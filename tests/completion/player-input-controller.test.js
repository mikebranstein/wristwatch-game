/**
 * Tests for PlayerInputController (Issue #114, Phase 2)
 *
 * Acceptance criteria covered:
 *   AC5 — suspend() disables player input during the camera animation hold.
 *   AC5 — resume() re-enables player input cleanly after camera returns.
 *   AC5 — idempotency guards prevent double-suspend/resume from leaving
 *          input stuck (no camera jerk or input conflict).
 */

const {
  PlayerInputController,
  INPUT_STATE,
  INPUT_COMMANDS,
} = require('../../src/completion/PlayerInputController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInputController(opts = {}) {
  const inputHook = jest.fn();
  const ctrl = new PlayerInputController({ inputHook, ...opts });
  return { ctrl, inputHook };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('PlayerInputController — construction', () => {
  test('constructs successfully with required options', () => {
    expect(() => makeInputController()).not.toThrow();
  });

  test('throws if inputHook is not a function', () => {
    expect(() => new PlayerInputController({ inputHook: 42 })).toThrow(
      'PlayerInputController requires an inputHook function.'
    );
  });

  test('initial state is ACTIVE (input enabled by default)', () => {
    const { ctrl } = makeInputController();
    expect(ctrl.getState()).toBe(INPUT_STATE.ACTIVE);
  });

  test('isSuspended() is false initially', () => {
    const { ctrl } = makeInputController();
    expect(ctrl.isSuspended()).toBe(false);
  });
});

// ─── suspend() — AC5 ─────────────────────────────────────────────────────────

describe('PlayerInputController — suspend() (AC5)', () => {
  test('fires SUSPEND command on first call', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    expect(inputHook).toHaveBeenCalledWith(INPUT_COMMANDS.SUSPEND);
  });

  test('state transitions to SUSPENDED after suspend()', () => {
    const { ctrl } = makeInputController();
    ctrl.suspend();
    expect(ctrl.getState()).toBe(INPUT_STATE.SUSPENDED);
  });

  test('isSuspended() returns true after suspend()', () => {
    const { ctrl } = makeInputController();
    ctrl.suspend();
    expect(ctrl.isSuspended()).toBe(true);
  });

  test('suspend() is idempotent — hook fires exactly once for double-call', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    ctrl.suspend(); // second call
    const suspendCalls = inputHook.mock.calls.filter((c) => c[0] === INPUT_COMMANDS.SUSPEND);
    expect(suspendCalls).toHaveLength(1);
  });
});

// ─── resume() — AC5 ──────────────────────────────────────────────────────────

describe('PlayerInputController — resume() (AC5)', () => {
  test('fires RESUME command after suspend()', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    inputHook.mockClear();
    ctrl.resume();
    expect(inputHook).toHaveBeenCalledWith(INPUT_COMMANDS.RESUME);
  });

  test('state transitions to ACTIVE after resume()', () => {
    const { ctrl } = makeInputController();
    ctrl.suspend();
    ctrl.resume();
    expect(ctrl.getState()).toBe(INPUT_STATE.ACTIVE);
  });

  test('isSuspended() returns false after resume()', () => {
    const { ctrl } = makeInputController();
    ctrl.suspend();
    ctrl.resume();
    expect(ctrl.isSuspended()).toBe(false);
  });

  test('resume() is idempotent — no-op if already ACTIVE', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.resume(); // already ACTIVE
    expect(inputHook).not.toHaveBeenCalled();
  });

  test('resume() is idempotent — hook fires once for double-call after suspend', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    inputHook.mockClear();
    ctrl.resume();
    ctrl.resume();
    const resumeCalls = inputHook.mock.calls.filter((c) => c[0] === INPUT_COMMANDS.RESUME);
    expect(resumeCalls).toHaveLength(1);
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('PlayerInputController — reset()', () => {
  test('reset() sets state to ACTIVE without firing hook', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    inputHook.mockClear();
    ctrl.reset();
    expect(ctrl.getState()).toBe(INPUT_STATE.ACTIVE);
    expect(inputHook).not.toHaveBeenCalled();
  });

  test('after reset(), suspend() fires again normally', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    ctrl.reset();
    inputHook.mockClear();
    ctrl.suspend();
    expect(inputHook).toHaveBeenCalledWith(INPUT_COMMANDS.SUSPEND);
  });
});

// ─── Full suspend-resume cycle (AC5 complete flow) ───────────────────────────

describe('PlayerInputController — full suspend/resume cycle (AC5)', () => {
  test('suspend → resume cycle fires commands in correct order', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    ctrl.resume();
    const commands = inputHook.mock.calls.map((c) => c[0]);
    expect(commands).toEqual([INPUT_COMMANDS.SUSPEND, INPUT_COMMANDS.RESUME]);
  });

  test('multiple suspend/resume cycles work correctly', () => {
    const { ctrl, inputHook } = makeInputController();
    ctrl.suspend();
    ctrl.resume();
    ctrl.suspend();
    ctrl.resume();
    const suspendCalls = inputHook.mock.calls.filter((c) => c[0] === INPUT_COMMANDS.SUSPEND);
    const resumeCalls  = inputHook.mock.calls.filter((c) => c[0] === INPUT_COMMANDS.RESUME);
    expect(suspendCalls).toHaveLength(2);
    expect(resumeCalls).toHaveLength(2);
  });
});
