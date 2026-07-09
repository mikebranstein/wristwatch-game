/**
 * Tests for FirstTickAudioController (Issue #113)
 *
 * Acceptance criteria covered:
 *   AC1  — silence gate of 0.5–1.5 s before first tick (clamped, configurable).
 *   AC2  — first-tick one-shot cue fires after the silence gate.
 *   AC3  — ticking loop fires immediately after first-tick (no gap).
 *   AC4  — re-wind suppression: startTickingLoop() skips silence-hold and one-shot.
 *   AC5  — audio disabled: audioHook is NOT called; states transition correctly.
 *   AC8  — stop() cancels in-flight timers; no orphaned audio after abort.
 *
 * Test scenarios mapped to issue #113:
 *   Scenario 1 (Happy path)         — full first-tick sequence.
 *   Scenario 2 (Re-wind)            — startTickingLoop() bypasses drama.
 *   Scenario 3 (Audio disabled)     — no audioHook calls when disabled.
 *   Scenario 4 (Low volume)         — audioHook is called regardless of volume
 *                                     (volume is a backend concern; controller
 *                                     is always enabled at low volume).
 *   Scenario 6 (Rapid wind)         — tension ramp fires once; subsequent calls
 *                                     to startTensionRamp are no-ops.
 *   Scenario 8 (Mid-scene abort)    — stop() cancels silence timer; no late fire.
 *   Scenario 9 (Loop boundary)      — ticking loop cue is fired (loop quality
 *                                     is an audio-asset concern).
 *  Scenario 10 (Regression)         — existing AUDIO_CUES shape is stable.
 */

const {
  FirstTickAudioController,
  AUDIO_CUES,
  AUDIO_STATE,
  DEFAULT_SILENCE_GATE_MS,
  MIN_SILENCE_GATE_MS,
  MAX_SILENCE_GATE_MS,
} = require('../../src/completion/FirstTickAudioController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const audioHook = jest.fn();
  const ctrl = new FirstTickAudioController({ audioHook, ...opts });
  return { ctrl, audioHook };
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('FirstTickAudioController — constants', () => {
  test('DEFAULT_SILENCE_GATE_MS is within [MIN, MAX]', () => {
    expect(DEFAULT_SILENCE_GATE_MS).toBeGreaterThanOrEqual(MIN_SILENCE_GATE_MS);
    expect(DEFAULT_SILENCE_GATE_MS).toBeLessThanOrEqual(MAX_SILENCE_GATE_MS);
  });

  test('MIN_SILENCE_GATE_MS is 500 (AC1: ≥0.5 s)', () => {
    expect(MIN_SILENCE_GATE_MS).toBe(500);
  });

  test('MAX_SILENCE_GATE_MS is 1500 (AC1: ≤1.5 s)', () => {
    expect(MAX_SILENCE_GATE_MS).toBe(1500);
  });

  test('AUDIO_CUES exposes four distinct cue IDs (Scenario 10)', () => {
    const ids = Object.values(AUDIO_CUES);
    expect(ids).toContain('first_tick_tension_ramp');
    expect(ids).toContain('first_tick_one_shot');
    expect(ids).toContain('first_tick_ticking_loop');
    expect(ids).toContain('first_tick_stop_all');
  });
});

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('FirstTickAudioController — constructor', () => {
  test('throws if audioHook is not a function', () => {
    expect(() => new FirstTickAudioController({ audioHook: null })).toThrow(
      'FirstTickAudioController requires an audioHook function.'
    );
  });

  test('initial audio state is IDLE', () => {
    const { ctrl } = makeController();
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.IDLE);
  });

  test('silenceGateMs clamps below MIN to MIN', () => {
    const { ctrl } = makeController({ silenceGateMs: 100 });
    expect(ctrl.getSilenceGateMs()).toBe(MIN_SILENCE_GATE_MS);
  });

  test('silenceGateMs clamps above MAX to MAX', () => {
    const { ctrl } = makeController({ silenceGateMs: 9999 });
    expect(ctrl.getSilenceGateMs()).toBe(MAX_SILENCE_GATE_MS);
  });

  test('silenceGateMs accepts a valid value in range', () => {
    const { ctrl } = makeController({ silenceGateMs: 800 });
    expect(ctrl.getSilenceGateMs()).toBe(800);
  });

  test('audioEnabled defaults to true', () => {
    const { ctrl } = makeController();
    expect(ctrl.isAudioEnabled()).toBe(true);
  });
});

// ─── startTensionRamp ─────────────────────────────────────────────────────────

describe('startTensionRamp', () => {
  test('fires the tension ramp audio cue', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.TENSION_RAMP);
  });

  test('audio state transitions to TENSION_RAMP', () => {
    const { ctrl } = makeController();
    ctrl.startTensionRamp();
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.TENSION_RAMP);
  });

  test('second call to startTensionRamp is a no-op (state already advanced)', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    ctrl.startTensionRamp(); // no-op: state is TENSION_RAMP, not IDLE
    expect(audioHook).toHaveBeenCalledTimes(1);
  });
});

// ─── Scenario 1 — Happy path: fireFirstTick sequence (AC1–AC3) ───────────────

