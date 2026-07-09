/**
 * Tests for AssemblyFeedbackStateMachine — Phase 1 (Issue #76)
 *
 * Covers:
 *   - Initial state is NEUTRAL
 *   - All four state transitions (NEUTRAL → NEAR_CORRECT → WRONG_ORIENTATION → LOCKED_IN)
 *   - STATE_2_MIN_DWELL_MS gate: State 3 does not fire before dwell elapsed
 *   - LOCKED_IN requires both inLockZone AND orientationCorrect
 *   - onStateChange callback fires with correct previousState / newState
 *   - No duplicate callback on same-state update
 *   - reset() returns to NEUTRAL and fires callback
 *
 * Test Scenarios mapped:
 *   Scenario 7  — No message on State 1 (NEUTRAL): verified by state checks
 *   Scenario 8  — No message on State 2 (NEAR_CORRECT): verified by state checks
 */

const {
  AssemblyFeedbackStateMachine,
  STATES,
  STATE_2_MIN_DWELL_MS,
} = require('../../src/reassembly/AssemblyFeedbackStateMachine');

describe('AssemblyFeedbackStateMachine — initial state', () => {
  test('initial state is NEUTRAL', () => {
    const fsm = new AssemblyFeedbackStateMachine();
    expect(fsm.getState()).toBe(STATES.NEUTRAL);
  });
});

describe('AssemblyFeedbackStateMachine — state transitions', () => {
  let fsm;
  beforeEach(() => { fsm = new AssemblyFeedbackStateMachine(); });

  test('NEUTRAL when part is outside approach zone', () => {
    fsm.update({ inApproachZone: false, inLockZone: false, orientationCorrect: false });
    expect(fsm.getState()).toBe(STATES.NEUTRAL);
  });

  test('NEAR_CORRECT when part enters approach zone (dwell not yet met)', () => {
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: false, dwellMs: 0 });
    expect(fsm.getState()).toBe(STATES.NEAR_CORRECT);
  });

  test('NEAR_CORRECT when part enters approach zone with correct orientation but not in lock zone', () => {
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: true, dwellMs: 0 });
    expect(fsm.getState()).toBe(STATES.NEAR_CORRECT);
  });

  test('WRONG_ORIENTATION when in approach zone, orientation wrong, dwell >= STATE_2_MIN_DWELL_MS', () => {
    fsm.update({
      inApproachZone: true,
      inLockZone: false,
      orientationCorrect: false,
      dwellMs: STATE_2_MIN_DWELL_MS,
    });
    expect(fsm.getState()).toBe(STATES.WRONG_ORIENTATION);
  });

  test('NEAR_CORRECT (not WRONG_ORIENTATION) when dwell is 1ms below threshold', () => {
    fsm.update({
      inApproachZone: true,
      inLockZone: false,
      orientationCorrect: false,
      dwellMs: STATE_2_MIN_DWELL_MS - 1,
    });
    expect(fsm.getState()).toBe(STATES.NEAR_CORRECT);
  });

  test('LOCKED_IN when in lock zone with correct orientation', () => {
    fsm.update({ inApproachZone: true, inLockZone: true, orientationCorrect: true, dwellMs: 999 });
    expect(fsm.getState()).toBe(STATES.LOCKED_IN);
  });

  test('NEAR_CORRECT (not LOCKED_IN) when in lock zone but orientation wrong', () => {
    // Lock zone with wrong orientation should NOT trigger LOCKED_IN
    fsm.update({ inApproachZone: true, inLockZone: true, orientationCorrect: false, dwellMs: 0 });
    expect(fsm.getState()).not.toBe(STATES.LOCKED_IN);
  });

  test('WRONG_ORIENTATION not fired when dwell exactly equals threshold - 1', () => {
    fsm.update({
      inApproachZone: true,
      inLockZone: false,
      orientationCorrect: false,
      dwellMs: STATE_2_MIN_DWELL_MS - 1,
    });
    expect(fsm.getState()).toBe(STATES.NEAR_CORRECT);
  });
});

describe('AssemblyFeedbackStateMachine — onStateChange callback', () => {
  let fsm, cb;
  beforeEach(() => {
    fsm = new AssemblyFeedbackStateMachine();
    cb = jest.fn();
    fsm.onStateChange(cb);
  });

  test('callback fires when transitioning from NEUTRAL to NEAR_CORRECT', () => {
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: false, dwellMs: 0 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ previousState: STATES.NEUTRAL, newState: STATES.NEAR_CORRECT });
  });

  test('callback fires when transitioning NEAR_CORRECT → WRONG_ORIENTATION', () => {
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: false, dwellMs: 0 });
    cb.mockClear();
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: false, dwellMs: STATE_2_MIN_DWELL_MS });
    expect(cb).toHaveBeenCalledWith({
      previousState: STATES.NEAR_CORRECT,
      newState: STATES.WRONG_ORIENTATION,
    });
  });

  test('callback fires when transitioning to LOCKED_IN', () => {
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: false, dwellMs: 0 });
    cb.mockClear();
    fsm.update({ inApproachZone: true, inLockZone: true, orientationCorrect: true });
    expect(cb).toHaveBeenCalledWith({
      previousState: STATES.NEAR_CORRECT,
      newState: STATES.LOCKED_IN,
    });
  });

  test('callback does NOT fire when state stays the same', () => {
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: false, dwellMs: 0 });
    cb.mockClear();
    // Same call again — still NEAR_CORRECT
    fsm.update({ inApproachZone: true, inLockZone: false, orientationCorrect: false, dwellMs: 0 });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('AssemblyFeedbackStateMachine — reset()', () => {
  let fsm, cb;
  beforeEach(() => {
    fsm = new AssemblyFeedbackStateMachine();
    cb = jest.fn();
    fsm.onStateChange(cb);
  });

  test('reset() returns state to NEUTRAL', () => {
    fsm.update({ inApproachZone: true, inLockZone: true, orientationCorrect: true });
    fsm.reset();
    expect(fsm.getState()).toBe(STATES.NEUTRAL);
  });

  test('reset() fires onStateChange callback with previousState and NEUTRAL', () => {
    fsm.update({ inApproachZone: true, inLockZone: true, orientationCorrect: true });
    cb.mockClear();
    fsm.reset();
    expect(cb).toHaveBeenCalledWith({
      previousState: STATES.LOCKED_IN,
      newState: STATES.NEUTRAL,
    });
  });

  test('reset() when already NEUTRAL does not fire callback', () => {
    // Already neutral — no transition
    fsm.reset();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('AssemblyFeedbackStateMachine — STATE_2_MIN_DWELL_MS export', () => {
  test('STATE_2_MIN_DWELL_MS is exported and is a positive number', () => {
    expect(typeof STATE_2_MIN_DWELL_MS).toBe('number');
    expect(STATE_2_MIN_DWELL_MS).toBeGreaterThan(0);
  });
});
