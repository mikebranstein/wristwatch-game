/**
 * Unit tests for AdaptiveCoachingController — Issue #293
 * Adaptive Coaching Engine — Mistake-Pattern Detection Layer (Phase 1 MVP)
 *
 * Covers all 6 acceptance criteria:
 *   AC1 — Detects three mistake types (wrong_tool_selected, fault_type_misidentified,
 *          diagnosis_undo_attempted)
 *   AC2 — Counter increments per event, per faultInstanceId+type
 *   AC3 — Threshold configurable (default 2); trigger suppression on repeat
 *   AC4 — Session reset (resetSession) and step reset (resetStep)
 *   AC5 — Phase isolation: only diagnosis events are processed here (non-diagnosis
 *          events are never routed to this controller)
 *   AC6 — Interface stability: AdaptiveCoachingController is purely additive;
 *          all existing tests pass unmodified
 *
 * Test Scenarios:
 *   Scenario 1 — Wrong tool: counter increments, trigger fires at threshold
 *   Scenario 2 — Fault type misidentified: counter increments, trigger fires at threshold
 *   Scenario 3 — Diagnosis undo attempted: counter increments, trigger fires at threshold
 *   Scenario 4 — Trigger suppression: no duplicate coaching_trigger for same step+type
 *   Scenario 5 — Counter reset on step advance (resetStep)
 *   Scenario 6 — Configurable threshold
 *   Scenario 7 — Phase isolation: controller does not process non-diagnosis events
 *   Scenario 8 — Session reset (resetSession) clears all state
 *   Scenario 9 — Synthetic event injection: isolated unit testing without DiagnosisScreen
 *   Scenario 10 — coaching_trigger payload shape: { type, stepId, failureCount }
 */

'use strict';

const {
  AdaptiveCoachingController,
  MISTAKE_TYPES,
  DEFAULT_THRESHOLD,
} = require('../../src/diagnosis/AdaptiveCoachingController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const triggers = [];
  const onCoachingTrigger = (payload) => triggers.push(payload);
  const controller = new AdaptiveCoachingController({ onCoachingTrigger, ...opts });
  return { controller, triggers };
}

// ─── Constructor guard ────────────────────────────────────────────────────────

describe('AdaptiveCoachingController — constructor', () => {
  test('throws if onCoachingTrigger is not a function', () => {
    expect(() => new AdaptiveCoachingController({ onCoachingTrigger: null })).toThrow();
    expect(() => new AdaptiveCoachingController({ onCoachingTrigger: 'not-a-fn' })).toThrow();
    expect(() => new AdaptiveCoachingController({})).toThrow();
  });

  test('does not throw when onCoachingTrigger is a function', () => {
    expect(() => new AdaptiveCoachingController({ onCoachingTrigger: () => {} })).not.toThrow();
  });
});

// ─── EVENTS constants completeness ───────────────────────────────────────────

describe('MISTAKE_TYPES constants — AC1', () => {
  test('all three mistake types are defined', () => {
    expect(MISTAKE_TYPES.WRONG_TOOL_SELECTED).toBe('wrong_tool_selected');
    expect(MISTAKE_TYPES.FAULT_TYPE_MISIDENTIFIED).toBe('fault_type_misidentified');
    expect(MISTAKE_TYPES.DIAGNOSIS_UNDO_ATTEMPTED).toBe('diagnosis_undo_attempted');
  });

  test('DEFAULT_THRESHOLD is 2 (AC3)', () => {
    expect(DEFAULT_THRESHOLD).toBe(2);
  });
});

// ─── Scenario 1 — wrong_tool_selected ────────────────────────────────────────

describe('Scenario 1 — wrong_tool_selected: counter increments, trigger fires at threshold (AC1, AC2, AC3)', () => {
  test('counter starts at 0 before any events', () => {
    const { controller } = makeController();
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
  });

  test('counter increments to 1 after first wrong_tool_selected event (AC2)', () => {
    const { controller } = makeController();
    controller.recordWrongToolSelected('fi-1', 'screwdriver');
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(1);
  });

  test('counter increments to 2 after second wrong_tool_selected event (AC2)', () => {
    const { controller } = makeController();
    controller.recordWrongToolSelected('fi-1', 'screwdriver');
    controller.recordWrongToolSelected('fi-1', 'hammer');
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(2);
  });

  test('coaching_trigger fires when count reaches threshold of 2 (AC3)', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('fi-1', 'screwdriver');
    expect(triggers).toHaveLength(0);
    controller.recordWrongToolSelected('fi-1', 'hammer');
    expect(triggers).toHaveLength(1);
  });

  test('coaching_trigger does NOT fire before threshold is reached (AC3)', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('fi-1', 'screwdriver');
    expect(triggers).toHaveLength(0);
  });
});

