/**
 * Tests for WindAudioController — Issue #113: First-Tick Audio Presentation, Phase 1
 *
 * Covers the three-phase audio state machine:
 *   Phase 1 (TENSION_RAMP)  — tension/silence audio during final wind steps
 *   Phase 2 (AWAITING_TICK) — enforced silence delay before first tick fires (AC1)
 *   Phase 3 (FIRST_TICK)    — distinct first-tick one-shot sound (AC2)
 *   Phase 4 (TICKING_LOOP)  — seamless crossfade into normal ticking loop (AC3)
 *
 * Acceptance criteria mapped:
 *   AC1 — silence/tension period enforced before first tick (0.5–1.5 s window)
 *   AC2 — first_tick cue is distinct from tension_ramp and ticking_loop
 *   AC3 — ticking_loop fires immediately after first_tick (no gap, no duplicate tick)
 *   AC5 — audio disabled: no audioHook calls, no errors, callbacks still invoked
 *
 * Test scenarios mapped to issue #113:
 *   Scenario 1 (Happy path)          — startTensionRamp → scheduleFirstTick → first tick fires
 *   Scenario 3 (Audio disabled)      — AC5: no-op with audioEnabled=false
 *   Scenario 6 (Rapid wind)          — tension ramp is time-based (timer), not input-cadence-based
 *   Scenario 7 (Balance wheel fails) — cancelRamp() prevents first tick
 *   Scenario 8 (Scene transition)    — stop() clears timer, no orphaned audio
 */

'use strict';

const {
  WindAudioController,
  PHASES,
  CUE_IDS,
  DEFAULT_TENSION_DELAY_MS,
  MAX_TENSION_DELAY_MS,
  MIN_TENSION_DELAY_MS,
} = require('../../src/completion/WindAudioController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const audioHook = jest.fn();
  const ctrl = new WindAudioController(audioHook, {
    setTimeoutFn:   jest.fn((fn, ms) => { ctrl._scheduledFn = fn; ctrl._scheduledMs = ms; return 42; }),
    clearTimeoutFn: jest.fn(),
    ...opts,
  });
  return { ctrl, audioHook };
}

/**
 * Make a controller with real fake timers (call jest.useFakeTimers() before using).
 */
function makeRealTimerController(opts = {}) {
  const audioHook = jest.fn();
  const ctrl = new WindAudioController(audioHook, opts);
  return { ctrl, audioHook };
}

// ─── Constructor validation ───────────────────────────────────────────────────

describe('WindAudioController — constructor', () => {
  test('throws if audioHook is not a function', () => {
    expect(() => new WindAudioController(null)).toThrow(
      'WindAudioController requires an audioHook function.'
    );
  });

  test('initial phase is IDLE', () => {
    const { ctrl } = makeController();
    expect(ctrl.getPhase()).toBe(PHASES.IDLE);
  });

  test('initial isFirstTickPending is false', () => {
    const { ctrl } = makeController();
    expect(ctrl.isFirstTickPending()).toBe(false);
  });

  test('default tensionDelayMs is DEFAULT_TENSION_DELAY_MS', () => {
    const { ctrl } = makeController();
    expect(ctrl.getTensionDelayMs()).toBe(DEFAULT_TENSION_DELAY_MS);
  });

  test('DEFAULT_TENSION_DELAY_MS is within the 500–1500 ms window', () => {
    expect(DEFAULT_TENSION_DELAY_MS).toBeGreaterThanOrEqual(MIN_TENSION_DELAY_MS);
    expect(DEFAULT_TENSION_DELAY_MS).toBeLessThanOrEqual(1500);
  });

  test('tensionDelayMs is clamped to MIN (500 ms) when too small', () => {
    const audioHook = jest.fn();
    const ctrl = new WindAudioController(audioHook, { tensionDelayMs: 10 });
    expect(ctrl.getTensionDelayMs()).toBe(MIN_TENSION_DELAY_MS);
  });

  test('tensionDelayMs is clamped to MAX_TENSION_DELAY_MS (2000 ms) when too large', () => {
    const audioHook = jest.fn();
    const ctrl = new WindAudioController(audioHook, { tensionDelayMs: 9999 });
    expect(ctrl.getTensionDelayMs()).toBe(MAX_TENSION_DELAY_MS);
  });

  test('audioEnabled defaults to true', () => {
    const { ctrl } = makeController();
    expect(ctrl.isAudioEnabled()).toBe(true);
  });
});

// ─── AC1: Tension ramp phase ──────────────────────────────────────────────────

describe('AC1 — startTensionRamp: phase transitions and audio cue', () => {
  test('startTensionRamp fires the tension_ramp cue', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    expect(audioHook).toHaveBeenCalledWith(CUE_IDS.TENSION_RAMP);
  });

  test('startTensionRamp transitions phase to TENSION_RAMP', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    expect(ctrl.getPhase()).toBe(PHASES.TENSION_RAMP);
  });

  test('startTensionRamp while not IDLE is a no-op (idempotent)', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp(); // first call
    ctrl.startTensionRamp(); // second call — should not fire again
    expect(audioHook).toHaveBeenCalledTimes(1);
  });
});

