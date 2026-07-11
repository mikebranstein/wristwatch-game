/**
 * GuidedJobOnboardingController — orchestrates the guided first-job onboarding overlay.
 *
 * Issue #111 — Guided First-Job Onboarding System.
 * Design contract: constructor-injection pattern matching TutorialOverlay / ChronographDiscoveryOverlay.
 *
 * Responsibilities:
 *   1. A/B cohort assignment: written once to PlayerSaveState before any game-loop code runs (AC5, Test Scenario 8).
 *   2. Control-cohort short-circuit: tryShow() returns false immediately for 'control' cohort; tooltip-only
 *      experience is completely unchanged (no further code execution).
 *   3. Callout-card step sequencing: data-driven from an injected stepConfig array so Phase 1 failure-map
 *      output (issue #112) drops in without any interface change.
 *   4. Session-scoped skip/dismiss: in-memory only (no persistence — per spec, AC3).
 *      Skip is available from step 2 onward (non-negotiable per requirements).
 *      Skip at step 1 is also permitted to handle the 'immediately dismiss' test scenario (Test Scenario 3).
 *   5. Telemetry: emits five named events to TelemetryEmitter (onboarding_started, onboarding_step_completed,
 *      onboarding_skipped, onboarding_completed, ab_cohort_assigned).
 *
 * Acceptance Criteria covered:
 *   AC1 — Guided track completion rate instrumented via onboarding_completed event.
 *   AC2 — Callout cards fire at designated step triggers via advanceStep() / tryShow().
 *   AC3 — Skip/dismiss tracked in-memory; no further guided prompts after skip.
 *   AC4 — Delegates highlight logic to ComponentHighlightController (injected separately).
 *   AC5 — A/B telemetry events emitted for both cohorts.
 *
 * Phase 1 dependency note:
 *   `stepConfig` is injected at construction with placeholder values until issue #112 delivers
 *   the failure-map report.  Swap in Phase 1 data without any interface change.
 *
 * Placeholder step config (to be replaced with Phase 1 failure-map data):
 *   Steps represent the major checkpoints of the first restoration job.
 *   Each step has: stepNumber, title, body (callout card text), componentId (for highlight).
 */

// Placeholder step configuration — populated with Phase 1 failure-map data when available.
// These placeholder steps cover the main phases of a first watch restoration job.
const PLACEHOLDER_STEP_CONFIG = [
  {
    step: 1,
    title: 'Start with the Case',
    body: '[Phase 1 data pending] This is where the restoration begins — opening the case back exposes the movement inside. Take your time here.',
    componentId: 'case-back',
  },
  {
    step: 2,
    title: 'Locate the Mainspring',
    body: '[Phase 1 data pending] The mainspring stores the watch\'s energy — it must come out before you can reach the gear train.',
    componentId: 'mainspring',
  },
  {
    step: 3,
    title: 'The Gear Train',
    body: '[Phase 1 data pending] The gear train transfers power from the mainspring to the escapement. Identify each wheel before removing it.',
    componentId: 'gear-train',
  },
  {
    step: 4,
    title: 'The Escapement',
    body: '[Phase 1 data pending] The escapement regulates the release of energy. This is the most delicate step — work slowly.',
    componentId: 'escapement',
  },
  {
    step: 5,
    title: 'Cleaning and Inspection',
    body: '[Phase 1 data pending] With the movement disassembled, inspect each part for wear or damage before reassembly.',
    componentId: 'cleaning-tray',
  },
];

const VALID_COHORTS = ['guided', 'control'];

class GuidedJobOnboardingController {
  /**
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   * @param {Array<{ step: number, title: string, body: string, componentId: string }>} [stepConfig]
   *   Injected step configuration. Defaults to PLACEHOLDER_STEP_CONFIG until Phase 1 data is available.
   *   Each entry maps a step number to callout card content and the component to highlight.
   */
  constructor(saveState, telemetry, stepConfig = PLACEHOLDER_STEP_CONFIG) {
    this._saveState = saveState;
    this._telemetry = telemetry;
    this._stepConfig = stepConfig;
    this._isVisible = false;
    this._currentStep = 0;
    this._skipped = false;
    this._jobId = null;
    // Session-scoped dismiss flag — in-memory only per spec (AC3)
    this._dismissed = false;
  }

  // ─── A/B Cohort Assignment ────────────────────────────────────────────────────

