/**
 * Tests for ReassemblyScreen — Phase 1 (Issue #76) + Phase 2 (Issue #78)
 *
 * ReassemblyScreen is tested with mocked subsystem dependencies so every
 * public method can be exercised against controlled mock behaviour.
 *
 * Acceptance Criteria validated:
 *   AC1 (Phase 2) — Part-specific directional messages fire on State 3; zero generic fallback
 *   AC2 (Phase 2) — Message content delegated to DirectionalMessageService (tested separately)
 *   AC3 (Phase 2) — renderMessage called synchronously in same tick as updatePartPosition
 *
 * Test Scenarios mapped:
 *   Scenario 1  — Happy path: correct placement, no error message displayed
 *   Scenario 2  — Wrong orientation message fires on State 3
 *   Scenario 6  — Message timing: renderMessage called in same synchronous call
 *   Scenario 7  — No message on State 1 (NEUTRAL)
 *   Scenario 8  — No message on State 2 (NEAR_CORRECT)
 *   Scenario 9  — Hint system non-regression (no interference from ReassemblyScreen)
 *   Scenario 10 — Teardown/disassembly regression guard (context throw)
 */

const { ReassemblyScreen } = require('../../src/reassembly/ReassemblyScreen');
const { SnapZoneTolerance } = require('../../src/reassembly/SnapZoneTolerance');
const { AssemblyFeedbackStateMachine, STATES } = require('../../src/reassembly/AssemblyFeedbackStateMachine');
const { DirectionalMessageService } = require('../../src/reassembly/DirectionalMessageService');
const { TelemetryEmitter } = require('../../src/telemetry/TelemetryEmitter');

jest.mock('../../src/reassembly/SnapZoneTolerance');
jest.mock('../../src/reassembly/AssemblyFeedbackStateMachine');
jest.mock('../../src/reassembly/DirectionalMessageService');
jest.mock('../../src/telemetry/TelemetryEmitter');

// ─── Per-test setup ───────────────────────────────────────────────────────────

let screen;
let mockTelemetry, mockSnapZone, mockFsm, mockMsgSvc;
let renderMessage, clearMessage, playAudio;
let capturedStateChangeCb; // captures the callback registered via fsm.onStateChange()

beforeEach(() => {
  jest.clearAllMocks();

  capturedStateChangeCb = null;
  renderMessage = jest.fn();
  clearMessage  = jest.fn();
  playAudio     = jest.fn();

  // Override the FSM mock constructor so that onStateChange() captures the callback
  // that ReassemblyScreen registers, enabling us to fire it manually in tests.
  AssemblyFeedbackStateMachine.mockImplementation(function () {
    this.onStateChange = jest.fn((cb) => { capturedStateChangeCb = cb; });
    this.update        = jest.fn().mockReturnValue(STATES.NEUTRAL);
    this.getState      = jest.fn().mockReturnValue(STATES.NEUTRAL);
    this.reset         = jest.fn();
  });

  screen = new ReassemblyScreen({
    instrumentationHook: jest.fn(),
    renderMessage,
    clearMessage,
    playAudio,
  });

  mockTelemetry = TelemetryEmitter.mock.instances[0];
  mockSnapZone  = SnapZoneTolerance.mock.instances[0];
  mockFsm       = AssemblyFeedbackStateMachine.mock.instances[0];
  mockMsgSvc    = DirectionalMessageService.mock.instances[0];

  // Default mock returns
  mockSnapZone.isInApproachZone.mockReturnValue(false);
  mockSnapZone.isInLockZone.mockReturnValue(false);
  mockFsm.getState.mockReturnValue(STATES.NEUTRAL);
  mockMsgSvc.getMessage.mockReturnValue(null);
});

// ─── Scenario 1: Happy path — correct placement ───────────────────────────────

