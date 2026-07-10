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

  /**
   * Returns a copy of every event emitted so far (for testing / QA).
   * @returns {Array<{eventName: string, payload: Object, timestamp: number}>}
   */
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