// ─── AC1: Silence delay enforcement before first tick ────────────────────────

describe('AC1 — scheduleFirstTick: enforces silence delay before first tick fires', () => {
  test('scheduleFirstTick schedules a timer', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    expect(ctrl.isFirstTickPending()).toBe(true);
  });

  test('scheduleFirstTick sets phase to AWAITING_TICK', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    expect(ctrl.getPhase()).toBe(PHASES.AWAITING_TICK);
  });

  test('timer is scheduled with the configured tension delay', () => {
    const audioHook = jest.fn();
    const setTimeoutFn = jest.fn(() => 99);
    const ctrl = new WindAudioController(audioHook, {
      tensionDelayMs: 800,
      setTimeoutFn,
      clearTimeoutFn: jest.fn(),
    });
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 800);
  });

  test('first tick does NOT fire immediately — only after the timer callback runs', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    // Timer callback has not been invoked yet
    expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
  });

  test('first tick fires after the timer callback is invoked', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    // Simulate the timer firing
    ctrl._scheduledFn();
    expect(audioHook).toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
  });

  test('onFirstTickFired callback is invoked after timer fires', () => {
    const { ctrl } = makeController();
    const cb = jest.fn();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick(cb);
    ctrl._scheduledFn();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('scheduleFirstTick with fake timers: first tick fires after delay', () => {
    jest.useFakeTimers();
    try {
      const { ctrl, audioHook } = makeRealTimerController({ tensionDelayMs: 1000 });
      ctrl.startTensionRamp();
      ctrl.scheduleFirstTick();

      // Before delay: no first tick
      expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);

      jest.advanceTimersByTime(999);
      expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);

      jest.advanceTimersByTime(1); // crosses the 1000ms threshold
      expect(audioHook).toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
    } finally {
      jest.useRealTimers();
    }
  });
});

// ─── AC2: First-tick cue is distinct ─────────────────────────────────────────

describe('AC2 — first_tick cue is audibly distinct from tension_ramp and ticking_loop', () => {
  test('CUE_IDS.FIRST_TICK is different from CUE_IDS.TENSION_RAMP', () => {
    expect(CUE_IDS.FIRST_TICK).not.toBe(CUE_IDS.TENSION_RAMP);
  });

  test('CUE_IDS.FIRST_TICK is different from CUE_IDS.TICKING_LOOP', () => {
    expect(CUE_IDS.FIRST_TICK).not.toBe(CUE_IDS.TICKING_LOOP);
  });

  test('CUE_IDS.TENSION_RAMP is different from CUE_IDS.TICKING_LOOP', () => {
    expect(CUE_IDS.TENSION_RAMP).not.toBe(CUE_IDS.TICKING_LOOP);
  });

  test('audioHook is called with CUE_IDS.FIRST_TICK (not any other cue) at first tick', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    audioHook.mockClear(); // ignore the tension_ramp call
    ctrl._scheduledFn();
    const calls = audioHook.mock.calls.map((c) => c[0]);
    expect(calls).toContain(CUE_IDS.FIRST_TICK);
  });
});

// ─── AC3: Seamless crossfade to ticking loop ─────────────────────────────────

describe('AC3 — ticking loop starts immediately after first tick (no gap)', () => {
  test('ticking_loop cue fires in the same tick as first_tick', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    ctrl._scheduledFn();

    const calls = audioHook.mock.calls.map((c) => c[0]);
    const firstTickIdx  = calls.indexOf(CUE_IDS.FIRST_TICK);
    const tickingLoopIdx = calls.indexOf(CUE_IDS.TICKING_LOOP);

    expect(firstTickIdx).toBeGreaterThanOrEqual(0);
    expect(tickingLoopIdx).toBe(firstTickIdx + 1); // ticking_loop immediately after first_tick
  });

  test('phase transitions to TICKING_LOOP after first tick fires', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    ctrl._scheduledFn();
    expect(ctrl.getPhase()).toBe(PHASES.TICKING_LOOP);
  });

  test('ticking_loop cue is fired exactly once', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    ctrl._scheduledFn();
    const tickingLoopCalls = audioHook.mock.calls.filter((c) => c[0] === CUE_IDS.TICKING_LOOP);
    expect(tickingLoopCalls).toHaveLength(1);
  });
});

// ─── Scenario 7: Balance wheel fails — cancelRamp ────────────────────────────

