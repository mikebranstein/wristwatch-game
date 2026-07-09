/**
 * TooltipSystem — manages inline plain-language tooltips for every horology
 * technical term in the diagnosis UI.
 *
 * AC3: Every technical term in the diagnosis screen must surface a tooltip
 * with a plain-language definition on hover/tap.  This system uses the
 * HorologyGlossary as the single source of truth.
 *
 * Usage pattern (framework-agnostic):
 *   const ts = new TooltipSystem();
 *   const tip = ts.getTooltip('mainspring');  // { term, definition }
 *   if (!tip) throw new Error('Term not in glossary — add it before using in UI');
 */

const { getTooltip, getAllTermKeys, hasTooltip } = require('./HorologyGlossary');

class TooltipSystem {
  constructor() {
    // Bind glossary helpers for convenience
    this._getTooltip = getTooltip;
    this._hasTooltip = hasTooltip;
    this._getAllTermKeys = getAllTermKeys;
  }

  /**
   * Returns the tooltip entry for the given term key, or null if not found.
   * @param {string} termKey
   * @returns {{term: string, definition: string}|null}
   */
  getTooltip(termKey) {
    return this._getTooltip(termKey);
  }

  /**
   * Returns true when a term is covered by the glossary.
   * @param {string} termKey
   * @returns {boolean}
   */
  hasTooltip(termKey) {
    return this._hasTooltip(termKey);
  }

  /**
   * Returns all known tooltip term keys.
   * Used by QA (Scenario 5) to audit tooltip coverage completeness.
   * @returns {string[]}
   */
  getAllRegisteredTerms() {
    return this._getAllTermKeys();
  }

  /**
   * Validates that every term in the supplied list has a registered tooltip.
   * Throws an error listing any uncovered terms.
   *
   * Intended use: call this at game startup / in CI against the diagnosed-UI
   * term inventory to detect AC3 regressions early.
   *
   * @param {string[]} termsUsedInUI — all term keys referenced in diagnosis UI copy
   * @returns {true}
   * @throws {Error} if any term is missing a tooltip
   */
  validateCoverage(termsUsedInUI) {
    const missing = termsUsedInUI.filter((t) => !this._hasTooltip(t));
    if (missing.length > 0) {
      throw new Error(
        `AC3 violation — missing tooltip definitions for: ${missing.join(', ')}`
      );
    }
    return true;
  }
}

module.exports = { TooltipSystem };
