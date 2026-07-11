/**
 * Tests for CameraAnimationController (Issue #114, Phase 2)
 *
 * Acceptance criteria covered:
 *   AC1 — Camera animation starts synchronously when animateToCloseUp() is called.
 *   AC3 — Camera holds for configured duration (1500–3000 ms), then eases back.
 *   AC3 — Exact player view restored; onAnimationComplete fires at end.
 *   AC5 — onAnimationComplete enables the caller to resume player input.
 *
 * Test scenarios mapped to Issue #114:
 *   Scenario 2  — Camera return accuracy: savedView forwarded in RESTORE command.
 *   Scenario 9  — Scene/state transition during animation: abort() cancels cleanly.
 */

const {
  CameraAnimationController,
  CAMERA_STATE,
  CAMERA_COMMANDS,
  DEFAULT_HOLD_DURATION_MS,
  MIN_HOLD_DURATION_MS,
  MAX_HOLD_DURATION_MS,
  DEFAULT_ANIMATE_IN_DURATION_MS,
  DEFAULT_ANIMATE_OUT_DURATION_MS,
} = require('../../../src/completion/CameraAnimationController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const cameraHook = jest.fn();
  const onAnimationComplete = jest.fn();
  const ctrl = new CameraAnimationController({
    cameraHook,
    onAnimationComplete,
    // Fast timings for tests
    animateInDurationMs: 50,
    animateOutDurationMs: 50,
    holdDurationMs: 100,
    ...opts,
  });
  return { ctrl, cameraHook, onAnimationComplete };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('CameraAnimationController — construction', () => {
  test('constructs successfully with required options', () => {
    expect(() => makeController()).not.toThrow();
  });

  test('throws if cameraHook is not a function', () => {
    expect(() => new CameraAnimationController({ cameraHook: 'bad' })).toThrow(
      'CameraAnimationController requires a cameraHook function.'
    );
  });

  test('throws if onAnimationComplete is provided but not a function', () => {
    expect(() => new CameraAnimationController({ cameraHook: jest.fn(), onAnimationComplete: 42 })).toThrow(
      'CameraAnimationController: onAnimationComplete must be a function or null.'
    );
  });

  test('initial state is IDLE', () => {
    const { ctrl } = makeController();
    expect(ctrl.getState()).toBe(CAMERA_STATE.IDLE);
  });

  test('getSavedPlayerView() is null before savePlayerView()', () => {
    const { ctrl } = makeController();
    expect(ctrl.getSavedPlayerView()).toBeNull();
  });

  test('hold duration clamped to MIN_HOLD_DURATION_MS when too low', () => {
    const { ctrl } = makeController({ holdDurationMs: 100 });
    expect(ctrl.getHoldDurationMs()).toBe(MIN_HOLD_DURATION_MS);
  });

  test('hold duration clamped to MAX_HOLD_DURATION_MS when too high', () => {
    const { ctrl } = makeController({ holdDurationMs: 9999 });
    expect(ctrl.getHoldDurationMs()).toBe(MAX_HOLD_DURATION_MS);
  });

  test('default hold duration is DEFAULT_HOLD_DURATION_MS', () => {
    const ctrl = new CameraAnimationController({ cameraHook: jest.fn() });
    expect(ctrl.getHoldDurationMs()).toBe(DEFAULT_HOLD_DURATION_MS);
  });

  test('default animate-in duration is DEFAULT_ANIMATE_IN_DURATION_MS', () => {
    const ctrl = new CameraAnimationController({ cameraHook: jest.fn() });
    expect(ctrl.getAnimateInDurationMs()).toBe(DEFAULT_ANIMATE_IN_DURATION_MS);
  });

  test('default animate-out duration is DEFAULT_ANIMATE_OUT_DURATION_MS', () => {
    const ctrl = new CameraAnimationController({ cameraHook: jest.fn() });
    expect(ctrl.getAnimateOutDurationMs()).toBe(DEFAULT_ANIMATE_OUT_DURATION_MS);
  });
});

// ─── savePlayerView ───────────────────────────────────────────────────────────

describe('CameraAnimationController — savePlayerView()', () => {
  test('saves and returns the player view descriptor', () => {
    const { ctrl } = makeController();
    const view = { position: { x: 1, y: 2, z: 3 }, angle: 45 };
    ctrl.savePlayerView(view);
    expect(ctrl.getSavedPlayerView()).toBe(view);
  });

  test('can be updated by calling savePlayerView() again', () => {
    const { ctrl } = makeController();
    const view1 = { angle: 0 };
    const view2 = { angle: 90 };
    ctrl.savePlayerView(view1);
    ctrl.savePlayerView(view2);
    expect(ctrl.getSavedPlayerView()).toBe(view2);
  });
});

// ─── animateToCloseUp — AC1 (synchronous camera start) ───────────────────────

describe('CameraAnimationController — animateToCloseUp() AC1', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('state transitions to ANIMATING_TO_CLOSEUP synchronously', () => {
    const { ctrl } = makeController();
    ctrl.animateToCloseUp();
    expect(ctrl.getState()).toBe(CAMERA_STATE.ANIMATING_TO_CLOSEUP);
  });

  test('camera_animate_to_closeup command fires synchronously (AC1)', () => {
    const { ctrl, cameraHook } = makeController();
    ctrl.animateToCloseUp();
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP, {
      duration: 50,
    });
  });

  test('ANIMATE_TO_CLOSEUP command fires before any timer advances', () => {
    const { ctrl, cameraHook } = makeController();
    ctrl.animateToCloseUp();
    // No timers advanced — should already have fired
    const commands = cameraHook.mock.calls.map((c) => c[0]);
    expect(commands).toContain(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP);
  });

  test('animateToCloseUp() is a no-op if already in progress', () => {
    const { ctrl, cameraHook } = makeController();
    ctrl.animateToCloseUp();
    cameraHook.mockClear();
    ctrl.animateToCloseUp(); // second call
    expect(cameraHook).not.toHaveBeenCalled();
  });

  test('animateToCloseUp() is a no-op if aborted', () => {
    const { ctrl, cameraHook } = makeController();
    ctrl.abort();
    cameraHook.mockClear();
    ctrl.animateToCloseUp();
    expect(cameraHook).not.toHaveBeenCalled();
  });
});

