/**
 * Tests for TelemetryEmitter reassembly extensions (AC5 — backward-compatible additive).
 *
 * AC5: Undo frequency per reassembly stage in playtest with 5–10 new players
 * decreases by ≥30% compared to pre-implementation baseline measurement.
 *
 * These tests verify:
 *   - New reassembly events (undo_attempted, reassembly_part_confirmed, reassembly_completed)
 *     emit correctly.
 *   - New events do NOT affect existing diagnosis events.
 *   - EVENTS constants include all three new event names.
 */

const { TelemetryEmitter, EVENTS } = require('../../../javascript/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmitter() {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  return { emitter: new TelemetryEmitter(hook), received };
}

// ─── EVENTS constants include reassembly events ───────────────────────────────

describe('EVENTS constants — reassembly event names defined', () => {
  test('UNDO_ATTEMPTED is defined', () => {
    expect(EVENTS.UNDO_ATTEMPTED).toBe('undo_attempted');
  });

  test('REASSEMBLY_PART_CONFIRMED is defined', () => {
    expect(EVENTS.REASSEMBLY_PART_CONFIRMED).toBe('reassembly_part_confirmed');
  });

  test('REASSEMBLY_COMPLETED is defined', () => {
    expect(EVENTS.REASSEMBLY_COMPLETED).toBe('reassembly_completed');
  });
});

// ─── undoAttempted event ──────────────────────────────────────────────────────

describe('TelemetryEmitter — undoAttempted()', () => {
  test('fires undo_attempted event', () => {
    const { emitter, received } = makeEmitter();
    emitter.undoAttempted('mainspring', 'session-1', 1);
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.UNDO_ATTEMPTED);
  });

  test('payload includes partId', () => {
    const { emitter, received } = makeEmitter();
    emitter.undoAttempted('escapement', 'session-1', 2);
    expect(received[0].payload.partId).toBe('escapement');
  });

  test('payload includes sessionId', () => {
    const { emitter, received } = makeEmitter();
    emitter.undoAttempted('mainspring', 'session-42', 1);
    expect(received[0].payload.sessionId).toBe('session-42');
  });

  test('payload includes totalUndoAttempts', () => {
    const { emitter, received } = makeEmitter();
    emitter.undoAttempted('mainspring', 'session-1', 5);
    expect(received[0].payload.totalUndoAttempts).toBe(5);
  });

  test('wasEmitted returns true after undoAttempted fires', () => {
    const { emitter } = makeEmitter();
    emitter.undoAttempted('mainspring', null, 1);
    expect(emitter.wasEmitted(EVENTS.UNDO_ATTEMPTED)).toBe(true);
  });
});

// ─── reassemblyPartConfirmed event ────────────────────────────────────────────

describe('TelemetryEmitter — reassemblyPartConfirmed()', () => {
  test('fires reassembly_part_confirmed event', () => {
    const { emitter, received } = makeEmitter();
    emitter.reassemblyPartConfirmed('balance_wheel', 'session-1');
    expect(received[0].name).toBe(EVENTS.REASSEMBLY_PART_CONFIRMED);
  });

  test('payload includes partId', () => {
    const { emitter, received } = makeEmitter();
    emitter.reassemblyPartConfirmed('balance_wheel', 'session-1');
    expect(received[0].payload.partId).toBe('balance_wheel');
  });

  test('payload includes sessionId', () => {
    const { emitter, received } = makeEmitter();
    emitter.reassemblyPartConfirmed('balance_wheel', 'session-7');
    expect(received[0].payload.sessionId).toBe('session-7');
  });
});

// ─── reassemblyCompleted event ────────────────────────────────────────────────

describe('TelemetryEmitter — reassemblyCompleted()', () => {
  test('fires reassembly_completed event', () => {
    const { emitter, received } = makeEmitter();
    emitter.reassemblyCompleted('session-1', { assembledCount: 5, totalUndoAttempts: 2 });
    expect(received[0].name).toBe(EVENTS.REASSEMBLY_COMPLETED);
  });

  test('payload includes sessionId', () => {
    const { emitter, received } = makeEmitter();
    emitter.reassemblyCompleted('session-42', { assembledCount: 3, totalUndoAttempts: 0 });
    expect(received[0].payload.sessionId).toBe('session-42');
  });

  test('payload includes assembledCount', () => {
    const { emitter, received } = makeEmitter();
    emitter.reassemblyCompleted('session-1', { assembledCount: 10, totalUndoAttempts: 3 });
    expect(received[0].payload.assembledCount).toBe(10);
  });

  test('payload includes totalUndoAttempts', () => {
    const { emitter, received } = makeEmitter();
    emitter.reassemblyCompleted('session-1', { assembledCount: 10, totalUndoAttempts: 7 });
    expect(received[0].payload.totalUndoAttempts).toBe(7);
  });
});

// ─── Backward-compatibility: existing diagnosis events unaffected ──────────────

describe('TelemetryEmitter — backward-compatibility (existing diagnosis events unaffected)', () => {
  test('diagnosisCompletedWithoutHint still fires correctly after reassembly extension', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisCompletedWithoutHint('fi-1');
    expect(received[0].name).toBe(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT);
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
  });

  test('all six original diagnosis events are still present in EVENTS', () => {
    expect(EVENTS.TUTORIAL_DIAGNOSIS_STARTED).toBe('tutorial_diagnosis_started');
    expect(EVENTS.HINT_TIER_1_SHOWN).toBe('hint_tier_1_shown');
    expect(EVENTS.HINT_TIER_2_SHOWN).toBe('hint_tier_2_shown');
    expect(EVENTS.HINT_TIER_3_SHOWN).toBe('hint_tier_3_shown');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT).toBe('diagnosis_completed_without_hint');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT).toBe('diagnosis_completed_with_hint');
  });

  test('reassembly events do not interfere with diagnosis event emission', () => {
    const { emitter, received } = makeEmitter();
    emitter.tutorialDiagnosisStarted('fi-1');
    emitter.undoAttempted('mainspring', null, 1);
    emitter.diagnosisCompletedWithoutHint('fi-1');

    const names = received.map((e) => e.name);
    expect(names).toContain('tutorial_diagnosis_started');
    expect(names).toContain('undo_attempted');
    expect(names).toContain('diagnosis_completed_without_hint');
    // Ordering preserved
    expect(names[0]).toBe('tutorial_diagnosis_started');
    expect(names[2]).toBe('diagnosis_completed_without_hint');
  });

  test('getEmittedEvents returns all events including new reassembly ones', () => {
    const { emitter } = makeEmitter();
    emitter.hintTier1Shown('fi-1');
    emitter.undoAttempted('mainspring', null, 1);
    emitter.reassemblyCompleted(null, { assembledCount: 1, totalUndoAttempts: 1 });

    const log = emitter.getEmittedEvents();
    expect(log).toHaveLength(3);
  });
});
