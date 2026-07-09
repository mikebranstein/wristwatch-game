/**
 * PlayerInputController — manages temporary suspension and clean resumption of
 * player input during the first-tick cinematic camera animation
 * (Issue #114, Phase 2).
 *
 * The player must not be able to move the camera or interact during the hold
 * phase; if they attempt rapid mouse / touch movement the animation must NOT
 * jerk or conflict (AC5).  This controller provides the thin adapter between
 * FirstTickCinematicSequence and the game's input manager.
 *
 * Acceptance criteria covered:
 *   AC5 — suspend() disables player input at animation start.
 *   AC5 — resume() re-enables player input cleanly once the camera has
 *          returned to the saved player view — called via
 *          CameraAnimationController.onAnimationComplete.
 *   AC5 — idempotency guards prevent double-suspend or double-resume from
 *          causing input to get stuck.
 *
 * Pattern: thin adapter; the inputHook is injected at construction time.
 */

/** Input states (for QA assertions). */
const INPUT_STATE = {
  ACTIVE:    'active',
  SUSPENDED: 'suspended',
};

/** Input command identifiers forwarded to the injected inputHook. */
const INPUT_COMMANDS = {
  SUSPEND: 'player_input_suspend',
  RESUME:  'player_input_resume',
};

class PlayerInputController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.inputHook  Injected input command hook:
   *   (command) => void. Maps to the game's input manager suspend/resume.
   */
  constructor({ inputHook }) {
    if (typeof inputHook !== 'function') {
      throw new Error('PlayerInputController requires an inputHook function.');
    }

    this._inputHook = inputHook;
    this._state     = INPUT_STATE.ACTIVE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Suspend player input — camera animation is in progress.
   * Idempotent: no-op if already SUSPENDED.
   */
  suspend() {
    if (this._state === INPUT_STATE.SUSPENDED) return;
    this._state = INPUT_STATE.SUSPENDED;
    this._inputHook(INPUT_COMMANDS.SUSPEND);
  }

  /**
   * Resume player input — camera animation has completed.
   * Idempotent: no-op if already ACTIVE.
   */
  resume() {
    if (this._state === INPUT_STATE.ACTIVE) return;
    this._state = INPUT_STATE.ACTIVE;
    this._inputHook(INPUT_COMMANDS.RESUME);
  }

  /**
   * Reset to ACTIVE state (default — input enabled).
   * Does NOT fire the hook — call resume() explicitly if the hook must fire.
   */
  reset() {
    this._state = INPUT_STATE.ACTIVE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string}  Current input state. */
  getState() { return this._state; }

  /** @returns {boolean} True when player input is currently suspended. */
  isSuspended() { return this._state === INPUT_STATE.SUSPENDED; }
}

module.exports = { PlayerInputController, INPUT_STATE, INPUT_COMMANDS };