describe('Scenario 1 — Happy path: correct placement', () => {
  test('confirmPlacement returns true when FSM is in LOCKED_IN state', () => {
    mockFsm.getState.mockReturnValue(STATES.LOCKED_IN);
    expect(screen.confirmPlacement('balance_wheel')).toBe(true);
  });

  test('confirmPlacement emits reassemblyCompleted telemetry on success', () => {
    mockFsm.getState.mockReturnValue(STATES.LOCKED_IN);
    screen.confirmPlacement('balance_wheel');
    expect(mockTelemetry.reassemblyCompleted).toHaveBeenCalledWith('balance_wheel');
  });

  test('confirmPlacement calls fsm.reset() after successful placement', () => {
    mockFsm.getState.mockReturnValue(STATES.LOCKED_IN);
    screen.confirmPlacement('balance_wheel');
    expect(mockFsm.reset).toHaveBeenCalled();
  });
});

// ─── Scenario 2: Wrong orientation message fires ──────────────────────────────

describe('Scenario 2 — Wrong orientation: directional message fires on State 3 (AC1, AC3)', () => {
  test('renderMessage is called when FSM transitions to WRONG_ORIENTATION', () => {
    const expectedMessage = 'Balance wheel inverted — flip upright, hairspring should face upward.';
    mockMsgSvc.getMessage.mockReturnValue(expectedMessage);

    screen.enterReassembly('balance_wheel');
    capturedStateChangeCb({ previousState: STATES.NEAR_CORRECT, newState: STATES.WRONG_ORIENTATION });

    expect(renderMessage).toHaveBeenCalledWith(expectedMessage);
  });

  test('getMessage is called with the active part ID on State 3', () => {
    mockMsgSvc.getMessage.mockReturnValue('Test message.');

    screen.enterReassembly('pallet_fork');
    capturedStateChangeCb({ previousState: STATES.NEAR_CORRECT, newState: STATES.WRONG_ORIENTATION });

    expect(mockMsgSvc.getMessage).toHaveBeenCalledWith('pallet_fork');
  });

  test('playAudio called with "state_wrong_orientation" on State 3', () => {
    screen.enterReassembly('pallet_fork');
    capturedStateChangeCb({ previousState: STATES.NEAR_CORRECT, newState: STATES.WRONG_ORIENTATION });

    expect(playAudio).toHaveBeenCalledWith('state_wrong_orientation');
  });
});

// ─── Scenario 6: Message timing — synchronous in same tick ────────────────────

describe('Scenario 6 — Message timing: renderMessage is synchronous (AC3)', () => {
  test('renderMessage is called synchronously — not deferred via setTimeout/Promise', () => {
    mockMsgSvc.getMessage.mockReturnValue('Test message.');

    screen.enterReassembly('dial');
    capturedStateChangeCb({ previousState: STATES.NEAR_CORRECT, newState: STATES.WRONG_ORIENTATION });

    // If renderMessage had been async, it would not yet have been called
    expect(renderMessage).toHaveBeenCalledTimes(1);
  });
});

// ─── Scenario 7: No message on State 1 (NEUTRAL) ─────────────────────────────

describe('Scenario 7 — No message on NEUTRAL state', () => {
  test('clearMessage called and renderMessage NOT called on NEUTRAL transition', () => {
    capturedStateChangeCb({ previousState: STATES.NEAR_CORRECT, newState: STATES.NEUTRAL });

    expect(clearMessage).toHaveBeenCalled();
    expect(renderMessage).not.toHaveBeenCalled();
  });

  test('playAudio called with "state_neutral" on NEUTRAL transition', () => {
    capturedStateChangeCb({ previousState: STATES.NEAR_CORRECT, newState: STATES.NEUTRAL });
    expect(playAudio).toHaveBeenCalledWith('state_neutral');
  });
});

// ─── Scenario 8: No message on State 2 (NEAR_CORRECT) ────────────────────────

describe('Scenario 8 — No message on NEAR_CORRECT state', () => {
  test('clearMessage called and renderMessage NOT called on NEAR_CORRECT transition', () => {
    capturedStateChangeCb({ previousState: STATES.NEUTRAL, newState: STATES.NEAR_CORRECT });

    expect(clearMessage).toHaveBeenCalled();
    expect(renderMessage).not.toHaveBeenCalled();
  });

  test('playAudio called with "state_near_correct" on NEAR_CORRECT transition', () => {
    capturedStateChangeCb({ previousState: STATES.NEUTRAL, newState: STATES.NEAR_CORRECT });
    expect(playAudio).toHaveBeenCalledWith('state_near_correct');
  });
});

