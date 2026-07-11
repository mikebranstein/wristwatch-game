/**
 * BalanceWheelHighlight — manages the visual highlight effect (glow, rim-light,
 * or focus-pull) applied to the balance wheel at the first-tick cinematic beat
 * (Issue #114, Phase 2).
 *
 * Acceptance criteria covered:
 *   AC2 — activate() fires the highlight effect hook so a visible glow or
 *          rim-light is applied; clearly noticeable in default lighting.
 *   AC2 — deactivate() removes the highlight effect cleanly after the camera
 *          eases back to the player view.
 *   AC4 — re-wind suppression: FirstTickCinematicSequence gates activate()
 *          with the first-activation flag; highlight does NOT fire on re-wind.
 *
 * Constraint: highlight shader must NOT alter balance-wheel collision or
 * physics behaviour — the hook is a pure visual signal to the render layer.
 *
 * Pattern: same DI pattern as BalanceWheelActivation (Issue #113). The
 * highlightHook is injected at construction time; this module owns state.
 */

/** Highlight states (for QA assertions). */
const HIGHLIGHT_STATE = {
  INACTIVE: 'inactive',
  ACTIVE:   'active',
};

/** Highlight command identifiers forwarded to the injected highlightHook. */
const HIGHLIGHT_COMMANDS = {
  ACTIVATE:   'balance_wheel_highlight_activate',
  DEACTIVATE: 'balance_wheel_highlight_deactivate',
};

class BalanceWheelHighlight {
  /**
   * @param {Object}   opts
   * @param {Function} opts.highlightHook  Injected visual command hook:
   *   (command) => void. Maps to the render layer's glow/rim-light toggle.
   */
  constructor({ highlightHook }) {
    if (typeof highlightHook !== 'function') {
      throw new Error('BalanceWheelHighlight requires a highlightHook function.');
    }

    this._highlightHook = highlightHook;
    this._state         = HIGHLIGHT_STATE.INACTIVE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Activate the balance-wheel highlight effect (glow / rim-light).
   * Idempotent: no-op if already ACTIVE.
   */
  activate() {
    if (this._state === HIGHLIGHT_STATE.ACTIVE) return;
    this._state = HIGHLIGHT_STATE.ACTIVE;
    this._highlightHook(HIGHLIGHT_COMMANDS.ACTIVATE);
  }

  /**
   * Deactivate the balance-wheel highlight effect.
   * Idempotent: no-op if already INACTIVE.
   */
  deactivate() {
    if (this._state === HIGHLIGHT_STATE.INACTIVE) return;
    this._state = HIGHLIGHT_STATE.INACTIVE;
    this._highlightHook(HIGHLIGHT_COMMANDS.DEACTIVATE);
  }

  /**
   * Reset to INACTIVE state (e.g. new watch loaded or abort called).
   * Does NOT fire the hook — caller deactivates explicitly before reset.
   */
  reset() {
    this._state = HIGHLIGHT_STATE.INACTIVE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string}  Current highlight state. */
  getState() { return this._state; }

  /** @returns {boolean} True when the highlight effect is active. */
  isActive() { return this._state === HIGHLIGHT_STATE.ACTIVE; }
}

module.exports = { BalanceWheelHighlight, HIGHLIGHT_STATE, HIGHLIGHT_COMMANDS };
