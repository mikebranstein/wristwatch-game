/**
 * Integration tests: DiagnosisScreen — loupe A/B subsystems (Issue #117)
 *
 * Tests the new DiagnosisScreen integration points:
 *   - onLoupeInspect delegates to LoupeViewport with the session arm (AC1, AC2)
 *   - requestHint records first hint time on DiagnosisSessionRecord (AC4)
 *   - enterDiagnosis starts session timer (AC4)
 *   - submitDiagnosis emits loupe A/B telemetry events (AC4)
 *   - getLoupeViewport / getDiagnosisSessionRecord accessors
 *   - Backward compatibility: no loupe/session record → existing behaviour unchanged
 *
 * Run with: npm test
 */

const { DiagnosisScreen } = require('../../src/diagnosis/DiagnosisScreen');
const { LoupeViewport } = require('../../src/diagnosis/LoupeViewport');
const { DiagnosisSessionRecord } = require('../../src/state/DiagnosisSessionRecord');
const { SymptomOverlay } = require('../../src/diagnosis/SymptomOverlay');
const { HintSystem } = require('../../src/diagnosis/HintSystem');
const { ConfidenceIndicator } = require('../../src/diagnosis/ConfidenceIndicator');
const { TooltipSystem } = require('../../src/tooltips/TooltipSystem');
const { TutorialOverlay } = require('../../src/tutorials/TutorialOverlay');
const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');
const { PlayerSaveState } = require('../../src/state/PlayerSaveState');

// Mock all existing subsystems (same as in diagnosis-screen.test.js)
jest.mock('../../src/diagnosis/SymptomOverlay');
jest.mock('../../src/diagnosis/HintSystem');
jest.mock('../../src/diagnosis/ConfidenceIndicator');
jest.mock('../../src/tooltips/TooltipSystem');
jest.mock('../../src/tutorials/TutorialOverlay');
jest.mock('../../src/telemetry/TelemetryEmitter');
jest.mock('../../src/state/PlayerSaveState');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEventBus() {
  return { on: jest.fn(), off: jest.fn() };
}

function makeLoupeViewport() {
  return {
    activate: jest.fn(),
    deactivate: jest.fn(),
    inspectComponent: jest.fn().mockReturnValue({
      componentId: 'pivot-1',
      variant: 'faint_amber_tint',
      description: 'Pivot wear',
    }),
    isActive: jest.fn().mockReturnValue(true),
  };
}

function makeSessionRecord(arm = 'treatment') {
  return {
    arm,
    sessionId: 'sess-test',
    startDiagnosis: jest.fn(),
    recordFirstHintRequest: jest.fn(),
    completeDiagnosis: jest.fn(),
    getTimeBeforeFirstHint: jest.fn().mockReturnValue(3000),
    getDiagnosedWithoutHint: jest.fn().mockReturnValue(true),
    getSessionMetrics: jest.fn().mockReturnValue({
      sessionId: 'sess-test',
      arm,
      timeBeforeFirstHintMs: 3000,
      diagnosedWithoutHint: true,
      diagnosisCompleted: true,
    }),
  };
}

function makeScreen(loupeViewport = null, diagnosisSessionRecord = null) {
  return new DiagnosisScreen({
    instrumentationHook: jest.fn(),
    renderOverlay: jest.fn(),
    clearOverlay: jest.fn(),
    eventBus: makeEventBus(),
    onConfidenceUpdate: jest.fn(),
    loupeViewport,
    diagnosisSessionRecord,
  });
}

let screen, mockTelemetry, mockHintSystem, mockSymptomOverlay, mockTutorialOverlay;
let mockLoupeViewport, mockSessionRecord;

beforeEach(() => {
  jest.clearAllMocks();
  mockLoupeViewport = makeLoupeViewport();
  mockSessionRecord = makeSessionRecord('treatment');
  screen = makeScreen(mockLoupeViewport, mockSessionRecord);

  mockTelemetry = TelemetryEmitter.mock.instances[0];
  mockHintSystem = HintSystem.mock.instances[0];
  mockSymptomOverlay = SymptomOverlay.mock.instances[0];
  mockTutorialOverlay = TutorialOverlay.mock.instances[0];

  // Default returns
  mockHintSystem.wasHintUsed.mockReturnValue(false);
  mockHintSystem.getCurrentTier.mockReturnValue(0);
  mockHintSystem.requestNextHint.mockReturnValue({ tier: 1, text: 'nudge' });
  mockHintSystem.hasMoreHints.mockReturnValue(true);
  mockSymptomOverlay.onSymptomClicked.mockReturnValue({
    symptomKey: 'stops_running',
    highlightedParts: ['mainspring'],
    renderDurationMs: 5,
  });
  mockTutorialOverlay.isVisible.mockReturnValue(false);
});

