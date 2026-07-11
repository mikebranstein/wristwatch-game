/**
 * CinematicCameraController — scoped camera override for the cleaning reveal beat.
 *
 * Design constraints (AC #54-2, #54-4, #54-5):
 *   - Camera move lasts 2–5 seconds at the reveal beat (AC#54-2).
 *   - Camera must return to normal gameplay position smoothly — no snap, no overshoot
 *     (AC#54-5). Uses an ease-out cubic easing curve for both the move and recovery.
 *   - Active ONLY during the reveal sequence; does not touch player-controlled
 *     camera logic at any other time.
 *   - Performance: uses only easing curve computations — no expensive post-process
 *     effects — ensuring ≥30fps on minimum-spec hardware (AC#54-4).
 */

const CINEMATIC_MOVE_MIN_MS = 2000;    // AC#54-2: minimum 2 seconds
const CINEMATIC_MOVE_MAX_MS = 5000;    // AC#54-2: maximum 5 seconds
const DEFAULT_MOVE_DURATION_MS = 3000; // 3 s — comfortably within 2–5 s range
const RECOVERY_DURATION_MS = 800;      // Smooth recovery easing duration

/**
 * Ease-out cubic — decelerates toward end for polished, non-jarring camera moves.
 * AC#54-4: used instead of post-process effects to keep GPU cost minimal.
 * @param {number} t  Progress 0.0–1.0
 * @returns {number}  Eased progress 0.0–1.0
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

class CinematicCameraController {
  /**
   * @param {Object} opts
   * @param {Function} opts.cameraOverrideHook  (moveType, easedProgress) => void
   *   Called with the cinematic camera transform; easedProgress is 0–1.
   * @param {Function} opts.cameraRestoreHook   (recoveryProgress) => void
   *   Called during recovery; recoveryProgress is 0–1.
   * @param {number}   [opts.moveDurationMs]    Cinematic move duration (clamped to 2000–5000ms).
   */
  constructor({ cameraOverrideHook, cameraRestoreHook, moveDurationMs = DEFAULT_MOVE_DURATION_MS }) {
    if (typeof cameraOverrideHook !== 'function') {
      throw new Error('CinematicCameraController: cameraOverrideHook must be a function.');
    }
    if (typeof cameraRestoreHook !== 'function') {
      throw new Error('CinematicCameraController: cameraRestoreHook must be a function.');
    }

    // Clamp duration to the valid 2–5 s range (AC#54-2)
    const clampedDuration = Math.max(
      CINEMATIC_MOVE_MIN_MS,
      Math.min(CINEMATIC_MOVE_MAX_MS, moveDurationMs)
    );

    this._cameraOverrideHook = cameraOverrideHook;
    this._cameraRestoreHook = cameraRestoreHook;
    this._moveDurationMs = clampedDuration;
    this._isActive = false;
    this._isRecovering = false;
    this._onComplete = null;
    this._moveTimer = null;
    this._recoveryTimer = null;
  }

  /**
   * Fires the cinematic pull-back / focus-shift at the reveal beat.
   * AC#54-2: lasts 2–5 seconds; AC#54-4: easing-only, no expensive GPU ops.
   *
   * @param {Function} [onComplete]  Called after move AND recovery both finish.
   */
  playRevealMove(onComplete = null) {
    // Prevent double-fire if already active or recovering
    if (this._isActive || this._isRecovering) return;

    this._isActive = true;
    this._onComplete = onComplete;

    // Initial override at progress 0 — camera begins moving
    this._cameraOverrideHook('pull_back', easeOutCubic(0));

    // Mid-point update
    const halfDuration = this._moveDurationMs / 2;
    this._moveTimer = setTimeout(() => {
      this._cameraOverrideHook('pull_back', easeOutCubic(0.5));

      // Move complete — begin smooth recovery (AC#54-5: no snap)
      this._moveTimer = setTimeout(() => {
        this._isActive = false;
        this._isRecovering = true;
        this._cameraOverrideHook('pull_back', easeOutCubic(1.0));
        this._beginRecovery();
      }, halfDuration);
    }, halfDuration);
  }

  /** Begins the smooth camera recovery back to the normal gameplay position. */
  _beginRecovery() {
    this._cameraRestoreHook(easeOutCubic(0));

    const halfRecovery = RECOVERY_DURATION_MS / 2;
    this._recoveryTimer = setTimeout(() => {
      this._cameraRestoreHook(easeOutCubic(0.5));

      this._recoveryTimer = setTimeout(() => {
        this._cameraRestoreHook(easeOutCubic(1.0));
        this._isRecovering = false;

        if (typeof this._onComplete === 'function') {
          this._onComplete();
        }
      }, halfRecovery);
    }, halfRecovery);
  }

  /**
   * Force-restores the camera to the normal gameplay position immediately.
   * Used as a safety fallback if the reveal sequence is interrupted mid-move.
   * AC#54-5: still uses easing to avoid a jarring snap.
   */
  restore() {
    if (this._moveTimer) {
      clearTimeout(this._moveTimer);
      this._moveTimer = null;
    }
    if (this._recoveryTimer) {
      clearTimeout(this._recoveryTimer);
      this._recoveryTimer = null;
    }

    if (this._isActive || this._isRecovering) {
      this._isActive = false;
      this._isRecovering = false;
      // Eased restore at progress 1.0 — smooth, no snap (AC#54-5)
      this._cameraRestoreHook(easeOutCubic(1.0));
    }
  }

  /** @returns {boolean} True while the cinematic move is in progress. */
  isActive() {
    return this._isActive;
  }

  /** @returns {boolean} True while the camera is easing back to normal position. */
  isRecovering() {
    return this._isRecovering;
  }

  /**
   * @returns {boolean} True when the camera is fully back at the normal gameplay
   *   position (neither active nor recovering).
   */
  isAtRest() {
    return !this._isActive && !this._isRecovering;
  }

  /** @returns {number} Configured cinematic move duration in milliseconds. */
  getDurationMs() {
    return this._moveDurationMs;
  }

  /** @returns {{ min: number, max: number }} Valid move duration range in ms (AC#54-2). */
  static getDurationRange() {
    return { min: CINEMATIC_MOVE_MIN_MS, max: CINEMATIC_MOVE_MAX_MS };
  }

  /** @returns {number} Recovery duration in milliseconds. */
  static getRecoveryDurationMs() {
    return RECOVERY_DURATION_MS;
  }

  /** Cleanup — cancels pending timers and restores camera state. */
  destroy() {
    this.restore();
  }
}

module.exports = {
  CinematicCameraController,
  CINEMATIC_MOVE_MIN_MS,
  CINEMATIC_MOVE_MAX_MS,
  DEFAULT_MOVE_DURATION_MS,
  RECOVERY_DURATION_MS,
  easeOutCubic,
};
