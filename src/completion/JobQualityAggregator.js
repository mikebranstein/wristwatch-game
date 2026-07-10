/**
 * JobQualityAggregator — 4-Dimension Craftsmanship Score synthesis at job delivery.
 *
 * Issue #253 — Holistic Craftsmanship Score Phase 1
 *
 * Reads quality signals from four existing shipped systems and computes a composite
 * craftsmanship score and tier at the DeliveryHandler delivery boundary.
 *
 * Dimensions (Phase 1):
 *   cosmetic    — CosmeticRestorationSummary.getSummaryState(): (strap+crystal+case)/3 × 100
 *   mechanical  — CompletionScreenState: faultsFixed / totalParts × 100
 *   diagnostic  — HintSystem.wasHintUsed(): faultsWithoutHints / totalFaults × 100
 *   economic    — LedgerManager.revenueForTier(): (revenue − partsCost) / revenue × 100
 *
 * Phase-gate: only dimensions in craftsmanship_dimensions_unlocked contribute to composite.
 * Default unlock: ['cosmetic', 'mechanical'] (early-game; diagnostic/economic added later).
 *
 * Tier assignment: Apprentice (0–49) | Journeyman (50–74) | Master (75–89) | Grandmaster (90–100)
 *
 * Constraints:
 *   - Does NOT call LedgerManager.recordJobCompletion() — that is done by DeliveryHandler.
 *   - Does NOT import or use HintEscalationAnalyzer (batch telemetry tool — no runtime role).
 *   - Interface-immutable: no modifications to CosmeticRestorationSummary, CompletionScreenState,
 *     HintSystem, or LedgerManager public APIs.
 *   - Synchronous, pure arithmetic — ≤16ms budget trivially satisfied.
 *   - Null-safe: if any source system returns null/undefined, that dimension is excluded from
 *     composite with a console.warn rather than throwing.
 *
 * Acceptance Criteria covered:
 *   AC1 — composite score + tier computed at delivery boundary from 4 dimensions
 *   AC3 — phase-gate: unlocked dimensions only; denominator = count of unlocked dimensions
 *   AC4 — personal best update (logic in DeliveryHandler; aggregator returns score/tier)
 *   AC5 — unit-testable via direct numeric injection (accepts dimension scores as params)
 */

'use strict';

const { LedgerManager } = require('../economy/LedgerManager');

// ---------------------------------------------------------------------------
// Tier thresholds
// ---------------------------------------------------------------------------

const TIERS = [
  { label: 'Grandmaster', min: 90 },
  { label: 'Master',      min: 75 },
  { label: 'Journeyman',  min: 50 },
  { label: 'Apprentice',  min: 0  },
];

/** All possible dimension identifiers. */
const ALL_DIMENSIONS = ['cosmetic', 'mechanical', 'diagnostic', 'economic'];

/** Default unlocked dimensions (early-game; diagnostic+economic added on tool unlock). */
const DEFAULT_UNLOCKED_DIMENSIONS = ['cosmetic', 'mechanical'];

// ---------------------------------------------------------------------------
// JobQualityAggregator
// ---------------------------------------------------------------------------

