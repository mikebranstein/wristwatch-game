/**
 * SourcingScreen — top-level orchestrator for the parts sourcing / placement stage.
 *
 * Issue #82 — Save/Load Reliability System:
 *   Provides the sourcing-stage completion lifecycle hook required for autosave
 *   checkpoint AC1.  An optional `autosaveHook` is injected at construction via
 *   the established DI pattern (mirrors ReassemblyScreen / CleaningRevealSequence).
 *
 * Issue #255 — Holistic Craftsmanship Score Phase 2:
 *   onPartSourced() extended with an optional `conditionGrade` parameter (null default).
 *   When supplied, the condition grade is recorded alongside the part ID for sourcing
 *   quality scoring at the DeliveryHandler boundary.
 *
 *   computeSourcingQualityScore(pricingTier) computes:
 *     (quality-meeting parts / total parts sourced) × 100
 *
 *   Quality thresholds by pricing tier (PartCondition values from part_compatibility.py):
 *     simple_service    (Tier 1): any PartCondition passes — Used-Fair, Used-Good, or New
 *     complex_service   (Tier 2): Used-Good or New passes; Used-Fair fails
 *     full_restoration  (Tier 3): New only — Used-Good and Used-Fair both fail
 *
 *   Backward-compatible: all existing onPartSourced(partId) call sites are unaffected
 *   (conditionGrade defaults to null; parts with null grades are excluded from scoring).
 *   Returns null when no parts with condition grades have been sourced (phase-gate exclusion).
 *
 * Responsibilities:
 *   - Track which parts have been sourced / placed.
 *   - Emit a `sourcing_completed` telemetry event on stage completion.
 *   - Fire the autosave hook (AC1: checkpoint written before next stage begins).
 *
 * Design pattern: same DI constructor hook pattern used by ReassemblyScreen and
 * CleaningRevealSequence.  All domain logic is delegated; this class is the stage
 * lifecycle boundary only.
 */

const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

/**
 * Quality rank ordering for PartCondition values (ascending quality).
 * Used by computeSourcingQualityScore() for threshold comparison.
 * Encoding this explicitly avoids relying on alphabetic string ordering.
 * Source: src/catalog/data/part_compatibility.py PartCondition enum.
 */
const CONDITION_ORDER = ['Used-Fair', 'Used-Good', 'New'];

/**
 * Minimum passing PartCondition by pricing tier.
 * null = any condition passes (Tier 1: simple_service).
 */
const SOURCING_THRESHOLD = {
  simple_service:   null,          // Tier 1: all conditions pass
  complex_service:  'Used-Good',   // Tier 2: Used-Fair fails
  full_restoration: 'New',         // Tier 3: only New passes
};

class SourcingScreen {
  /**
   * @param {Object}   opts
   * @param {Function} opts.instrumentationHook  Telemetry hook: (eventName, payload) => void
   * @param {Function} [opts.autosaveHook]        Issue #82: async (stage: string) => void
   * @param {string}   [opts.sessionId]           Optional session identifier for telemetry.
   */
  constructor({ instrumentationHook, autosaveHook = null, sessionId = null }) {
    this._telemetry    = new TelemetryEmitter(instrumentationHook);
    this._autosaveHook = autosaveHook;  // Issue #82
    this._sessionId    = sessionId;
    this._sourcedParts = new Set();

    // Issue #255: array of { partId, conditionGrade } for sourcing quality scoring.
    // Only populated for calls to onPartSourced() that include a conditionGrade.
    this._sourcedPartsWithCondition = [];
  }

  // ── Parts sourcing tracking ─────────────────────────────────────────────

