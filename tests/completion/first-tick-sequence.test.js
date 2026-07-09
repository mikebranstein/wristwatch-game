/**
 * Tests for FirstTickSequence — top-level orchestrator (Issue #113)
 *
 * Acceptance criteria covered:
 *   AC1  — tension ramp fires before first tick; silence gate holds (via audio controller).
 *   AC2  — first-tick one-shot fires on first activation.
 *   AC3  — ticking loop crossfades after first tick.
 *   AC4  — re-wind: tension ramp and one-shot do NOT replay on second activation.
 *   AC5  — audio disabled: game remains functional with no audioHook calls for music cues.
 *   AC7  — incorrectly assembled watch: first-tick does NOT fire.
 *   AC8  — abort() cancels in-flight audio, no orphaned cues.
 *  AC10  — regression: existing tests unaffected (tested via isolated construction).
 *
 * Test scenarios mapped to issue #113:
 *   Scenario 1 — Happy path: first activation fires full sequence.
 *   Scenario 2 — Re-wind: no drama on second wind.
 *   Scenario 3 — Audio disabled: no audio, no errors.
 *   Scenario 5 — Multi-watch: first-tick fires independently per watch.
 *   Scenario 6 — Rapid wind: ramp fires once regardless of step count.
 *   Scenario 7 — Incorrect assembly: activation hook suppressed.
 *   Scenario 8 — Mid-scene abort: stop_all fires, no orphaned audio.
 *  Scenario 10 — Regression: sequence constructs without breaking existing modules.
 */

const { FirstTickSequence, FIRST_TICK_EVENTS } = require('../../src/completion/FirstTickSequence');
const { AUDIO_CUES, AUDIO_STATE } = require('../../src/completion/FirstTickAudioController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSequence(opts = {}) {
  const audioHook = jest.fn();
  const telemetryLog = [];
  const seq = new FirstTickSequence({
    audioHook,
    instrumentationHook: (name, payload) => telemetryLog.push({ name, payload }),
    // Use minimal wind steps for tests (totalWindSteps=4, tensionWindowSteps=1)
    totalWindSteps: 4,
    tensionWindowSteps: 1,
    // Use minimal silence gate so fake timers advance quickly
    silenceGateMs: 500,
    ...opts,
  });
  return { seq, audioHook, telemetryLog };
}

function windToFull(seq, totalWindSteps = 4) {
  for (let i = 0; i < totalWindSteps; i++) seq.onWindStep(1);
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('FirstTickSequence — construction', () => {
  test('constructs successfully with required options', () => {
    expect(() => makeSequence()).not.toThrow();
  });

  test('exposes wind mechanic accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getWindMechanic()).toBeDefined();
  });

  test('exposes balance wheel accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getBalanceWheel()).toBeDefined();
  });

  test('exposes audio controller accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getAudioController()).toBeDefined();
  });

  test('exposes telemetry accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getTelemetry()).toBeDefined();
  });

  test('hasActivated() is false before any winding', () => {
    const { seq } = makeSequence();
    expect(seq.hasActivated('watch-001')).toBe(false);
  });
});

// ─── Scenario 1 — Happy path: first activation (AC1–AC3) ─────────────────────

describe('Scenario 1 — Happy path: full first-tick sequence on first activation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('tension ramp audio fires when winding reaches tension window', () => {
    const { seq, audioHook } = makeSequence();
    seq.prepareForWatch('watch-001', true);

    // totalWindSteps=4, tensionWindowSteps=1 → ramp fires at step 3
    seq.onWindStep(1);
    seq.onWindStep(1);
    seq.onWindStep(1); // step 3 = 4-1 = tension threshold
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.TENSION_RAMP);
  });

  test('tension ramp telemetry fires on first activation', () => {
    const { seq, telemetryLog } = makeSequence();
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    const event = telemetryLog.find((e) => e.name === FIRST_TICK_EVENTS.TENSION_RAMP_STARTED);
    expect(event).toBeDefined();
    expect(event.payload.watchId).toBe('watch-001');
    expect(event.payload.isFirstActivation).toBe(true);
  });

  test('first_tick_one_shot fires after silence gate (AC2)', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.FIRST_TICK);
  });

  test('ticking loop fires after first tick (AC3 — no gap)', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);
    const calls = audioHook.mock.calls.map((c) => c[0]);
    expect(calls).toContain(AUDIO_CUES.TICKING_LOOP);
  });

  test('hasActivated() is true after first activation', () => {
    const { seq } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    expect(seq.hasActivated('watch-001')).toBe(true);
  });

  test('first_tick_fired telemetry emitted on first activation', () => {
    const { seq, telemetryLog } = makeSequence();
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    const event = telemetryLog.find((e) => e.name === FIRST_TICK_EVENTS.FIRST_TICK_FIRED);
    expect(event).toBeDefined();
    expect(event.payload.isFirstActivation).toBe(true);
  });
});

// ─── Scenario 2 — Re-wind: drama suppressed on second wind (AC4) ─────────────

describe('Scenario 2 — Re-wind: tension ramp and one-shot do NOT fire again (AC4)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('tension ramp does NOT fire on re-wind', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 500 });
    // First activation
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    audioHook.mockClear();

    // Re-wind
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    expect(audioHook).not.toHaveBeenCalledWith(AUDIO_CUES.TENSION_RAMP);
  });

  test('first_tick_one_shot does NOT fire on re-wind', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    audioHook.mockClear();

    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);
    expect(audioHook).not.toHaveBeenCalledWith(AUDIO_CUES.FIRST_TICK);
  });

  test('ticking loop DOES fire on re-wind (continuation)', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    audioHook.mockClear();

    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.TICKING_LOOP);
  });

  test('rewound_no_drama telemetry emitted on re-wind', () => {
    const { seq, telemetryLog } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    seq.prepareForWatch('watch-001', true);
    windToFull(seq);

    const event = telemetryLog.find((e) => e.name === FIRST_TICK_EVENTS.REWOUND_NO_DRAMA);
    expect(event).toBeDefined();
    expect(event.payload.isFirstActivation).toBe(false);
  });
});

