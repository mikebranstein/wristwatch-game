/**
 * TelemetryEmitter — wires named events to the existing instrumentation hooks.
 *
 * Design constraint: must emit events to existing hooks WITHOUT creating a
 * parallel telemetry system.  The `emit` call delegates to an externally
 * injected `instrumentationHook` function so the existing infrastructure
 * decides how to record / ship the event.
 *
 * Named events (AC5 — diagnosis system):
 *   tutorial_diagnosis_started
 *   hint_tier_1_shown
 *   hint_tier_2_shown
 *   hint_tier_3_shown
 *   diagnosis_completed_without_hint
 *   diagnosis_completed_with_hint
 *
 * Named events (AC5 — reassembly system, backward-compatible additive extension):
 *   undo_attempted          — player undid a reassembly placement
 *   reassembly_part_confirmed — a part was successfully snapped in
 *   reassembly_completed    — full reassembly stage completed (carries undo frequency)
 */

const EVENTS = {
  TUTORIAL_DIAGNOSIS_STARTED: 'tutorial_diagnosis_started',
  HINT_TIER_1_SHOWN: 'hint_tier_1_shown',
  HINT_TIER_2_SHOWN: 'hint_tier_2_shown',
  HINT_TIER_3_SHOWN: 'hint_tier_3_shown',
  DIAGNOSIS_COMPLETED_WITHOUT_HINT: 'diagnosis_completed_without_hint',
  DIAGNOSIS_COMPLETED_WITH_HINT: 'diagnosis_completed_with_hint',

  // Reassembly events (additive — does not affect diagnosis events above)
  UNDO_ATTEMPTED: 'undo_attempted',
  REASSEMBLY_PART_CONFIRMED: 'reassembly_part_confirmed',
  REASSEMBLY_COMPLETED: 'reassembly_completed',

  // Cleaning Reveal Core System (Issue #53)
  CLEANING_REVEAL_STARTED: 'cleaning_reveal_started',
  CLEANING_REVEAL_DISMISSED: 'cleaning_reveal_dismissed',
  CLEANING_REVEAL_AUTO_DISMISSED: 'cleaning_reveal_auto_dismissed',

  // First-Tick Audio Presentation — Phase 1 (Issue #113)
  // All additive — zero changes to existing event names or signatures.
  FIRST_TICK_TENSION_RAMP_STARTED:       'first_tick_tension_ramp_started',
  FIRST_TICK_FIRED:                      'first_tick_fired',
  FIRST_TICK_TICKING_LOOP_STARTED:       'first_tick_ticking_loop_started',
  FIRST_TICK_REWOUND_NO_DRAMA:           'first_tick_rewound_no_drama',
  FIRST_TICK_SEQUENCE_ABORTED:           'first_tick_sequence_aborted',
  FIRST_TICK_INCORRECT_ASSEMBLY_ABORTED: 'first_tick_incorrect_assembly_no_tick',

  // Chronograph Discovery Path — Phase 1 (Issue #88)
  // All additive — zero changes to existing event names or signatures.
  // COMPLICATION_GATE_REACHED must fire pre-launch to establish the D30 baseline (AC5).
  COMPLICATION_GATE_REACHED: 'complication_gate_reached',
  CHRONOGRAPH_OVERLAY_SHOWN: 'chronograph_overlay_shown',
  CHRONOGRAPH_OVERLAY_DISMISSED: 'chronograph_overlay_dismissed',
  CHRONOGRAPH_OVERLAY_SKIPPED: 'chronograph_overlay_skipped',
  PART_GROUP_REVEALED: 'part_group_revealed',
  DISCOVERY_MODE_TOGGLED: 'discovery_mode_toggled',

  // Guided First-Job Onboarding — Issue #111
  // All additive — zero changes to existing event names or signatures.
  // Five events cover the A/B instrumentation required for completion-rate and D1 return-rate tracking.
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  AB_COHORT_ASSIGNED: 'ab_cohort_assigned',
  AUDIO_SESSION_START: 'audio_session_start',
  AUDIO_SESSION_END: 'audio_session_end',
  AUDIO_CLEANING_REVEAL_FIRED: 'audio_cleaning_reveal_fired',
  AUDIO_FIRST_TICK_FIRED: 'audio_first_tick_fired',
  AUDIO_CASE_BACK_FIRED: 'audio_case_back_fired',
  AUDIO_TOOL_PICKUP_FIRED: 'audio_tool_pickup_fired',
  AUDIO_DELIVERY_FIRED: 'audio_delivery_fired',
  // Two-Bench Workshop Probe — Issue #116 (Phase 1 A/B)
  // All additive — zero changes to existing event names or signatures.
  // Six events cover cohort stabilisation, session-frequency and session-start-behaviour
  // telemetry, slot activation, and the 2-week qualitative feedback prompt.
  SECOND_BENCH_COHORT_ASSIGNED:   'second_bench_cohort_assigned',
  SESSION_FREQUENCY_PROBE:        'session_frequency_probe',
  SESSION_START_BEHAVIOR_PROBE:   'session_start_behavior_probe',
  SECOND_BENCH_SLOT_ACTIVATED:    'second_bench_slot_activated',
  SECOND_BENCH_FEEDBACK_PROMPTED: 'second_bench_feedback_prompted',
  SECOND_BENCH_FEEDBACK_RESPONSE: 'second_bench_feedback_response',

  // Client Backstory Card System — Issue #126
  // All additive — zero changes to existing event names or signatures.
  // Three events cover the A/B measurement signals required for D7 retention and job-completion tracking.
  JOB_ACCEPTED:         'job_accepted',          // payload: { job_id, job_type, has_backstory }
  JOB_DECLINED:         'job_declined',           // payload: { job_id, job_type, has_backstory }
  BACKSTORY_CARD_SHOWN: 'backstory_card_shown',  // payload: { job_id, job_type, template_id }

  // Reassembly Micro-Confirmation events (Issue #122)
  REASSEMBLY_COMPONENT_SEATED_SUCCESS: 'reassembly_component_seated_success',
  REASSEMBLY_SESSION_ABANDONED: 'reassembly_session_abandoned',

  // In-Repair Part Damage Recovery — Core System (Issue #148)
  // All additive — zero changes to existing event names or signatures.
  // AC5: captures part ID, restoration ID, damage event type, and player recovery choice.
  PART_DAMAGED:                  'part_damaged',                   // payload: { partId, restorationId, eventType }
  PART_DAMAGE_RECOVERY_CHOSEN:   'part_damage_recovery_chosen',    // payload: { partId, restorationId, playerChoice: 'ordered'|'declined' }
};