  /**
   * Record that a replacement part has been sourced / placed.
   *
   * Issue #255: backward-compatible extension — accepts an optional `conditionGrade`
   * parameter (null default). When supplied, the grade is recorded for sourcing quality
   * scoring at the DeliveryHandler boundary.  All existing callers remain unaffected.
   *
   * @param {string}      partId
   * @param {string|null} [conditionGrade]  Issue #255: PartCondition value ('New' |
   *                                         'Used-Good' | 'Used-Fair') or null (default).
   */
  onPartSourced(partId, conditionGrade = null) {
    this._sourcedParts.add(partId);

    // Issue #255: record condition grade when provided (Phase 2 sourcing quality tracking).
    if (conditionGrade !== null) {
      this._sourcedPartsWithCondition.push({ partId, conditionGrade });
    }

    this._telemetry.emit('sourcing_part_placed', {
      partId,
      sessionId: this._sessionId,
      sourcedCount: this._sourcedParts.size,
    });
  }

  /**
   * Remove a previously sourced part (player un-sources a part).
   *
   * @param {string} partId
   */
  onPartUnSourced(partId) {
    this._sourcedParts.delete(partId);
    this._telemetry.emit('sourcing_part_removed', {
      partId,
      sessionId: this._sessionId,
    });
  }

  // ── Stage completion ────────────────────────────────────────────────────

  /**
   * Mark the sourcing stage as complete (all required parts placed).
   *
   * Emits a `sourcing_completed` telemetry event.
   * Issue #82 — AC1, AC5: awaits the autosaveHook so the checkpoint is
   * guaranteed to land on disk before the next stage begins.
   *
   * @returns {Promise<void>}
   */
  async completeSourcing() {
    this._telemetry.emit('sourcing_completed', {
      sessionId: this._sessionId,
      sourcedCount: this._sourcedParts.size,
    });

    // Issue #82: trigger autosave checkpoint at sourcing completion (AC1).
    if (this._autosaveHook) {
      await this._autosaveHook('sourcing');
    }
  }

  // ── Issue #255: Sourcing quality scoring ────────────────────────────────

  /**
   * Compute the sourcing quality score for this stage.
   *
   * Issue #255 — AC2:
   *   Score = (quality-meeting parts / total parts sourced with grade data) × 100.
   *
   *   Quality thresholds (using PartCondition enum from part_compatibility.py):
   *     Tier 1 (simple_service):   any condition passes (null threshold)
   *     Tier 2 (complex_service):  Used-Good or New passes; Used-Fair fails
   *     Tier 3 (full_restoration): New only; Used-Good and Used-Fair both fail
   *
   *   Returns null when no parts have been sourced with condition grade data
   *   (phase-gate exclusion — aggregator treats null as "dimension unavailable").
   *
   * @param {string} pricingTier  'simple_service' | 'complex_service' | 'full_restoration'
   * @returns {number|null}  Score in [0, 100], or null when no graded parts were sourced.
   */
  computeSourcingQualityScore(pricingTier) {
    if (!this._sourcedPartsWithCondition || this._sourcedPartsWithCondition.length === 0) {
      return null;
    }

    const threshold = SOURCING_THRESHOLD[pricingTier] !== undefined
      ? SOURCING_THRESHOLD[pricingTier]
      : null;  // Unrecognised tier → treat as Tier 1 (all pass)

    const passing = this._sourcedPartsWithCondition.filter(({ conditionGrade }) => {
      if (threshold === null) return true;  // Tier 1: all conditions pass
      const gradeIdx     = CONDITION_ORDER.indexOf(conditionGrade);
      const thresholdIdx = CONDITION_ORDER.indexOf(threshold);
      // Unknown grade strings are treated as failing.
      if (gradeIdx === -1) return false;
      return gradeIdx >= thresholdIdx;
    });

    return (passing.length / this._sourcedPartsWithCondition.length) * 100;
  }

  // ── Accessors (for testing & QA) ────────────────────────────────────────

  /** @returns {Set<string>} Set of sourced part IDs. */
  getSourcedParts() { return new Set(this._sourcedParts); }

  /**
   * Returns a copy of the sourced-parts-with-condition list (Issue #255).
   * @returns {Array<{partId: string, conditionGrade: string}>}
   */
  getSourcedPartsWithCondition() { return [...this._sourcedPartsWithCondition]; }

  /** @returns {TelemetryEmitter} */
  getTelemetry() { return this._telemetry; }
}

module.exports = { SourcingScreen, CONDITION_ORDER, SOURCING_THRESHOLD };
