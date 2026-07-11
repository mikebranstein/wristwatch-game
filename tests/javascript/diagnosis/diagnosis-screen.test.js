/**
 * Integration tests for DiagnosisScreen — AC6 (Scenarios 11, 12, 13)
 *
 * DiagnosisScreen is constructed with Jest-mocked subsystem dependencies so
 * every public method can be exercised against controlled mock behaviour.
 *
 * Coverage target: ≥ 70% statements, branches, functions, and lines for
 * DiagnosisScreen.js (currently 0% — PRIMARY BLOCKER).
 */

const { DiagnosisScreen } = require('../../../javascript/diagnosis/DiagnosisScreen');
const { SymptomOverlay } = require('../../../javascript/diagnosis/SymptomOverlay');
const { HintSystem } = require('../../../javascript/diagnosis/HintSystem');
const { ConfidenceIndicator } = require('../../../javascript/diagnosis/ConfidenceIndicator');
const { TooltipSystem } = require('../../../javascript/tooltips/TooltipSystem');
const { TutorialOverlay } = require('../../../javascript/tutorials/TutorialOverlay');
const { TelemetryEmitter } = require('../../../javascript/telemetry/TelemetryEmitter');
const { PlayerSaveState } = require('../../../javascript/state/PlayerSaveState');

// ─── Mock all subsystem modules ────────────────────────────────────────────────
// DiagnosisScreen constructs these internally; mocking them here replaces every
// constructor and prototype method with a jest.fn() so we can verify delegation.

jest.mock('../../../javascript/diagnosis/SymptomOverlay');
jest.mock('../../../javascript/diagnosis/HintSystem');
jest.mock('../../../javascript/diagnosis/ConfidenceIndicator');
jest.mock('../../../javascript/tooltips/TooltipSystem');
jest.mock('../../../javascript/tutorials/TutorialOverlay');
jest.mock('../../../javascript/telemetry/TelemetryEmitter');
jest.mock('../../../javascript/state/PlayerSaveState');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEventBus() {
  return { on: jest.fn(), off: jest.fn() };
}

function makeScreen() {
  return new DiagnosisScreen({
    instrumentationHook: jest.fn(),
    renderOverlay: jest.fn(),
    clearOverlay: jest.fn(),
    eventBus: makeEventBus(),
    onConfidenceUpdate: jest.fn(),
  });
}

// ─── Per-test setup ───────────────────────────────────────────────────────────

let screen;
let mockTelemetry, mockSymptomOverlay, mockHintSystem;
let mockTooltipSystem, mockTutorialOverlay, mockConfidenceIndicator, mockSaveState;

beforeEach(() => {
  // Clear all mock call records (also resets mock.instances for each class)
  jest.clearAllMocks();

  // Construct the screen — this triggers the internal `new XxxClass(...)` calls,
  // populating each class's mock.instances[0].
  screen = makeScreen();

  // Retrieve the mock instances in the order DiagnosisScreen creates them:
  //   PlayerSaveState → TelemetryEmitter → SymptomOverlay → HintSystem →
  //   TooltipSystem → TutorialOverlay → ConfidenceIndicator
  mockSaveState = PlayerSaveState.mock.instances[0];
  mockTelemetry = TelemetryEmitter.mock.instances[0];
  mockSymptomOverlay = SymptomOverlay.mock.instances[0];
  mockHintSystem = HintSystem.mock.instances[0];
  mockTooltipSystem = TooltipSystem.mock.instances[0];
  mockTutorialOverlay = TutorialOverlay.mock.instances[0];
  mockConfidenceIndicator = ConfidenceIndicator.mock.instances[0];

  // ── Default return values so delegation calls don't throw ──────────────────
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
  mockTooltipSystem.getTooltip.mockReturnValue({ term: 'mainspring', definition: 'A coiled spring.' });
});

// ─── Scenario 11: enterDiagnosis and submitDiagnosis without hints ─────────────

