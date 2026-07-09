/**
 * Tests for FirstTickSequence — Issue #113: First-Tick Audio Presentation, Phase 1
 *
 * Integration tests for the orchestrator that wires WindAudioController
 * and TelemetryEmitter together.
 *
 * Acceptance criteria mapped:
 *   AC1 — tension ramp starts on final wind steps (first activation only)
 *   AC2 — first-tick fires on balance wheel activation
 *   AC3 — ticking loop starts after first tick (via WindAudioController)
 *   AC4 — re-wind suppression: dramatic sequence does NOT replay
 *   AC5 — audio disabled: no errors, game remains functional
 *
 * Test scenarios mapped to issue #113:
 *   Scenario 1  (Happy path)              — onFinalWindSteps → onBalanceWheelActivated → drama fires
 *   Scenario 2  (Re-wind no drama)        — AC4: already activated watch → no sequence
 *   Scenario 3  (Audio disabled)          — AC5: no errors, callbacks invoked, game proceeds
 *   Scenario 5  (Multiple watches)        — each watchId tracks activation independently
 *   Scenario 7  (Balance wheel fails)     — onActivationFailed cancels ramp, no first tick
 *   Scenario 8  (Scene transition)        — destroy() cancels ramp, no orphaned audio
 *   Scenario 10 (Regression)              — existing tests not broken (isolated module)
 */

'use strict';

const { FirstTickSequence, FIRST_TICK_EVENTS } = require('../../src/completion/FirstTickSequence');
const { CUE_IDS, PHASES } = require('../../src/completion/WindAudioController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a FirstTickSequence with injected mocks and a synchronous timer
 * (tensionDelayMs=0 to make timer fire synchronously in tests).
 */
function makeSequence(overrides = {}) {
  const audioHook           = jest.fn();
  const instrumentationHook = jest.fn();

  // Use synchronous mock timer: fires immediately when invoked
  const callbacks = [];
  const setTimeoutFn   = jest.fn((fn) => { callbacks.push(fn); return callbacks.length; });
  const clearTimeoutFn = jest.fn((id) => { callbacks[id - 1] = null; });

  const seq = new FirstTickSequence({
    audioHook,
    instrumentationHook,
    tensionDelayMs: 500, // within AC1 window
    setTimeoutFn,
    clearTimeoutFn,
    ...overrides,
  });

  // Helper: fire all pending timers (simulating time passage) then clear the queue.
  const flushTimers = () => {
    const pending = callbacks.splice(0); // take all pending and clear the queue
    pending.forEach((fn) => { if (fn) fn(); });
  };

  return { seq, audioHook, instrumentationHook, setTimeoutFn, clearTimeoutFn, flushTimers };
}

// ─── Constructor validation ───────────────────────────────────────────────────

describe('FirstTickSequence — constructor', () => {
  test('constructs without error given valid hooks', () => {
    expect(() =>
      new FirstTickSequence({
        audioHook: jest.fn(),
        instrumentationHook: jest.fn(),
      })
    ).not.toThrow();
  });

  test('hasWatchActivated returns false for a new watchId', () => {
    const { seq } = makeSequence();
    expect(seq.hasWatchActivated('watch-001')).toBe(false);
  });

  test('getAudioController() returns a WindAudioController instance', () => {
    const { seq } = makeSequence();
    expect(seq.getAudioController()).toBeDefined();
    expect(typeof seq.getAudioController().startTensionRamp).toBe('function');
  });

  test('getTelemetry() returns a TelemetryEmitter instance', () => {
    const { seq } = makeSequence();
    expect(seq.getTelemetry()).toBeDefined();
    expect(typeof seq.getTelemetry().emit).toBe('function');
  });
});

// ─── Scenario 1: Happy path — first activation ───────────────────────────────

describe('Scenario 1 — Happy path: first activation fires the full dramatic sequence', () => {
  test('onFinalWindSteps fires the tension_ramp audio cue', () => {
    const { seq, audioHook } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    expect(audioHook).toHaveBeenCalledWith(CUE_IDS.TENSION_RAMP);
  });

  test('onFinalWindSteps emits TENSION_RAMP_STARTED telemetry', () => {
    const { seq, instrumentationHook } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    expect(instrumentationHook).toHaveBeenCalledWith(
      FIRST_TICK_EVENTS.TENSION_RAMP_STARTED,
      { watchId: 'watch-001' }
    );
  });

  test('onBalanceWheelActivated schedules the first tick', () => {
    const { seq, setTimeoutFn } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    expect(setTimeoutFn).toHaveBeenCalled();
  });

  test('onBalanceWheelActivated marks the watch as activated', () => {
    const { seq } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    expect(seq.hasWatchActivated('watch-001')).toBe(true);
  });

  test('first_tick cue fires after the timer callback runs', () => {
    const { seq, audioHook, flushTimers } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    expect(audioHook).toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
  });

  test('ticking_loop cue fires after first_tick (AC3 — seamless crossfade)', () => {
    const { seq, audioHook, flushTimers } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    const calls = audioHook.mock.calls.map((c) => c[0]);
    const firstTickIdx   = calls.indexOf(CUE_IDS.FIRST_TICK);
    const tickingLoopIdx = calls.indexOf(CUE_IDS.TICKING_LOOP);
    expect(firstTickIdx).toBeGreaterThanOrEqual(0);
    expect(tickingLoopIdx).toBe(firstTickIdx + 1);
  });

  test('FIRST_TICK_FIRED telemetry emitted after timer runs', () => {
    const { seq, instrumentationHook, flushTimers } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    expect(instrumentationHook).toHaveBeenCalledWith(
      FIRST_TICK_EVENTS.FIRST_TICK_FIRED,
      { watchId: 'watch-001' }
    );
  });

  test('TICKING_LOOP_STARTED telemetry emitted after timer runs', () => {
    const { seq, instrumentationHook, flushTimers } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    expect(instrumentationHook).toHaveBeenCalledWith(
      FIRST_TICK_EVENTS.TICKING_LOOP_STARTED,
      { watchId: 'watch-001' }
    );
  });
});

// ─── AC4: Re-wind suppression ─────────────────────────────────────────────────

describe('AC4 — Re-wind suppression: drama does NOT replay on re-wind', () => {
  test('onFinalWindSteps for already-activated watch does NOT fire tension_ramp', () => {
    const { seq, audioHook, flushTimers } = makeSequence();

    // First activation
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    audioHook.mockClear();

    // Re-wind
    seq.onFinalWindSteps('watch-001');
    expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.TENSION_RAMP);
  });

  test('onFinalWindSteps for already-activated watch does NOT emit TENSION_RAMP_STARTED', () => {
    const { seq, instrumentationHook, flushTimers } = makeSequence();

    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    instrumentationHook.mockClear();

    seq.onFinalWindSteps('watch-001');
    const eventNames = instrumentationHook.mock.calls.map((c) => c[0]);
    expect(eventNames).not.toContain(FIRST_TICK_EVENTS.TENSION_RAMP_STARTED);
  });

  test('onBalanceWheelActivated for already-activated watch emits REWOUND_NO_DRAMA', () => {
    const { seq, instrumentationHook, flushTimers } = makeSequence();

    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    instrumentationHook.mockClear();

    seq.onBalanceWheelActivated('watch-001');
    expect(instrumentationHook).toHaveBeenCalledWith(
      FIRST_TICK_EVENTS.REWOUND_NO_DRAMA,
      { watchId: 'watch-001' }
    );
  });

  test('onBalanceWheelActivated for already-activated watch does NOT fire first_tick', () => {
    const { seq, audioHook, flushTimers } = makeSequence();

    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    audioHook.mockClear();

    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
  });

  test('onBalanceWheelActivated for already-activated watch does NOT schedule a new timer', () => {
    const { seq, setTimeoutFn, flushTimers } = makeSequence();

    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();
    setTimeoutFn.mockClear();

    seq.onBalanceWheelActivated('watch-001');
    expect(setTimeoutFn).not.toHaveBeenCalled();
  });
});