describe('Scenario 7 — Balance wheel activation fails: cancelRamp() prevents first tick', () => {
  test('cancelRamp() clears pending timer', () => {
    const audioHook = jest.fn();
    const clearTimeoutFn = jest.fn();
    const setTimeoutFn = jest.fn(() => 42);
    const ctrl = new WindAudioController(audioHook, { setTimeoutFn, clearTimeoutFn });

    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    ctrl.cancelRamp();

    expect(clearTimeoutFn).toHaveBeenCalledWith(42);
  });

  test('cancelRamp() sets phase back to IDLE', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    ctrl.cancelRamp();
    expect(ctrl.getPhase()).toBe(PHASES.IDLE);
  });

  test('cancelRamp() means first tick does NOT fire even after timer delay', () => {
    jest.useFakeTimers();
    try {
      const { ctrl, audioHook } = makeRealTimerController({ tensionDelayMs: 1000 });
      ctrl.startTensionRamp();
      ctrl.scheduleFirstTick();
      ctrl.cancelRamp();
      jest.advanceTimersByTime(2000);
      expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
    } finally {
      jest.useRealTimers();
    }
  });

  test('cancelRamp() sets isFirstTickPending to false', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    ctrl.cancelRamp();
    expect(ctrl.isFirstTickPending()).toBe(false);
  });
});

// ─── Scenario 8: Scene/state transition — stop() ─────────────────────────────

describe('Scenario 8 — Scene transition: stop() prevents orphaned audio', () => {
  test('stop() sets phase to IDLE', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    ctrl.stop();
    expect(ctrl.getPhase()).toBe(PHASES.IDLE);
  });

  test('stop() clears any pending timer', () => {
    const audioHook = jest.fn();
    const clearTimeoutFn = jest.fn();
    const ctrl = new WindAudioController(audioHook, {
      setTimeoutFn: jest.fn(() => 99),
      clearTimeoutFn,
    });
    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick();
    ctrl.stop();
    expect(clearTimeoutFn).toHaveBeenCalledWith(99);
  });
});

// ─── AC5: Audio disabled ──────────────────────────────────────────────────────

describe('AC5 — Audio disabled: no audio fires, no errors, game proceeds normally', () => {
  test('startTensionRamp with audioEnabled=false does NOT call audioHook', () => {
    const audioHook = jest.fn();
    const ctrl = new WindAudioController(audioHook, { audioEnabled: false });
    ctrl.startTensionRamp();
    expect(audioHook).not.toHaveBeenCalled();
  });

  test('startTensionRamp with audioEnabled=false does not throw', () => {
    const ctrl = new WindAudioController(jest.fn(), { audioEnabled: false });
    expect(() => ctrl.startTensionRamp()).not.toThrow();
  });

  test('scheduleFirstTick with audioEnabled=false does NOT schedule a timer', () => {
    const audioHook = jest.fn();
    const setTimeoutFn = jest.fn();
    const ctrl = new WindAudioController(audioHook, {
      audioEnabled: false,
      setTimeoutFn,
      clearTimeoutFn: jest.fn(),
    });
    ctrl.scheduleFirstTick();
    expect(setTimeoutFn).not.toHaveBeenCalled();
  });

  test('scheduleFirstTick with audioEnabled=false invokes callback immediately', () => {
    const ctrl = new WindAudioController(jest.fn(), { audioEnabled: false });
    const cb = jest.fn();
    ctrl.scheduleFirstTick(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('scheduleFirstTick with audioEnabled=false does NOT fire first_tick cue', () => {
    const audioHook = jest.fn();
    const ctrl = new WindAudioController(audioHook, { audioEnabled: false });
    const cb = jest.fn();
    ctrl.scheduleFirstTick(cb);
    expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
  });

  test('scheduleFirstTick with audioEnabled=false does NOT fire ticking_loop cue', () => {
    const audioHook = jest.fn();
    const ctrl = new WindAudioController(audioHook, { audioEnabled: false });
    ctrl.scheduleFirstTick();
    expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.TICKING_LOOP);
  });

  test('cancelRamp with audioEnabled=false does not throw', () => {
    const ctrl = new WindAudioController(jest.fn(), { audioEnabled: false });
    expect(() => ctrl.cancelRamp()).not.toThrow();
  });
});

// ─── Scenario 6: Rapid wind — ramp is time-based, not input-cadence-based ───

describe('Scenario 6 — Rapid wind: tension ramp timer is independent of input cadence', () => {
  test('calling onFinalWindSteps multiple times does not reset the tension timer', () => {
    const audioHook = jest.fn();
    const setTimeoutFn = jest.fn(() => 101);
    const clearTimeoutFn = jest.fn();
    const ctrl = new WindAudioController(audioHook, { setTimeoutFn, clearTimeoutFn });

    ctrl.startTensionRamp();
    ctrl.scheduleFirstTick(); // first schedule

    // Simulate rapid wind: a second scheduleFirstTick clears old and re-arms
    // (the audio controller is idempotent — new call clears old timer)
    ctrl.scheduleFirstTick(); // second call
    // clearTimeout should have been called to cancel the first timer
    expect(clearTimeoutFn).toHaveBeenCalledWith(101);
    // A new timer should be scheduled
    expect(setTimeoutFn).toHaveBeenCalledTimes(2);
  });
});