// ─── Hold phase — AC3 (configurable hold duration) ───────────────────────────

describe('CameraAnimationController — hold phase (AC3)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('state transitions to HOLDING after animate-in completes', () => {
    const { ctrl } = makeController({ animateInDurationMs: 50, holdDurationMs: 1500 });
    ctrl.animateToCloseUp();
    jest.advanceTimersByTime(50);
    expect(ctrl.getState()).toBe(CAMERA_STATE.HOLDING);
  });

  test('camera_hold_at_closeup command fires after animate-in', () => {
    const { ctrl, cameraHook } = makeController({ animateInDurationMs: 50, holdDurationMs: 1500 });
    ctrl.animateToCloseUp();
    jest.advanceTimersByTime(50);
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.HOLD_AT_CLOSEUP, {
      duration: 1500,
    });
  });

  test('camera_animate_to_player_view fires after hold elapses', () => {
    const { ctrl, cameraHook } = makeController({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    ctrl.animateToCloseUp();
    jest.advanceTimersByTime(50 + 1500);
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ANIMATE_TO_PLAYER_VIEW, {
      duration: 50,
      targetView: null,
    });
  });

  test('targetView in ANIMATE_TO_PLAYER_VIEW matches saved player view', () => {
    const playerView = { position: { x: 5, y: 10, z: 3 }, angle: 30 };
    const { ctrl, cameraHook } = makeController({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    ctrl.savePlayerView(playerView);
    ctrl.animateToCloseUp();
    jest.advanceTimersByTime(50 + 1500);
    const animateOutCall = cameraHook.mock.calls.find(
      (c) => c[0] === CAMERA_COMMANDS.ANIMATE_TO_PLAYER_VIEW
    );
    expect(animateOutCall[1].targetView).toBe(playerView);
  });
});

// ─── Restore phase — AC3 (exact view restore, Test Scenario #2) ──────────────

describe('CameraAnimationController — restore phase (AC3, Scenario 2)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('camera_restore_player_view fires with exact saved view (no drift)', () => {
    const savedView = { position: { x: 1, y: 2, z: 3 }, angle: 45.0 };
    const { ctrl, cameraHook } = makeController({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    ctrl.savePlayerView(savedView);
    ctrl.animateToCloseUp();
    jest.advanceTimersByTime(50 + 1500 + 50 + 50); // in + hold + out + complete
    const restoreCall = cameraHook.mock.calls.find(
      (c) => c[0] === CAMERA_COMMANDS.RESTORE_PLAYER_VIEW
    );
    expect(restoreCall).toBeDefined();
    expect(restoreCall[1].savedView).toBe(savedView); // exact reference equality
  });

  test('state returns to IDLE after full animation completes', () => {
    const { ctrl } = makeController({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    ctrl.animateToCloseUp();
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    expect(ctrl.getState()).toBe(CAMERA_STATE.IDLE);
  });

  test('onAnimationComplete callback fires after restore (AC5)', () => {
    const { ctrl, onAnimationComplete } = makeController({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    ctrl.animateToCloseUp();
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
  });
});

// ─── Abort — Scenario 9 (scene/state transition during animation) ─────────────

describe('CameraAnimationController — abort() (Scenario 9)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('abort() fires camera_abort command', () => {
    const { ctrl, cameraHook } = makeController();
    ctrl.animateToCloseUp();
    ctrl.abort();
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ABORT, { savedView: null });
  });

  test('abort() transitions state to IDLE', () => {
    const { ctrl } = makeController();
    ctrl.animateToCloseUp();
    ctrl.abort();
    expect(ctrl.getState()).toBe(CAMERA_STATE.IDLE);
  });

  test('hold command does NOT fire after abort()', () => {
    const { ctrl, cameraHook } = makeController({ animateInDurationMs: 50, holdDurationMs: 1500 });
    ctrl.animateToCloseUp();
    ctrl.abort();
    jest.advanceTimersByTime(50 + 1500 + 100);
    const commands = cameraHook.mock.calls.map((c) => c[0]);
    expect(commands).not.toContain(CAMERA_COMMANDS.HOLD_AT_CLOSEUP);
  });

  test('onAnimationComplete does NOT fire after abort()', () => {
    const { ctrl, onAnimationComplete } = makeController({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    ctrl.animateToCloseUp();
    ctrl.abort();
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    expect(onAnimationComplete).not.toHaveBeenCalled();
  });

  test('abort() is idempotent — second call is a no-op', () => {
    const { ctrl, cameraHook } = makeController();
    ctrl.animateToCloseUp();
    ctrl.abort();
    const callCountAfterFirst = cameraHook.mock.calls.length;
    ctrl.abort();
    expect(cameraHook.mock.calls.length).toBe(callCountAfterFirst);
  });

  test('abort() includes savedView in abort command payload', () => {
    const savedView = { angle: 22.5 };
    const { ctrl, cameraHook } = makeController();
    ctrl.savePlayerView(savedView);
    ctrl.animateToCloseUp();
    ctrl.abort();
    const abortCall = cameraHook.mock.calls.find((c) => c[0] === CAMERA_COMMANDS.ABORT);
    expect(abortCall[1].savedView).toBe(savedView);
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('CameraAnimationController — reset()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('reset() clears saved player view', () => {
    const { ctrl } = makeController();
    ctrl.savePlayerView({ angle: 45 });
    ctrl.reset();
    expect(ctrl.getSavedPlayerView()).toBeNull();
  });

  test('reset() returns state to IDLE', () => {
    const { ctrl } = makeController({ animateInDurationMs: 50, holdDurationMs: 1500 });
    ctrl.animateToCloseUp();
    ctrl.reset();
    expect(ctrl.getState()).toBe(CAMERA_STATE.IDLE);
  });

  test('after reset(), animateToCloseUp() starts a new sequence', () => {
    const { ctrl, cameraHook } = makeController({ animateInDurationMs: 50, holdDurationMs: 1500 });
    ctrl.animateToCloseUp();
    ctrl.reset();
    cameraHook.mockClear();
    ctrl.animateToCloseUp();
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP, expect.any(Object));
  });
});
