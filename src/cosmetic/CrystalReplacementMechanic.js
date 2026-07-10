/**
 * CrystalReplacementMechanic — two-step remove/install player interaction.
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2 (AC2, AC6)
 *
 * Responsibilities:
 *   - Model the two-step crystal replacement interaction:
 *       Step 1: removeOldCrystal()  — lift the damaged crystal off the watch
 *       Step 2: installNewCrystal() — seat the clean replacement crystal
 *   - Enforce ordering (install cannot precede remove).
 *   - Support re-doing the replacement (AC6: back-navigation re-apply without
 *     mesh artifacts — tracked via completion count for idempotency check).
 *   - Fire an onStateChange callback after each step so the CosmeticRestorationController
 *     can trigger the material swap and before/after display in real time (AC2).
 *
 * State machine:
 *   idle → removing → removed → installing → installed
 *
 * AC6 (return and re-do): after reaching 'installed', the mechanic can be
 *   reset() and the two-step flow repeated — the second completion correctly
 *   re-applies clean state without artifact.
 */

'use strict';

const STATES = Object.freeze({
  IDLE:       'idle',
  REMOVING:   'removing',
  REMOVED:    'removed',
  INSTALLING: 'installing',
  INSTALLED:  'installed',
});

class CrystalReplacementMechanic {
  /**
   * @param {Object}   [opts]
   * @param {Function} [opts.onStateChange] — (state: string) => void
   *   Fired after each state transition. Allows the controller to hook into
   *   removal and installation events for real-time mesh updates (AC2).
   */
  constructor({ onStateChange = null } = {}) {
    this._onStateChange = onStateChange;
    this._state = STATES.IDLE;
    this._completionCount = 0; // incremented each time installed state is reached (AC6)
  }

  // ── Player interaction steps ──────────────────────────────────────────────

  /**
   * Step 1: Player initiates removal of the damaged crystal.
   * Allowed from 'idle' or (for re-do) 'installed'.
   *
   * @returns {{ success: boolean, reason: string|null, state: string }}
   */
  beginRemove() {
    if (this._state !== STATES.IDLE && this._state !== STATES.INSTALLED) {
      return {
        success: false,
        reason: `Cannot begin removal from state '${this._state}'`,
        state: this._state,
      };
    }
    this._transition(STATES.REMOVING);
    return { success: true, reason: null, state: this._state };
  }

  /**
   * Complete removal of the damaged crystal (simulates the player lifting the crystal).
   * Allowed only from 'removing'.
   *
   * @returns {{ success: boolean, reason: string|null, state: string }}
   */
  completeRemove() {
    if (this._state !== STATES.REMOVING) {
      return {
        success: false,
        reason: `Cannot complete removal from state '${this._state}'`,
        state: this._state,
      };
    }
    this._transition(STATES.REMOVED);
    return { success: true, reason: null, state: this._state };
  }

  /**
   * Step 2: Player initiates installation of the new clean crystal.
   * Allowed only from 'removed'.
   *
   * @returns {{ success: boolean, reason: string|null, state: string }}
   */
  beginInstall() {
    if (this._state !== STATES.REMOVED) {
      return {
        success: false,
        reason: `Cannot begin install from state '${this._state}' — must remove damaged crystal first`,
        state: this._state,
      };
    }
    this._transition(STATES.INSTALLING);
    return { success: true, reason: null, state: this._state };
  }

  /**
   * Complete installation of the new clean crystal.
   * Allowed only from 'installing'.
   *
   * Increments completionCount — used by AC6 tests to confirm re-do works correctly.
   *
   * @returns {{ success: boolean, reason: string|null, state: string, completionCount: number }}
   */
  completeInstall() {
    if (this._state !== STATES.INSTALLING) {
      return {
        success: false,
        reason: `Cannot complete install from state '${this._state}'`,
        state: this._state,
        completionCount: this._completionCount,
      };
    }
    this._completionCount += 1;
    this._transition(STATES.INSTALLED);
    return { success: true, reason: null, state: this._state, completionCount: this._completionCount };
  }

  // ── Re-do support (AC6) ───────────────────────────────────────────────────

  /**
   * Reset back to idle so the player can redo the replacement (AC6).
   * Can be called from any state.
   *
   * @returns {{ state: string }}
   */
  reset() {
    this._transition(STATES.IDLE);
    return { state: this._state };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {string} current state id */
  getState() { return this._state; }

  /** @returns {boolean} true when the replacement has been fully completed */
  isInstalled() { return this._state === STATES.INSTALLED; }

  /** @returns {number} number of times the full remove→install flow has completed */
  getCompletionCount() { return this._completionCount; }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * @private
   */
  _transition(newState) {
    this._state = newState;
    if (this._onStateChange) {
      this._onStateChange(newState);
    }
  }
}

module.exports = { CrystalReplacementMechanic, STATES };