class TelemetryEmitter {
  /**
   * @param {Function} instrumentationHook  Receives (eventName, payload) — the
   *   existing analytics backend hook injected at game startup.
   */
  constructor(instrumentationHook) {
    if (typeof instrumentationHook !== 'function') {
      throw new Error('TelemetryEmitter requires an instrumentation hook function.');
    }
    this._hook = instrumentationHook;
    this._emitted = []; // record of all events fired (useful for QA assertions)
  }

  /**
   * Emit a named telemetry event with an optional payload.
   * @param {string} eventName
   * @param {Object} [payload]
   */
  emit(eventName, payload = {}) {
    const record = { name: eventName, payload, timestamp: Date.now() };
    this._emitted.push(record);
    this._hook(eventName, payload);
  }

  // ---- Convenience methods for each named event ----

  tutorialDiagnosisStarted(faultInstanceId) {
    this.emit(EVENTS.TUTORIAL_DIAGNOSIS_STARTED, { faultInstanceId });
  }

  hintTier1Shown(faultInstanceId) {
    this.emit(EVENTS.HINT_TIER_1_SHOWN, { faultInstanceId });
  }

  hintTier2Shown(faultInstanceId) {
    this.emit(EVENTS.HINT_TIER_2_SHOWN, { faultInstanceId });
  }

  hintTier3Shown(faultInstanceId) {
    this.emit(EVENTS.HINT_TIER_3_SHOWN, { faultInstanceId });
  }

  diagnosisCompletedWithoutHint(faultInstanceId) {
    this.emit(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT, { faultInstanceId });
  }

  diagnosisCompletedWithHint(faultInstanceId, highestTierUsed) {
    this.emit(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT, { faultInstanceId, highestTierUsed });
  }

  // ---- Reassembly convenience methods (backward-compatible additive extension) ----

  /**
   * Emitted when the player undoes a reassembly placement.
   * Used for AC5 undo-frequency baseline and post-implementation measurement.
   *
   * @param {string} partId
   * @param {string|null} sessionId
   * @param {number} totalUndoAttempts — running total for this session
   */
  undoAttempted(partId, sessionId, totalUndoAttempts) {
    this.emit(EVENTS.UNDO_ATTEMPTED, { partId, sessionId, totalUndoAttempts });
  }

