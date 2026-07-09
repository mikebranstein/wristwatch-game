/**
 * GuidedJobOnboardingController — guided first-job onboarding overlay system.
 *
 * Issue #111 — Guided First-Job Onboarding System
 *
 * Follows the TutorialOverlay / ChronographDiscoveryOverlay constructor-injection
 * pattern: accepts saveState and telemetry via constructor injection.
 *
 * Responsibilities:
 *   - A/B cohort assignment (guided vs. control) at first-launch, stored in PlayerSaveState
 *   - Control-cohort short-circuit: tryShow() returns false immediately for control players,
 *     leaving the tooltip-only path completely unchanged
 *   - Callout-card step sequencing: data-driven step config injected at construction
 *   - Session-scoped skip/dismiss: in-memory flag, not persisted cross-session (per spec)
 *   - Telemetry: five additive named events emitted at the correct lifecycle points
 *
 * Design constraints (from approved design — issue #111):
 *   - All changes are additive — existing tutorial, telemetry, and save-state interfaces untouched
 *   - Tooltip system is explicitly a non-goal; this is a pure overlay layer
 *   - Skip is available from step 2 onward (non-negotiable per spec)
 *   - Step config is injected at construction; slot in Phase 1 data (issue #112) without interface change
 *   - Dismiss preference is session-scoped only (documented deliberate product decision)
 */

/**
 * Default placeholder step config — used when Phase 1 failure-map data is not yet available.
 * Each entry has: step (1-based), title, body, componentId (matches ComponentHighlightController).
 * Replace by injecting the Phase 1 report output at construction time.
 */
const DEFAULT_STEP_CONFIG = [
  {
    step: 1,
    title: 'Start Here: Remove the Mainspring',
    body: "The mainspring stores the watch's energy — it must come out before you can reach the gear train. Tap the highlighted component to begin.",
    componentId: 'mainspring',
  },
  {
    step: 2,
    title: 'The Gear Train',
    body: 'The gear train transmits energy from the mainspring to the escapement. Each wheel must be removed in order — working from the outside in.',
    componentId: 'gear-train',
  },
  {
    step: 3,
    title: 'The Escapement',
    body: 'The escapement controls how fast the gear train runs. It is the heartbeat of the watch — remove it carefully.',
    componentId: 'escapement',
  },
  {
    step: 4,
    title: 'Select the Right Tool',
    body: 'Each step requires a specific tool. Choosing the wrong one can damage delicate components. Select the correct tool from your tray.',
    componentId: 'tool-tray',
  },
  {
    step: 5,
    title: 'Final Delivery',
    body: "You've completed the first job. Deliver the restored watch to close the job and start the next one.",
    componentId: 'delivery-slot',
  },
];

/** Valid A/B cohort values */
const COHORTS = {
  GUIDED: 'guided',
  CONTROL: 'control',
};

class GuidedJobOnboardingController {
  /**
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   * @param {Array<{step: number, title: string, body: string, componentId: string}>} [stepConfig]
   *   Ordered array of step descriptors.  Pass Phase 1 failure-map output here.
   *   Defaults to DEFAULT_STEP_CONFIG (placeholder) when omitted.
   */
  constructor(saveState, telemetry, stepConfig = DEFAULT_STEP_CONFIG) {
    this._saveState = saveState;
    this._telemetry = telemetry;
    this._stepConfig = stepConfig.slice(); // defensive copy
    this._isVisible = false;
    this._currentStep = 0;
    this._dismissedThisSession = false; // session-scoped; not persisted
    this._jobId = null;
  }

  // ── A/B Cohort Assignment ────────────────────────────────────────────────────

  /**
   * Assigns the player to a cohort (guided or control) if not already assigned.
   * Called once at first-launch before any game-loop code runs (Test Scenario 8).
   * Writes ab_first_job_cohort synchronously to PlayerSaveState.
   *
   * @param {Function} [randomFn]  Injected random function for testability; defaults to Math.random
   * @returns {'guided'|'control'}  The assigned cohort
   */
  assignCohortIfNeeded(randomFn = Math.random) {
    const existing = this._saveState.get('ab_first_job_cohort');
    if (existing === COHORTS.GUIDED || existing === COHORTS.CONTROL) {
      return existing;
    }
    // Simple 50/50 random split (issue spec: random assignment at session start is acceptable)
    const cohort = randomFn() < 0.5 ? COHORTS.GUIDED : COHORTS.CONTROL;
    this._saveState.set('ab_first_job_cohort', cohort);
    this._telemetry.abCohortAssigned(cohort);
    return cohort;
  }