class JobQualityAggregator {
  /**
   * @param {Object}  opts
   * @param {Object}  opts.cosmeticSummary    CosmeticRestorationSummary instance
   * @param {Object}  opts.completionState    Object with { faultsFixed: number, totalParts: number }
   * @param {Object}  opts.hintSystem         HintSystem instance
   * @param {Object}  opts.ledgerManager      LedgerManager instance
   * @param {Object}  opts.saveState          PlayerSaveState-compatible object (get/set)
   */
  constructor({ cosmeticSummary, completionState, hintSystem, ledgerManager, saveState }) {
    this._cosmeticSummary  = cosmeticSummary;
    this._completionState  = completionState;
    this._hintSystem       = hintSystem;
    this._ledgerManager    = ledgerManager;
    this._saveState        = saveState;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Compute the composite craftsmanship score.
   *
   * Accepts explicit delivery-payload inputs (pricingTier, partsCost, faultInstanceIds)
   * so that the aggregator can score economic and diagnostic dimensions without needing
   * additional side-channel queries.
   *
   * AC5: When using synthetic injection (injectDimensionScores), the real source systems
   * are bypassed entirely — any [0–100] value can be injected for unit-test isolation.
   *
   * @param {Object}   opts
   * @param {string}   opts.pricingTier          — from DeliveryHandler payload
   * @param {number}   opts.partsCost            — from DeliveryHandler payload
   * @param {string[]} opts.faultInstanceIds      — all fault IDs registered for this job
   * @param {Object}   [opts.injectDimensionScores] — optional synthetic overrides for testing
   *   Shape: { cosmetic?: number, mechanical?: number, diagnostic?: number, economic?: number }
   *   Any injected dimension value (0–100) bypasses the real source-system read.
   * @returns {{
   *   score:              number,
   *   tier:               string,
   *   dimensionScores:    { cosmetic?: number, mechanical?: number, diagnostic?: number, economic?: number },
   *   unlockedDimensions: string[],
   * }}
   */
  computeScore({ pricingTier, partsCost, faultInstanceIds = [], injectDimensionScores = {} }) {
    const unlocked = this._getUnlockedDimensions();

    const dimensionScores = {};

    for (const dim of unlocked) {
      // Synthetic injection (AC5): if an override is provided, use it directly.
      if (Object.prototype.hasOwnProperty.call(injectDimensionScores, dim) &&
          injectDimensionScores[dim] !== undefined && injectDimensionScores[dim] !== null) {
        dimensionScores[dim] = Math.min(100, Math.max(0, Number(injectDimensionScores[dim])));
        continue;
      }

      // Real source-system read — null-safe (exclude on failure; warn but do not throw).
      const score = this._computeDimensionScore(dim, { pricingTier, partsCost, faultInstanceIds });
      if (score !== null) {
        dimensionScores[dim] = score;
      }
    }

    // Composite = average of successfully-scored dimensions.
    const scoredDimensions = Object.keys(dimensionScores);
    if (scoredDimensions.length === 0) {
      // Graceful degradation: no data → Apprentice tier at 0%.
      return { score: 0, tier: 'Apprentice', dimensionScores: {}, unlockedDimensions: unlocked };
    }

    const total     = scoredDimensions.reduce((sum, dim) => sum + dimensionScores[dim], 0);
    const composite = total / scoredDimensions.length;
    const score     = Math.round(composite * 100) / 100;   // round to 2 dp
    const tier      = JobQualityAggregator.assignTier(score);

    return { score, tier, dimensionScores, unlockedDimensions: unlocked };
  }

  // ---------------------------------------------------------------------------
  // Static helpers (public so callers can use them without an instance)
  // ---------------------------------------------------------------------------

  /**
   * Assign a tier label from a numeric score (0–100).
   * Apprentice (0–49) | Journeyman (50–74) | Master (75–89) | Grandmaster (90–100)
   * @param {number} score
   * @returns {string}
   */
  static assignTier(score) {
    for (const { label, min } of TIERS) {
      if (score >= min) return label;
    }
    return 'Apprentice';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Read the phase-gate unlock list from save state.
   * Default: ['cosmetic', 'mechanical'] when field is absent/null (early-game).
   * @returns {string[]}
   * @private
   */
  _getUnlockedDimensions() {
    const stored = this._saveState
      ? this._saveState.get('craftsmanship_dimensions_unlocked')
      : null;

    if (Array.isArray(stored) && stored.length > 0) {
      // Filter to only known dimension names for safety.
      return stored.filter(d => ALL_DIMENSIONS.includes(d));
    }
    return [...DEFAULT_UNLOCKED_DIMENSIONS];
  }

  /**
   * Compute a single dimension score from the real source systems.
   * Returns null on any failure (null-safe contract).
   * @param {string} dimension
   * @param {Object} opts
   * @returns {number|null}
   * @private
   */
  _computeDimensionScore(dimension, { pricingTier, partsCost, faultInstanceIds }) {
    try {
      switch (dimension) {
        case 'cosmetic':
          return this._cosmeticScore();
        case 'mechanical':
          return this._mechanicalScore();
        case 'diagnostic':
          return this._diagnosticScore(faultInstanceIds);
        case 'economic':
          return this._economicScore(pricingTier, partsCost);
        default:
          console.warn(`[JobQualityAggregator] Unknown dimension '${dimension}' — skipped.`);
          return null;
      }
    } catch (err) {
      console.warn(`[JobQualityAggregator] Failed to compute '${dimension}' score: ${err.message} — dimension excluded from composite.`);
      return null;
    }
  }

  /**
   * Cosmetic score: (strap.complete + crystal.complete + case.complete) / 3 × 100
   * Yields discrete values 0%, 33%, 67%, or 100% only (3 equal-weight boolean phases).
   * @returns {number|null}
   * @private
   */
  _cosmeticScore() {
    if (!this._cosmeticSummary) return null;

    const state = this._cosmeticSummary.getSummaryState();
    if (!state || !state.strap || !state.crystal || !state.case) {
      console.warn('[JobQualityAggregator] CosmeticRestorationSummary returned unexpected state — cosmetic dimension excluded.');
      return null;
    }

    const completed = (state.strap.complete ? 1 : 0)
                    + (state.crystal.complete ? 1 : 0)
                    + (state.case.complete ? 1 : 0);

    return Math.round((completed / 3) * 100);
  }

  /**
   * Mechanical score: faultsFixed / totalParts × 100
   * Guard: if totalParts === 0, defaults to 100% (nothing to fix = perfect).
   * @returns {number|null}
   * @private
   */
  _mechanicalScore() {
    if (!this._completionState) return null;

    let summary;
    // Accept both CompletionScreenState instances and plain objects.
    if (typeof this._completionState.getSessionSummary === 'function') {
      summary = this._completionState.getSessionSummary();
    } else {
      summary = this._completionState;
    }

    const { faultsFixed, totalParts } = summary;
    if (totalParts === undefined || totalParts === null) {
      console.warn('[JobQualityAggregator] CompletionScreenState totalParts missing — mechanical dimension excluded.');
      return null;
    }
    if (totalParts === 0) return 100;

    return Math.round((faultsFixed / totalParts) * 100);
  }

  /**
   * Diagnostic score: faultsWithoutHints / totalFaults × 100
   * Edge case: empty faultInstanceIds → 100% (no faults = no hints possible).
   * @param {string[]} faultInstanceIds
   * @returns {number|null}
   * @private
   */
  _diagnosticScore(faultInstanceIds) {
    if (!Array.isArray(faultInstanceIds)) return null;
    if (faultInstanceIds.length === 0) return 100;
    if (!this._hintSystem) return null;

    const faultsWithoutHints = faultInstanceIds.filter(
      id => !this._hintSystem.wasHintUsed(id)
    ).length;

    return Math.round((faultsWithoutHints / faultInstanceIds.length) * 100);
  }

  /**
   * Economic score: Math.max(0, (revenue − partsCost) / revenue × 100)
   * Guard: revenue === 0 → 100% (no revenue expected = not penalised).
   * Cozy Mode: reads cozy_mode_enabled from saveState; effective partsCost = 0 when cozy.
   * @param {string} pricingTier
   * @param {number} partsCost
   * @returns {number|null}
   * @private
   */
  _economicScore(pricingTier, partsCost) {
    if (!pricingTier) return null;

    let revenue;
    try {
      revenue = LedgerManager.revenueForTier(pricingTier);
    } catch {
      console.warn(`[JobQualityAggregator] Unknown pricingTier '${pricingTier}' — economic dimension excluded.`);
      return null;
    }

    if (revenue === 0) return 100;

    // Cozy Mode: parts cost is not a real deduction.
    const cozyMode = this._saveState ? (this._saveState.get('cozy_mode_enabled') || false) : false;
    const effectiveCost = cozyMode ? 0 : (partsCost || 0);

    return Math.round(Math.max(0, (revenue - effectiveCost) / revenue * 100));
  }
}

module.exports = { JobQualityAggregator, TIERS, ALL_DIMENSIONS, DEFAULT_UNLOCKED_DIMENSIONS };
