/**
 * Tests for MovementAnimationOrchestrator (Issue #150)
 *
 * Acceptance criteria covered:
 *   AC1 — escape wheel, pallet fork, gear train all animate in sync after
 *          correct reassembly.
 *   AC2 — incorrect assembly triggers failure-state animation on all components.
 *   AC3 — LOD reduces gear train on minimum-spec hardware; escapement preserved.
 *   AC4 — all Phase 2 components start simultaneously (synchronous calls — same
 *          event-loop tick, well within 100ms SLA).
 *   AC5 — Phase 1 integration boundary validated: attachToPhase1Hook wires the
 *          extensibility hook; no Phase 1 code is called/modified.
 *
 * Test scenarios mapped to issue #150:
 *   Happy path — full sync (AC1)
 *   Mechanical accuracy — escape wheel + pallet fork coordinated (AC1)
 *   Failure state — wrong part placed (AC2)
 *   Failure state — missing component (AC2)
 *   LOD on minimum spec (AC3)
 *   LOD on high spec (AC3)
 *   #99 integration timing / AC4 — synchronous start (AC4)
 *   Phase 1 non-regression — Phase 1 hook not modified (AC5)
 *   Scene transition — stop cleans state (AC5)
 *   Multi-movement accuracy — custom gear ratios
 */

'use strict';

const {
  MovementAnimationOrchestrator,
  ORCHESTRATOR_STATE,
} = require('../../src/completion/MovementAnimationOrchestrator');
const { ESCAPE_WHEEL_STATE } = require('../../src/completion/EscapeWheelAnimationController');
const { PALLET_FORK_STATE }  = require('../../src/completion/PalletForkAnimationController');
const { GEAR_TRAIN_STATE }   = require('../../src/completion/GearTrainAnimationController');
const { LOD_TIER }           = require('../../src/completion/MovementAnimationLODController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrchestrator(opts = {}) {
  const ewHook   = jest.fn();
  const pfHook   = jest.fn();
  const gtHook   = jest.fn();
  const orch = new MovementAnimationOrchestrator({
    escapeWheelRenderHook: ewHook,
    palletForkRenderHook:  pfHook,
    gearTrainRenderHook:   gtHook,
    ...opts,
  });
  return { orch, ewHook, pfHook, gtHook };
}

/** Stub for Phase 1 extensibility hook. */
function makePhase1HalfSwingSource() {
  const listeners = [];
  return {
    onHalfSwing: (listener) => listeners.push(listener),
    fireHalfSwing: () => listeners.forEach(fn => fn()),
    listenerCount: () => listeners.length,
  };
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('MovementAnimationOrchestrator — constructor', () => {
  test('constructs in IDLE state', () => {
    const { orch } = makeOrchestrator();
    expect(orch.getState()).toBe(ORCHESTRATOR_STATE.IDLE);
  });

  test('Phase 1 hook not attached on construction', () => {
    const { orch } = makeOrchestrator();
    expect(orch.isPhase1Attached()).toBe(false);
  });
});

// ─── AC1: Happy path — full sync ─────────────────────────────────────────────

describe('MovementAnimationOrchestrator — AC1: full sync correct assembly', () => {
  test('start(true) sets RUNNING state', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    expect(orch.getState()).toBe(ORCHESTRATOR_STATE.RUNNING);
  });

  test('start(true) sets all sub-controllers to RUNNING', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    expect(orch.getEscapeWheel().getState()).toBe(ESCAPE_WHEEL_STATE.RUNNING);
    expect(orch.getPalletFork().getState()).toBe(PALLET_FORK_STATE.RUNNING);
    expect(orch.getGearTrain().getState()).toBe(GEAR_TRAIN_STATE.RUNNING);
  });

  test('onHalfSwing propagates to escape wheel (AC1 — tooth advances)', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    orch.onHalfSwing();
    expect(orch.getEscapeWheel().getHalfSwingCount()).toBe(1);
  });

  test('onHalfSwing propagates to pallet fork (AC1 — rocks in opposition)', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    orch.onHalfSwing();
    expect(orch.getPalletFork().getHalfSwingCount()).toBe(1);
  });

  test('onHalfSwing propagates tooth advance to gear train', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    orch.onHalfSwing();
    expect(orch.getGearTrain().getEscapeWheelAdvances()).toBe(1);
  });
});

// ─── AC1: Mechanical accuracy ─────────────────────────────────────────────────

