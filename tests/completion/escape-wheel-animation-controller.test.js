/**
 * Tests for EscapeWheelAnimationController (Issue #150)
 *
 * Acceptance criteria covered:
 *   AC1 — escape wheel advances one tooth per balance wheel half-swing.
 *   AC2 — failure-state animation for incorrect assembly.
 *   AC5 — no Phase 1 code modified; module is self-contained.
 *
 * Test scenarios mapped to issue #150:
 *   Happy path — full sync     (AC1: tooth advances on each half-swing)
 *   Mechanical accuracy        (AC1: exactly one tooth per half-swing; wraps at toothCount)
 *   Failure state — wrong part (AC2: stalled failure mode)
 *   Failure state — jittery    (AC2: jittery failure mode)
 *   Failure state — over-spin  (AC2: over-spinning failure mode)
 *   Scene transition           (stop cleans state; no leaks)
 *   Multi-caliber accuracy     (tooth count configurable per caliber)
 */

'use strict';

const {
  EscapeWheelAnimationController,
  ESCAPE_WHEEL_STATE,
  FAILURE_MODE,
  DEFAULT_TOOTH_COUNT,
} = require('../../src/completion/EscapeWheelAnimationController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const renderHook = jest.fn();
  const ctrl = new EscapeWheelAnimationController({ renderHook, ...opts });
  return { ctrl, renderHook };
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('EscapeWheelAnimationController — constructor', () => {
  test('constructs with default tooth count', () => {
    const { ctrl } = makeController();
    expect(ctrl.getToothCount()).toBe(DEFAULT_TOOTH_COUNT);
    expect(ctrl.getState()).toBe(ESCAPE_WHEEL_STATE.IDLE);
  });

  test('throws if renderHook is not a function', () => {
    expect(() => new EscapeWheelAnimationController({ renderHook: 'bad' })).toThrow(
      'renderHook must be a function'
    );
  });

  test('throws if toothCount is not a positive integer', () => {
    expect(() => makeController({ toothCount: 0 })).toThrow('toothCount must be a positive integer');
    expect(() => makeController({ toothCount: -5 })).toThrow('toothCount must be a positive integer');
    expect(() => makeController({ toothCount: 3.5 })).toThrow('toothCount must be a positive integer');
  });

  test('throws if failureMode is unknown', () => {
    expect(() => makeController({ failureMode: 'exploding' })).toThrow('unknown failureMode');
  });

  test('accepts custom toothCount', () => {
    const { ctrl } = makeController({ toothCount: 20 });
    expect(ctrl.getToothCount()).toBe(20);
  });
});

// ─── AC1: Happy path — one tooth per half-swing ───────────────────────────────

describe('EscapeWheelAnimationController — AC1: tooth-per-half-swing', () => {
  test('start(true) sets RUNNING state and fires escape_wheel_start command', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    expect(ctrl.getState()).toBe(ESCAPE_WHEEL_STATE.RUNNING);
    expect(renderHook).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'escape_wheel_start', state: ESCAPE_WHEEL_STATE.RUNNING })
    );
  });

  test('onHalfSwing advances tooth index by 1', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    expect(ctrl.getCurrentToothIndex()).toBe(1);
    expect(ctrl.getHalfSwingCount()).toBe(1);
  });

  test('onHalfSwing fires escape_wheel_advance with correct toothIndex', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    expect(renderHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: 'escape_wheel_advance', toothIndex: 1, halfSwings: 1 })
    );
  });

  test('onHalfSwing wraps tooth index at toothCount (AC1 — tooth-per-half-swing cycles)', () => {
    const toothCount = 15;
    const { ctrl } = makeController({ toothCount });
    ctrl.start(true);
    for (let i = 0; i < toothCount; i++) ctrl.onHalfSwing();
    expect(ctrl.getCurrentToothIndex()).toBe(0); // wrapped
    expect(ctrl.getHalfSwingCount()).toBe(toothCount);
  });

  test('onHalfSwing is no-op when not in RUNNING state', () => {
    const { ctrl, renderHook } = makeController();
    // not started
    ctrl.onHalfSwing();
    expect(ctrl.getCurrentToothIndex()).toBe(0);
    const callsBefore = renderHook.mock.calls.length;
    expect(callsBefore).toBe(0);
  });
});