// ─── Scenario 5: Multiple watches ────────────────────────────────────────────

describe('Scenario 5 — Multiple watches: each watchId activates independently', () => {
  test('two watches both fire their own first-tick drama', () => {
    const { seq, audioHook, flushTimers } = makeSequence();

    seq.onFinalWindSteps('watch-A');
    seq.onBalanceWheelActivated('watch-A');
    flushTimers();

    seq.onFinalWindSteps('watch-B');
    seq.onBalanceWheelActivated('watch-B');
    flushTimers();

    const firstTickCalls = audioHook.mock.calls.filter((c) => c[0] === CUE_IDS.FIRST_TICK);
    expect(firstTickCalls).toHaveLength(2);
  });

  test('watch-A activation does not mark watch-B as activated', () => {
    const { seq } = makeSequence();
    seq.onFinalWindSteps('watch-A');
    seq.onBalanceWheelActivated('watch-A');
    expect(seq.hasWatchActivated('watch-B')).toBe(false);
  });

  test('watch-B re-wind suppression is independent of watch-A', () => {
    const { seq, audioHook, flushTimers } = makeSequence();

    // Activate both watches
    seq.onFinalWindSteps('watch-A');
    seq.onBalanceWheelActivated('watch-A');
    flushTimers();
    seq.onFinalWindSteps('watch-B');
    seq.onBalanceWheelActivated('watch-B');
    flushTimers();
    audioHook.mockClear();

    // Re-wind watch-A → no drama
    seq.onFinalWindSteps('watch-A');
    expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.TENSION_RAMP);
  });
});

// ─── Scenario 7: Balance wheel activation fails ───────────────────────────────

