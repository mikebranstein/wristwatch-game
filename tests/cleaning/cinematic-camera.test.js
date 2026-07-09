/**
 * Tests for CinematicCameraController — AC#54-2, AC#54-4, AC#54-5
 *
 * AC#54-2: cinematic camera move fires at reveal beat, lasting 2–5 seconds.
 * AC#54-4: camera move uses only easing computations (≥30fps preserved — no expensive GPU ops).
 * AC#54-5: camera returns smoothly to normal gameplay position — no snap, no overshoot.
 */

const {
  CinematicCameraController,
  CINEMATIC_MOVE_MIN_MS,
  CINEMATIC_MOVE_MAX_MS,
  DEFAULT_MOVE_DURATION_MS,
  RECOVERY_DURATION_MS,
} = require('../../src/cleaning/CinematicCameraController');

function makeController(overrides = {}) {
  return new CinematicCameraController({
    cameraOverrideHook: jest.fn(),
    cameraRestoreHook: jest.fn(),
    ...overrides,
  });
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('CinematicCameraController — construction', () => {
  test('throws if cameraOverrideHook is not a function', () => {
    expect(() =>
      new CinematicCameraController({ cameraOverrideHook: null, cameraRestoreHook: jest.fn() })
    ).toThrow('cameraOverrideHook must be a function');
  });

  test('throws if cameraRestoreHook is not a function', () => {
    expect(() =>
      new CinematicCameraController({ cameraOverrideHook: jest.fn(), cameraRestoreHook: null })
    ).toThrow('cameraRestoreHook must be a function');
  });

  test('constructs with valid hooks — camera is at rest initially', () => {
    const ctrl = makeController();
    expect(ctrl.isAtRest()).toBe(true);
    expect(ctrl.isActive()).toBe(false);
    expect(ctrl.isRecovering()).toBe(false);
  });

  test('AC#54-2: getDurationMs() returns a value within the 2–5 second range', () => {
    const ctrl = makeController();
    const duration = ctrl.getDurationMs();
    expect(duration).toBeGreaterThanOrEqual(CINEMATIC_MOVE_MIN_MS);
    expect(duration).toBeLessThanOrEqual(CINEMATIC_MOVE_MAX_MS);
  });

  test('moveDurationMs below minimum is clamped to CINEMATIC_MOVE_MIN_MS', () => {
    const ctrl = makeController({ moveDurationMs: 100 });
    expect(ctrl.getDurationMs()).toBe(CINEMATIC_MOVE_MIN_MS);
  });

  test('moveDurationMs above maximum is clamped to CINEMATIC_MOVE_MAX_MS', () => {
    const ctrl = makeController({ moveDurationMs: 99999 });
    expect(ctrl.getDurationMs()).toBe(CINEMATIC_MOVE_MAX_MS);
  });

  test('getDurationRange() returns { min: 2000, max: 5000 }', () => {
    const range = CinematicCameraController.getDurationRange();
    expect(range.min).toBe(2000);
    expect(range.max).toBe(5000);
  });

  test('getRecoveryDurationMs() returns a positive number', () => {
    expect(CinematicCameraController.getRecoveryDurationMs()).toBeGreaterThan(0);
    expect(CinematicCameraController.getRecoveryDurationMs()).toBe(RECOVERY_DURATION_MS);
  });
});

// ── playRevealMove() (AC#54-2, AC#54-4) ──────────────────────────────────────

describe('CinematicCameraController — playRevealMove()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('AC#54-2: isActive() is true immediately after playRevealMove()', () => {
    const ctrl = makeController();
    ctrl.playRevealMove();
    expect(ctrl.isActive()).toBe(true);
  });

  test('AC#54-2: cameraOverrideHook is called with "pull_back" move type', () => {
    const cameraOverrideHook = jest.fn();
    const ctrl = makeController({ cameraOverrideHook });
    ctrl.playRevealMove();
    expect(cameraOverrideHook).toHaveBeenCalledWith('pull_back', expect.any(Number));
  });

  test('AC#54-4: cameraOverrideHook progress values are between 0 and 1 (eased, not raw)', () => {
    const progressValues = [];
    const cameraOverrideHook = jest.fn((moveType, progress) => progressValues.push(progress));
    const ctrl = makeController({ cameraOverrideHook });
    ctrl.playRevealMove();
    jest.runAllTimers();
    progressValues.forEach(p => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  test('AC#54-5: cameraRestoreHook is called during recovery phase', () => {
    const cameraRestoreHook = jest.fn();
    const ctrl = makeController({ cameraRestoreHook });
    ctrl.playRevealMove();
    jest.advanceTimersByTime(DEFAULT_MOVE_DURATION_MS + 10);
    expect(cameraRestoreHook).toHaveBeenCalled();
  });

  test('AC#54-5: cameraRestoreHook receives progress values between 0 and 1 (eased recovery)', () => {
    const recoveryValues = [];
    const cameraRestoreHook = jest.fn((progress) => recoveryValues.push(progress));
    const ctrl = makeController({ cameraRestoreHook });
    ctrl.playRevealMove();
    jest.runAllTimers();
    expect(recoveryValues.length).toBeGreaterThan(0);
    recoveryValues.forEach(p => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  test('AC#54-5: isAtRest() is true after move and recovery fully complete', () => {
    const ctrl = makeController();
    ctrl.playRevealMove();
    jest.advanceTimersByTime(DEFAULT_MOVE_DURATION_MS + RECOVERY_DURATION_MS + 100);
    expect(ctrl.isAtRest()).toBe(true);
  });

  test('onComplete fires after move + recovery completes', () => {
    const onComplete = jest.fn();
    const ctrl = makeController();
    ctrl.playRevealMove(onComplete);
    jest.advanceTimersByTime(DEFAULT_MOVE_DURATION_MS + RECOVERY_DURATION_MS + 100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('playRevealMove() while already active is a no-op (prevents double-fire)', () => {
    const cameraOverrideHook = jest.fn();
    const ctrl = makeController({ cameraOverrideHook });
    ctrl.playRevealMove();
    const callsAfterFirst = cameraOverrideHook.mock.calls.length;
    ctrl.playRevealMove(); // second call — should be ignored
    expect(cameraOverrideHook.mock.calls.length).toBe(callsAfterFirst);
  });

  test('isRecovering() is true after move completes but before recovery finishes', () => {
    const ctrl = makeController();
    ctrl.playRevealMove();
    // Move is done, recovery hasn't finished yet
    jest.advanceTimersByTime(DEFAULT_MOVE_DURATION_MS + 1);
    expect(ctrl.isRecovering()).toBe(true);
  });
});

// ── restore() (AC#54-5) ───────────────────────────────────────────────────────

describe('CinematicCameraController — restore()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('AC#54-5: restore() while active calls cameraRestoreHook and returns to rest', () => {
    const cameraRestoreHook = jest.fn();
    const ctrl = makeController({ cameraRestoreHook });
    ctrl.playRevealMove();
    ctrl.restore();
    expect(cameraRestoreHook).toHaveBeenCalled();
    expect(ctrl.isAtRest()).toBe(true);
  });

  test('restore() cancels pending move timers — onComplete is NOT called', () => {
    const onComplete = jest.fn();
    const ctrl = makeController();
    ctrl.playRevealMove(onComplete);
    ctrl.restore();
    jest.runAllTimers();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('restore() on an already-resting controller is a no-op (no errors)', () => {
    const ctrl = makeController();
    expect(() => ctrl.restore()).not.toThrow();
    expect(ctrl.isAtRest()).toBe(true);
  });

  test('AC#54-5: restore() does NOT call cameraRestoreHook when already at rest', () => {
    const cameraRestoreHook = jest.fn();
    const ctrl = makeController({ cameraRestoreHook });
    ctrl.restore(); // already at rest
    expect(cameraRestoreHook).not.toHaveBeenCalled();
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────────

describe('CinematicCameraController — destroy()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('destroy() while active restores camera and returns to rest', () => {
    const ctrl = makeController();
    ctrl.playRevealMove();
    ctrl.destroy();
    expect(ctrl.isAtRest()).toBe(true);
  });

  test('destroy() while recovering restores camera and returns to rest', () => {
    const ctrl = makeController();
    ctrl.playRevealMove();
    jest.advanceTimersByTime(DEFAULT_MOVE_DURATION_MS + 1); // in recovery
    ctrl.destroy();
    expect(ctrl.isAtRest()).toBe(true);
  });

  test('destroy() when already at rest does not throw', () => {
    const ctrl = makeController();
    expect(() => ctrl.destroy()).not.toThrow();
  });
});
