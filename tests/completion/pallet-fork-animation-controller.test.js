/**
 * Tests for PalletForkAnimationController (Issue #150)
 *
 * Acceptance criteria covered:
 *   AC1 — pallet fork rocks in opposition to each half-swing (alternates ENTRY/EXIT).
 *   AC2 — failure-state animation (stalled | jittery) for incorrect assembly.
 *   AC5 — no Phase 1 code modified; module is self-contained.
 *
 * Test scenarios mapped to issue #150:
 *   Happy path — rocks in opposition on every half-swing
 *   Mechanical accuracy — alternates ENTRY ↔ EXIT with every half-swing
 *   Failure state — stalled
 *   Failure state — jittery
 *   Scene transition — stop cleans state
 */

'use strict';

const {
  PalletForkAnimationController,
  PALLET_FORK_STATE,
  FORK_POSITION,
} = require('../../src/completion/PalletForkAnimationController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const renderHook = jest.fn();
  const ctrl = new PalletForkAnimationController({ renderHook, ...opts });
  return { ctrl, renderHook };
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('PalletForkAnimationController — constructor', () => {
  test('constructs with defaults', () => {
    const { ctrl } = makeController();
    expect(ctrl.getState()).toBe(PALLET_FORK_STATE.IDLE);
    expect(ctrl.getPosition()).toBe(FORK_POSITION.ENTRY);
  });

  test('throws if renderHook is not a function', () => {
    expect(() => new PalletForkAnimationController({ renderHook: 'bad' })).toThrow(
      'renderHook must be a function'
    );
  });

  test('throws if failureMode is unknown', () => {
    expect(() => makeController({ failureMode: 'exploding' })).toThrow('unknown failureMode');
  });
});

// ─── AC1: Rocks in opposition ─────────────────────────────────────────────────

describe('PalletForkAnimationController — AC1: rocks in opposition', () => {
  test('start(true) sets RUNNING and fires pallet_fork_start with ENTRY position', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    expect(ctrl.getState()).toBe(PALLET_FORK_STATE.RUNNING);
    expect(renderHook).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'pallet_fork_start', position: FORK_POSITION.ENTRY })
    );
  });

  test('onHalfSwing toggles position from ENTRY to EXIT', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    expect(ctrl.getPosition()).toBe(FORK_POSITION.ENTRY);
    ctrl.onHalfSwing();
    expect(ctrl.getPosition()).toBe(FORK_POSITION.EXIT);
  });

  test('onHalfSwing toggles position from EXIT back to ENTRY', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing(); // → EXIT
    ctrl.onHalfSwing(); // → ENTRY
    expect(ctrl.getPosition()).toBe(FORK_POSITION.ENTRY);
  });

  test('onHalfSwing fires pallet_fork_rock command with correct position', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    expect(renderHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: 'pallet_fork_rock', position: FORK_POSITION.EXIT })
    );
  });

  test('position alternates ENTRY/EXIT over many half-swings (mechanical accuracy)', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    const positions = [];
    for (let i = 0; i < 6; i++) {
      ctrl.onHalfSwing();
      positions.push(ctrl.getPosition());
    }
    expect(positions).toEqual([
      FORK_POSITION.EXIT,
      FORK_POSITION.ENTRY,
      FORK_POSITION.EXIT,
      FORK_POSITION.ENTRY,
      FORK_POSITION.EXIT,
      FORK_POSITION.ENTRY,
    ]);
  });

  test('onHalfSwing increments halfSwingCount', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    ctrl.onHalfSwing();
    expect(ctrl.getHalfSwingCount()).toBe(2);
  });

  test('onHalfSwing is no-op when not RUNNING', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.onHalfSwing(); // not started
    expect(ctrl.getPosition()).toBe(FORK_POSITION.ENTRY); // unchanged
    expect(renderHook).not.toHaveBeenCalled();
  });
});

// ─── AC2: Failure states ─────────────────────────────────────────────────────

describe('PalletForkAnimationController — AC2: failure states', () => {
  test('start(false) with stalled failureMode sets STALLED state', () => {
    const { ctrl, renderHook } = makeController({ failureMode: 'stalled' });
    ctrl.start(false);
    expect(ctrl.getState()).toBe(PALLET_FORK_STATE.STALLED);
    expect(renderHook).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'pallet_fork_failure', state: PALLET_FORK_STATE.STALLED })
    );
  });

  test('start(false) with jittery failureMode sets JITTERY state', () => {
    const { ctrl } = makeController({ failureMode: 'jittery' });
    ctrl.start(false);
    expect(ctrl.getState()).toBe(PALLET_FORK_STATE.JITTERY);
  });

  test('failure command is distinct from correct-run command (AC2 — visually distinct)', () => {
    const { ctrl: runCtrl, renderHook: runHook } = makeController();
    runCtrl.start(true);
    const runCmd = runHook.mock.calls[0][0].command;

    const { ctrl: failCtrl, renderHook: failHook } = makeController({ failureMode: 'stalled' });
    failCtrl.start(false);
    const failCmd = failHook.mock.calls[0][0].command;

    expect(runCmd).not.toBe(failCmd);
  });

  test('onHalfSwing does not rock fork in failure state', () => {
    const { ctrl } = makeController({ failureMode: 'stalled' });
    ctrl.start(false);
    ctrl.onHalfSwing();
    expect(ctrl.getPosition()).toBe(FORK_POSITION.ENTRY); // still at ENTRY — stalled
  });
});

// ─── AC5: Scene transition ────────────────────────────────────────────────────

describe('PalletForkAnimationController — AC5: scene transition', () => {
  test('stop() sets IDLE and fires pallet_fork_stop', () => {
    const { ctrl, renderHook } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    ctrl.stop();
    expect(ctrl.getState()).toBe(PALLET_FORK_STATE.IDLE);
    expect(renderHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: 'pallet_fork_stop' })
    );
  });

  test('reset() zeroes half-swing count and returns IDLE', () => {
    const { ctrl } = makeController();
    ctrl.start(true);
    ctrl.onHalfSwing();
    ctrl.reset();
    expect(ctrl.getHalfSwingCount()).toBe(0);
    expect(ctrl.getState()).toBe(PALLET_FORK_STATE.IDLE);
    expect(ctrl.getPosition()).toBe(FORK_POSITION.ENTRY);
  });
});