  /**
   * Returns the player's current cohort from save state, or null if not yet assigned.
   * @returns {'guided'|'control'|null}
   */
  getCohort() {
    return this._saveState.get('ab_first_job_cohort') || null;
  }

  // ── Overlay Lifecycle ────────────────────────────────────────────────────────

  /**
   * Returns true when the guided onboarding overlay should be shown.
   * Conditions:
   *   1. Player is in the 'guided' A/B cohort
   *   2. Player has NOT dismissed the overlay this session
   *
   * @returns {boolean}
   */
  shouldShow() {
    if (this._dismissedThisSession) return false;
    return this.getCohort() === COHORTS.GUIDED;
  }

  /**
   * Triggers the guided onboarding overlay for the current job.
   * Control-cohort players short-circuit here — no further code executes.
   * Emits onboarding_started for guided-cohort players.
   *
   * @param {string} jobId
   * @returns {boolean}  true if overlay was shown, false if suppressed
   */
  tryShow(jobId) {
    if (!this.shouldShow()) {
      return false;
    }
    this._isVisible = true;
    this._currentStep = 1;
    this._jobId = jobId;
    this._telemetry.onboardingStarted(jobId, this.getCohort());
    return true;
  }

  // ── Step Navigation ──────────────────────────────────────────────────────────

  /**
   * Advance to the next step.
   * Emits onboarding_step_completed for the step being left.
   * Auto-completes the onboarding when the last step is passed.
   *
   * @returns {{ step: number, title: string, body: string, componentId: string }|null}
   *   The new current step data, or null if onboarding has ended naturally.
   */
  nextStep() {
    if (!this._isVisible) return null;

    // Emit step_completed for the step being left
    const leavingStep = this._currentStep;
    this._telemetry.onboardingStepCompleted(this._jobId, leavingStep, this.getCohort());

    if (this._currentStep >= this._stepConfig.length) {
      this._complete();
      return null;
    }
    this._currentStep += 1;
    return this.getCurrentStepData();
  }

  /**
   * Player skips the guided track.
   * Available from step 2 onward (non-negotiable per spec).
   * Sets session-scoped dismiss flag — no further guided prompts this session.
   * Emits onboarding_skipped.
   *
   * @param {string} [jobId]  Optional — falls back to the jobId from tryShow
   * @returns {boolean}  true if skip was accepted, false if too early (step < 2)
   */
  skip(jobId) {
    if (!this._isVisible) return false;
    if (this._currentStep < 2) return false; // skip not available at step 1
    const resolvedJobId = jobId || this._jobId;
    this._telemetry.onboardingSkipped(resolvedJobId, this._currentStep, this.getCohort());
    this._dismiss();
    return true;
  }

  /**
   * Returns the data for the currently displayed step.
   * @returns {{ step: number, title: string, body: string, componentId: string }|null}
   */
  getCurrentStepData() {
    if (!this._isVisible || this._currentStep === 0) return null;
    return this._stepConfig[this._currentStep - 1] || null;
  }

  // ── State Queries ────────────────────────────────────────────────────────────

  /**
   * Returns true if the overlay is currently visible.
   * @returns {boolean}
   */
  isVisible() {
    return this._isVisible;
  }

  /**
   * Returns true if the player dismissed the overlay this session.
   * @returns {boolean}
   */
  isDismissedThisSession() {
    return this._dismissedThisSession;
  }

  /**
   * Returns the total number of onboarding steps in the current config.
   * @returns {number}
   */
  getTotalSteps() {
    return this._stepConfig.length;
  }

  /**
   * Returns the current step index (1-based), or 0 if not started.
   * @returns {number}
   */
  getCurrentStepIndex() {
    return this._currentStep;
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  /**
   * Complete the guided onboarding naturally (all steps finished).
   * Emits onboarding_completed.
   */
  _complete() {
    this._isVisible = false;
    this._dismissedThisSession = true;
    this._telemetry.onboardingCompleted(this._jobId, this.getCohort());
  }

  /**
   * Internal dismiss — used by skip() and any future dismiss-at-step-N paths.
   * Sets session-scoped dismiss flag; does NOT persist cross-session (deliberate per spec).
   */
  _dismiss() {
    this._isVisible = false;
    this._dismissedThisSession = true;
  }
}

module.exports = { GuidedJobOnboardingController, DEFAULT_STEP_CONFIG, COHORTS };
