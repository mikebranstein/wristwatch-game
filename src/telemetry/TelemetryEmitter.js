/**
 * TelemetryEmitter — wires named events to the existing instrumentation hooks.
 *
 * Design constraint: must emit events to existing hooks WITHOUT creating a
 * parallel telemetry system.  The `emit` call delegates to an externally
 * injected `instrumentationHook` function so the existing infrastructure
 * decides how to record / ship the event.
 *
 * Named events (AC5):
 *   tutorial_diagnosis_started
 *   hint_tier_1_shown
 *   hint_tier_2_shown
 *   hint_tier_3_shown
 *   diagnosis_completed_without_hint
 *   diagnosis_completed_with_hint
 */

const EVENTS = {
  TUTORIAL_DIAGNOSIS_STARTED: 'tutorial_diagnosis_started',
  HINT_TIER_1_SHOWN: 'hint_tier_1_shown',
  HINT_TIER_2_SHOWN: 'hint_tier_2_shown',
  HINT_TIER_3_SHOWN: 'hint_tier_3_shown',
  DIAGNOSIS_COMPLETED_WITHOUT_HINT: 'diagnosis_completed_without_hint',
  DIAGNOSIS_COMPLETED_WITH_HINT: 'diagnosis_completed_with_hint',
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
