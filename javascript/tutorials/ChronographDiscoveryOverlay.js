/**
 * ChronographDiscoveryOverlay — first-time contextual introduction for chronograph movements.
 *
 * Mirrors TutorialOverlay.js in structure and injection pattern.
 * Accepts `saveState` and `telemetry` via constructor injection.
 *
 * AC1: Given a player encounters a chronograph movement for the first time,
 *      when the movement loads, then the column-wheel introduction overlay appears
 *      automatically before any parts are surfaced, and the player can dismiss it
 *      with a single action.
 *
 * AC3: Given a player has previously dismissed the overlay and disabled discovery mode,
 *      when they load the same (or another) chronograph movement, then neither the overlay
 *      nor part scaffolding activates — the full part set surfaces as normal.
 *
 * AC4: Given a player who has completed a chronograph before loads a new chronograph
 *      movement, when discovery mode is set to "off" in settings, then no overlay or
 *      scaffolding appears, confirming the setting persists correctly.
 *
 * Test Scenarios: 1, 2, 5
 */

const DISCOVERY_STEPS = [
  {
    step: 1,
    title: 'Welcome to the Chronograph',
    body: 'A chronograph is a watch with a built-in stopwatch complication — the pushers on the case start, stop, and reset a separate seconds hand. Everything you see here exists to make that work.',
  },
  {
    step: 2,
    title: 'Meet the Column Wheel',
    body: 'The column wheel is the command centre of the chronograph. Its raised columns and valleys route tiny levers that control the start, stop, and reset functions. One click — precise mechanical logic.',
  },
  {
    step: 3,
    title: 'Parts in Context',
    body: "There are more parts here than in a three-hand movement, but each one has a clear job. We'll introduce them in small groups so you can see how each layer connects to the next.",
  },
  {
    step: 4,
    title: "You're Ready to Explore",
    body: "Take your time. You can skip this introduction at any moment and jump straight in. Discovery mode can be turned off in Settings if you prefer to see all parts at once.",
  },
];

class ChronographDiscoveryOverlay {
  /**
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   */
  constructor(saveState, telemetry) {
    this._saveState = saveState;
    this._telemetry = telemetry;
    this._isVisible = false;
    this._currentStep = 0;
    this._skipped = false;
  }

  /**
   * Returns true when the overlay should be shown.
   * Deterministic and side-effect-free.
   * Conditions: overlay not yet seen AND discovery mode is enabled.
   *
   * @returns {boolean}
   */
  shouldShow() {
    return (
      !this._saveState.get('chronograph_overlay_seen') &&
      this._saveState.get('discovery_mode_enabled')
    );
  }

  /**
   * Triggers the overlay for a first-time encounter.
   * Emits `chronograph_overlay_shown`.
   * No-ops if shouldShow() is false (AC3, AC4 — never re-fires for any subsequent chronograph).
   *
   * @param {string} movementId
   * @returns {boolean} true if the overlay was shown, false if suppressed
   */
  tryShow(movementId) {
    if (!this.shouldShow()) {
      return false;
    }
    this._isVisible = true;
    this._currentStep = 1;
    this._skipped = false;
    this._telemetry.chronographOverlayShown(movementId);
    return true;
  }

  /**
   * Advance to the next discovery step.
   * Auto-completes when the last step is passed.
   *
   * @returns {{ step: number, title: string, body: string }|null}
   *   The new current step, or null if the overlay has ended naturally.
   */
  nextStep() {
    if (!this._isVisible) return null;
    if (this._currentStep >= DISCOVERY_STEPS.length) {
      this._complete('dismissed');
      return null;
    }
    this._currentStep += 1;
    return this.getCurrentStepData();
  }

  /**
   * Player explicitly dismisses the overlay after reading (single action — AC1).
   * Persists the seen flag so the overlay is never shown again for any chronograph.
   *
   * @param {string} movementId
   */
  dismiss(movementId) {
    this._skipped = false;
    this._complete('dismissed', movementId);
  }

  /**
   * Player skips the overlay immediately without reading (single action — AC1).
   * Persists the seen flag so the overlay is never shown again.
   *
   * @param {string} movementId
   */
  skip(movementId) {
    this._skipped = true;
    this._complete('skipped', movementId);
  }

  /**
   * Returns the data for the currently displayed step.
   * @returns {{ step: number, title: string, body: string }|null}
   */
  getCurrentStepData() {
    if (!this._isVisible || this._currentStep === 0) return null;
    return DISCOVERY_STEPS[this._currentStep - 1] || null;
  }

  /**
   * Returns true if the overlay is currently visible.
   * @returns {boolean}
   */
  isVisible() {
    return this._isVisible;
  }

  /**
   * Returns true if the player used the Skip action.
   * @returns {boolean}
   */
  wasSkipped() {
    return this._skipped;
  }

  /**
   * Returns the total number of discovery steps.
   * @returns {number}
   */
  getTotalSteps() {
    return DISCOVERY_STEPS.length;
  }

  // ---- Private ----

  /**
   * @param {'dismissed'|'skipped'} action
   * @param {string} [movementId]
   */
  _complete(action, movementId = '') {
    this._isVisible = false;
    // Persist: overlay NEVER shown again (AC1, AC3)
    this._saveState.set('chronograph_overlay_seen', true);
    if (action === 'skipped') {
      this._telemetry.chronographOverlaySkipped(movementId);
    } else {
      this._telemetry.chronographOverlayDismissed(movementId);
    }
  }
}

module.exports = { ChronographDiscoveryOverlay, DISCOVERY_STEPS };
