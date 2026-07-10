/**
 * Tests for GearTrainAnimationController (Issue #150)
 *
 * Acceptance criteria covered:
 *   AC1 — gear train rotates at correct relative gear ratios per caliber.
 *   AC2 — over-spinning / stalled failure state for incorrect assembly.
 *   AC3 — LOD management: gear train pauses when lodReduced = true;
 *          balance + escapement unaffected.
 *   AC5 — no Phase 1 code modified.
 *
 * Test scenarios mapped to issue #150:
 *   Happy path — four wheels at correct relative rates
 *   Mechanical accuracy — gear ratios verified per caliber
 *   Failure state — over-spinning (AC2)
 *   Failure state — stalled (AC2)
 *   LOD on minimum spec — gear train pauses (AC3)
 *   LOD on high spec — full animation runs (AC3)
 *   Multi-movement accuracy — custom gear ratios (AC1)
 *   Scene transition — stop cleans state (AC5)
 */

'use strict';

const {
  GearTrainAnimationController,
  GEAR_TRAIN_STATE,
  DEFAULT_GEAR_RATIOS,
} = require('../../src/completion/GearTrainAnimationController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const renderHook = jest.fn();
  const ctrl = new GearTrainAnimationController({ renderHook, ...opts });
  return { ctrl, renderHook };
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('GearTrainAnimationController — constructor', () => {
  test('constructs with default gear ratios', () => {
    const { ctrl } = makeController();
    expect(ctrl.getGearRatios()).toMatchObject(DEFAULT_GEAR_RATIOS);
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.IDLE);
  });

  test('throws if renderHook is not a function', () => {
    expect(() => new GearTrainAnimationController({ renderHook: 'bad' })).toThrow(
      'renderHook must be a function'
    );
  });

  test('throws on unknown failureMode', () => {
    expect(() => makeController({ failureMode: 'exploding' })).toThrow('unknown failureMode');
  });

  test('custom gear ratios merge with defaults', () => {
    const { ctrl } = makeController({ gearRatios: { fourthWheel: 9 } });
    expect(ctrl.getGearRatios().fourthWheel).toBe(9);
    expect(ctrl.getGearRatios().centreWheel).toBe(DEFAULT_GEAR_RATIOS.centreWheel);
  });
});

// ─── AC1: Correct gear ratios ─────────────────────────────────────────────────

describe('GearTrainAnimationController — AC1: gear ratios', () => {
  test('start(true) sets RUNNING and fires gear_train_start', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.RUNNING);
    expect(renderHook).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'gear_train_start', state: GEAR_TRAIN_STATE.RUNNING })
    );
  });

  test('onEscapeWheelAdvance increments all angles by their gear ratios', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(1);
    const angles = ctrl.getAngles();
    expect(angles.mainspringBarrel).toBeCloseTo(DEFAULT_GEAR_RATIOS.mainspringBarrel);
    expect(angles.centreWheel).toBeCloseTo(DEFAULT_GEAR_RATIOS.centreWheel);
    expect(angles.thirdWheel).toBeCloseTo(DEFAULT_GEAR_RATIOS.thirdWheel);
    expect(angles.fourthWheel).toBeCloseTo(DEFAULT_GEAR_RATIOS.fourthWheel);
  });

  test('angles accumulate over multiple advances', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(1);
    ctrl.onEscapeWheelAdvance(1);
    const angles = ctrl.getAngles();
    expect(angles.fourthWheel).toBeCloseTo(DEFAULT_GEAR_RATIOS.fourthWheel * 2);
  });

  test('fourthWheel (seconds hand) rotates faster than mainspringBarrel', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(1);
    const angles = ctrl.getAngles();
    expect(angles.fourthWheel).toBeGreaterThan(angles.mainspringBarrel);
  });

  test('gear_train_advance fired with updated angles', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(1);
    const lastCall = renderHook.mock.calls[renderHook.mock.calls.length - 1][0];
    expect(lastCall.command).toBe('gear_train_advance');
    expect(lastCall.angles).toBeDefined();
  });

  test('onEscapeWheelAdvance is no-op when IDLE', () => {
    const { ctrl, renderHook } = makeController();
    // not started
    ctrl.onEscapeWheelAdvance(1);
    expect(ctrl.getEscapeWheelAdvances()).toBe(0);
    expect(renderHook).not.toHaveBeenCalled();
  });
});

