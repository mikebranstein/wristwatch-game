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

  // Chronograph Discovery Path — Phase 1 (Issue #88)
  // All additive — zero changes to existing event names or signatures.
  // COMPLICATION_GATE_REACHED must fire pre-launch to establish the D30 baseline (AC5).
  COMPLICATION_GATE_REACHED: 'complication_gate_reached',
  CHRONOGRAPH_OVERLAY_SHOWN: 'chronograph_overlay_shown',
  CHRONOGRAPH_OVERLAY_DISMISSED: 'chronograph_overlay_dismissed',
  CHRONOGRAPH_OVERLAY_SKIPPED: 'chronograph_overlay_skipped',
  PART_GROUP_REVEALED: 'part_group_revealed',
  DISCOVERY_MODE_TOGGLED: 'discovery_mode_toggled',
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