// ─── Scenario 3 — Audio disabled (AC5) ───────────────────────────────────────

describe('Scenario 3 — Audio disabled: no audio plays, game functional (AC5)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('no audio cues fire when audioEnabled is false', () => {
    const { seq, audioHook } = makeSequence({ audioEnabled: false, silenceGateMs: 500 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);
    // stop_all may fire on stop(); filter out to check no music cues
    const musicCalls = audioHook.mock.calls
      .map((c) => c[0])
      .filter((id) => id !== AUDIO_CUES.STOP_ALL);
    expect(musicCalls).toHaveLength(0);
  });

  test('no errors thrown when audio is disabled (AC5)', () => {
    const { seq } = makeSequence({ audioEnabled: false, silenceGateMs: 500 });
    expect(() => {
      seq.prepareForWatch('watch-001', true);
      windToFull(seq);
      jest.advanceTimersByTime(500);
    }).not.toThrow();
  });

  test('hasActivated() tracks correctly even when audio is disabled', () => {
    const { seq } = makeSequence({ audioEnabled: false });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    expect(seq.hasActivated('watch-001')).toBe(true);
  });
});

// ─── Scenario 5 — Multi-watch: first-tick fires per watch independently ──────

describe('Scenario 5 — Multi-watch: each watch gets its own first-tick', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('first-tick fires on watch-001 then watch-002 independently', () => {
    const { seq, telemetryLog } = makeSequence({ silenceGateMs: 500 });

    // Watch 001
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    // Watch 002
    seq.prepareForWatch('watch-002', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    const fired = telemetryLog.filter((e) => e.name === FIRST_TICK_EVENTS.FIRST_TICK_FIRED);
    expect(fired).toHaveLength(2);
    expect(fired[0].payload.watchId).toBe('watch-001');
    expect(fired[1].payload.watchId).toBe('watch-002');
  });

  test('watch-001 is still marked activated after watch-002 processes', () => {
    const { seq } = makeSequence({ silenceGateMs: 500 });

    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    seq.prepareForWatch('watch-002', true);
    windToFull(seq);
    jest.advanceTimersByTime(500);

    expect(seq.hasActivated('watch-001')).toBe(true);
    expect(seq.hasActivated('watch-002')).toBe(true);
  });
});

// ─── Scenario 6 — Rapid wind: ramp fires exactly once ────────────────────────

describe('Scenario 6 — Rapid wind: large onWindStep fires tension ramp exactly once', () => {
  test('winding totalWindSteps at once fires tension ramp exactly once', () => {
    const { seq, audioHook } = makeSequence();
    seq.prepareForWatch('watch-001', true);
    seq.onWindStep(4); // all at once
    const rampCalls = audioHook.mock.calls.filter((c) => c[0] === AUDIO_CUES.TENSION_RAMP);
    expect(rampCalls).toHaveLength(1);
  });
});

// ─── Scenario 7 — Incorrect assembly: no first-tick (AC7) ────────────────────

describe('Scenario 7 — Incorrect assembly: first-tick audio does NOT fire (AC7)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('first_tick_one_shot does NOT fire when assembled incorrectly', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-bad', false); // incorrectly assembled
    windToFull(seq);
    jest.advanceTimersByTime(500);
    expect(audioHook).not.toHaveBeenCalledWith(AUDIO_CUES.FIRST_TICK);
  });

  test('hasActivated() is false when assembled incorrectly', () => {
    const { seq } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-bad', false);
    windToFull(seq);
    jest.advanceTimersByTime(500);
    expect(seq.hasActivated('watch-bad')).toBe(false);
  });

  test('first_tick_fired telemetry is NOT emitted on incorrect assembly', () => {
    const { seq, telemetryLog } = makeSequence({ silenceGateMs: 500 });
    seq.prepareForWatch('watch-bad', false);
    windToFull(seq);
    jest.advanceTimersByTime(500);
    const fired = telemetryLog.find((e) => e.name === FIRST_TICK_EVENTS.FIRST_TICK_FIRED);
    expect(fired).toBeUndefined();
  });
});

// ─── Scenario 8 — Mid-scene abort (AC8) ──────────────────────────────────────

describe('Scenario 8 — Mid-scene abort: abort() cancels audio, no orphaned cues (AC8)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('abort() fires stop_all cue', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 750 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq); // triggers silence hold
    seq.abort();
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUES.STOP_ALL);
  });

  test('first_tick_one_shot does NOT fire after abort()', () => {
    const { seq, audioHook } = makeSequence({ silenceGateMs: 750 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    seq.abort();
    jest.advanceTimersByTime(750);
    expect(audioHook).not.toHaveBeenCalledWith(AUDIO_CUES.FIRST_TICK);
  });

  test('abort() emits sequence_aborted telemetry', () => {
    const { seq, telemetryLog } = makeSequence({ silenceGateMs: 750 });
    seq.prepareForWatch('watch-001', true);
    windToFull(seq);
    seq.abort();
    const event = telemetryLog.find((e) => e.name === FIRST_TICK_EVENTS.SEQUENCE_ABORTED);
    expect(event).toBeDefined();
    expect(event.payload.watchId).toBe('watch-001');
  });
});