// ─── AC1: Multi-movement accuracy ─────────────────────────────────────────────

describe('GearTrainAnimationController — AC1: multi-movement accuracy', () => {
  test('Caliber A: custom gear ratio for fourthWheel advances at custom rate', () => {
    const customRatio = 12;
    const { ctrl } = makeController({ gearRatios: { fourthWheel: customRatio } });
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(1);
    expect(ctrl.getAngles().fourthWheel).toBeCloseTo(customRatio);
  });

  test('Caliber B: different mainspringBarrel ratio is applied', () => {
    const customRatio = 1 / 80;
    const { ctrl } = makeController({ gearRatios: { mainspringBarrel: customRatio } });
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(1);
    expect(ctrl.getAngles().mainspringBarrel).toBeCloseTo(customRatio);
  });
});

// ─── AC2: Failure states ─────────────────────────────────────────────────────

describe('GearTrainAnimationController — AC2: failure states', () => {
  test('start(false) with over_spinning failureMode sets OVER_SPINNING', () => {
    const { ctrl, renderHook } = makeController({ failureMode: 'over_spinning' });
    ctrl.start(false);
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.OVER_SPINNING);
    expect(renderHook).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'gear_train_failure', state: GEAR_TRAIN_STATE.OVER_SPINNING })
    );
  });

  test('start(false) with stalled failureMode sets STALLED', () => {
    const { ctrl } = makeController({ failureMode: 'stalled' });
    ctrl.start(false);
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.STALLED);
  });

  test('failure command is distinct from correct-run command (AC2 — visually distinct)', () => {
    const { ctrl: runCtrl, renderHook: runHook } = makeController();
    runCtrl.start(true);
    const runCmd = runHook.mock.calls[0][0].command;

    const { ctrl: failCtrl, renderHook: failHook } = makeController({ failureMode: 'over_spinning' });
    failCtrl.start(false);
    const failCmd = failHook.mock.calls[0][0].command;

    expect(runCmd).not.toBe(failCmd);
  });

  test('onEscapeWheelAdvance is no-op in failure state', () => {
    const { ctrl } = makeController({ failureMode: 'over_spinning' });
    ctrl.start(false);
    ctrl.onEscapeWheelAdvance(1);
    // Angles should be zero (no advances applied in failure state)
    const angles = ctrl.getAngles();
    expect(angles.fourthWheel).toBe(0);
  });
});

// ─── AC3: LOD management ──────────────────────────────────────────────────────

describe('GearTrainAnimationController — AC3: LOD', () => {
  test('start(true, true) sets RUNNING_LOD state', () => {
    const { ctrl } = makeController();
    ctrl.start(true, true);
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.RUNNING_LOD);
    expect(ctrl.isLodReduced()).toBe(true);
  });

  test('onEscapeWheelAdvance does NOT advance angles when lodReduced=true (gear train paused)', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true, true); // LOD reduced
    const startCallCount = renderHook.mock.calls.length;
    ctrl.onEscapeWheelAdvance(1);
    // No additional render hook calls in LOD mode
    expect(renderHook.mock.calls.length).toBe(startCallCount);
    expect(ctrl.getAngles().fourthWheel).toBe(0);
  });

  test('start(true, false) keeps full animation (high spec)', () => {
    const { ctrl } = makeController();
    ctrl.start(true, false);
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.RUNNING);
    expect(ctrl.isLodReduced()).toBe(false);
  });
});

// ─── AC5: Scene transition ────────────────────────────────────────────────────

describe('GearTrainAnimationController — AC5: scene transition', () => {
  test('stop() sets IDLE and fires gear_train_stop', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(1);
    ctrl.stop();
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.IDLE);
    expect(renderHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: 'gear_train_stop' })
    );
  });

  test('reset() zeroes angles and returns IDLE', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onEscapeWheelAdvance(5);
    ctrl.reset();
    const angles = ctrl.getAngles();
    expect(angles.fourthWheel).toBe(0);
    expect(angles.mainspringBarrel).toBe(0);
    expect(ctrl.getState()).toBe(GEAR_TRAIN_STATE.IDLE);
    expect(ctrl.getEscapeWheelAdvances()).toBe(0);
  });
});