describe('Scenario 11 — DiagnosisScreen: enterDiagnosis and submitDiagnosis without hints', () => {
  test('enterDiagnosis stores the active fault instance id', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    // If active id were not stored, requestHint would return null
    mockHintSystem.requestNextHint.mockReturnValue({ tier: 1, text: 'tip' });
    const hint = screen.requestHint();
    expect(hint).not.toBeNull();
  });

  test('enterDiagnosis registers the fault instance with the HintSystem', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    expect(mockHintSystem.registerFaultInstance).toHaveBeenCalledWith('fi-1', 'mainspring_failure');
  });

  test('enterDiagnosis triggers the TutorialOverlay.tryShow with the fault instance id', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    expect(mockTutorialOverlay.tryShow).toHaveBeenCalledWith('fi-1');
  });

  test('submitDiagnosis without hints fires diagnosis_completed_without_hint', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    mockHintSystem.wasHintUsed.mockReturnValue(false);

    screen.submitDiagnosis('fi-1', 'mainspring');

    expect(mockTelemetry.diagnosisCompletedWithoutHint).toHaveBeenCalledWith('fi-1');
  });

  test('submitDiagnosis without hints does NOT fire diagnosis_completed_with_hint', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    mockHintSystem.wasHintUsed.mockReturnValue(false);

    screen.submitDiagnosis('fi-1', 'mainspring');

    expect(mockTelemetry.diagnosisCompletedWithHint).not.toHaveBeenCalled();
  });

  test('submitDiagnosis clears the SymptomOverlay', () => {
    screen.enterDiagnosis('fi-1', 'mainspring_failure');
    mockHintSystem.wasHintUsed.mockReturnValue(false);

    screen.submitDiagnosis('fi-1', 'mainspring');

    expect(mockSymptomOverlay.clearOverlay).toHaveBeenCalled();
  });
});

// ─── Scenario 12: hint-assisted submission ────────────────────────────────────

describe('Scenario 12 — DiagnosisScreen: hint-assisted submission', () => {
  test('requestHint delegates to HintSystem.requestNextHint with the active fault id', () => {
    screen.enterDiagnosis('fi-2', 'escapement_fault');

    screen.requestHint();

    expect(mockHintSystem.requestNextHint).toHaveBeenCalledWith('fi-2');
  });

  test('requestHint returns the hint object from HintSystem', () => {
    screen.enterDiagnosis('fi-2', 'escapement_fault');
    mockHintSystem.requestNextHint.mockReturnValue({ tier: 1, text: 'subtle nudge' });

    const result = screen.requestHint();

    expect(result).toEqual({ tier: 1, text: 'subtle nudge' });
  });

  test('submitDiagnosis after requesting a hint fires diagnosis_completed_with_hint', () => {
    screen.enterDiagnosis('fi-2', 'escapement_fault');
    mockHintSystem.wasHintUsed.mockReturnValue(true);
    mockHintSystem.getCurrentTier.mockReturnValue(1);

    screen.submitDiagnosis('fi-2', 'pallet_fork');

    expect(mockTelemetry.diagnosisCompletedWithHint).toHaveBeenCalledWith('fi-2', 1);
  });

  test('submitDiagnosis after requesting a hint does NOT fire diagnosis_completed_without_hint', () => {
    screen.enterDiagnosis('fi-2', 'escapement_fault');
    mockHintSystem.wasHintUsed.mockReturnValue(true);
    mockHintSystem.getCurrentTier.mockReturnValue(2);

    screen.submitDiagnosis('fi-2', 'pallet_fork');

    expect(mockTelemetry.diagnosisCompletedWithoutHint).not.toHaveBeenCalled();
  });

  test('submitDiagnosis passes the highest hint tier used to the telemetry event', () => {
    screen.enterDiagnosis('fi-2', 'escapement_fault');
    mockHintSystem.wasHintUsed.mockReturnValue(true);
    mockHintSystem.getCurrentTier.mockReturnValue(3);

    screen.submitDiagnosis('fi-2', 'pallet_fork');

    expect(mockTelemetry.diagnosisCompletedWithHint).toHaveBeenCalledWith('fi-2', 3);
  });
});

// ─── Scenario 13: symptom click, tutorial control, tooltip lookup, and cleanup ─