// ─── AC1: Mechanical accuracy — multi-caliber tooth count ────────────────────

describe('EscapeWheelAnimationController — AC1: multi-caliber accuracy', () => {
  test.each([
    [15, 'ETA 2824 (15 teeth)'],
    [18, 'Rolex 3135 (18 teeth)'],
    [20, 'Custom caliber (20 teeth)'],
  ])('tooth count %i wraps correctly for %s', (toothCount) => {
    const { ctrl } = makeController({ toothCount });
    ctrl.start(true);
    for (let i = 0; i < toothCount * 2; i++) ctrl.onHalfSwing();
    expect(ctrl.getCurrentToothIndex()).toBe(0); // two full rotations — back to start
  });
});

// ─── AC2: Failure-state animation ────────────────────────────────────────────

describe('EscapeWheelAnimationController — AC2: failure states', () => {
  test('start(false) with failureMode=stalled sets STALLED state', () => {
    const { ctrl, renderHook } = makeController({ failureMode: FAILURE_MODE.STALLED });
    ctrl.start(false);
    expect(ctrl.getState()).toBe(ESCAPE_WHEEL_STATE.STALLED);
    expect(renderHook).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'escape_wheel_failure', state: ESCAPE_WHEEL_STATE.STALLED })
    );
  });

  test('start(false) with failureMode=jittery sets JITTERY state', () => {
    const { ctrl } = makeController({ failureMode: FAILURE_MODE.JITTERY });
    ctrl.start(false);
    expect(ctrl.getState()).toBe(ESCAPE_WHEEL_STATE.JITTERY);
  });

  test('start(false) with failureMode=over_spinning sets OVER_SPINNING state', () => {
    const { ctrl } = makeController({ failureMode: FAILURE_MODE.OVER_SPINNING });
    ctrl.start(false);
    expect(ctrl.getState()).toBe(ESCAPE_WHEEL_STATE.OVER_SPINNING);
  });

  test('failure state is visually distinct: stalled vs running emit different commands', () => {
    const { ctrl: runCtrl, renderHook: runHook } = makeController();
    runCtrl.start(true);
    const runCommand = runHook.mock.calls[0][0].command;

    const { ctrl: failCtrl, renderHook: failHook } = makeController({ failureMode: FAILURE_MODE.STALLED });
    failCtrl.start(false);
    const failCommand = failHook.mock.calls[0][0].command;

    expect(runCommand).not.toBe(failCommand); // AC2 — visually distinct
  });

  test('onHalfSwing is no-op in failure state (does not advance tooth)', () => {
    const { ctrl } = makeController({ failureMode: FAILURE_MODE.STALLED });
    ctrl.start(false);
    ctrl.onHalfSwing();
    expect(ctrl.getCurrentToothIndex()).toBe(0); // no advance in stalled state
  });
});

// ─── AC4: Start timestamp recorded ───────────────────────────────────────────

describe('EscapeWheelAnimationController — AC4: start timestamp', () => {
  test('start() records the provided startTimestampMs', () => {
    const { ctrl } = makeController();
    const ts = 1_000_000;
    ctrl.start(true, ts);
    expect(ctrl.getStartTimestamp()).toBe(ts);
  });
});

// ─── AC5: Scene transition / no state leaks ──────────────────────────────────

describe('EscapeWheelAnimationController — AC5: scene transition', () => {
  test('stop() sets IDLE state and fires escape_wheel_stop command', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    ctrl.stop();
    expect(ctrl.getState()).toBe(ESCAPE_WHEEL_STATE.IDLE);
    expect(renderHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: 'escape_wheel_stop' })
    );
  });

  test('reset() zeroes tooth index and half-swing count', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    ctrl.onHalfSwing();
    ctrl.reset();
    expect(ctrl.getCurrentToothIndex()).toBe(0);
    expect(ctrl.getHalfSwingCount()).toBe(0);
    expect(ctrl.getState()).toBe(ESCAPE_WHEEL_STATE.IDLE);
  });
});
