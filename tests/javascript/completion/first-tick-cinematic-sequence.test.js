/**
 * Tests for FirstTickCinematicSequence — top-level Phase 2 orchestrator
 * (Issue #114)
 *
 * Acceptance criteria covered:
 *   AC1 — onFirstTickFired() triggers camera animation synchronously.
 *   AC2 — balance-wheel highlight activates when cinematic sequence begins.
 *   AC3 — camera returns to saved player view after configured hold.
 *   AC4 — re-wind suppression: camera and highlight do NOT fire on re-wind.
 *   AC5 — input suspended at start, resumed after camera animation completes.
 *
 * Test scenarios mapped to Issue #114:
 *   Scenario 1  — Happy path: full cinematic a/v beat fires on first activation.
 *   Scenario 2  — Camera return accuracy: savedView passed back unchanged.
 *   Scenario 3  — Re-wind suppression: no camera, no highlight, no input suspend.
 *   Scenario 4  — Player input during animation: input suspended; resumes cleanly.
 *   Scenario 5  — Multiple watches: cinematic fires independently per watch.
 *   Scenario 8  — Balance wheel fail: cinematic NOT triggered (no onFirstTickFired call).
 *   Scenario 9  — Scene/state transition: abort() cancels animation, resumes input.
 */

const { FirstTickCinematicSequence } = require('../../../src/completion/FirstTickCinematicSequence');
const { CAMERA_STATE, CAMERA_COMMANDS } = require('../../../src/completion/CameraAnimationController');
const { HIGHLIGHT_STATE, HIGHLIGHT_COMMANDS } = require('../../../src/completion/BalanceWheelHighlight');
const { INPUT_STATE, INPUT_COMMANDS } = require('../../../src/completion/PlayerInputController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSequence(opts = {}) {
  const cameraHook    = jest.fn();
  const highlightHook = jest.fn();
  const inputHook     = jest.fn();

  const seq = new FirstTickCinematicSequence({
    cameraHook,
    highlightHook,
    inputHook,
    // Fast timings for tests
    animateInDurationMs:  50,
    animateOutDurationMs: 50,
    holdDurationMs:       1500,
    ...opts,
  });

  return { seq, cameraHook, highlightHook, inputHook };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('FirstTickCinematicSequence — construction', () => {
  test('constructs successfully with required options', () => {
    expect(() => makeSequence()).not.toThrow();
  });

  test('exposes camera controller accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getCameraController()).toBeDefined();
  });

  test('exposes highlight controller accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getHighlightController()).toBeDefined();
  });

  test('exposes input controller accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getInputController()).toBeDefined();
  });

  test('hasActivated() is false before any first-tick event', () => {
    const { seq } = makeSequence();
    expect(seq.hasActivated('watch-001')).toBe(false);
  });
});

// ─── Scenario 1 — Happy path: full cinematic beat (AC1–AC5) ──────────────────

