/**
 * CameraAnimationController — manages the camera animation sequence for the
 * first-tick cinematic treatment (Issue #114, Phase 2).
 *
 * Three-phase animation sequence:
 *   Phase 1 — ANIMATING_TO_CLOSEUP: smooth dolly/zoom from the saved player
 *              view to the balance-wheel close-up position (AC1).
 *   Phase 2 — HOLDING: camera lingers at close-up for a configurable hold
 *              duration (1.5–3 seconds) (AC3).
 *   Phase 3 — ANIMATING_TO_PLAYER_VIEW: smooth ease-back to the saved player
 *              view position/angle without a hard cut (AC3).
 *
 * Design pattern: mirrors FirstTickAudioController (Issue #113). The
 * cameraHook is injected at construction time; this module is responsible
 * only for state transitions and timing. The caller maps camera commands to
 * actual camera-system calls.
 *
 * Constraints from Issue #114:
 *   - Hold duration clamped to [MIN_HOLD_DURATION_MS, MAX_HOLD_DURATION_MS].
 *   - Camera must restore the saved player view with exact precision — no
 *     drift (AC3, Test Scenario #2: within 1° of original position/angle).
 *   - total animate-in + animate-out kept short so that perceived total
 *     sequence time remains acceptable at minimum hold of 1.5 s.
 *
 * Acceptance criteria covered:
 *   AC1 — animateToCloseUp() starts synchronously when called; caller ensures
 *          the ≤ 100 ms trigger window from the first-tick audio event.
 *   AC3 — hold-and-return: configurable hold (1500–3000 ms); smooth ease-back
 *          camera command forwarded to hook; exact savedView restored.
 *   AC5 — onAnimationComplete callback fires when the full sequence finishes,
 *          signalling the PlayerInputController to resume player input.
 */

/** Camera animation states (for QA assertions). */
const CAMERA_STATE = {
  IDLE:                     'idle',
  ANIMATING_TO_CLOSEUP:     'animating_to_closeup',
  HOLDING:                  'holding',
  ANIMATING_TO_PLAYER_VIEW: 'animating_to_player_view',
};

/** Camera command identifiers forwarded to the injected cameraHook. */
const CAMERA_COMMANDS = {
  ANIMATE_TO_CLOSEUP:     'camera_animate_to_closeup',
  HOLD_AT_CLOSEUP:        'camera_hold_at_closeup',
  ANIMATE_TO_PLAYER_VIEW: 'camera_animate_to_player_view',
  RESTORE_PLAYER_VIEW:    'camera_restore_player_view',
  ABORT:                  'camera_abort',
};

const DEFAULT_HOLD_DURATION_MS     = 1500;
const MIN_HOLD_DURATION_MS         = 1500;
const MAX_HOLD_DURATION_MS         = 3000;
const DEFAULT_ANIMATE_IN_DURATION_MS  = 300;
const DEFAULT_ANIMATE_OUT_DURATION_MS = 300;