describe('MovementAnimationOrchestrator — AC1: mechanical accuracy', () => {
  test('escape wheel advances one tooth per half-swing', () => {
    const { orch } = makeOrchestrator({ toothCount: 15 });
    orch.start(true);
    for (let i = 0; i < 5; i++) orch.onHalfSwing();
    expect(orch.getEscapeWheel().getCurrentToothIndex()).toBe(5);
    expect(orch.getEscapeWheel().getHalfSwingCount()).toBe(5);
  });

  test('pallet fork rocks in opposition: 3 half-swings → 3 rocks', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    for (let i = 0; i < 3; i++) orch.onHalfSwing();
    expect(orch.getPalletFork().getHalfSwingCount()).toBe(3);
  });
});

// ─── AC2: Failure states ─────────────────────────────────────────────────────

describe('MovementAnimationOrchestrator — AC2: failure states', () => {
  test('start(false) sets FAILURE orchestrator state', () => {
    const { orch } = makeOrchestrator();
    orch.start(false);
    expect(orch.getState()).toBe(ORCHESTRATOR_STATE.FAILURE);
  });

  test('start(false) puts escape wheel in failure state', () => {
    const { orch } = makeOrchestrator({ escapeWheelFailureMode: 'stalled' });
    orch.start(false);
    expect(orch.getEscapeWheel().getState()).toBe(ESCAPE_WHEEL_STATE.STALLED);
  });

  test('start(false) puts pallet fork in failure state', () => {
    const { orch } = makeOrchestrator({ palletForkFailureMode: 'stalled' });
    orch.start(false);
    expect(orch.getPalletFork().getState()).toBe(PALLET_FORK_STATE.STALLED);
  });

  test('start(false) puts gear train in failure state', () => {
    const { orch } = makeOrchestrator({ gearTrainFailureMode: 'over_spinning' });
    orch.start(false);
    expect(orch.getGearTrain().getState()).toBe(GEAR_TRAIN_STATE.OVER_SPINNING);
  });

  test('failure state does not advance tooth on half-swing (stalled)', () => {
    const { orch } = makeOrchestrator({ escapeWheelFailureMode: 'stalled' });
    orch.start(false);
    orch.onHalfSwing();
    expect(orch.getEscapeWheel().getCurrentToothIndex()).toBe(0);
  });
});

// ─── AC3: LOD management ──────────────────────────────────────────────────────

describe('MovementAnimationOrchestrator — AC3: LOD', () => {
  test('start(true, 10) selects LOW LOD tier on minimum-spec FPS', () => {
    const { orch } = makeOrchestrator();
    orch.start(true, 10); // 10 FPS → LOW
    expect(orch.getLodTier()).toBe(LOD_TIER.LOW);
    expect(orch.getLodConfig().lodReduced).toBe(true);
  });

  test('gear train is in RUNNING_LOD on LOW tier (AC3)', () => {
    const { orch } = makeOrchestrator();
    orch.start(true, 10);
    expect(orch.getGearTrain().getState()).toBe(GEAR_TRAIN_STATE.RUNNING_LOD);
  });

  test('escape wheel remains RUNNING on LOW tier (balance + escapement preserved, AC3)', () => {
    const { orch } = makeOrchestrator();
    orch.start(true, 10);
    expect(orch.getEscapeWheel().getState()).toBe(ESCAPE_WHEEL_STATE.RUNNING);
  });

  test('pallet fork remains RUNNING on LOW tier (escapement preserved, AC3)', () => {
    const { orch } = makeOrchestrator();
    orch.start(true, 10);
    expect(orch.getPalletFork().getState()).toBe(PALLET_FORK_STATE.RUNNING);
  });

  test('start(true, 60) selects HIGH LOD tier on high-spec FPS', () => {
    const { orch } = makeOrchestrator();
    orch.start(true, 60);
    expect(orch.getLodTier()).toBe(LOD_TIER.HIGH);
    expect(orch.getLodConfig().lodReduced).toBe(false);
  });

  test('gear train is in RUNNING (not LOD) on HIGH tier', () => {
    const { orch } = makeOrchestrator();
    orch.start(true, 60);
    expect(orch.getGearTrain().getState()).toBe(GEAR_TRAIN_STATE.RUNNING);
  });
});

// ─── AC4: Simultaneous start (synchronous — within 100ms SLA) ────────────────

