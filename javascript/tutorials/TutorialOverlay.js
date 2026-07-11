/**
 * TutorialOverlay — first-time guided walkthrough for new players.
 *
 * AC4: First-time players encounter a guided walkthrough overlay on their very
 * first fault diagnosis.  The overlay is:
 *   - Shown automatically on the first fault only
 *   - Skippable with a single action (`skip()`)
 *   - Never shown again after the first playthrough (persisted via PlayerSaveState)
 *
 * Scenario 3: First session → first fault → overlay shown automatically.
 * Scenario 4: Player clicks "Skip" → overlay dismisses; skip is persisted.
 * Scenario 8: Re-examined already-diagnosed fault → overlay does NOT re-trigger.
 */

const WALKTHROUGH_STEPS = [
  {
    step: 1,
    title: 'Welcome to Fault Diagnosis',
    body: "Your watch isn't working. Something inside has failed. Your job is to figure out what.",
  },
  {
    step: 2,
    title: 'Read the Symptoms',
    body: "Start by looking at the visible symptoms — does the watch stop running, lose time, or have a stuck crown? Click a symptom to highlight the parts that might be causing it.",
  },
  {
    step: 3,
    title: 'Inspect the Candidates',
    body: 'Once parts are highlighted on the anatomy diagram, click each one to examine it up close. Look for damage, wear, or missing components.',
  },
  {
    step: 4,
    title: 'Make Your Diagnosis',
    body: "Select the part you believe has failed and confirm your diagnosis. If you're unsure, use the Hint button for a gentle nudge — you're in control of how much guidance you receive.",
  },
  {
    step: 5,
    title: "You're Ready",
    body: "That's the full loop: symptoms → inspect → diagnose → repair. Good luck — you've got this.",
  },
];

class TutorialOverlay {
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
   * Returns true when the tutorial overlay should be shown.
   * Based solely on the persisted save flag — deterministic and side-effect-free.
   * @returns {boolean}
   */
  shouldShow() {
    return !this._saveState.get('tutorial_first_fault_seen');
  }

  /**
   * Triggers the overlay for a first-time player.
   * Emits `tutorial_diagnosis_started`.
   * No-ops if the overlay has already been seen (AC4 — never shown again).
   *
   * @param {string} faultInstanceId
   * @returns {boolean} true if the overlay was shown, false if suppressed
   */
  tryShow(faultInstanceId) {
    if (!this.shouldShow()) {
      return false;
    }
    this._isVisible = true;
    this._currentStep = 1;
    this._skipped = false;
    this._telemetry.tutorialDiagnosisStarted(faultInstanceId);
    return true;
  }

  /**
   * Advance to the next walkthrough step.
   * Auto-completes the tutorial when the last step is passed.
   * @returns {{ step: number, title: string, body: string }|null}
   *   The new current step, or null if the tutorial has ended naturally.
   */
  nextStep() {
    if (!this._isVisible) return null;
    if (this._currentStep >= WALKTHROUGH_STEPS.length) {
      this._complete();
      return null;
    }
    this._currentStep += 1;
    return this.getCurrentStepData();
  }

  /**
   * Player skips the tutorial with a single action (AC4).
   * Persists the seen flag so the overlay is never shown again.
   */
  skip() {
    this._skipped = true;
    this._complete();
  }

  /**
   * Returns the data for the currently displayed step.
   * @returns {{ step: number, title: string, body: string }|null}
   */
  getCurrentStepData() {
    if (!this._isVisible || this._currentStep === 0) return null;
    return WALKTHROUGH_STEPS[this._currentStep - 1] || null;
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
   * Returns the total number of walkthrough steps.
   * @returns {number}
   */
  getTotalSteps() {
    return WALKTHROUGH_STEPS.length;
  }

  // ---- Private ----

  _complete() {
    this._isVisible = false;
    // Persist the flag so the overlay is NEVER shown again (AC4)
    this._saveState.set('tutorial_first_fault_seen', true);
  }
}

module.exports = { TutorialOverlay, WALKTHROUGH_STEPS };
