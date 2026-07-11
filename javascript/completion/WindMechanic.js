/**
 * WindMechanic — models the wind interaction that precedes balance-wheel
 * activation, and fires event hooks at two key moments:
 *
 *   1. onTensionRamp  — fired when the player reaches the "tension window"
 *                       (TENSION_WINDOW_STEPS before full wind), signalling
 *                       the audio system to begin the tension build-up (AC1).
 *   2. onActivationThreshold — fired when fully wound AND the watch is
 *                       assembled correctly, delegating to BalanceWheelActivation
 *                       (AC7 — incorrect assembly: hook is NOT fired).
 *
 * Design: Issue #113 (First-Tick Audio Presentation — Phase 1)
 *
 * Constraints (from issue):
 *   - Must use existing wind mechanic trigger points.
 *   - Must NOT alter timing or feel of the wind interaction mechanic itself.
 *   - Tension ramp is driven by wind-step count, not by real time — the audio
 *     controller owns the time-based coroutine so rapid input (AC6/Scenario 6)
 *     cannot skip the ramp.
 *
 * Acceptance criteria covered:
 *   AC1  — tension ramp fires 0.5–1.5 s before first-tick; this module fires
 *           the hook at TENSION_WINDOW_STEPS before activation (audio controller
 *           owns silence gate timing).
 *   AC6  — rapid wind input still fires onTensionRamp exactly once (idempotent
 *           flag + Math.min guard prevents runaway steps).
 *   AC7  — setAssembledCorrectly(false) suppresses onActivationThreshold.
 */

/** Total wind steps to fully wind the watch. */
const TOTAL_WIND_STEPS = 10;

/**
 * Number of wind steps before full activation that triggers the tension ramp.
 * At step (TOTAL_WIND_STEPS - TENSION_WINDOW_STEPS) the ramp hook fires.
 */
const TENSION_WINDOW_STEPS = 2;

class WindMechanic {
  /**
   * @param {Object} [opts]
   * @param {number}   [opts.totalWindSteps]       Override total wind steps (default 10).
   * @param {number}   [opts.tensionWindowSteps]   Override tension window (default 2).
   * @param {Function|null} [opts.onTensionRamp]   Hook: () => void — fires at tension window.
   * @param {Function|null} [opts.onActivationThreshold]  Hook: () => void — fires when
   *   fully wound and correctly assembled.
   */
  constructor({
    totalWindSteps = TOTAL_WIND_STEPS,
    tensionWindowSteps = TENSION_WINDOW_STEPS,
    onTensionRamp = null,
    onActivationThreshold = null,
  } = {}) {
    if (onTensionRamp !== null && typeof onTensionRamp !== 'function') {
      throw new Error('WindMechanic: onTensionRamp must be a function or null.');
    }
    if (onActivationThreshold !== null && typeof onActivationThreshold !== 'function') {
      throw new Error('WindMechanic: onActivationThreshold must be a function or null.');
    }

    this._totalWindSteps = totalWindSteps;
    this._tensionWindowSteps = tensionWindowSteps;
    this._onTensionRamp = onTensionRamp;
    this._onActivationThreshold = onActivationThreshold;

    this._windSteps = 0;
    this._tensionRampFired = false;
    this._activationFired = false;
    this._assembledCorrectly = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Record whether the watch assembly is correct before winding begins.
   * If false, the onActivationThreshold hook will NOT fire even when fully wound,
   * satisfying AC7 (incorrect assembly — balance wheel does not activate).
   *
   * @param {boolean} isCorrect
   */
  setAssembledCorrectly(isCorrect) {
    this._assembledCorrectly = Boolean(isCorrect);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Wind interaction
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Advance wind by `steps` (default 1).
   * Clamps at totalWindSteps so rapid input cannot exceed full wind (AC6).
   *
   * @param {number} [steps]  Number of wind steps to advance.
   * @returns {number}  New wind step count.
   */
  wind(steps = 1) {
    this._windSteps = Math.min(this._windSteps + steps, this._totalWindSteps);

    // Fire tension ramp when entering the tension window (idempotent guard)
    const tensionThreshold = this._totalWindSteps - this._tensionWindowSteps;
    if (!this._tensionRampFired && this._windSteps >= tensionThreshold) {
      this._tensionRampFired = true;
      if (this._onTensionRamp) {
        this._onTensionRamp();
      }
    }

    // Fire activation when fully wound AND correctly assembled (AC7 guard)
    if (
      !this._activationFired &&
      this._windSteps >= this._totalWindSteps &&
      this._assembledCorrectly
    ) {
      this._activationFired = true;
      if (this._onActivationThreshold) {
        this._onActivationThreshold();
      }
    }

    return this._windSteps;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State reset
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reset wind state for re-wind (e.g. player winds again after watch is running).
   * Does NOT reset assembledCorrectly — that reflects assembly state, not wind state.
   */
  reset() {
    this._windSteps = 0;
    this._tensionRampFired = false;
    this._activationFired = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {number} Current wind step count. */
  getWindSteps() { return this._windSteps; }

  /** @returns {boolean} True once the tension ramp hook has been fired. */
  isTensionRampFired() { return this._tensionRampFired; }

  /** @returns {boolean} True once the activation threshold hook has been fired. */
  isActivationFired() { return this._activationFired; }

  /** @returns {boolean} Current assembly-correctness flag. */
  isAssembledCorrectly() { return this._assembledCorrectly; }
}

module.exports = { WindMechanic, TOTAL_WIND_STEPS, TENSION_WINDOW_STEPS };