  /**
   * Assigns a new player to the guided or control cohort at first-launch.
   * Written synchronously to PlayerSaveState BEFORE any game-loop code runs (Test Scenario 8).
   * No-op if cohort is already assigned (idempotent — prevents mid-session flip, AC5).
   *
   * @param {string} [jobId]
   * @param {Function} [randomFn]  Injected RNG for deterministic testing (default: Math.random)
   * @returns {'guided'|'control'}  The assigned (or pre-existing) cohort
   */
  assignCohort(jobId = '', randomFn = Math.random) {
    const existing = this._saveState.get('ab_first_job_cohort');
    if (existing && VALID_COHORTS.includes(existing)) {
      return existing; // Already assigned — do not flip cohort mid-session
    }
    const cohort = randomFn() < 0.5 ? 'guided' : 'control';
    // Write synchronously before any game-loop code (Test Scenario 8 invariant)
    this._saveState.set('ab_first_job_cohort', cohort);
    this._telemetry.abCohortAssigned(cohort, jobId);
    return cohort;
  }

  // ─── Overlay Lifecycle ────────────────────────────────────────────────────────

  /**
   * Returns true when the guided overlay should be shown to this player.
   * False for: control cohort, already dismissed this session, or not a new player.
   *
   * @returns {boolean}
   */
  shouldShow() {
    if (this._dismissed) return false;
    const cohort = this._saveState.get('ab_first_job_cohort');
    return cohort === 'guided';
  }

  /**
   * Triggers the guided overlay for the first job.
   * Control-cohort players short-circuit immediately — zero further code execution (AC5).
   * Emits `onboarding_started` for guided cohort.
   *
   * @param {string} jobId
   * @returns {boolean}  true if the overlay was shown (guided cohort), false if suppressed
   */
  tryShow(jobId) {
    if (!this.shouldShow()) {
      return false;
    }
    this._isVisible = true;
    this._currentStep = 1;
    this._skipped = false;
    this._jobId = jobId;
    const cohort = this._saveState.get('ab_first_job_cohort');
    this._telemetry.onboardingStarted(jobId, cohort);
    return true;
  }

  /**
   * Advance to the next callout card step.
   * Emits `onboarding_step_completed` for the step just completed.
   * Auto-completes the guided track when the last step is advanced past.
   *
   * @returns {{ step: number, title: string, body: string, componentId: string }|null}
   *   The new current step data, or null if the guided track has ended naturally.
   */
  advanceStep() {
    if (!this._isVisible) return null;
    // Emit step-completed for the step being left
    this._telemetry.onboardingStepCompleted(this._jobId, this._currentStep);

    if (this._currentStep >= this._stepConfig.length) {
      this._completeGuidedTrack();
      return null;
    }
    this._currentStep += 1;
    return this.getCurrentStepData();
  }

  /**
   * Player skips/dismisses the guided track (AC3).
   * Available from step 1 onward (Test Scenarios 2, 3).
   * Sets session-scoped dismissed flag so no further prompts appear for this session.
   * Emits `onboarding_skipped`.
   */
  skip() {
    if (!this._isVisible) return;
    this._skipped = true;
    this._dismissed = true;
    this._isVisible = false;
    this._telemetry.onboardingSkipped(this._jobId, this._currentStep);
  }

  // ─── Accessors ────────────────────────────────────────────────────────────────

  /**
   * Returns the data for the currently displayed callout card step.
   * @returns {{ step: number, title: string, body: string, componentId: string }|null}
   */
  getCurrentStepData() {
    if (!this._isVisible || this._currentStep === 0) return null;
    return this._stepConfig[this._currentStep - 1] || null;
  }

  /**
   * Returns true if the guided overlay is currently visible.
   * @returns {boolean}
   */
  isVisible() {
    return this._isVisible;
  }

  /**
   * Returns true if the player used the skip action this session.
   * @returns {boolean}
   */
  wasSkipped() {
    return this._skipped;
  }

  /**
   * Returns true if the guided track has been dismissed this session (skip OR natural completion).
   * Once true, no further guided prompts will appear for the remainder of the session (AC3).
   * @returns {boolean}
   */
  isDismissed() {
    return this._dismissed;
  }

  /**
   * Returns the total number of configured guided steps.
   * @returns {number}
   */
  getTotalSteps() {
    return this._stepConfig.length;
  }

  /**
   * Returns the current 1-based step number (0 if overlay not started).
   * @returns {number}
   */
  getCurrentStep() {
    return this._currentStep;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /**
   * Called when the player completes the full guided first job naturally.
   * Emits `onboarding_completed` and sets dismissed so no re-trigger occurs.
   */
  _completeGuidedTrack() {
    this._isVisible = false;
    this._dismissed = true;
    this._telemetry.onboardingCompleted(this._jobId);
  }
}

module.exports = { GuidedJobOnboardingController, PLACEHOLDER_STEP_CONFIG };
