/**
 * Tests for AC5 — Telemetry Event Emission
 *
 * AC5: Telemetry events fire correctly for:
 *   tutorial_diagnosis_started
 *   hint_tier_1_shown
 *   hint_tier_2_shown
 *   hint_tier_3_shown
 *   diagnosis_completed_without_hint
 *   diagnosis_completed_with_hint
 *
 * Scenario 1: Unassisted happy path — diagnosis_completed_without_hint fires.
 * Scenario 2: Full hint-assisted path — all hint events + diagnosis_completed_with_hint fire in order.
 */

const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmitter() {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  return { emitter: new TelemetryEmitter(hook), received };
}

// ─── AC5: Named telemetry events fire correctly ────────────────────────────────

describe('AC5 — TelemetryEmitter: all six named events fire', () => {
  test('tutorialDiagnosisStarted fires tutorial_diagnosis_started', () => {
    const { emitter, received } = makeEmitter();
    emitter.tutorialDiagnosisStarted('fi-1');
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.TUTORIAL_DIAGNOSIS_STARTED);
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
  });

  test('hintTier1Shown fires hint_tier_1_shown', () => {
    const { emitter, received } = makeEmitter();
    emitter.hintTier1Shown('fi-1');
    expect(received[0].name).toBe(EVENTS.HINT_TIER_1_SHOWN);
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
  });

  test('hintTier2Shown fires hint_tier_2_shown', () => {
    const { emitter, received } = makeEmitter();
    emitter.hintTier2Shown('fi-1');
    expect(received[0].name).toBe(EVENTS.HINT_TIER_2_SHOWN);
  });

  test('hintTier3Shown fires hint_tier_3_shown', () => {
    const { emitter, received } = makeEmitter();
    emitter.hintTier3Shown('fi-1');
    expect(received[0].name).toBe(EVENTS.HINT_TIER_3_SHOWN);
  });

  test('diagnosisCompletedWithoutHint fires diagnosis_completed_without_hint', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisCompletedWithoutHint('fi-1');
    expect(received[0].name).toBe(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT);
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
  });

  test('diagnosisCompletedWithHint fires diagnosis_completed_with_hint', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisCompletedWithHint('fi-1', 2);
    expect(received[0].name).toBe(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT);
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
    expect(received[0].payload.highestTierUsed).toBe(2);
  });
});

// ─── wasEmitted / getEmittedEvents ────────────────────────────────────────────

describe('TelemetryEmitter — tracking helpers', () => {
  test('wasEmitted returns true after the event fires', () => {
    const { emitter } = makeEmitter();
    emitter.tutorialDiagnosisStarted('fi');
    expect(emitter.wasEmitted(EVENTS.TUTORIAL_DIAGNOSIS_STARTED)).toBe(true);
  });

  test('wasEmitted returns false before the event fires', () => {
    const { emitter } = makeEmitter();
    expect(emitter.wasEmitted(EVENTS.HINT_TIER_1_SHOWN)).toBe(false);
  });

  test('getEmittedEvents returns a copy of the log', () => {
    const { emitter } = makeEmitter();
    emitter.hintTier1Shown('fi');
    emitter.hintTier2Shown('fi');
    const log = emitter.getEmittedEvents();
    expect(log).toHaveLength(2);
  });

  test('getEmittedEvents returns a copy (mutating it does not affect internal state)', () => {
    const { emitter } = makeEmitter();
    emitter.hintTier1Shown('fi');
    const log = emitter.getEmittedEvents();
    log.pop();
    expect(emitter.getEmittedEvents()).toHaveLength(1);
  });
});

// ─── EVENTS constants completeness ────────────────────────────────────────────

describe('EVENTS constants — completeness', () => {
  test('all six AC5 event names are defined in the EVENTS object', () => {
    expect(EVENTS.TUTORIAL_DIAGNOSIS_STARTED).toBe('tutorial_diagnosis_started');
    expect(EVENTS.HINT_TIER_1_SHOWN).toBe('hint_tier_1_shown');
    expect(EVENTS.HINT_TIER_2_SHOWN).toBe('hint_tier_2_shown');
    expect(EVENTS.HINT_TIER_3_SHOWN).toBe('hint_tier_3_shown');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT).toBe('diagnosis_completed_without_hint');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT).toBe('diagnosis_completed_with_hint');
  });
});

// ─── Scenario 1: Unassisted happy path ────────────────────────────────────────

describe('Scenario 1 — Unassisted happy path: diagnosis_completed_without_hint fires', () => {
  test('completing diagnosis without requesting any hint fires diagnosis_completed_without_hint', () => {
    const { emitter } = makeEmitter();
    // Simulate: no hint events fired before completion
    emitter.diagnosisCompletedWithoutHint('fi-1');
    expect(emitter.wasEmitted(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT)).toBe(true);
    expect(emitter.wasEmitted(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT)).toBe(false);
  });
});

// ─── Scenario 2: Full hint-assisted path ──────────────────────────────────────

describe('Scenario 2 — Full hint-assisted path: all events fire in order', () => {
  test('hint tiers 1/2/3 and diagnosis_completed_with_hint all fire in correct order', () => {
    const { emitter } = makeEmitter();
    emitter.tutorialDiagnosisStarted('fi-1');
    emitter.hintTier1Shown('fi-1');
    emitter.hintTier2Shown('fi-1');
    emitter.hintTier3Shown('fi-1');
    emitter.diagnosisCompletedWithHint('fi-1', 3);

    const log = emitter.getEmittedEvents().map((e) => e.name);
    expect(log).toEqual([
      'tutorial_diagnosis_started',
      'hint_tier_1_shown',
      'hint_tier_2_shown',
      'hint_tier_3_shown',
      'diagnosis_completed_with_hint',
    ]);
  });
});

// ─── Constructor guard ────────────────────────────────────────────────────────

describe('TelemetryEmitter — constructor guard', () => {
  test('throws if instrumentationHook is not a function', () => {
    expect(() => new TelemetryEmitter(null)).toThrow();
    expect(() => new TelemetryEmitter('not-a-function')).toThrow();
  });
});

// ─── AC8: Default parameter — emit() without payload uses default {} (line 45) ─

describe('AC8 — TelemetryEmitter: emit(eventName) with no payload uses default (line 45)', () => {
  test('emit(eventName) with no second argument does not throw', () => {
    const { emitter } = makeEmitter();
    expect(() => emitter.emit('test_event')).not.toThrow();
  });

  test('emit(eventName) with no payload calls the instrumentation hook with a defined payload', () => {
    const received = [];
    const hook = (name, payload) => received.push({ name, payload });
    const emitter = new TelemetryEmitter(hook);

    emitter.emit('test_event_no_payload');

    expect(received).toHaveLength(1);
    expect(received[0].name).toBe('test_event_no_payload');
    expect(received[0].payload).toBeDefined();
  });

  test('emit(eventName) default payload is an empty object {}', () => {
    const received = [];
    const hook = (name, payload) => received.push({ name, payload });
    const emitter = new TelemetryEmitter(hook);

    emitter.emit('test_event_default_payload');

    expect(received[0].payload).toEqual({});
  });

  test('event emitted without payload is recorded in the internal log', () => {
    const { emitter } = makeEmitter();
    emitter.emit('test_event_logged');
    const log = emitter.getEmittedEvents();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe('test_event_logged');
    expect(log[0].payload).toEqual({});
  });
});