  /**
   * Emitted when a part is successfully snapped into the correct position.
   *
   * @param {string} partId
   * @param {string|null} sessionId
   */
  reassemblyPartConfirmed(partId, sessionId) {
    this.emit(EVENTS.REASSEMBLY_PART_CONFIRMED, { partId, sessionId });
  }

  /**
   * Emitted when the full reassembly stage completes.
   * Carries undo frequency data for AC5 post-implementation measurement.
   *
   * @param {string|null} sessionId
   * @param {{ assembledCount: number, totalUndoAttempts: number }} stats
   */
  /**
   * Backward-compatible dual-mode signature:
   *   reassemblyCompleted(partId)                    — Phase 1 (Issue #76) single-arg form
   *   reassemblyCompleted(sessionId, stats)           — Phase 2 extended form with session context
   *
   * When called with one argument, emits { partId }.
   * When called with two arguments (stats defined), emits { sessionId, ...stats }.
   */
  reassemblyCompleted(partIdOrSessionId, stats) {
    if (stats !== undefined) {
      this.emit(EVENTS.REASSEMBLY_COMPLETED, { sessionId: partIdOrSessionId, ...stats });
    } else {
      this.emit(EVENTS.REASSEMBLY_COMPLETED, { partId: partIdOrSessionId });
    }
  }

  // ---- Cleaning Reveal events (Issue #53) ----

  cleaningRevealStarted(preTexture, postTexture) {
    this.emit(EVENTS.CLEANING_REVEAL_STARTED, { preTexture, postTexture });
  }

  cleaningRevealDismissed() {
    this.emit(EVENTS.CLEANING_REVEAL_DISMISSED, {});
  }

  cleaningRevealAutoDismissed() {
    this.emit(EVENTS.CLEANING_REVEAL_AUTO_DISMISSED, {});
  }

  // ---- Chronograph Discovery Path convenience methods (Issue #88) ----

  /**
   * Fires when any complication movement loads — required for D30 baseline
   * instrumentation BEFORE launch (AC5, Test Scenario 10).
   *
   * @param {string} movementId
   * @param {string} complicationType  e.g. 'chronograph'
   */
  complicationGateReached(movementId, complicationType) {
    this.emit(EVENTS.COMPLICATION_GATE_REACHED, { movementId, complicationType });
  }

  /**
   * Fires when the ChronographDiscoveryOverlay is displayed to the player.
   *
   * @param {string} movementId
   */
  chronographOverlayShown(movementId) {
    this.emit(EVENTS.CHRONOGRAPH_OVERLAY_SHOWN, { movementId });
  }

  /**
   * Fires when the player explicitly dismisses the overlay after viewing it.
   *
   * @param {string} movementId
   */
  chronographOverlayDismissed(movementId) {
    this.emit(EVENTS.CHRONOGRAPH_OVERLAY_DISMISSED, { movementId });
  }

  /**
   * Fires when the player immediately skips the overlay without reading.
   *
   * @param {string} movementId
   */
  chronographOverlaySkipped(movementId) {
    this.emit(EVENTS.CHRONOGRAPH_OVERLAY_SKIPPED, { movementId });
  }

  /**
   * Fires each time PartScaffoldingController reveals a group of parts.
   *
   * @param {number} groupIndex   0-based index of the revealed group
   * @param {string} label        Descriptive context cue shown to the player
   * @param {number} partCount    Number of parts in this group
   */
  partGroupRevealed(groupIndex, label, partCount) {
    this.emit(EVENTS.PART_GROUP_REVEALED, { groupIndex, label, partCount });
  }

  /**
   * Fires when the player toggles discovery mode in Settings.
   *
   * @param {boolean} newValue  The new state of discovery_mode_enabled
   */
  discoveryModeToggled(newValue) {
    this.emit(EVENTS.DISCOVERY_MODE_TOGGLED, { newValue });
  }

  // ---- Guided First-Job Onboarding convenience methods (Issue #111) ----

  /**
   * Fires when the GuidedJobOnboardingController starts for a new player (guided cohort).
   * Emitted once per first-job session, immediately after A/B cohort assignment (AC5).
   *
   * @param {string} jobId
   * @param {string} cohort  'guided' | 'control'
   */
  onboardingStarted(jobId, cohort) {
    this.emit(EVENTS.ONBOARDING_STARTED, { jobId, cohort });
  }

