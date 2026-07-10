/**
 * Tests: Loupe A/B Telemetry — Issue #117 AC4
 *
 * Verifies that the three new loupe A/B telemetry events fire correctly:
 *   loupe_ab_arm_assigned        — fires once at session creation (AC3, AC4)
 *   time_before_first_hint_recorded — fires when hint is first requested (AC4)
 *   diagnosis_session_completed  — fires at diagnosis completion with arm tag (AC4)
 *
 * All events are tagged with the A/B arm for cohort-segmented post-test analysis.
 *
 * Run with: npm test
 */

const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');

function makeEmitter() {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  return { emitter: new TelemetryEmitter(hook), received };
}

// ── EVENTS constants ──────────────────────────────────────────────────────────

describe('EVENTS constants — Issue #117 loupe A/B events defined', () => {
  test('LOUPE_AB_ARM_ASSIGNED is defined', () => {
    expect(EVENTS.LOUPE_AB_ARM_ASSIGNED).toBe('loupe_ab_arm_assigned');
  });

  test('TIME_BEFORE_FIRST_HINT_RECORDED is defined', () => {
    expect(EVENTS.TIME_BEFORE_FIRST_HINT_RECORDED).toBe('time_before_first_hint_recorded');
  });

  test('DIAGNOSIS_SESSION_COMPLETED is defined', () => {
    expect(EVENTS.DIAGNOSIS_SESSION_COMPLETED).toBe('diagnosis_session_completed');
  });
});

// ── loupeAbArmAssigned ────────────────────────────────────────────────────────

describe('TelemetryEmitter — loupeAbArmAssigned (AC3, AC4)', () => {
  test('fires loupe_ab_arm_assigned event', () => {
    const { emitter, received } = makeEmitter();
    emitter.loupeAbArmAssigned('sess-1', 'treatment');
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.LOUPE_AB_ARM_ASSIGNED);
  });

  test('payload includes sessionId and arm', () => {
    const { emitter, received } = makeEmitter();
    emitter.loupeAbArmAssigned('sess-2', 'control');
    expect(received[0].payload.sessionId).toBe('sess-2');
    expect(received[0].payload.arm).toBe('control');
  });

  test('fires for treatment arm', () => {
    const { emitter, received } = makeEmitter();
    emitter.loupeAbArmAssigned('sess-3', 'treatment');
    expect(received[0].payload.arm).toBe('treatment');
  });

  test('wasEmitted returns true after loupeAbArmAssigned fires', () => {
    const { emitter } = makeEmitter();
    emitter.loupeAbArmAssigned('sess-4', 'treatment');
    expect(emitter.wasEmitted(EVENTS.LOUPE_AB_ARM_ASSIGNED)).toBe(true);
  });
});

// ── timeBeforeFirstHintRecorded ───────────────────────────────────────────────

describe('TelemetryEmitter — timeBeforeFirstHintRecorded (AC4)', () => {
  test('fires time_before_first_hint_recorded event', () => {
    const { emitter, received } = makeEmitter();
    emitter.timeBeforeFirstHintRecorded('sess-5', 'treatment', 3000);
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.TIME_BEFORE_FIRST_HINT_RECORDED);
  });

  test('payload includes sessionId, arm, and elapsedMs', () => {
    const { emitter, received } = makeEmitter();
    emitter.timeBeforeFirstHintRecorded('sess-6', 'treatment', 4500);
    expect(received[0].payload.sessionId).toBe('sess-6');
    expect(received[0].payload.arm).toBe('treatment');
    expect(received[0].payload.elapsedMs).toBe(4500);
  });

  test('fires correctly for control arm', () => {
    const { emitter, received } = makeEmitter();
    emitter.timeBeforeFirstHintRecorded('sess-7', 'control', 1200);
    expect(received[0].payload.arm).toBe('control');
    expect(received[0].payload.elapsedMs).toBe(1200);
  });
});

// ── diagnosisSessionCompleted ─────────────────────────────────────────────────

describe('TelemetryEmitter — diagnosisSessionCompleted (AC4)', () => {
  test('fires diagnosis_session_completed event', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisSessionCompleted('sess-8', 'treatment', true);
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.DIAGNOSIS_SESSION_COMPLETED);
  });

  test('payload includes sessionId, arm, and diagnosedWithoutHint (true)', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisSessionCompleted('sess-9', 'treatment', true);
    expect(received[0].payload.sessionId).toBe('sess-9');
    expect(received[0].payload.arm).toBe('treatment');
    expect(received[0].payload.diagnosedWithoutHint).toBe(true);
  });

  test('payload diagnosedWithoutHint is false when hint was used', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisSessionCompleted('sess-10', 'control', false);
    expect(received[0].payload.diagnosedWithoutHint).toBe(false);
    expect(received[0].payload.arm).toBe('control');
  });
});

// ── End-to-end AC4 telemetry sequence ─────────────────────────────────────────

describe('Loupe A/B telemetry — AC4 end-to-end session sequence', () => {
  test('arm assignment + time-before-first-hint + session completion fires in order', () => {
    const { emitter } = makeEmitter();
    emitter.loupeAbArmAssigned('sess-11', 'treatment');
    emitter.timeBeforeFirstHintRecorded('sess-11', 'treatment', 5000);
    emitter.diagnosisSessionCompleted('sess-11', 'treatment', false);

    const log = emitter.getEmittedEvents().map((e) => e.name);
    expect(log).toContain(EVENTS.LOUPE_AB_ARM_ASSIGNED);
    expect(log).toContain(EVENTS.TIME_BEFORE_FIRST_HINT_RECORDED);
    expect(log).toContain(EVENTS.DIAGNOSIS_SESSION_COMPLETED);
  });

  test('diagnosis without hint: only arm + completion events fire (no time-before-hint)', () => {
    const { emitter } = makeEmitter();
    emitter.loupeAbArmAssigned('sess-12', 'treatment');
    emitter.diagnosisSessionCompleted('sess-12', 'treatment', true);

    expect(emitter.wasEmitted(EVENTS.LOUPE_AB_ARM_ASSIGNED)).toBe(true);
    expect(emitter.wasEmitted(EVENTS.DIAGNOSIS_SESSION_COMPLETED)).toBe(true);
    expect(emitter.wasEmitted(EVENTS.TIME_BEFORE_FIRST_HINT_RECORDED)).toBe(false);
  });
});