describe('Scenario 1 — Happy path: full cinematic a/v beat fires on first activation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('AC1 — camera_animate_to_closeup fires synchronously on onFirstTickFired()', () => {
    const { seq, cameraHook } = makeSequence();
    seq.onFirstTickFired('watch-001');
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP, {
      duration: 50,
    });
  });

  test('AC1 — camera animation starts before any timers advance', () => {
    const { seq, cameraHook } = makeSequence();
    seq.onFirstTickFired('watch-001');
    const commands = cameraHook.mock.calls.map((c) => c[0]);
    expect(commands).toContain(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP);
  });

  test('AC2 — balance-wheel highlight activates on first-tick (ANIMATE command fires)', () => {
    const { seq, highlightHook } = makeSequence();
    seq.onFirstTickFired('watch-001');
    expect(highlightHook).toHaveBeenCalledWith(HIGHLIGHT_COMMANDS.ACTIVATE);
  });

  test('AC2 — highlight is ACTIVE immediately after onFirstTickFired()', () => {
    const { seq } = makeSequence();
    seq.onFirstTickFired('watch-001');
    expect(seq.getHighlightController().isActive()).toBe(true);
  });

  test('AC5 — player input is suspended immediately on onFirstTickFired()', () => {
    const { seq, inputHook } = makeSequence();
    seq.onFirstTickFired('watch-001');
    expect(inputHook).toHaveBeenCalledWith(INPUT_COMMANDS.SUSPEND);
    expect(seq.getInputController().isSuspended()).toBe(true);
  });

  test('hasActivated() is true after onFirstTickFired()', () => {
    const { seq } = makeSequence();
    seq.onFirstTickFired('watch-001');
    expect(seq.hasActivated('watch-001')).toBe(true);
  });

  test('AC3 — camera_hold_at_closeup fires after animate-in', () => {
    const { seq, cameraHook } = makeSequence({ animateInDurationMs: 50 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50);
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.HOLD_AT_CLOSEUP, {
      duration: 1500,
    });
  });

  test('AC3 — camera_animate_to_player_view fires after hold', () => {
    const { seq, cameraHook } = makeSequence({ animateInDurationMs: 50, holdDurationMs: 1500 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500);
    const commands = cameraHook.mock.calls.map((c) => c[0]);
    expect(commands).toContain(CAMERA_COMMANDS.ANIMATE_TO_PLAYER_VIEW);
  });

  test('AC3 — camera_restore_player_view fires after animate-out', () => {
    const { seq, cameraHook } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    const commands = cameraHook.mock.calls.map((c) => c[0]);
    expect(commands).toContain(CAMERA_COMMANDS.RESTORE_PLAYER_VIEW);
  });

  test('AC5 — player input resumes after full animation completes', () => {
    const { seq, inputHook } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    const commands = inputHook.mock.calls.map((c) => c[0]);
    expect(commands).toContain(INPUT_COMMANDS.RESUME);
    expect(seq.getInputController().isSuspended()).toBe(false);
  });

  test('AC2 — highlight deactivates after full animation completes', () => {
    const { seq, highlightHook } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    expect(highlightHook).toHaveBeenCalledWith(HIGHLIGHT_COMMANDS.DEACTIVATE);
    expect(seq.getHighlightController().isActive()).toBe(false);
  });
});

// ─── Scenario 2 — Camera return accuracy ─────────────────────────────────────

describe('Scenario 2 — Camera return accuracy: savedView forwarded unchanged (AC3)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('savedView is passed into RESTORE_PLAYER_VIEW without modification', () => {
    const playerView = { position: { x: 3, y: 7, z: -1 }, angle: 22.5 };
    const { seq, cameraHook } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001', playerView);
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    const restoreCall = cameraHook.mock.calls.find(
      (c) => c[0] === CAMERA_COMMANDS.RESTORE_PLAYER_VIEW
    );
    expect(restoreCall).toBeDefined();
    expect(restoreCall[1].savedView).toBe(playerView); // exact reference — no drift
  });

  test('savedView persists through full animation sequence', () => {
    const playerView = { angle: 89.9 };
    const { seq } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001', playerView);
    jest.advanceTimersByTime(50 + 1500);
    expect(seq.getCameraController().getSavedPlayerView()).toBe(playerView);
  });
});

// ─── Scenario 3 — Re-wind suppression (AC4) ──────────────────────────────────