  /**
   * Fires each time the player completes a guided step (AC5 step-level granularity).
   *
   * @param {string} jobId
   * @param {number} step   1-based step number
   */
  onboardingStepCompleted(jobId, step) {
    this.emit(EVENTS.ONBOARDING_STEP_COMPLETED, { jobId, step });
  }

  /**
   * Fires when the player skips/dismisses the guided track mid-flow (AC3, AC5).
   *
   * @param {string} jobId
   * @param {number} atStep  The step number at which the player chose to skip
   */
  onboardingSkipped(jobId, atStep) {
    this.emit(EVENTS.ONBOARDING_SKIPPED, { jobId, atStep });
  }

  /**
   * Fires when the player completes the full guided first job (AC1 success gate metric).
   *
   * @param {string} jobId
   */
  onboardingCompleted(jobId) {
    this.emit(EVENTS.ONBOARDING_COMPLETED, { jobId });
  }

  /**
   * Fires once at session start when a new player's A/B cohort is assigned (AC5 / Test Scenario 8).
   *
   * @param {string} cohort  'guided' | 'control'
   * @param {string} [jobId]
   */
  abCohortAssigned(cohort, jobId = '') {
    this.emit(EVENTS.AB_COHORT_ASSIGNED, { cohort, jobId });
  }

  // ---- Two-Bench Workshop Probe convenience methods (Issue #116) ----

  /**
   * Fires once when the player's second-bench probe cohort is assigned for the first time.
   * Must be emitted before any session-frequency events (cohort stabilisation invariant).
   *
   * @param {string} playerId   Anonymised persistent player identifier
   * @param {string} cohort     'probe' | 'control'
   */
  secondBenchCohortAssigned(playerId, cohort) {
    this.emit(EVENTS.SECOND_BENCH_COHORT_ASSIGNED, { playerId, cohort });
  }

  /**
   * Fires at every session start for all players in the probe window.
   * Provides the session-frequency data required for probe vs. control comparison (AC4).
   *
   * @param {string} playerId
   * @param {string} cohort     'probe' | 'control'
   * @param {number} [timestamp]  Unix timestamp of session start (defaults to Date.now())
   */
  sessionFrequencyProbe(playerId, cohort, timestamp = Date.now()) {
    this.emit(EVENTS.SESSION_FREQUENCY_PROBE, { playerId, cohort, timestamp });
  }

  /**
   * Fires at session start; records whether Slot 1 is in sourcing wait (AC4 session-start behaviour).
   *
   * @param {string}  playerId
   * @param {string}  cohort            'probe' | 'control'
   * @param {boolean} slot1IsSourcing   True when Slot 1 has an active sourcing wait at load
   * @param {boolean} slot2Available    True when player has an unlocked second slot
   * @param {number}  [timestamp]
   */
  sessionStartBehaviorProbe(playerId, cohort, slot1IsSourcing, slot2Available, timestamp = Date.now()) {
    this.emit(EVENTS.SESSION_START_BEHAVIOR_PROBE, {
      playerId, cohort, slot1IsSourcing, slot2Available, timestamp,
    });
  }

  /**
   * Fires when a player first intakes a job into Slot 2 (probe activation event).
   *
   * @param {string} playerId
   * @param {string} cohort
   */
  secondBenchSlotActivated(playerId, cohort) {
    this.emit(EVENTS.SECOND_BENCH_SLOT_ACTIVATED, { playerId, cohort });
  }

  /**
   * Fires when the 2-week qualitative feedback prompt is shown to a probe-arm player.
   *
   * @param {string} playerId
   */
  secondBenchFeedbackPrompted(playerId) {
    this.emit(EVENTS.SECOND_BENCH_FEEDBACK_PROMPTED, { playerId });
  }

  /**
   * Fires when the player responds to the 2-week feedback prompt.
   *
   * @param {string} playerId
   * @param {string} sentiment       'positive' | 'neutral' | 'negative'
   * @param {string} [responseText]  Optional free-text response
   */
  secondBenchFeedbackResponse(playerId, sentiment, responseText = '') {
    this.emit(EVENTS.SECOND_BENCH_FEEDBACK_RESPONSE, { playerId, sentiment, responseText });
  }

  // ---- Client Backstory Card System convenience methods (Issue #126) ----

  /**
   * Fires when the player accepts a job.
   * The `has_backstory` flag enables A/B measurement of D7 retention and job-completion rate.
   *
   * @param {string}  jobId
   * @param {string}  jobType       e.g. 'dive_watch'
   * @param {boolean} hasBackstory  true when the job is in the 'backstory' A/B cohort
   */
  jobAccepted(jobId, jobType, hasBackstory) {
    this.emit(EVENTS.JOB_ACCEPTED, { job_id: jobId, job_type: jobType, has_backstory: hasBackstory });
  }

