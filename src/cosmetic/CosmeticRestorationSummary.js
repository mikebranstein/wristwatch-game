/**
 * CosmeticRestorationSummary — tracks and renders the completion state for all
 * three cosmetic restoration phases (strap swap, crystal replacement, case polishing).
 *
 * Implements: Issue #152 (Case Polishing — Phase 3)
 *
 * Called by CosmeticRestorationFlow after each phase completes, and rendered on
 * the final restoration summary screen.
 *
 * Acceptance criteria covered:
 *   AC5  — all three cosmetic phases are reflected correctly in the final summary;
 *           restoration is marked as cosmetically complete only when all three
 *           phases are confirmed complete.
 *   AC9  — summary screen shows: new strap, clean crystal, polished case →
 *           'Cosmetically Restored' status displayed; no missing component states.
 */

/** Valid phase identifiers for the cosmetic restoration arc. */
const PHASES = {
  STRAP:   'strap',    // Phase 1 — Strap Swap (#143)
  CRYSTAL: 'crystal',  // Phase 2 — Crystal Replacement (#146)
  CASE:    'case',     // Phase 3 — Case Polishing (#152)
};

/** Status labels for display in the summary screen (AC9). */
const STATUS_LABELS = {
  COMPLETE:   'Cosmetically Restored',
  INCOMPLETE: 'Cosmetic Restoration Incomplete',
};

class CosmeticRestorationSummary {
  /**
   * @param {Function} renderSummary  Hook: (summaryState) => void — called to render the summary UI.
   * @param {Function} clearSummary   Hook: () => void — called to clear the summary UI.
   */
  constructor(renderSummary, clearSummary) {
    if (typeof renderSummary !== 'function') {
      throw new Error('CosmeticRestorationSummary requires a renderSummary function.');
    }
    if (typeof clearSummary !== 'function') {
      throw new Error('CosmeticRestorationSummary requires a clearSummary function.');
    }

    this._renderSummary = renderSummary;
    this._clearSummary  = clearSummary;

    // Track each phase state independently
    this._phaseState = {
      [PHASES.STRAP]:   { complete: false, label: 'Original Strap',   restoredLabel: 'New Strap'       },
      [PHASES.CRYSTAL]: { complete: false, label: 'Worn Crystal',      restoredLabel: 'Clean Crystal'   },
      [PHASES.CASE]:    { complete: false, label: 'Worn/Scratched Case', restoredLabel: 'Polished Case' },
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Mark a restoration phase as complete.
   * Idempotent — marking the same phase complete twice has no effect.
   *
   * @param {string} phase  One of PHASES.STRAP, PHASES.CRYSTAL, or PHASES.CASE.
   */
  markPhaseComplete(phase) {
    if (!Object.prototype.hasOwnProperty.call(this._phaseState, phase)) {
      throw new Error(`Unknown cosmetic restoration phase: '${phase}'. Use PHASES constants.`);
    }
    this._phaseState[phase].complete = true;
  }

  /**
   * Returns whether all three cosmetic phases are complete (AC5 gate condition).
   * @returns {boolean}
   */
  isFullyCosmeticallyRestored() {
    return (
      this._phaseState[PHASES.STRAP].complete &&
      this._phaseState[PHASES.CRYSTAL].complete &&
      this._phaseState[PHASES.CASE].complete
    );
  }

  /**
   * Get the current summary state object.
   * Used by the render hook and by tests to assert phase states (AC5, AC9).
   *
   * @returns {{
   *   strap:   { complete: boolean, displayLabel: string },
   *   crystal: { complete: boolean, displayLabel: string },
   *   case:    { complete: boolean, displayLabel: string },
   *   overallStatus: string,
   *   isCosmeticallyRestored: boolean
   * }}
   */
  getSummaryState() {
    const strapState   = this._phaseState[PHASES.STRAP];
    const crystalState = this._phaseState[PHASES.CRYSTAL];
    const caseState    = this._phaseState[PHASES.CASE];
    const restored     = this.isFullyCosmeticallyRestored();

    return {
      strap: {
        complete:     strapState.complete,
        displayLabel: strapState.complete ? strapState.restoredLabel : strapState.label,
      },
      crystal: {
        complete:     crystalState.complete,
        displayLabel: crystalState.complete ? crystalState.restoredLabel : crystalState.label,
      },
      case: {
        complete:     caseState.complete,
        displayLabel: caseState.complete ? caseState.restoredLabel : caseState.label,
      },
      overallStatus:         restored ? STATUS_LABELS.COMPLETE : STATUS_LABELS.INCOMPLETE,
      isCosmeticallyRestored: restored,
    };
  }

  /**
   * Render the summary screen with the current phase states.
   * The renderSummary hook receives the full state object (AC9).
   */
  render() {
    const state = this.getSummaryState();
    this._renderSummary(state);
  }

  /**
   * Clear the summary screen and reset all phase states.
   * Called when navigating away from the summary.
   */
  reset() {
    for (const phase of Object.keys(this._phaseState)) {
      this._phaseState[phase].complete = false;
    }
    this._clearSummary();
  }
}

module.exports = { CosmeticRestorationSummary, PHASES, STATUS_LABELS };
