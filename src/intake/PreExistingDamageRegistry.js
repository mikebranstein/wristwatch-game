/**
 * PreExistingDamageRegistry — pre-existing damage flagging system (Issue #149).
 *
 * Responsibilities (AC3 — Issue #149):
 *   - Allow a player to flag any functional-test finding or visual finding
 *     as "pre-existing damage" during the intake phase.
 *   - Store flagged items with their estimated cost impact so the
 *     ScopeNegotiationScreen can display them as line items (AC3).
 *   - Provide the full list of flagged items for the scope negotiation summary.
 *   - Ensure items can only be flagged once (idempotent — no duplicates).
 *
 * Design constraints:
 *   - This module is purely a data registry; it does not render UI.
 *   - Cost deltas are provided by the caller (game rule-based pricing —
 *     not a pricing engine).
 *   - All methods are synchronous.
 */

'use strict';

/**
 * @typedef {Object} PreExistingFinding
 * @property {string}  findingId       — unique identifier for this finding
 * @property {string}  sourceTestId    — which functional test (or 'visual') raised it
 * @property {string}  label           — human-readable description
 * @property {string}  result          — the test result that caused the flag
 * @property {number}  costDelta       — estimated cost impact (positive = additional charge)
 * @property {boolean} flaggedByPlayer — always true once in registry
 */

class PreExistingDamageRegistry {
  constructor() {
    /** @type {Map<string, PreExistingFinding>} */
    this._findings = new Map();
  }

  // ── Flagging ─────────────────────────────────────────────────────────────────

  /**
   * Flag a finding as pre-existing damage.
   *
   * Idempotent: calling again with the same findingId updates the entry.
   *
   * @param {string} findingId     — stable ID for this finding (e.g. 'crown_wind_broken_001')
   * @param {string} sourceTestId  — test that surfaced the finding
   * @param {string} label         — display label
   * @param {string} result        — test result string
   * @param {number} costDelta     — estimated cost adjustment (≥0)
   * @returns {PreExistingFinding}
   */
  flagFinding(findingId, sourceTestId, label, result, costDelta) {
    if (typeof costDelta !== 'number' || costDelta < 0) {
      throw new Error(
        `PreExistingDamageRegistry: costDelta must be a non-negative number (got ${costDelta}).`
      );
    }
    const finding = {
      findingId,
      sourceTestId,
      label,
      result,
      costDelta,
      flaggedByPlayer: true,
    };
    this._findings.set(findingId, finding);
    return finding;
  }

  /**
   * Remove a pre-existing flag (player changes their mind).
   * @param {string} findingId
   * @returns {boolean} true if the flag existed and was removed
   */
  unflagFinding(findingId) {
    return this._findings.delete(findingId);
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  /**
   * Whether a given findingId is currently flagged.
   * @param {string} findingId
   * @returns {boolean}
   */
  isFlagged(findingId) {
    return this._findings.has(findingId);
  }

  /**
   * Return all currently flagged findings as an array (for scope negotiation line items — AC3).
   * @returns {PreExistingFinding[]}
   */
  getAllFlaggedFindings() {
    return Array.from(this._findings.values());
  }

  /**
   * Total estimated cost delta across all flagged findings.
   * Used by ScopeNegotiationScreen to compute the adjusted job estimate.
   * @returns {number}
   */
  getTotalCostDelta() {
    let total = 0;
    for (const f of this._findings.values()) {
      total += f.costDelta;
    }
    return total;
  }

  /**
   * Count of flagged findings.
   * @returns {number}
   */
  count() {
    return this._findings.size;
  }

  /**
   * True if there is at least one flagged finding.
   * @returns {boolean}
   */
  hasFindings() {
    return this._findings.size > 0;
  }
}

module.exports = { PreExistingDamageRegistry };