// ─── Scenario 9: Hint system non-regression ───────────────────────────────────

describe('Scenario 9 — Hint system non-regression', () => {
  test('ReassemblyScreen does not import or interact with HintSystem', () => {
    // Verify the module does not require HintSystem at all
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/reassembly/ReassemblyScreen.js'),
      'utf8'
    );
    expect(src).not.toContain('HintSystem');
    expect(src).not.toContain('hintSystem');
  });
});

// ─── Scenario 10: Teardown/disassembly regression guard ──────────────────────

describe('Scenario 10 — Teardown/disassembly regression guard', () => {
  test('SnapZoneTolerance is constructed with "reassembly" context', () => {
    // The constructor call captured by the mock should have received 'reassembly'
    expect(SnapZoneTolerance).toHaveBeenCalledWith('reassembly');
  });
});

// ─── confirmPlacement: failure path ───────────────────────────────────────────

describe('confirmPlacement — failure path', () => {
  test('returns false when FSM is NOT in LOCKED_IN state', () => {
    mockFsm.getState.mockReturnValue(STATES.NEAR_CORRECT);
    expect(screen.confirmPlacement('escape_wheel')).toBe(false);
  });

  test('emits undoAttempted telemetry when FSM is not LOCKED_IN', () => {
    mockFsm.getState.mockReturnValue(STATES.WRONG_ORIENTATION);
    screen.confirmPlacement('escape_wheel');
    expect(mockTelemetry.undoAttempted).toHaveBeenCalledWith('escape_wheel');
  });

  test('does NOT emit reassemblyCompleted when FSM is not LOCKED_IN', () => {
    mockFsm.getState.mockReturnValue(STATES.NEAR_CORRECT);
    screen.confirmPlacement('escape_wheel');
    expect(mockTelemetry.reassemblyCompleted).not.toHaveBeenCalled();
  });
});

// ─── Accessor methods ─────────────────────────────────────────────────────────

describe('ReassemblyScreen — accessor methods', () => {
  test('getState delegates to the internal FSM', () => {
    mockFsm.getState.mockReturnValue(STATES.WRONG_ORIENTATION);
    expect(screen.getState()).toBe(STATES.WRONG_ORIENTATION);
  });

  test('getTelemetry returns the internal TelemetryEmitter instance', () => {
    expect(screen.getTelemetry()).toBe(mockTelemetry);
  });

  test('getMessageService returns the internal DirectionalMessageService instance', () => {
    expect(screen.getMessageService()).toBe(mockMsgSvc);
  });

  test('getSnapZone returns the internal SnapZoneTolerance instance', () => {
    expect(screen.getSnapZone()).toBe(mockSnapZone);
  });
});

// ─── updatePartPosition ────────────────────────────────────────────────────────

describe('ReassemblyScreen — updatePartPosition', () => {
  test('returns undefined when partId does not match active part', () => {
    screen.enterReassembly('dial');
    expect(screen.updatePartPosition({ partId: 'wrong_part', distance: 10, orientationCorrect: false }))
      .toBeUndefined();
  });

  test('delegates to SnapZoneTolerance.isInApproachZone with active partId', () => {
    screen.enterReassembly('dial');
    screen.updatePartPosition({ partId: 'dial', distance: 50, orientationCorrect: false });
    expect(mockSnapZone.isInApproachZone).toHaveBeenCalledWith('dial', 50);
  });

  test('delegates to SnapZoneTolerance.isInLockZone with active partId', () => {
    screen.enterReassembly('dial');
    screen.updatePartPosition({ partId: 'dial', distance: 50, orientationCorrect: false });
    expect(mockSnapZone.isInLockZone).toHaveBeenCalledWith('dial', 50);
  });
});
