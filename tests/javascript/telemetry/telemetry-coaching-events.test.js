/**
 * Tests for new TelemetryEmitter mistake-type events — Issue #293
 * Adaptive Coaching Engine — Mistake-Pattern Detection Layer (Phase 1 MVP)
 *
 * Verifies AC1 / AC6:
 *   - The three new additive EVENTS constants are defined correctly
 *   - The three new convenience methods fire the correct named events
 *   - Payloads match the AC1 specification: { faultInstanceId, toolId },
 *     { faultInstanceId, submittedFaultTypeId }, { faultInstanceId }
 *   - Additive-only: no existing event names or signatures are changed (AC6)
 */

'use strict';

const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmitter() {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  return { emitter: new TelemetryEmitter(hook), received };
}

// ─── EVENTS constants — three new mistake-type events (AC1, AC6) ──────────────

describe('EVENTS constants — three new diagnosis-phase mistake-type events (AC1, AC6)', () => {
  test('WRONG_TOOL_SELECTED constant is defined with correct value', () => {
    expect(EVENTS.WRONG_TOOL_SELECTED).toBe('wrong_tool_selected');
  });

  test('FAULT_TYPE_MISIDENTIFIED constant is defined with correct value', () => {
    expect(EVENTS.FAULT_TYPE_MISIDENTIFIED).toBe('fault_type_misidentified');
  });

  test('DIAGNOSIS_UNDO_ATTEMPTED constant is defined with correct value', () => {
    expect(EVENTS.DIAGNOSIS_UNDO_ATTEMPTED).toBe('diagnosis_undo_attempted');
  });

  test('AC6 — existing diagnosis event constants are unchanged', () => {
    expect(EVENTS.TUTORIAL_DIAGNOSIS_STARTED).toBe('tutorial_diagnosis_started');
    expect(EVENTS.HINT_TIER_1_SHOWN).toBe('hint_tier_1_shown');
    expect(EVENTS.HINT_TIER_2_SHOWN).toBe('hint_tier_2_shown');
    expect(EVENTS.HINT_TIER_3_SHOWN).toBe('hint_tier_3_shown');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT).toBe('diagnosis_completed_without_hint');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT).toBe('diagnosis_completed_with_hint');
  });

  test('AC6 — existing reassembly event constants are unchanged', () => {
    expect(EVENTS.UNDO_ATTEMPTED).toBe('undo_attempted');
    expect(EVENTS.REASSEMBLY_PART_CONFIRMED).toBe('reassembly_part_confirmed');
    expect(EVENTS.REASSEMBLY_COMPLETED).toBe('reassembly_completed');
  });
});

// ─── wrongToolSelected convenience method ────────────────────────────────────

describe('TelemetryEmitter.wrongToolSelected — fires wrong_tool_selected (AC1)', () => {
  test('fires wrong_tool_selected event', () => {
    const { emitter, received } = makeEmitter();
    emitter.wrongToolSelected('fi-1', 'screwdriver');
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.WRONG_TOOL_SELECTED);
  });

  test('payload contains faultInstanceId', () => {
    const { emitter, received } = makeEmitter();
    emitter.wrongToolSelected('fi-1', 'screwdriver');
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
  });

  test('payload contains toolId', () => {
    const { emitter, received } = makeEmitter();
    emitter.wrongToolSelected('fi-1', 'screwdriver');
    expect(received[0].payload.toolId).toBe('screwdriver');
  });

  test('wasEmitted returns true after wrongToolSelected fires', () => {
    const { emitter } = makeEmitter();
    emitter.wrongToolSelected('fi-1', 'screwdriver');
    expect(emitter.wasEmitted(EVENTS.WRONG_TOOL_SELECTED)).toBe(true);
  });

  test('wasEmitted returns false before wrongToolSelected fires', () => {
    const { emitter } = makeEmitter();
    expect(emitter.wasEmitted(EVENTS.WRONG_TOOL_SELECTED)).toBe(false);
  });

  test('event is recorded in the emitted events log', () => {
    const { emitter } = makeEmitter();
    emitter.wrongToolSelected('fi-1', 'screwdriver');
    const log = emitter.getEmittedEvents();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe(EVENTS.WRONG_TOOL_SELECTED);
  });
});

// ─── faultTypeMisidentified convenience method ────────────────────────────────

