/**
 * AdaptiveCoachingController — Mistake-Pattern Detection Layer (Phase 1 MVP)
 * Issue #293
 *
 * Session-scoped controller that tracks three diagnosis-phase mistake types
 * per fault step (faultInstanceId). When a step+mistake-type pair crosses
 * the configured threshold, it fires a coaching_trigger event consumed by
 * the UI delivery layer (Feature B, Issue #296).
 *
 * Mistake types tracked (AC1):
 *   wrong_tool_selected      — player selects an incorrect tool
 *   fault_type_misidentified — player submits an incorrect fault type
 *   diagnosis_undo_attempted — player attempts to undo a diagnosis
 *
 * AC2 — Counter increments per event (per faultInstanceId + mistake type).
 * AC3 — Threshold is configurable; default is 2.
 * AC4 — Session reset: resetSession() clears all counters and suppression state.
 * AC5 — Phase isolation: only the three diagnosis-phase events are tracked here;
 *        callers must NOT invoke this controller from non-diagnosis contexts.
 * AC6 — Interface stability: no existing method signatures are modified; this
 *        module is purely additive.
 *
 * Integration mechanism: DiagnosisScreen.js calls this controller directly via
 * the three record*() methods (direct-callback pattern). No listener registry
 * on TelemetryEmitter is required; DiagnosisScreen already holds references to
 * both subsystems.
 */

'use strict';

/** @enum {string} */
const MISTAKE_TYPES = {
  WRONG_TOOL_SELECTED:      'wrong_tool_selected',
  FAULT_TYPE_MISIDENTIFIED: 'fault_type_misidentified',
  DIAGNOSIS_UNDO_ATTEMPTED: 'diagnosis_undo_attempted',
};

/** Default mistake count required to fire a coaching_trigger (AC3). */
const DEFAULT_THRESHOLD = 2;

class AdaptiveCoachingController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.onCoachingTrigger  Called with a coaching_trigger payload
   *                                           when a step+mistake-type pair hits the
   *                                           threshold. Payload shape:
   *                                           { type: string, stepId: string, failureCount: number }
   * @param {number}   [opts.threshold=2]      Mistake count required to fire the trigger (AC3).
   */
  constructor({ onCoachingTrigger, threshold = DEFAULT_THRESHOLD } = {}) {
    if (typeof onCoachingTrigger !== 'function') {
      throw new Error(
        'AdaptiveCoachingController requires an onCoachingTrigger callback function.'
      );
    }
    this._onCoachingTrigger = onCoachingTrigger;
    this._threshold = threshold;

    /**
     * Per-step, per-mistake-type mistake counts.
     * Map<faultInstanceId, Map<mistakeType, count>>
     * @type {Map<string, Map<string, number>>}
     */
    this._counts = new Map();

    /**
     * Suppression set: tracks "faultInstanceId:mistakeType" pairs that have already
     * triggered coaching, preventing duplicate triggers (AC3 trigger suppression).
     * @type {Set<string>}
     */
    this._triggered = new Set();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AC1 — Record mistake events
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Record a wrong_tool_selected mistake for the given fault step.
   * Increments the per-step counter and fires coaching_trigger if threshold is reached.
   *
   * @param {string} faultInstanceId  Per-encounter fault identifier (= stepId)
   * @param {string} toolId           The (incorrect) tool the player selected
   */
  recordWrongToolSelected(faultInstanceId, toolId) {
    this._record(faultInstanceId, MISTAKE_TYPES.WRONG_TOOL_SELECTED, { toolId });
  }

  /**
   * Record a fault_type_misidentified mistake for the given fault step.
   * Increments the per-step counter and fires coaching_trigger if threshold is reached.
   *
   * @param {string} faultInstanceId      Per-encounter fault identifier (= stepId)
   * @param {string} submittedFaultTypeId The (incorrect) fault type the player submitted
   */
  recordFaultTypeMisidentified(faultInstanceId, submittedFaultTypeId) {
    this._record(faultInstanceId, MISTAKE_TYPES.FAULT_TYPE_MISIDENTIFIED, { submittedFaultTypeId });
  }

  /**
   * Record a diagnosis_undo_attempted event for the given fault step.
   * Increments the per-step counter and fires coaching_trigger if threshold is reached.
   *
   * @param {string} faultInstanceId  Per-encounter fault identifier (= stepId)
   */
  recordDiagnosisUndoAttempted(faultInstanceId) {
    this._record(faultInstanceId, MISTAKE_TYPES.DIAGNOSIS_UNDO_ATTEMPTED, {});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AC4 — Reset
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Reset counters and suppression state for a specific fault step.
   * Call when the player advances to a new fault instance (enterDiagnosis with a
   * new faultInstanceId) so that old trigger state does not carry over.
   *
   * @param {string} faultInstanceId
   */
  resetStep(faultInstanceId) {
    this._counts.delete(faultInstanceId);
    const prefix = `${faultInstanceId}:`;
    for (const key of [...this._triggered]) {
      if (key.startsWith(prefix)) {
        this._triggered.delete(key);
      }
    }
  }

  /**
   * Reset all session state — clears every counter and suppression flag (AC4).
   * Call on new session start or session teardown.
   */
  resetSession() {
    this._counts.clear();
    this._triggered.clear();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AC2 / AC3 — Inspection accessors (for testing and QA)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the current mistake count for a step+type pair (AC2).
   *
   * @param {string} faultInstanceId
   * @param {string} mistakeType  One of MISTAKE_TYPES.*
   * @returns {number}
   */
  getCount(faultInstanceId, mistakeType) {
    const stepCounts = this._counts.get(faultInstanceId);
    if (!stepCounts) return 0;
    return stepCounts.get(mistakeType) || 0;
  }

  /**
   * Returns the configured coaching trigger threshold (AC3).
   * @returns {number}
   */
  getThreshold() {
    return this._threshold;
  }

  /**
   * Returns true if a coaching_trigger has already fired for the given
   * step+type pair in this session (AC3 — suppression check).
   *
   * @param {string} faultInstanceId
   * @param {string} mistakeType
   * @returns {boolean}
   */
  wasTriggered(faultInstanceId, mistakeType) {
    return this._triggered.has(`${faultInstanceId}:${mistakeType}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Internal: increment count for faultInstanceId+mistakeType and fire
   * coaching_trigger if the threshold is newly reached.
   *
   * @param {string} faultInstanceId
   * @param {string} mistakeType
   * @param {Object} _extra  Extra payload context (not used internally, reserved for future logging)
   */
  _record(faultInstanceId, mistakeType, _extra) {
    // Initialise per-step map if not yet present
    if (!this._counts.has(faultInstanceId)) {
      this._counts.set(faultInstanceId, new Map());
    }
    const stepCounts = this._counts.get(faultInstanceId);

    const prev = stepCounts.get(mistakeType) || 0;
    const next = prev + 1;
    stepCounts.set(mistakeType, next);

    // Fire coaching_trigger only once per step+type (suppression — AC3)
    const triggerKey = `${faultInstanceId}:${mistakeType}`;
    if (next >= this._threshold && !this._triggered.has(triggerKey)) {
      this._triggered.add(triggerKey);
      this._onCoachingTrigger({
        type: mistakeType,
        stepId: faultInstanceId,
        failureCount: next,
      });
    }
  }
}

module.exports = { AdaptiveCoachingController, MISTAKE_TYPES, DEFAULT_THRESHOLD };