// ─── Scenario 2 — fault_type_misidentified ───────────────────────────────────

describe('Scenario 2 — fault_type_misidentified: counter increments, trigger fires at threshold (AC1, AC2, AC3)', () => {
  test('counter increments per fault_type_misidentified event (AC2)', () => {
    const { controller } = makeController();
    controller.recordFaultTypeMisidentified('fi-2', 'escapement_fault');
    expect(controller.getCount('fi-2', MISTAKE_TYPES.FAULT_TYPE_MISIDENTIFIED)).toBe(1);
    controller.recordFaultTypeMisidentified('fi-2', 'mainspring_fault');
    expect(controller.getCount('fi-2', MISTAKE_TYPES.FAULT_TYPE_MISIDENTIFIED)).toBe(2);
  });

  test('coaching_trigger fires at threshold for fault_type_misidentified (AC3)', () => {
    const { controller, triggers } = makeController();
    controller.recordFaultTypeMisidentified('fi-2', 'escapement_fault');
    controller.recordFaultTypeMisidentified('fi-2', 'mainspring_fault');
    expect(triggers).toHaveLength(1);
  });

  test('counters for different mistake types on same step are independent (AC2)', () => {
    const { controller } = makeController();
    controller.recordFaultTypeMisidentified('fi-2', 'wrong_fault');
    expect(controller.getCount('fi-2', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
    expect(controller.getCount('fi-2', MISTAKE_TYPES.DIAGNOSIS_UNDO_ATTEMPTED)).toBe(0);
  });
});

// ─── Scenario 3 — diagnosis_undo_attempted ───────────────────────────────────

describe('Scenario 3 — diagnosis_undo_attempted: counter increments, trigger fires at threshold (AC1, AC2, AC3)', () => {
  test('counter increments per diagnosis_undo_attempted event (AC2)', () => {
    const { controller } = makeController();
    controller.recordDiagnosisUndoAttempted('fi-3');
    expect(controller.getCount('fi-3', MISTAKE_TYPES.DIAGNOSIS_UNDO_ATTEMPTED)).toBe(1);
    controller.recordDiagnosisUndoAttempted('fi-3');
    expect(controller.getCount('fi-3', MISTAKE_TYPES.DIAGNOSIS_UNDO_ATTEMPTED)).toBe(2);
  });

  test('coaching_trigger fires at threshold for diagnosis_undo_attempted (AC3)', () => {
    const { controller, triggers } = makeController();
    controller.recordDiagnosisUndoAttempted('fi-3');
    controller.recordDiagnosisUndoAttempted('fi-3');
    expect(triggers).toHaveLength(1);
  });
});

// ─── Scenario 4 — Trigger suppression (AC3) ──────────────────────────────────

describe('Scenario 4 — Trigger suppression: no duplicate coaching_trigger for same step+type (AC3)', () => {
  test('coaching_trigger fires exactly once per step+type, even when threshold is exceeded multiple times', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-1', 'tool-b');
    controller.recordWrongToolSelected('fi-1', 'tool-c'); // 3rd — should NOT re-trigger
    expect(triggers).toHaveLength(1);
  });

  test('wasTriggered returns true after threshold is crossed', () => {
    const { controller } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-1', 'tool-b');
    expect(controller.wasTriggered('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(true);
  });

  test('wasTriggered returns false before threshold is crossed', () => {
    const { controller } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    expect(controller.wasTriggered('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(false);
  });

  test('trigger suppression is per step+type: separate types on same step trigger independently', () => {
    const { controller, triggers } = makeController();
    // Cross threshold for WRONG_TOOL
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-1', 'tool-b');
    // Cross threshold for FAULT_TYPE_MISIDENTIFIED on same step
    controller.recordFaultTypeMisidentified('fi-1', 'bad-fault-a');
    controller.recordFaultTypeMisidentified('fi-1', 'bad-fault-b');
    expect(triggers).toHaveLength(2);
  });

  test('trigger suppression is per step: different steps trigger independently', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-1', 'tool-b');
    controller.recordWrongToolSelected('fi-2', 'tool-a'); // different step
    controller.recordWrongToolSelected('fi-2', 'tool-b'); // different step crosses threshold
    expect(triggers).toHaveLength(2);
  });
});

// ─── Scenario 5 — Counter reset on step advance (AC4) ────────────────────────

describe('Scenario 5 — resetStep: counter and suppression state resets for a specific step (AC4)', () => {
  test('resetStep clears the count for the given faultInstanceId', () => {
    const { controller } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.resetStep('fi-1');
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
  });

  test('resetStep clears the triggered flag, allowing re-trigger after reset', () => {
    const { controller, triggers } = makeController();
    // Reach threshold (trigger fires)
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-1', 'tool-b');
    expect(triggers).toHaveLength(1);
    // Reset and re-reach threshold (should trigger again)
    controller.resetStep('fi-1');
    controller.recordWrongToolSelected('fi-1', 'tool-c');
    controller.recordWrongToolSelected('fi-1', 'tool-d');
    expect(triggers).toHaveLength(2);
  });

  test('resetStep does not affect counts for other steps', () => {
    const { controller } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-2', 'tool-b');
    controller.resetStep('fi-1');
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
    expect(controller.getCount('fi-2', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(1);
  });
});

// ─── Scenario 6 — Configurable threshold (AC3) ───────────────────────────────

describe('Scenario 6 — Configurable threshold (AC3)', () => {
  test('default threshold is 2 (AC3)', () => {
    const { controller } = makeController();
    expect(controller.getThreshold()).toBe(DEFAULT_THRESHOLD);
    expect(controller.getThreshold()).toBe(2);
  });

  test('custom threshold of 3: trigger fires at count 3, not at count 2', () => {
    const { controller, triggers } = makeController({ threshold: 3 });
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-1', 'tool-b');
    expect(triggers).toHaveLength(0); // 2 < threshold of 3
    controller.recordWrongToolSelected('fi-1', 'tool-c');
    expect(triggers).toHaveLength(1); // 3 >= threshold of 3
  });

  test('custom threshold of 1: trigger fires immediately on first event', () => {
    const { controller, triggers } = makeController({ threshold: 1 });
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    expect(triggers).toHaveLength(1);
  });

  test('getThreshold returns the configured threshold', () => {
    const { controller } = makeController({ threshold: 5 });
    expect(controller.getThreshold()).toBe(5);
  });
});

// ─── Scenario 7 — Phase isolation (AC5) ──────────────────────────────────────

describe('Scenario 7 — Phase isolation: non-diagnosis events do not affect coaching counters (AC5)', () => {
  test('reassembly-phase undo events (routed via their own path) never reach this controller — counters stay at 0', () => {
    // The AdaptiveCoachingController has no method for reassembly undo.
    // This test verifies the controller contract: only the three
    // diagnosis-phase record*() methods exist; no reassembly integration.
    const { controller } = makeController();
    expect(typeof controller.recordWrongToolSelected).toBe('function');
    expect(typeof controller.recordFaultTypeMisidentified).toBe('function');
    expect(typeof controller.recordDiagnosisUndoAttempted).toBe('function');
    // No reassembly undo method present (AC5 boundary)
    expect(controller.recordReassemblyUndo).toBeUndefined();
    expect(controller.recordUndoAttempted).toBeUndefined();
  });

  test('coaching counters are not mutated if no record*() calls are made', () => {
    const { controller, triggers } = makeController();
    // Simulate non-diagnosis phase — no record calls
    expect(controller.getCount('fi-any', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
    expect(triggers).toHaveLength(0);
  });
});

// ─── Scenario 8 — Session reset (AC4) ────────────────────────────────────────

describe('Scenario 8 — resetSession: clears all state (AC4)', () => {
  test('resetSession resets all counters across all steps', () => {
    const { controller } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordFaultTypeMisidentified('fi-2', 'bad-fault');
    controller.resetSession();
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
    expect(controller.getCount('fi-2', MISTAKE_TYPES.FAULT_TYPE_MISIDENTIFIED)).toBe(0);
  });

  test('resetSession clears triggered flags — trigger can fire again after reset', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('fi-1', 'tool-a');
    controller.recordWrongToolSelected('fi-1', 'tool-b');
    expect(triggers).toHaveLength(1);
    controller.resetSession();
    controller.recordWrongToolSelected('fi-1', 'tool-c');
    controller.recordWrongToolSelected('fi-1', 'tool-d');
    expect(triggers).toHaveLength(2); // triggered again after reset
  });
});

// ─── Scenario 9 — Synthetic event injection (AC1 testability) ────────────────

describe('Scenario 9 — Synthetic event injection: isolated unit test without DiagnosisScreen (AC1)', () => {
  test('coaching_trigger payload has correct shape: { type, stepId, failureCount }', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('fi-synth', 'synth-tool');
    controller.recordWrongToolSelected('fi-synth', 'synth-tool-2');

    expect(triggers).toHaveLength(1);
    const payload = triggers[0];
    expect(payload).toMatchObject({
      type: MISTAKE_TYPES.WRONG_TOOL_SELECTED,
      stepId: 'fi-synth',
      failureCount: 2,
    });
  });

  test('coaching_trigger type is fault_type_misidentified when that mistake type fires', () => {
    const { controller, triggers } = makeController();
    controller.recordFaultTypeMisidentified('fi-synth', 'wrong-type-a');
    controller.recordFaultTypeMisidentified('fi-synth', 'wrong-type-b');

    expect(triggers[0].type).toBe(MISTAKE_TYPES.FAULT_TYPE_MISIDENTIFIED);
    expect(triggers[0].stepId).toBe('fi-synth');
  });

  test('coaching_trigger type is diagnosis_undo_attempted when that mistake type fires', () => {
    const { controller, triggers } = makeController();
    controller.recordDiagnosisUndoAttempted('fi-synth');
    controller.recordDiagnosisUndoAttempted('fi-synth');

    expect(triggers[0].type).toBe(MISTAKE_TYPES.DIAGNOSIS_UNDO_ATTEMPTED);
    expect(triggers[0].stepId).toBe('fi-synth');
  });
});

// ─── Scenario 10 — coaching_trigger payload contract (AC1) ───────────────────

describe('Scenario 10 — coaching_trigger payload contract (AC1)', () => {
  test('failureCount in payload reflects the count at the moment of trigger', () => {
    const { controller, triggers } = makeController({ threshold: 3 });
    controller.recordDiagnosisUndoAttempted('fi-p');
    controller.recordDiagnosisUndoAttempted('fi-p');
    controller.recordDiagnosisUndoAttempted('fi-p');
    expect(triggers[0].failureCount).toBe(3);
  });

  test('stepId in payload matches the faultInstanceId passed to the record method', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('my-fault-instance-id', 'tool-x');
    controller.recordWrongToolSelected('my-fault-instance-id', 'tool-y');
    expect(triggers[0].stepId).toBe('my-fault-instance-id');
  });

  test('coaching_trigger payload contains type, stepId, and failureCount (no extra fields required)', () => {
    const { controller, triggers } = makeController();
    controller.recordWrongToolSelected('fi-q', 'tool-a');
    controller.recordWrongToolSelected('fi-q', 'tool-b');
    const payload = triggers[0];
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(['type', 'stepId', 'failureCount']));
  });
});

// ─── AC6 — Interface stability: AdaptiveCoachingController has correct public API ─

describe('AC6 — Interface stability: public API surface is correct', () => {
  test('public methods present: recordWrongToolSelected, recordFaultTypeMisidentified, recordDiagnosisUndoAttempted', () => {
    const { controller } = makeController();
    expect(typeof controller.recordWrongToolSelected).toBe('function');
    expect(typeof controller.recordFaultTypeMisidentified).toBe('function');
    expect(typeof controller.recordDiagnosisUndoAttempted).toBe('function');
  });

  test('public methods present: resetStep, resetSession', () => {
    const { controller } = makeController();
    expect(typeof controller.resetStep).toBe('function');
    expect(typeof controller.resetSession).toBe('function');
  });

  test('public inspection methods present: getCount, getThreshold, wasTriggered', () => {
    const { controller } = makeController();
    expect(typeof controller.getCount).toBe('function');
    expect(typeof controller.getThreshold).toBe('function');
    expect(typeof controller.wasTriggered).toBe('function');
  });
});