describe('Scenario 1 — fireFirstTick: silence hold → one-shot → ticking loop', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('audio state is SILENCE_HOLD immediately after fireFirstTick()', () => {
    const { ctrl } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.SILENCE_HOLD);
  });

  test('no audio fires immediately (silence hold is active)', () => {
    const { ctrl, audioHook } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    expect(audioHook).not.toHaveBeenCalled();
  });

  test('after silence gate expires, first_tick_one_shot fires (AC2)', () => {
    const { ctrl, audioHook } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    jest.advanceTimersByTime(750);
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.FIRST_TICK);
  });

  test('after silence gate, ticking loop fires immediately after one-shot (AC3 — no gap)', () => {
    const { ctrl, audioHook } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    jest.advanceTimersByTime(750);
    const calls = audioHook.mock.calls.map((c) => c[0]);
    expect(calls).toContain(AUDIO_CUES.FIRST_TICK);
    expect(calls).toContain(AUDIO_CUES.TICKING_LOOP);
    // Ticking loop fires after first tick in the same timer callback
    const tickIdx = calls.indexOf(AUDIO_CUES.FIRST_TICK);
    const loopIdx = calls.indexOf(AUDIO_CUES.TICKING_LOOP);
    expect(loopIdx).toBeGreaterThan(tickIdx);
  });

  test('audio state is TICKING_LOOP after full sequence', () => {
    const { ctrl } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    jest.advanceTimersByTime(750);
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.TICKING_LOOP);
  });

  test('one-shot does NOT fire before silence gate expires (AC1)', () => {
    const { ctrl, audioHook } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    jest.advanceTimersByTime(500); // before 750ms
    expect(audioHook).not.toHaveBeenCalledWith(AUDIO_CUES.FIRST_TICK);
  });
});

// ─── Scenario 2 — Re-wind: startTickingLoop() skips drama (AC4) ──────────────

describe('Scenario 2 — Re-wind: startTickingLoop bypasses silence hold and one-shot (AC4)', () => {
  test('startTickingLoop fires ticking loop cue immediately', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTickingLoop();
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.TICKING_LOOP);
  });

  test('startTickingLoop does NOT fire tension ramp or one-shot', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTickingLoop();
    const calls = audioHook.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain(AUDIO_CUES.TENSION_RAMP);
    expect(calls).not.toContain(AUDIO_CUES.FIRST_TICK);
  });

  test('audio state is TICKING_LOOP after startTickingLoop()', () => {
    const { ctrl } = makeController();
    ctrl.startTickingLoop();
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.TICKING_LOOP);
  });
});

// ─── Scenario 3 — Audio disabled: no hooks fire (AC5) ───────────────────────

describe('Scenario 3 — Audio disabled: audioHook is NOT called (AC5)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('startTensionRamp does not call audioHook when disabled', () => {
    const { ctrl, audioHook } = makeController({ audioEnabled: false });
    ctrl.startTensionRamp();
    expect(audioHook).not.toHaveBeenCalled();
  });

  test('fireFirstTick does not call audioHook when disabled (before timer)', () => {
    const { ctrl, audioHook } = makeController({ audioEnabled: false });
    ctrl.fireFirstTick();
    expect(audioHook).not.toHaveBeenCalled();
  });

  test('fireFirstTick does not call audioHook when disabled (after timer)', () => {
    const { ctrl, audioHook } = makeController({ audioEnabled: false, silenceGateMs: 500 });
    ctrl.fireFirstTick();
    jest.advanceTimersByTime(500);
    expect(audioHook).not.toHaveBeenCalled();
  });

  test('startTickingLoop does not call audioHook when disabled', () => {
    const { ctrl, audioHook } = makeController({ audioEnabled: false });
    ctrl.startTickingLoop();
    expect(audioHook).not.toHaveBeenCalled();
  });

  test('audio states still transition correctly when disabled', () => {
    const { ctrl } = makeController({ audioEnabled: false, silenceGateMs: 500 });
    ctrl.fireFirstTick();
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.SILENCE_HOLD);
    jest.advanceTimersByTime(500);
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.TICKING_LOOP);
  });

  test('no errors thrown when disabled (AC5 — game functional)', () => {
    const { ctrl } = makeController({ audioEnabled: false, silenceGateMs: 500 });
    expect(() => {
      ctrl.startTensionRamp();
      ctrl.fireFirstTick();
      jest.advanceTimersByTime(500);
      ctrl.startTickingLoop();
    }).not.toThrow();
  });
});

// ─── Scenario 8 — Mid-scene abort: stop() cancels pending timer (AC8) ────────

describe('Scenario 8 — Mid-scene abort: stop() cancels silence timer (AC8)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('stop() during silence hold prevents one-shot from firing', () => {
    const { ctrl, audioHook } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    ctrl.stop(); // abort mid-silence-hold
    jest.advanceTimersByTime(750);
    expect(audioHook).not.toHaveBeenCalledWith(AUDIO_CUES.FIRST_TICK);
  });

  test('stop() fires the stop_all cue', () => {
    const { ctrl, audioHook } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    ctrl.stop();
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.STOP_ALL);
  });

  test('audio state returns to IDLE after stop()', () => {
    const { ctrl } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    ctrl.stop();
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.IDLE);
  });

  test('ticking loop does NOT fire after stop()', () => {
    const { ctrl, audioHook } = makeController({ silenceGateMs: 750 });
    ctrl.fireFirstTick();
    ctrl.stop();
    jest.advanceTimersByTime(750);
    const calls = audioHook.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain(AUDIO_CUES.TICKING_LOOP);
  });
});

// ─── reset() — re-arms for fresh sequence ────────────────────────────────────

describe('reset() — re-arms controller for a fresh sequence', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('after stop() + reset(), startTensionRamp fires again', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.startTensionRamp();
    ctrl.stop();
    ctrl.reset();
    ctrl.startTensionRamp();
    // First startTensionRamp + stop() + reset() + second startTensionRamp
    const tensionCalls = audioHook.mock.calls.filter((c) => c[0] === AUDIO_CUES.TENSION_RAMP);
    expect(tensionCalls.length).toBe(2);
  });

  test('after reset(), audio state is IDLE', () => {
    const { ctrl } = makeController();
    ctrl.startTickingLoop();
    ctrl.reset();
    expect(ctrl.getAudioState()).toBe(AUDIO_STATE.IDLE);
  });
});