describe('Scenario 3 — Re-wind suppression: camera and highlight do NOT fire (AC4)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('camera_animate_to_closeup does NOT fire on re-wind', () => {
    const { seq, cameraHook } = makeSequence({ animateInDurationMs: 50, holdDurationMs: 1500 });
    // First activation
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    cameraHook.mockClear();

    // Re-wind
    seq.onFirstTickFired('watch-001');
    const commands = cameraHook.mock.calls.map((c) => c[0]);
    expect(commands).not.toContain(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP);
  });

  test('highlight does NOT activate on re-wind', () => {
    const { seq, highlightHook } = makeSequence({ animateInDurationMs: 50, holdDurationMs: 1500 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    highlightHook.mockClear();

    seq.onFirstTickFired('watch-001'); // re-wind
    expect(highlightHook).not.toHaveBeenCalledWith(HIGHLIGHT_COMMANDS.ACTIVATE);
  });

  test('input is NOT suspended on re-wind', () => {
    const { seq, inputHook } = makeSequence({ animateInDurationMs: 50, holdDurationMs: 1500 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    inputHook.mockClear();

    seq.onFirstTickFired('watch-001'); // re-wind
    expect(inputHook).not.toHaveBeenCalledWith(INPUT_COMMANDS.SUSPEND);
  });

  test('hasActivated() remains true after re-wind (no double firing)', () => {
    const { seq } = makeSequence({ animateInDurationMs: 50, holdDurationMs: 1500 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    seq.onFirstTickFired('watch-001');
    expect(seq.hasActivated('watch-001')).toBe(true);
  });
});

// ─── Scenario 4 — Player input during animation (AC5) ────────────────────────

describe('Scenario 4 — Player input during animation: input suspended for hold duration (AC5)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('input is SUSPENDED throughout the animate-in phase', () => {
    const { seq } = makeSequence({ animateInDurationMs: 50 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(30); // mid animate-in
    expect(seq.getInputController().isSuspended()).toBe(true);
  });

  test('input is SUSPENDED throughout the hold phase', () => {
    const { seq } = makeSequence({ animateInDurationMs: 50, holdDurationMs: 1500 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 750); // mid hold
    expect(seq.getInputController().isSuspended()).toBe(true);
  });

  test('input is SUSPENDED throughout the animate-out phase', () => {
    const { seq } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 25); // mid animate-out
    expect(seq.getInputController().isSuspended()).toBe(true);
  });

  test('input resumes ONLY after full animation (AC5 clean resume)', () => {
    const { seq } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001');
    // The completeTimer fires at animateIn(50) + hold(1500) + animateOut(50) = 1600 ms.
    // Advance to 1 ms before that to verify input is still suspended.
    jest.advanceTimersByTime(50 + 1500 + 50 - 1); // 1599 ms
    expect(seq.getInputController().isSuspended()).toBe(true);
    // Advance the final 1 ms to fire the completeTimer and resume input.
    jest.advanceTimersByTime(1); // 1600 ms
    expect(seq.getInputController().isSuspended()).toBe(false);
  });
});

// ─── Scenario 5 — Multiple watches: cinematic fires independently ─────────────

describe('Scenario 5 — Multiple watches: each watch gets its own cinematic beat', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('camera animation fires on watch-001 then watch-002 independently', () => {
    const { seq, cameraHook } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });

    // Watch 001
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);

    cameraHook.mockClear();

    // Watch 002
    seq.onFirstTickFired('watch-002');
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP, expect.any(Object));
  });

  test('hasActivated() tracks each watch independently', () => {
    const { seq } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });

    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);

    seq.onFirstTickFired('watch-002');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);

    expect(seq.hasActivated('watch-001')).toBe(true);
    expect(seq.hasActivated('watch-002')).toBe(true);
    expect(seq.hasActivated('watch-003')).toBe(false);
  });

  test('re-wind on watch-001 does not affect first activation of watch-002', () => {
    const { seq, cameraHook } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });

    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    seq.onFirstTickFired('watch-001'); // re-wind — no effect

    cameraHook.mockClear();
    seq.onFirstTickFired('watch-002'); // new watch — should fire
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP, expect.any(Object));
  });
});

// ─── Scenario 8 — Incorrect assembly: cinematic NOT triggered ────────────────