describe('TelemetryEmitter.faultTypeMisidentified — fires fault_type_misidentified (AC1)', () => {
  test('fires fault_type_misidentified event', () => {
    const { emitter, received } = makeEmitter();
    emitter.faultTypeMisidentified('fi-2', 'escapement_fault');
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.FAULT_TYPE_MISIDENTIFIED);
  });

  test('payload contains faultInstanceId', () => {
    const { emitter, received } = makeEmitter();
    emitter.faultTypeMisidentified('fi-2', 'escapement_fault');
    expect(received[0].payload.faultInstanceId).toBe('fi-2');
  });

  test('payload contains submittedFaultTypeId', () => {
    const { emitter, received } = makeEmitter();
    emitter.faultTypeMisidentified('fi-2', 'escapement_fault');
    expect(received[0].payload.submittedFaultTypeId).toBe('escapement_fault');
  });

  test('wasEmitted returns true after faultTypeMisidentified fires', () => {
    const { emitter } = makeEmitter();
    emitter.faultTypeMisidentified('fi-2', 'escapement_fault');
    expect(emitter.wasEmitted(EVENTS.FAULT_TYPE_MISIDENTIFIED)).toBe(true);
  });
});

// ─── diagnosisUndoAttempted convenience method ────────────────────────────────

describe('TelemetryEmitter.diagnosisUndoAttempted — fires diagnosis_undo_attempted (AC1)', () => {
  test('fires diagnosis_undo_attempted event', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisUndoAttempted('fi-3');
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.DIAGNOSIS_UNDO_ATTEMPTED);
  });

  test('payload contains faultInstanceId', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisUndoAttempted('fi-3');
    expect(received[0].payload.faultInstanceId).toBe('fi-3');
  });

  test('wasEmitted returns true after diagnosisUndoAttempted fires', () => {
    const { emitter } = makeEmitter();
    emitter.diagnosisUndoAttempted('fi-3');
    expect(emitter.wasEmitted(EVENTS.DIAGNOSIS_UNDO_ATTEMPTED)).toBe(true);
  });
});

// ─── AC5 phase isolation — reassembly undo_attempted is a separate event ────

describe('AC5 — Phase isolation: reassembly undo_attempted is separate from diagnosis_undo_attempted', () => {
  test('undo_attempted (reassembly) and diagnosis_undo_attempted are distinct event names', () => {
    expect(EVENTS.UNDO_ATTEMPTED).toBe('undo_attempted');
    expect(EVENTS.DIAGNOSIS_UNDO_ATTEMPTED).toBe('diagnosis_undo_attempted');
    expect(EVENTS.UNDO_ATTEMPTED).not.toBe(EVENTS.DIAGNOSIS_UNDO_ATTEMPTED);
  });

  test('firing reassembly undo_attempted does not set wasEmitted for diagnosis_undo_attempted', () => {
    const { emitter } = makeEmitter();
    emitter.undoAttempted('part-id', 'session-1', 1);
    expect(emitter.wasEmitted(EVENTS.UNDO_ATTEMPTED)).toBe(true);
    expect(emitter.wasEmitted(EVENTS.DIAGNOSIS_UNDO_ATTEMPTED)).toBe(false);
  });

  test('firing diagnosis_undo_attempted does not set wasEmitted for reassembly undo_attempted', () => {
    const { emitter } = makeEmitter();
    emitter.diagnosisUndoAttempted('fi-3');
    expect(emitter.wasEmitted(EVENTS.DIAGNOSIS_UNDO_ATTEMPTED)).toBe(true);
    expect(emitter.wasEmitted(EVENTS.UNDO_ATTEMPTED)).toBe(false);
  });
});

// ─── AC6 — Additive-only: existing method signatures unchanged ────────────────

describe('AC6 — Existing TelemetryEmitter methods are unchanged', () => {
  test('tutorialDiagnosisStarted still fires tutorial_diagnosis_started with faultInstanceId', () => {
    const { emitter, received } = makeEmitter();
    emitter.tutorialDiagnosisStarted('fi-1');
    expect(received[0].name).toBe(EVENTS.TUTORIAL_DIAGNOSIS_STARTED);
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
  });

  test('undoAttempted still fires undo_attempted with reassembly payload', () => {
    const { emitter, received } = makeEmitter();
    emitter.undoAttempted('part-x', 'session-1', 3);
    expect(received[0].name).toBe(EVENTS.UNDO_ATTEMPTED);
    expect(received[0].payload.partId).toBe('part-x');
    expect(received[0].payload.sessionId).toBe('session-1');
    expect(received[0].payload.totalUndoAttempts).toBe(3);
  });

  test('diagnosisCompletedWithHint still works with original signature', () => {
    const { emitter, received } = makeEmitter();
    emitter.diagnosisCompletedWithHint('fi-1', 2);
    expect(received[0].name).toBe(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT);
    expect(received[0].payload.faultInstanceId).toBe('fi-1');
    expect(received[0].payload.highestTierUsed).toBe(2);
  });
});