describe('Scenario 7 — Balance wheel fails: onActivationFailed cancels ramp, no first tick', () => {
  test('onActivationFailed cancels the tension ramp timer', () => {
    const { seq, clearTimeoutFn } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    seq.onActivationFailed('watch-001');
    expect(clearTimeoutFn).toHaveBeenCalled();
  });

  test('onActivationFailed emits ACTIVATION_FAILED telemetry', () => {
    const { seq, instrumentationHook } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onActivationFailed('watch-001');
    expect(instrumentationHook).toHaveBeenCalledWith(
      FIRST_TICK_EVENTS.ACTIVATION_FAILED,
      { watchId: 'watch-001' }
    );
  });

  test('onActivationFailed does NOT mark watch as activated', () => {
    const { seq } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onActivationFailed('watch-001');
    expect(seq.hasWatchActivated('watch-001')).toBe(false);
  });

  test('first_tick does NOT fire after onActivationFailed even if timer would have run', () => {
    jest.useFakeTimers();
    try {
      const audioHook = jest.fn();
      const seq = new FirstTickSequence({
        audioHook,
        instrumentationHook: jest.fn(),
        tensionDelayMs: 1000,
      });
      seq.onFinalWindSteps('watch-001');
      seq.onBalanceWheelActivated('watch-001');
      seq.onActivationFailed('watch-001');
      jest.advanceTimersByTime(2000);
      expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
    } finally {
      jest.useRealTimers();
    }
  });

  test('watch can still activate after a failed attempt', () => {
    const { seq, audioHook, flushTimers } = makeSequence();

    // First attempt fails
    seq.onFinalWindSteps('watch-001');
    seq.onActivationFailed('watch-001');

    // Second attempt succeeds
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    flushTimers();

    expect(audioHook).toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
  });
});

// ─── Scenario 8: Scene/state transition during wind ──────────────────────────

describe('Scenario 8 — Scene transition: destroy() prevents orphaned audio', () => {
  test('destroy() cancels any pending tension timer', () => {
    const { seq, clearTimeoutFn } = makeSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    seq.destroy();
    expect(clearTimeoutFn).toHaveBeenCalled();
  });

  test('destroy() emits SEQUENCE_DESTROYED telemetry', () => {
    const { seq, instrumentationHook } = makeSequence();
    seq.destroy();
    expect(instrumentationHook).toHaveBeenCalledWith(
      FIRST_TICK_EVENTS.SEQUENCE_DESTROYED,
      {}
    );
  });

  test('no first_tick fires after destroy() even if timer would have elapsed', () => {
    jest.useFakeTimers();
    try {
      const audioHook = jest.fn();
      const seq = new FirstTickSequence({
        audioHook,
        instrumentationHook: jest.fn(),
        tensionDelayMs: 1000,
      });
      seq.onFinalWindSteps('watch-001');
      seq.onBalanceWheelActivated('watch-001');
      seq.destroy();
      jest.advanceTimersByTime(2000);
      expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
    } finally {
      jest.useRealTimers();
    }
  });

  test('destroy() does not throw even when called with no pending sequence', () => {
    const { seq } = makeSequence();
    expect(() => seq.destroy()).not.toThrow();
  });
});

// ─── AC5: Audio disabled ──────────────────────────────────────────────────────

describe('AC5 — Audio disabled: no audio fires, no errors, game remains functional', () => {
  function makeDisabledSequence() {
    const audioHook = jest.fn();
    const instrumentationHook = jest.fn();
    const seq = new FirstTickSequence({
      audioHook,
      instrumentationHook,
      audioEnabled: false,
    });
    return { seq, audioHook, instrumentationHook };
  }

  test('onFinalWindSteps with audioEnabled=false does not fire tension_ramp cue', () => {
    const { seq, audioHook } = makeDisabledSequence();
    seq.onFinalWindSteps('watch-001');
    expect(audioHook).not.toHaveBeenCalled();
  });

  test('onFinalWindSteps with audioEnabled=false does not throw', () => {
    const { seq } = makeDisabledSequence();
    expect(() => seq.onFinalWindSteps('watch-001')).not.toThrow();
  });

  test('onBalanceWheelActivated with audioEnabled=false does not fire first_tick cue', () => {
    const { seq, audioHook } = makeDisabledSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    expect(audioHook).not.toHaveBeenCalledWith(CUE_IDS.FIRST_TICK);
  });

  test('onBalanceWheelActivated with audioEnabled=false still marks watch as activated', () => {
    const { seq } = makeDisabledSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');
    expect(seq.hasWatchActivated('watch-001')).toBe(true);
  });

  test('onBalanceWheelActivated with audioEnabled=false does not throw', () => {
    const { seq } = makeDisabledSequence();
    expect(() => {
      seq.onFinalWindSteps('watch-001');
      seq.onBalanceWheelActivated('watch-001');
    }).not.toThrow();
  });

  test('AC4 (re-wind suppression) still works when audio is disabled', () => {
    const { seq, instrumentationHook } = makeDisabledSequence();
    seq.onFinalWindSteps('watch-001');
    seq.onBalanceWheelActivated('watch-001');

    // Re-wind
    instrumentationHook.mockClear();
    seq.onBalanceWheelActivated('watch-001');

    expect(instrumentationHook).toHaveBeenCalledWith(
      FIRST_TICK_EVENTS.REWOUND_NO_DRAMA,
      { watchId: 'watch-001' }
    );
  });

  test('destroy() with audioEnabled=false does not throw', () => {
    const { seq } = makeDisabledSequence();
    expect(() => seq.destroy()).not.toThrow();
  });
});