  /**
   * Fires when the player declines a job.
   * The `has_backstory` flag enables A/B measurement of decline-rate differences between cohorts.
   *
   * @param {string}  jobId
   * @param {string}  jobType
   * @param {boolean} hasBackstory
   */
  jobDeclined(jobId, jobType, hasBackstory) {
    this.emit(EVENTS.JOB_DECLINED, { job_id: jobId, job_type: jobType, has_backstory: hasBackstory });
  }

  /**
   * Fires when a backstory card is rendered in the intake screen (backstory cohort only).
   * Provides template-level granularity for card-performance analysis.
   *
   * @param {string} jobId
   * @param {string} jobType
   * @param {string} templateId  The specific template shown (e.g. 'dive_001')
   */
  backstoryCardShown(jobId, jobType, templateId) {
    this.emit(EVENTS.BACKSTORY_CARD_SHOWN, { job_id: jobId, job_type: jobType, template_id: templateId });
  }

  // ---- Reassembly Micro-Confirmation convenience methods (Issue #122) ----

  reassemblyComponentSeatedSuccess(componentId, cohortId) {
    this.emit(EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS, {
      componentId, cohortId, timestamp: Date.now(),
    });
  }

  reassemblySessionAbandoned(cohortId) {
    this.emit(EVENTS.REASSEMBLY_SESSION_ABANDONED, {
      cohortId, timestamp: Date.now(),
    });
  }

  // ---- In-Repair Part Damage Recovery convenience methods (Issue #148) ----

  /**
   * Fires when a part is damaged (over-torque, drop, snap) during restoration.
   * AC5: Captures part ID, restoration ID, and damage event type.
   *
   * @param {string} partId         Unique part identifier
   * @param {string} restorationId  Unique restoration session identifier
   * @param {string} eventType      'over_torque' | 'drop' | 'snap'
   */
  partDamaged(partId, restorationId, eventType) {
    this.emit(EVENTS.PART_DAMAGED, { partId, restorationId, eventType });
  }

  /**
   * Fires when the player makes a recovery choice from the damage prompt.
   * AC5: Captures player recovery choice (ordered / declined).
   *
   * @param {string} partId
   * @param {string} restorationId
   * @param {'ordered'|'declined'} playerChoice
   */
  partDamageRecoveryChosen(partId, restorationId, playerChoice) {
    this.emit(EVENTS.PART_DAMAGE_RECOVERY_CHOSEN, { partId, restorationId, playerChoice });
  }

  /**
   * Returns a copy of every event emitted so far (for testing / QA).
   * @returns {Array<{eventName: string, payload: Object, timestamp: number}>}
   */
  audioSessionStart(sessionId, cohort) { return this.emit(EVENTS.AUDIO_SESSION_START, { sessionId, cohort }); }
  audioSessionEnd(sessionId, cohort, sessionLengthMs) { return this.emit(EVENTS.AUDIO_SESSION_END, { sessionId, cohort, sessionLengthMs }); }
  audioCleaningRevealFired(sessionId, cohort) { return this.emit(EVENTS.AUDIO_CLEANING_REVEAL_FIRED, { sessionId, cohort }); }
  audioFirstTickFired(sessionId, cohort) { return this.emit(EVENTS.AUDIO_FIRST_TICK_FIRED, { sessionId, cohort }); }
  audioCaseBackFired(sessionId, cohort) { return this.emit(EVENTS.AUDIO_CASE_BACK_FIRED, { sessionId, cohort }); }
  audioToolPickupFired(sessionId, cohort) { return this.emit(EVENTS.AUDIO_TOOL_PICKUP_FIRED, { sessionId, cohort }); }
  audioDeliveryFired(sessionId, cohort) { return this.emit(EVENTS.AUDIO_DELIVERY_FIRED, { sessionId, cohort }); }

  getEmittedEvents() {
    return this._emitted.slice();
  }

  /**
   * Check whether a specific named event has been emitted at least once.
   * @param {string} eventName
   * @returns {boolean}
   */
  wasEmitted(eventName) {
    return this._emitted.some((r) => r.name === eventName);
  }
}

module.exports = { TelemetryEmitter, EVENTS };
// TEST_WRITE_124036