class CameraAnimationController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.cameraHook             Injected camera command hook:
   *   (command, payload) => void.
   * @param {Function} [opts.onAnimationComplete]  Callback fired when the full
   *   sequence finishes (animate-in + hold + animate-out). Used by
   *   FirstTickCinematicSequence to resume player input (AC5).
   * @param {number}   [opts.holdDurationMs]        Hold duration in ms
   *   (clamped to [1500, 3000]).
   * @param {number}   [opts.animateInDurationMs]   Animate-to-close-up duration.
   * @param {number}   [opts.animateOutDurationMs]  Animate-back duration.
   */
  constructor({
    cameraHook,
    onAnimationComplete = null,
    holdDurationMs = DEFAULT_HOLD_DURATION_MS,
    animateInDurationMs = DEFAULT_ANIMATE_IN_DURATION_MS,
    animateOutDurationMs = DEFAULT_ANIMATE_OUT_DURATION_MS,
  }) {
    if (typeof cameraHook !== 'function') {
      throw new Error('CameraAnimationController requires a cameraHook function.');
    }
    if (onAnimationComplete !== null && typeof onAnimationComplete !== 'function') {
      throw new Error('CameraAnimationController: onAnimationComplete must be a function or null.');
    }

    this._cameraHook           = cameraHook;
    this._onAnimationComplete  = onAnimationComplete;
    this._holdDurationMs       = Math.max(MIN_HOLD_DURATION_MS, Math.min(MAX_HOLD_DURATION_MS, holdDurationMs));
    this._animateInDurationMs  = animateInDurationMs;
    this._animateOutDurationMs = animateOutDurationMs;

    this._state           = CAMERA_STATE.IDLE;
    this._savedPlayerView = null;
    this._holdTimer       = null;
    this._animateOutTimer = null;
    this._completeTimer   = null;
    this._aborted         = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Save the current player camera view so it can be restored after the
   * animation sequence completes (AC3 — no camera drift after return).
   *
   * @param {Object|null} playerView  Opaque view descriptor forwarded verbatim
   *   to the cameraHook's RESTORE_PLAYER_VIEW command.
   */
  savePlayerView(playerView) {
    this._savedPlayerView = playerView;
  }

  /**
   * Start the full camera animation sequence synchronously:
   *   1. Animate in to balance-wheel close-up (animateInDurationMs).
   *   2. Hold at close-up (holdDurationMs).
   *   3. Animate out back to saved player view (animateOutDurationMs).
   *   4. Restore exact saved view, fire onAnimationComplete.
   *
   * No-op if already in progress or aborted.
   */
  animateToCloseUp() {
    if (this._aborted || this._state !== CAMERA_STATE.IDLE) return;

    // Phase 1 — animate in (AC1: starts synchronously)
    this._state = CAMERA_STATE.ANIMATING_TO_CLOSEUP;
    this._cameraHook(CAMERA_COMMANDS.ANIMATE_TO_CLOSEUP, {
      duration: this._animateInDurationMs,
    });

    // Phase 2 — hold at close-up after animate-in completes
    this._holdTimer = setTimeout(() => {
      if (this._aborted) return;

      this._state = CAMERA_STATE.HOLDING;
      this._cameraHook(CAMERA_COMMANDS.HOLD_AT_CLOSEUP, {
        duration: this._holdDurationMs,
      });

      // Phase 3 — animate out after hold elapses
      this._animateOutTimer = setTimeout(() => {
        if (this._aborted) return;

        this._state = CAMERA_STATE.ANIMATING_TO_PLAYER_VIEW;
        this._cameraHook(CAMERA_COMMANDS.ANIMATE_TO_PLAYER_VIEW, {
          duration:   this._animateOutDurationMs,
          targetView: this._savedPlayerView,
        });

        // Restore and complete after animate-out
        this._completeTimer = setTimeout(() => {
          if (this._aborted) return;

          // Exact restore — no drift (AC3, Test Scenario #2)
          this._cameraHook(CAMERA_COMMANDS.RESTORE_PLAYER_VIEW, {
            savedView: this._savedPlayerView,
          });
          this._state = CAMERA_STATE.IDLE;

          if (this._onAnimationComplete) {
            this._onAnimationComplete();
          }
        }, this._animateOutDurationMs);
      }, this._holdDurationMs);
    }, this._animateInDurationMs);
  }

  /**
   * Abort all in-flight animation timers and issue a camera abort command.
   * Leaves no orphaned state (AC — scene/state transition during animation).
   * After abort() the controller is safe to discard.
   */
  abort() {
    if (this._aborted) return;
    this._aborted = true;

    if (this._holdTimer !== null)       { clearTimeout(this._holdTimer);       this._holdTimer = null; }
    if (this._animateOutTimer !== null) { clearTimeout(this._animateOutTimer); this._animateOutTimer = null; }
    if (this._completeTimer !== null)   { clearTimeout(this._completeTimer);   this._completeTimer = null; }

    this._cameraHook(CAMERA_COMMANDS.ABORT, { savedView: this._savedPlayerView });
    this._state = CAMERA_STATE.IDLE;
  }

  /**
   * Reset the controller for a fresh sequence (e.g. new watch loaded).
   * Clears timers and abort flag; does NOT clear _savedPlayerView.
   */
  reset() {
    if (this._holdTimer !== null)       { clearTimeout(this._holdTimer);       this._holdTimer = null; }
    if (this._animateOutTimer !== null) { clearTimeout(this._animateOutTimer); this._animateOutTimer = null; }
    if (this._completeTimer !== null)   { clearTimeout(this._completeTimer);   this._completeTimer = null; }
    this._aborted         = false;
    this._state           = CAMERA_STATE.IDLE;
    this._savedPlayerView = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string}      Current camera animation state. */
  getState() { return this._state; }

  /** @returns {Object|null} Saved player view descriptor (for test assertions). */
  getSavedPlayerView() { return this._savedPlayerView; }

  /** @returns {number} Active hold duration in ms. */
  getHoldDurationMs() { return this._holdDurationMs; }

  /** @returns {number} Animate-in duration in ms. */
  getAnimateInDurationMs() { return this._animateInDurationMs; }

  /** @returns {number} Animate-out duration in ms. */
  getAnimateOutDurationMs() { return this._animateOutDurationMs; }
}

module.exports = {
  CameraAnimationController,
  CAMERA_STATE,
  CAMERA_COMMANDS,
  DEFAULT_HOLD_DURATION_MS,
  MIN_HOLD_DURATION_MS,
  MAX_HOLD_DURATION_MS,
  DEFAULT_ANIMATE_IN_DURATION_MS,
  DEFAULT_ANIMATE_OUT_DURATION_MS,
};