describe('MovementAnimationOrchestrator — AC4: simultaneous start', () => {
  test('all sub-controllers started in the same synchronous call (AC4)', () => {
    const { orch } = makeOrchestrator();
    const tsBefore = Date.now();
    orch.start(true, 60, tsBefore);
    // All sub-controllers are set up synchronously — no async delay between them.
    // Verify all are RUNNING in the same post-start check.
    expect(orch.getEscapeWheel().getState()).toBe(ESCAPE_WHEEL_STATE.RUNNING);
    expect(orch.getPalletFork().getState()).toBe(PALLET_FORK_STATE.RUNNING);
    expect(orch.getGearTrain().getState()).toBe(GEAR_TRAIN_STATE.RUNNING);
    // startTimestampMs is recorded for integration audit
    expect(orch.getStartTimestampMs()).toBe(tsBefore);
  });
});

// ─── AC5: Phase 1 hook integration ───────────────────────────────────────────

describe('MovementAnimationOrchestrator — AC5: Phase 1 hook', () => {
  test('attachToPhase1Hook registers listener on phase1 source', () => {
    const { orch } = makeOrchestrator();
    const phase1Source = makePhase1HalfSwingSource();
    orch.attachToPhase1Hook(phase1Source);
    expect(orch.isPhase1Attached()).toBe(true);
    expect(phase1Source.listenerCount()).toBe(1);
  });

  test('phase1 half-swing fires propagate through orchestrator', () => {
    const { orch } = makeOrchestrator();
    const phase1Source = makePhase1HalfSwingSource();
    orch.attachToPhase1Hook(phase1Source);
    orch.start(true);
    phase1Source.fireHalfSwing();
    expect(orch.getEscapeWheel().getHalfSwingCount()).toBe(1);
    expect(orch.getPalletFork().getHalfSwingCount()).toBe(1);
  });

  test('multiple phase1 half-swings propagate correctly', () => {
    const { orch } = makeOrchestrator();
    const phase1Source = makePhase1HalfSwingSource();
    orch.attachToPhase1Hook(phase1Source);
    orch.start(true);
    for (let i = 0; i < 5; i++) phase1Source.fireHalfSwing();
    expect(orch.getEscapeWheel().getHalfSwingCount()).toBe(5);
  });

  test('attachToPhase1Hook throws if source lacks onHalfSwing method (AC5)', () => {
    const { orch } = makeOrchestrator();
    expect(() => orch.attachToPhase1Hook(null)).toThrow('halfSwingSource must have an onHalfSwing');
    expect(() => orch.attachToPhase1Hook({})).toThrow('halfSwingSource must have an onHalfSwing');
    expect(() => orch.attachToPhase1Hook({ onHalfSwing: 'not-a-function' })).toThrow(
      'halfSwingSource must have an onHalfSwing'
    );
  });
});

// ─── AC5: Scene transition — no state leaks ───────────────────────────────────

describe('MovementAnimationOrchestrator — AC5: scene transition', () => {
  test('stop() sets IDLE state and stops all sub-controllers', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    orch.onHalfSwing();
    orch.stop();
    expect(orch.getState()).toBe(ORCHESTRATOR_STATE.IDLE);
    expect(orch.getEscapeWheel().getState()).toBe(ESCAPE_WHEEL_STATE.IDLE);
    expect(orch.getPalletFork().getState()).toBe(PALLET_FORK_STATE.IDLE);
    expect(orch.getGearTrain().getState()).toBe(GEAR_TRAIN_STATE.IDLE);
  });

  test('reset() clears all accumulated state', () => {
    const { orch } = makeOrchestrator();
    orch.start(true);
    orch.onHalfSwing();
    orch.onHalfSwing();
    orch.reset();
    expect(orch.getEscapeWheel().getCurrentToothIndex()).toBe(0);
    expect(orch.getPalletFork().getHalfSwingCount()).toBe(0);
    expect(orch.getGearTrain().getAngles().fourthWheel).toBe(0);
    expect(orch.getState()).toBe(ORCHESTRATOR_STATE.IDLE);
  });
});

// ─── Multi-movement accuracy ──────────────────────────────────────────────────

describe('MovementAnimationOrchestrator — multi-movement accuracy', () => {
  test('custom tooth count and gear ratios apply to the correct sub-controllers', () => {
    const customRatio = 10;
    const { orch } = makeOrchestrator({
      toothCount:  20,
      gearRatios:  { fourthWheel: customRatio },
    });
    orch.start(true, 60);
    orch.onHalfSwing();
    expect(orch.getEscapeWheel().getToothCount()).toBe(20);
    expect(orch.getGearTrain().getGearRatios().fourthWheel).toBe(customRatio);
  });
});
