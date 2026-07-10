/**
 * Integration tests for DiagnosisScreen coaching hooks — Issue #293
 * Adaptive Coaching Engine — Mistake-Pattern Detection Layer (Phase 1 MVP)
 *
 * Tests AC1, AC2, AC3, AC4, AC5, AC6 from the DiagnosisScreen integration
 * perspective: verifying that the three new onXxx() methods emit telemetry
 * and wire through to the AdaptiveCoachingController.
 *
 * Scenario 10 (AC6): New events emitted at DiagnosisScreen interaction points
 * with correct faultInstanceId-based payloads — directly tests correct wiring.
 * Scenario 8 (AC6): Existing DiagnosisScreen tests pass unmodified (interface regression).
 */

'use strict';

const { DiagnosisScreen } = require('../../src/diagnosis/DiagnosisScreen');
const { SymptomOverlay } = require('../../src/diagnosis/SymptomOverlay');
const { HintSystem } = require('../../src/diagnosis/HintSystem');
const { ConfidenceIndicator } = require('../../src/diagnosis/ConfidenceIndicator');
const { TooltipSystem } = require('../../src/tooltips/TooltipSystem');
const { TutorialOverlay } = require('../../src/tutorials/TutorialOverlay');
const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');
const { PlayerSaveState } = require('../../src/state/PlayerSaveState');
const { MISTAKE_TYPES } = require('../../src/diagnosis/AdaptiveCoachingController');

// ─── Mock all subsystem modules ────────────────────────────────────────────────
jest.mock('../../src/diagnosis/SymptomOverlay');
jest.mock('../../src/diagnosis/HintSystem');
jest.mock('../../src/diagnosis/ConfidenceIndicator');
jest.mock('../../src/tooltips/TooltipSystem');
jest.mock('../../src/tutorials/TutorialOverlay');
jest.mock('../../src/telemetry/TelemetryEmitter');
jest.mock('../../src/state/PlayerSaveState');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEventBus() {
  return { on: jest.fn(), off: jest.fn() };
}

function makeScreen(extraOpts = {}) {
  return new DiagnosisScreen({
    instrumentationHook: jest.fn(),
    renderOverlay: jest.fn(),
    clearOverlay: jest.fn(),
    eventBus: makeEventBus(),
    onConfidenceUpdate: jest.fn(),
    ...extraOpts,
  });
}

let screen;
let mockTelemetry;

beforeEach(() => {
  jest.clearAllMocks();
  screen = makeScreen();

  // Standard setup: default mock return values
  mockTelemetry = TelemetryEmitter.mock.instances[0];
  const mockHintSystem = HintSystem.mock.instances[0];
  const mockSymptomOverlay = SymptomOverlay.mock.instances[0];
  const mockTutorialOverlay = TutorialOverlay.mock.instances[0];
  const mockConfidenceIndicator = ConfidenceIndicator.mock.instances[0];

  mockSymptomOverlay.onSymptomClicked.mockReturnValue({
    symptomKey: 'stops_running',
    highlightedParts: ['mainspring', 'escapement'],
    renderDurationMs: 5,
  });
  mockHintSystem.wasHintUsed.mockReturnValue(false);
  mockHintSystem.hasMoreHints.mockReturnValue(true);
  mockHintSystem.getCurrentTier.mockReturnValue(0);
  mockHintSystem.requestNextHint.mockReturnValue({ tier: 1, text: 'nudge text' });
  mockTutorialOverlay.isVisible.mockReturnValue(false);
  mockTutorialOverlay.nextStep.mockReturnValue({ step: 2, title: 'Step 2', body: 'Body' });
  const mockTooltipSystem = TooltipSystem.mock.instances[0];
  mockTooltipSystem.getTooltip.mockReturnValue({ term: 'mainspring', definition: 'A coiled spring.' });
  mockConfidenceIndicator.destroy = jest.fn();
});

// ─── AC6 Regression — Scenario 8: existing DiagnosisScreen API unchanged ─────

describe('AC6 Regression (Scenario 8) — Existing DiagnosisScreen methods still work', () => {
  test('enterDiagnosis still registers fault instance with HintSystem', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    expect(HintSystem.mock.instances[0].registerFaultInstance).toHaveBeenCalledWith('fi-1', 'mainspring_failure');
  });

  test('submitDiagnosis still fires diagnosisCompletedWithoutHint when no hint used', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    HintSystem.mock.instances[0].wasHintUsed.mockReturnValue(false);
    screen.submitDiagnosis('fi-1', 'mainspring');
    expect(mockTelemetry.diagnosisCompletedWithoutHint).toHaveBeenCalledWith('fi-1');
  });

  test('requestHint still delegates to HintSystem', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    screen.requestHint();
    expect(HintSystem.mock.instances[0].requestNextHint).toHaveBeenCalledWith('fi-1');
  });

  test('getAdaptiveCoachingController returns the coaching controller instance', () => {
    const controller = screen.getAdaptiveCoachingController();
    expect(controller).toBeDefined();
    expect(typeof controller.getCount).toBe('function');
  });
});

// ─── Scenario 10: New events emitted at DiagnosisScreen interaction points ────