describe('Scenario 13 — DiagnosisScreen: symptom click, tutorial control, tooltip, and cleanup', () => {
  test('onSymptomClicked delegates to SymptomOverlay and returns the result', () => {
    const result = screen.onSymptomClicked('stops_running');

    expect(mockSymptomOverlay.onSymptomClicked).toHaveBeenCalledWith('stops_running');
    expect(result).toBeDefined();
    expect(result.highlightedParts).toEqual(['mainspring', 'escapement']);
  });

  test('onSymptomClicked forwards highlighted parts to ConfidenceIndicator', () => {
    screen.onSymptomClicked('stops_running');

    expect(mockConfidenceIndicator.setActiveCandidateParts).toHaveBeenCalledWith(
      expect.arrayContaining(['mainspring', 'escapement'])
    );
  });

  test('skipTutorial delegates to TutorialOverlay.skip()', () => {
    screen.skipTutorial();

    expect(mockTutorialOverlay.skip).toHaveBeenCalled();
  });

  test('advanceTutorial delegates to TutorialOverlay.nextStep() and returns the step data', () => {
    mockTutorialOverlay.nextStep.mockReturnValue({ step: 2, title: 'Read Symptoms', body: 'Body text' });

    const result = screen.advanceTutorial();

    expect(mockTutorialOverlay.nextStep).toHaveBeenCalled();
    expect(result).toEqual({ step: 2, title: 'Read Symptoms', body: 'Body text' });
  });

  test('isTutorialVisible returns true when TutorialOverlay is visible', () => {
    mockTutorialOverlay.isVisible.mockReturnValue(true);
    expect(screen.isTutorialVisible()).toBe(true);
  });

  test('isTutorialVisible returns false when TutorialOverlay is not visible', () => {
    mockTutorialOverlay.isVisible.mockReturnValue(false);
    expect(screen.isTutorialVisible()).toBe(false);
  });

  test('getTooltip delegates to TooltipSystem and returns the tooltip', () => {
    mockTooltipSystem.getTooltip.mockReturnValue({ term: 'escapement', definition: 'Controls energy release.' });

    const result = screen.getTooltip('escapement');

    expect(mockTooltipSystem.getTooltip).toHaveBeenCalledWith('escapement');
    expect(result).toEqual({ term: 'escapement', definition: 'Controls energy release.' });
  });

  test('getTooltip returns null for an unknown term', () => {
    mockTooltipSystem.getTooltip.mockReturnValue(null);

    const result = screen.getTooltip('unknown_term');

    expect(result).toBeNull();
  });

  test('destroy calls ConfidenceIndicator.destroy() to remove event-bus subscriptions', () => {
    screen.destroy();

    expect(mockConfidenceIndicator.destroy).toHaveBeenCalled();
  });
});

// ─── Edge cases: guard branches for requestHint and hasMoreHints ──────────────

describe('DiagnosisScreen — guard branches before enterDiagnosis is called', () => {
  test('requestHint returns null when no active fault instance is set', () => {
    // enterDiagnosis has NOT been called — _activeFaultInstanceId is null
    expect(screen.requestHint()).toBeNull();
    expect(mockHintSystem.requestNextHint).not.toHaveBeenCalled();
  });

  test('hasMoreHints returns false when no active fault instance is set', () => {
    expect(screen.hasMoreHints()).toBe(false);
    expect(mockHintSystem.hasMoreHints).not.toHaveBeenCalled();
  });

  test('hasMoreHints delegates to HintSystem after enterDiagnosis', () => {
    screen.enterDiagnosis('fi-4', 'balance_wheel_fault');
    mockHintSystem.hasMoreHints.mockReturnValue(true);

    const result = screen.hasMoreHints();

    expect(mockHintSystem.hasMoreHints).toHaveBeenCalledWith('fi-4');
    expect(result).toBe(true);
  });

  test('hasMoreHints returns false from HintSystem when all hints exhausted', () => {
    screen.enterDiagnosis('fi-5', 'balance_wheel_fault');
    mockHintSystem.hasMoreHints.mockReturnValue(false);

    expect(screen.hasMoreHints()).toBe(false);
  });
});

// ─── Accessor methods ─────────────────────────────────────────────────────────

describe('DiagnosisScreen — accessor methods', () => {
  test('getTelemetry returns the internal TelemetryEmitter instance', () => {
    expect(screen.getTelemetry()).toBe(mockTelemetry);
  });

  test('getSaveState returns the internal PlayerSaveState instance', () => {
    expect(screen.getSaveState()).toBe(mockSaveState);
  });

  test('getConfidenceIndicator returns the internal ConfidenceIndicator instance', () => {
    expect(screen.getConfidenceIndicator()).toBe(mockConfidenceIndicator);
  });

  test('getTooltipSystem returns the internal TooltipSystem instance', () => {
    expect(screen.getTooltipSystem()).toBe(mockTooltipSystem);
  });
});
