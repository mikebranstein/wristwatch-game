/**
 * RegulationTutorial — first-run contextual tutorial for the Regulation Phase.
 *
 * Issue #294 — Movement Regulation Phase 1
 *
 * Shown once (first regulation phase encounter only), dismissible at any step.
 * Persistence: stored in save state (key: 'regulation_tutorial_seen') so tutorial
 * does not re-appear on subsequent regulation phases or after session restart.
 *
 * AC: First-run contextual tutorial (one-time, dismissible).
 * Test Scenario 7: Tutorial dismissed → does NOT re-appear on subsequent encounters.
 *
 * Follows TutorialOverlay.js pattern (Issue #113).
 */
'use strict';

const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Precision Timing Required',
    body: "Your client needs this watch certified for precision accuracy. You'll use a simulated timing machine to measure and adjust the movement's beat rate.",
  },
  {
    step: 2,
    title: 'Reading the Timegrapher',
    body: 'The timegrapher shows how many seconds per day the movement runs fast or slow. Your goal is to get the reading into the highlighted target zone.',
  },
  {
    step: 3,
    title: 'Adjusting the Regulator',
    body: 'Use the Advance/Retard slider to shift the regulator index. Advance speeds the movement up; Retard slows it down. Listen to the tick — convergence sounds different.',
  },
  {
    step: 4,
    title: 'Submitting Your Calibration',
    body: "Once you're happy with the reading, submit your calibration. The grade you achieve (Acceptable → Certified Chronometer) is recorded on your delivery summary.",
  },
];

class RegulationTutorial {
  /**
   * @param {Object} opts
   * @param {Object} opts.saveState  PlayerSaveState-compatible object (get/set)
   */
  constructor({ saveState }) {
    this._saveState   = saveState;
    this._isVisible   = false;
    this._currentStep = 0;
    this._dismissed   = false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Whether the tutorial should be shown on entering the regulation phase.
   * Returns true only on the first-ever regulation phase encounter.
   * @returns {boolean}
   */
  shouldShow() {
    return !this._saveState.get('regulation_tutorial_seen');
  }

  /**
   * Attempt to show the tutorial.
   * No-ops (returns false) if 'regulation_tutorial_seen' is already true.
   * @returns {boolean} true if tutorial was shown, false if suppressed
   */
  tryShow() {
    if (!this.shouldShow()) return false;
    this._isVisible   = true;
    this._currentStep = 1;
    this._dismissed   = false;
    return true;
  }

  /**
   * Dismiss the tutorial. Persists the seen flag to prevent future display.
   * Test Scenario 7: Tutorial dismissed → never shown again.
   */
  dismiss() {
    this._dismissed = true;
    this._complete();
  }

  /**
   * Advance to the next step. Auto-completes when the last step is passed.
   * @returns {{ step: number, title: string, body: string }|null}
   *   Next step data, or null when tutorial has ended.
   */
  nextStep() {
    if (!this._isVisible) return null;
    if (this._currentStep >= TUTORIAL_STEPS.length) {
      this._complete();
      return null;
    }
    this._currentStep += 1;
    return this.getCurrentStepData();
  }

  /**
   * Get the currently displayed step data.
   * @returns {{ step: number, title: string, body: string }|null}
   */
  getCurrentStepData() {
    if (!this._isVisible || this._currentStep === 0) return null;
    return TUTORIAL_STEPS[this._currentStep - 1] || null;
  }

  /** @returns {boolean} Whether the tutorial is currently visible. */
  isVisible() { return this._isVisible; }

  /** @returns {boolean} Whether the tutorial was dismissed via dismiss(). */
  wasDismissed() { return this._dismissed; }

  /** @returns {number} Total number of tutorial steps. */
  getTotalSteps() { return TUTORIAL_STEPS.length; }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _complete() {
    this._isVisible = false;
    // Persist seen flag — tutorial NEVER shows again (Test Scenario 7)
    this._saveState.set('regulation_tutorial_seen', true);
  }
}

module.exports = { RegulationTutorial, TUTORIAL_STEPS };
