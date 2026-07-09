/**
 * BalanceWheelActivation — minimal event exposure for the balance-wheel
 * activation moment.
 *
 * Design: Issue #113 (First-Tick Audio Presentation — Phase 1)
 *
 * Pre-build engineering verification confirmed: the balance-wheel activation
 * event did not previously expose a hookable trigger. This module creates
 * that minimal exposure so the FirstTickSequence orchestrator can attach
 * audio behaviour to the exact moment the balance wheel begins oscillating.
 *
 * Pattern mirrors RevealAudioController (Issue #53): the onActivate hook is
 * injected at construction time so the caller controls side-effects; this
 * module is responsible only for activation-state tracking and idempotency.
 *
 * Acceptance criteria covered:
 *   AC1 — the hookable trigger fires at balance-wheel activation onset.
 *   AC3 — activate() is idempotent: calling it on an already-running watch
 *          does NOT re-fire the hook (supports re-wind suppression).
 *   AC7 — if the watch is assembled incorrectly the caller never calls
 *          activate(), so the first-tick audio does NOT fire (guarded by
 *          WindMechanic.setAssembledCorrectly(false)).
 */

class BalanceWheelActivation {
  /**
   * @param {Object} [opts]
   * @param {Function|null} [opts.onActivate]  Hook called with (watchId) when the
   *   balance wheel activates for the first time.  The caller maps watchId to the
   *   correct watch instance.
   */
  constructor({ onActivate = null } = {}) {
    if (onActivate !== null && typeof onActivate !== 'function') {
      throw new Error('BalanceWheelActivation: onActivate must be a function or null.');
    }

    this._onActivate = onActivate;
    this._isActivated = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Signal that the balance wheel has begun oscillating.
   * Idempotent: subsequent calls are no-ops (AC3 — re-wind does not re-fire hook).
   *
   * @param {string} [watchId]  Identifier for the watch instance (forwarded to hook).
   * @returns {boolean}  True if this call triggered the activation (first call only).
   */
  activate(watchId = 'default') {
    if (this._isActivated) return false;

    this._isActivated = true;

    if (this._onActivate) {
      this._onActivate(watchId);
    }

    return true;
  }

  /**
   * Reset activation state (e.g. when a new watch is loaded into the worktable).
   * After reset(), the next activate() call will fire the hook again.
   */
  reset() {
    this._isActivated = false;
  }

  /** @returns {boolean} True once the balance wheel has been activated. */
  isActivated() {
    return this._isActivated;
  }
}

module.exports = { BalanceWheelActivation };