// ── AC1: onLoupeInspect delegates to LoupeViewport ───────────────────────────

describe('DiagnosisScreen — Issue #117 AC1: onLoupeInspect', () => {
  test('onLoupeInspect delegates to LoupeViewport.inspectComponent with arm from session record', () => {
    screen.onLoupeInspect('pivot-1', 'worn_pivot');
    expect(mockLoupeViewport.inspectComponent).toHaveBeenCalledWith(
      'pivot-1', 'worn_pivot', 'treatment'
    );
  });

  test('onLoupeInspect returns the signal from LoupeViewport', () => {
    const signal = screen.onLoupeInspect('pivot-1', 'worn_pivot');
    expect(signal).toEqual({
      componentId: 'pivot-1',
      variant: 'faint_amber_tint',
      description: 'Pivot wear',
    });
  });

  test('onLoupeInspect returns null when no loupeViewport is configured', () => {
    const screenNoLoupe = makeScreen(null, null);
    expect(screenNoLoupe.onLoupeInspect('pivot-1', 'worn_pivot')).toBeNull();
  });

  test('onLoupeInspect returns null when no sessionRecord is configured', () => {
    const screenNoRecord = makeScreen(mockLoupeViewport, null);
    expect(screenNoRecord.onLoupeInspect('pivot-1', 'worn_pivot')).toBeNull();
  });

  test('control arm: onLoupeInspect passes arm "control" to LoupeViewport', () => {
    const controlRecord = makeSessionRecord('control');
    const controlScreen = makeScreen(mockLoupeViewport, controlRecord);
    jest.clearAllMocks();
    controlScreen.onLoupeInspect('pivot-1', 'worn_pivot');
    expect(mockLoupeViewport.inspectComponent).toHaveBeenCalledWith(
      'pivot-1', 'worn_pivot', 'control'
    );
  });
});

// ── AC4: enterDiagnosis starts session timer ──────────────────────────────────

describe('DiagnosisScreen — Issue #117 AC4: enterDiagnosis starts session timer', () => {
  test('enterDiagnosis calls sessionRecord.startDiagnosis()', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    expect(mockSessionRecord.startDiagnosis).toHaveBeenCalled();
  });

  test('enterDiagnosis does NOT call startDiagnosis when no session record configured', () => {
    const noRecordScreen = makeScreen(null, null);
    jest.clearAllMocks();
    noRecordScreen.enterDiagnosis('fi-1', 'worn_pivot');
    expect(mockSessionRecord.startDiagnosis).not.toHaveBeenCalled();
  });
});

// ── AC4: requestHint records first hint time ──────────────────────────────────

describe('DiagnosisScreen — Issue #117 AC4: requestHint records first hint time', () => {
  test('requestHint calls sessionRecord.recordFirstHintRequest()', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    screen.requestHint();
    expect(mockSessionRecord.recordFirstHintRequest).toHaveBeenCalled();
  });

  test('requestHint still delegates to HintSystem after recording hint time', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    screen.requestHint();
    expect(mockHintSystem.requestNextHint).toHaveBeenCalledWith('fi-1');
  });

  test('requestHint does NOT call recordFirstHintRequest when no session record configured', () => {
    const noRecordScreen = makeScreen(null, null);
    jest.clearAllMocks();
    noRecordScreen.enterDiagnosis('fi-1', 'worn_pivot');
    noRecordScreen.requestHint();
    expect(mockSessionRecord.recordFirstHintRequest).not.toHaveBeenCalled();
  });
});

// ── AC4: submitDiagnosis emits loupe A/B telemetry ────────────────────────────