describe('Scenario 8 — Incorrect assembly: cinematic does NOT trigger', () => {
  test('no camera, highlight, or input commands when onFirstTickFired is never called', () => {
    // In this game: WindMechanic suppresses onActivationThreshold for bad assembly,
    // so Phase 1 never calls onFirstTickFired. This test verifies no side-effects
    // happen unless the sync hook is explicitly invoked.
    const { seq, cameraHook, highlightHook, inputHook } = makeSequence();
    // Simulate bad assembly: onFirstTickFired is never called
    expect(cameraHook).not.toHaveBeenCalled();
    expect(highlightHook).not.toHaveBeenCalled();
    expect(inputHook).not.toHaveBeenCalled();
    expect(seq.hasActivated('watch-bad')).toBe(false);
  });
});

// ─── Scenario 9 — Scene/state transition: abort() (AC, Issue #114 Scenario 9) ──

describe('Scenario 9 — Scene/state transition during animation: abort() cleans up', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('abort() fires camera_abort command', () => {
    const { seq, cameraHook } = makeSequence({ animateInDurationMs: 50 });
    seq.onFirstTickFired('watch-001');
    seq.abort();
    expect(cameraHook).toHaveBeenCalledWith(CAMERA_COMMANDS.ABORT, expect.any(Object));
  });

  test('abort() deactivates the balance-wheel highlight', () => {
    const { seq, highlightHook } = makeSequence({ animateInDurationMs: 50 });
    seq.onFirstTickFired('watch-001');
    seq.abort();
    expect(highlightHook).toHaveBeenCalledWith(HIGHLIGHT_COMMANDS.DEACTIVATE);
    expect(seq.getHighlightController().isActive()).toBe(false);
  });

  test('abort() resumes player input immediately', () => {
    const { seq } = makeSequence({ animateInDurationMs: 50 });
    seq.onFirstTickFired('watch-001');
    expect(seq.getInputController().isSuspended()).toBe(true);
    seq.abort();
    expect(seq.getInputController().isSuspended()).toBe(false);
  });

  test('no further camera commands fire after abort()', () => {
    const { seq, cameraHook } = makeSequence({
      animateInDurationMs: 50,
      holdDurationMs: 1500,
      animateOutDurationMs: 50,
    });
    seq.onFirstTickFired('watch-001');
    seq.abort();
    cameraHook.mockClear();
    jest.advanceTimersByTime(50 + 1500 + 50 + 50);
    // No hold, restore, or animate-out should fire after abort
    const commands = cameraHook.mock.calls.map((c) => c[0]);
    expect(commands).not.toContain(CAMERA_COMMANDS.HOLD_AT_CLOSEUP);
    expect(commands).not.toContain(CAMERA_COMMANDS.ANIMATE_TO_PLAYER_VIEW);
    expect(commands).not.toContain(CAMERA_COMMANDS.RESTORE_PLAYER_VIEW);
  });

  test('no orphaned input state after abort() — input not stuck suspended', () => {
    const { seq } = makeSequence({ animateInDurationMs: 50, holdDurationMs: 1500 });
    seq.onFirstTickFired('watch-001');
    jest.advanceTimersByTime(50); // mid-animation
    seq.abort();
    expect(seq.getInputController().isSuspended()).toBe(false);
  });
});

// ─── hold duration clamping ───────────────────────────────────────────────────

describe('FirstTickCinematicSequence — hold duration configuration', () => {
  test('holdDurationMs is clamped to MIN (1500 ms)', () => {
    const { seq } = makeSequence({ holdDurationMs: 100 });
    expect(seq.getCameraController().getHoldDurationMs()).toBe(1500);
  });

  test('holdDurationMs is clamped to MAX (3000 ms)', () => {
    const { seq } = makeSequence({ holdDurationMs: 9999 });
    expect(seq.getCameraController().getHoldDurationMs()).toBe(3000);
  });

  test('holdDurationMs of 2000 ms is accepted unchanged', () => {
    const { seq } = makeSequence({ holdDurationMs: 2000 });
    expect(seq.getCameraController().getHoldDurationMs()).toBe(2000);
  });
});