describe('Scenario 10 — New events emitted at DiagnosisScreen interaction points (AC1, AC6)', () => {
  test('onWrongToolSelected emits wrongToolSelected on TelemetryEmitter with faultInstanceId and toolId', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    screen.onWrongToolSelected('screwdriver');
    expect(mockTelemetry.wrongToolSelected).toHaveBeenCalledWith('fi-1', 'screwdriver');
  });

  test('onFaultTypeMisidentified emits faultTypeMisidentified on TelemetryEmitter with faultInstanceId and submittedFaultTypeId', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    screen.onFaultTypeMisidentified('escapement_fault');
    expect(mockTelemetry.faultTypeMisidentified).toHaveBeenCalledWith('fi-1', 'escapement_fault');
  });

  test('onDiagnosisUndoAttempted emits diagnosisUndoAttempted on TelemetryEmitter with faultInstanceId', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    screen.onDiagnosisUndoAttempted();
    expect(mockTelemetry.diagnosisUndoAttempted).toHaveBeenCalledWith('fi-1');
  });

  test('onWrongToolSelected does nothing when no active fault instance (guard)', () => {
    // enterDiagnosis NOT called
    screen.onWrongToolSelected('screwdriver');
    expect(mockTelemetry.wrongToolSelected).not.toHaveBeenCalled();
  });

  test('onFaultTypeMisidentified does nothing when no active fault instance (guard)', () => {
    screen.onFaultTypeMisidentified('wrong_type');
    expect(mockTelemetry.faultTypeMisidentified).not.toHaveBeenCalled();
  });

  test('onDiagnosisUndoAttempted does nothing when no active fault instance (guard)', () => {
    screen.onDiagnosisUndoAttempted();
    expect(mockTelemetry.diagnosisUndoAttempted).not.toHaveBeenCalled();
  });
});

// ─── AdaptiveCoachingController wiring through DiagnosisScreen ───────────────

describe('DiagnosisScreen — AdaptiveCoachingController wiring (AC1, AC2, AC3)', () => {
  test('onWrongToolSelected increments coaching controller count (AC2)', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    screen.onWrongToolSelected('screwdriver');
    const controller = screen.getAdaptiveCoachingController();
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(1);
  });

  test('onFaultTypeMisidentified increments coaching controller count (AC2)', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    screen.onFaultTypeMisidentified('wrong_type');
    const controller = screen.getAdaptiveCoachingController();
    expect(controller.getCount('fi-1', MISTAKE_TYPES.FAULT_TYPE_MISIDENTIFIED)).toBe(1);
  });

  test('onDiagnosisUndoAttempted increments coaching controller count (AC2)', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    screen.onDiagnosisUndoAttempted();
    const controller = screen.getAdaptiveCoachingController();
    expect(controller.getCount('fi-1', MISTAKE_TYPES.DIAGNOSIS_UNDO_ATTEMPTED)).toBe(1);
  });

  test('coaching_trigger fires via onCoachingTrigger callback when threshold reached (AC3)', () => {
    const triggers = [];
    const screenWithCallback = makeScreen({ onCoachingTrigger: (p) => triggers.push(p) });
    screenWithCallback.enterDiagnosis('fi-1', 'mainspring_failure');
    screenWithCallback.onWrongToolSelected('tool-a');
    expect(triggers).toHaveLength(0);
    screenWithCallback.onWrongToolSelected('tool-b');
    expect(triggers).toHaveLength(1);
    expect(triggers[0].type).toBe(MISTAKE_TYPES.WRONG_TOOL_SELECTED);
    expect(triggers[0].stepId).toBe('fi-1');
  });

  test('custom coachingThreshold is respected (AC3)', () => {
    const triggers = [];
    const screenWithThreshold = makeScreen({
      onCoachingTrigger: (p) => triggers.push(p),
      coachingThreshold: 3,
    });
    screenWithThreshold.enterDiagnosis('fi-1', 'mainspring_failure');
    screenWithThreshold.onWrongToolSelected('tool-a');
    screenWithThreshold.onWrongToolSelected('tool-b');
    expect(triggers).toHaveLength(0); // threshold of 3 not yet reached
    screenWithThreshold.onWrongToolSelected('tool-c');
    expect(triggers).toHaveLength(1);
  });
});

// ─── AC4 — Counter reset on step advance ─────────────────────────────────────

describe('AC4 — enterDiagnosis resets coaching counters for the new step', () => {
  test('entering a new fault resets counters from the previous step', () => {
    screen.enterDiagnosis('fi-old', 'old_fault');
    screen.onWrongToolSelected('tool-a');
    const controller = screen.getAdaptiveCoachingController();
    expect(controller.getCount('fi-old', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(1);
    // Enter a new fault (same faultInstanceId = step advance)
    screen.enterDiagnosis('fi-old', 'new_fault');
    expect(controller.getCount('fi-old', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
  });

  test('entering a new fault with a different faultInstanceId leaves old step counts intact', () => {
    screen.enterDiagnosis('fi-1', 'fault-a');
    screen.onWrongToolSelected('tool-a');
    const controller = screen.getAdaptiveCoachingController();
    // Advance to new step fi-2 — should NOT clear fi-1 counts
    screen.enterDiagnosis('fi-2', 'fault-b');
    expect(controller.getCount('fi-1', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(1);
    expect(controller.getCount('fi-2', MISTAKE_TYPES.WRONG_TOOL_SELECTED)).toBe(0);
  });
});

// ─── AC5 — Phase isolation ────────────────────────────────────────────────────

describe('AC5 — Phase isolation: diagnosis undo is separate from reassembly undo', () => {
  test('DiagnosisScreen has onDiagnosisUndoAttempted for diagnosis phase (not reassembly)', () => {
    expect(typeof screen.onDiagnosisUndoAttempted).toBe('function');
  });

  test('onDiagnosisUndoAttempted emits diagnosis_undo_attempted, not undo_attempted', () => {
    screen.enterDiagnosis('fi-1', 'fault-a');
    screen.onDiagnosisUndoAttempted();
    expect(mockTelemetry.diagnosisUndoAttempted).toHaveBeenCalledWith('fi-1');
    expect(mockTelemetry.undoAttempted).not.toHaveBeenCalled();
  });
});