describe('DiagnosisScreen — Issue #117 AC4: submitDiagnosis emits loupe A/B telemetry', () => {
  test('submitDiagnosis calls sessionRecord.completeDiagnosis()', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    mockHintSystem.wasHintUsed.mockReturnValue(false);
    screen.submitDiagnosis('fi-1', 'mainspring');
    expect(mockSessionRecord.completeDiagnosis).toHaveBeenCalledWith(true); // no hint used
  });

  test('submitDiagnosis calls completeDiagnosis(false) when hint was used', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    mockHintSystem.wasHintUsed.mockReturnValue(true);
    mockHintSystem.getCurrentTier.mockReturnValue(1);
    screen.submitDiagnosis('fi-1', 'mainspring');
    expect(mockSessionRecord.completeDiagnosis).toHaveBeenCalledWith(false);
  });

  test('submitDiagnosis emits diagnosis_session_completed telemetry event', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    mockHintSystem.wasHintUsed.mockReturnValue(false);
    screen.submitDiagnosis('fi-1', 'mainspring');
    expect(mockTelemetry.diagnosisSessionCompleted).toHaveBeenCalledWith(
      'sess-test', 'treatment', true
    );
  });

  test('submitDiagnosis does NOT call completeDiagnosis when no session record configured', () => {
    const noRecordScreen = makeScreen(null, null);
    jest.clearAllMocks();
    noRecordScreen.enterDiagnosis('fi-1', 'worn_pivot');
    mockHintSystem.wasHintUsed.mockReturnValue(false);
    noRecordScreen.submitDiagnosis('fi-1', 'mainspring');
    expect(mockSessionRecord.completeDiagnosis).not.toHaveBeenCalled();
  });

  test('submitDiagnosis emits time_before_first_hint_recorded when hint was used', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    mockHintSystem.wasHintUsed.mockReturnValue(true);
    mockHintSystem.getCurrentTier.mockReturnValue(1);
    mockSessionRecord.getSessionMetrics.mockReturnValue({
      sessionId: 'sess-test',
      arm: 'treatment',
      timeBeforeFirstHintMs: 2500,
      diagnosedWithoutHint: false,
      diagnosisCompleted: true,
    });
    screen.submitDiagnosis('fi-1', 'mainspring');
    expect(mockTelemetry.timeBeforeFirstHintRecorded).toHaveBeenCalledWith(
      'sess-test', 'treatment', 2500
    );
  });

  test('submitDiagnosis does NOT emit time_before_first_hint when no hint used', () => {
    screen.enterDiagnosis('fi-1', 'worn_pivot');
    mockHintSystem.wasHintUsed.mockReturnValue(false);
    screen.submitDiagnosis('fi-1', 'mainspring');
    expect(mockTelemetry.timeBeforeFirstHintRecorded).not.toHaveBeenCalled();
  });
});

// ── Accessors ─────────────────────────────────────────────────────────────────

describe('DiagnosisScreen — Issue #117 accessor methods', () => {
  test('getLoupeViewport returns the configured LoupeViewport', () => {
    expect(screen.getLoupeViewport()).toBe(mockLoupeViewport);
  });

  test('getDiagnosisSessionRecord returns the configured DiagnosisSessionRecord', () => {
    expect(screen.getDiagnosisSessionRecord()).toBe(mockSessionRecord);
  });

  test('getLoupeViewport returns null when not configured', () => {
    const noLoupe = makeScreen(null, null);
    expect(noLoupe.getLoupeViewport()).toBeNull();
  });

  test('getDiagnosisSessionRecord returns null when not configured', () => {
    const noRecord = makeScreen(null, null);
    expect(noRecord.getDiagnosisSessionRecord()).toBeNull();
  });
});

// ── Backward compatibility ────────────────────────────────────────────────────

describe('DiagnosisScreen — Issue #117 backward compatibility (no new opts)', () => {
  test('existing behavior is unchanged when neither loupeViewport nor sessionRecord is provided', () => {
    // Create a fresh screen with no loupe/session args — capture its own mock instances
    jest.clearAllMocks();
    const legacyScreen = makeScreen(null, null);
    const legacyTelemetry = TelemetryEmitter.mock.instances[0];
    const legacyHintSystem = HintSystem.mock.instances[0];

    legacyScreen.enterDiagnosis('fi-99', 'worn_pivot');
    legacyHintSystem.wasHintUsed.mockReturnValue(false);
    legacyScreen.submitDiagnosis('fi-99', 'mainspring');
    // diagnosisCompletedWithoutHint should still fire (existing AC5 behavior)
    expect(legacyTelemetry.diagnosisCompletedWithoutHint).toHaveBeenCalledWith('fi-99');
  });
});