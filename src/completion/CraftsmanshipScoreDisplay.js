/**
 * CraftsmanshipScoreDisplay — Delivery-screen UI component for holistic craftsmanship score.
 *
 * Issue #253 — Holistic Craftsmanship Score Phase 1
 *
 * Renders the hybrid craftsmanship score format at job delivery:
 *   - Tier label + 1–2 sentence narrative referencing specific achievement
 *   - Expandable dimensional subscores with progress-bar visualisation (████████░░ 80%)
 *   - Personal best comparison (omitted when craftsmanship_personal_best === null)
 *   - One actionable improvement tip (congratulatory message when score = 100%)
 *
 * Design constraints:
 *   - Pure rendering module — no side effects, no save-state mutation.
 *   - Subscores collapsed by default; expandable on player interaction.
 *   - Personal best section omitted entirely when prev === null (graceful degradation).
 *   - Improvement tip absent when score = 100%; congratulatory message shown instead.
 *   - Progress bars use Unicode block characters (████████░░) for text-layer rendering.
 *
 * Acceptance Criteria covered:
 *   AC2 — Tier label, narrative, expandable subscores, personal best comparison, improvement tip.
 */

'use strict';

// ---------------------------------------------------------------------------
// Tier narratives (AC2): 1–2 sentences referencing the specific achievement
// ---------------------------------------------------------------------------

const TIER_NARRATIVES = {
  Grandmaster: 'Flawless work on every dimension — this is the hallmark of a true master craftsman. A perfect restoration that will stand the test of time.',
  Master:      'Exceptional craftsmanship across the board — the customer will notice the care in every detail. Only the finest workshops achieve results like this.',
  Journeyman:  'Solid work that meets professional standards — room to grow, but you\'re on the right track. Each job brings you closer to mastery.',
  Apprentice:  'A learning experience worth building on — every expert started exactly here. Focus on the dimensions with the most room for improvement.',
};

// ---------------------------------------------------------------------------
// Improvement tips (AC2): one actionable tip per tier
// ---------------------------------------------------------------------------

const IMPROVEMENT_TIPS = {
  Grandmaster: null,   // score = 100% → congratulatory message shown instead
  Master:      'Tip: review your diagnostic approach on the next job — even one saved hint lifts you to Grandmaster.',
  Journeyman:  'Tip: complete all cosmetic phases and fix more faults to break into the Master tier.',
  Apprentice:  'Tip: start by unlocking and completing the cosmetic restoration phases — they\'re the fastest score gain available.',
};

const PERFECT_SCORE_MESSAGE = '🎉 Perfect restoration! Every dimension is at 100% — congratulations!';

// ---------------------------------------------------------------------------
// Progress-bar renderer
// ---------------------------------------------------------------------------

const BAR_LENGTH = 10;
const BAR_FILL   = '█';
const BAR_EMPTY  = '░';

/**
 * Render a Unicode progress bar for a percentage value.
 * @param {number} pct  0–100
 * @returns {string}   e.g. "████████░░ 80%"
 */
function renderProgressBar(pct) {
  const filled = Math.round((pct / 100) * BAR_LENGTH);
  const empty  = BAR_LENGTH - filled;
  return BAR_FILL.repeat(filled) + BAR_EMPTY.repeat(empty) + ` ${Math.round(pct)}%`;
}

// ---------------------------------------------------------------------------
// CraftsmanshipScoreDisplay
// ---------------------------------------------------------------------------

class CraftsmanshipScoreDisplay {
  /**
   * @param {Function} renderFn    Hook: (viewModel) => void — called to render the score UI.
   * @param {Function} [clearFn]   Hook: () => void — called to clear the score UI.
   */
  constructor(renderFn, clearFn = () => {}) {
    if (typeof renderFn !== 'function') {
      throw new Error('CraftsmanshipScoreDisplay requires a renderFn function.');
    }
    this._renderFn = renderFn;
    this._clearFn  = clearFn;
    this._expanded = false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Render the craftsmanship score display.
   *
   * @param {Object}      result          From JobQualityAggregator.computeScore()
   * @param {number}      result.score
   * @param {string}      result.tier
   * @param {Object}      result.dimensionScores
   * @param {string[]}    result.unlockedDimensions
   * @param {Object|null} personalBest    craftsmanship_personal_best save field (null = first time)
   */
  render(result, personalBest = null) {
    const vm = this._buildViewModel(result, personalBest);
    this._renderFn(vm);
  }

  /**
   * Toggle the dimensional subscore expansion state.
   * When expanded, subscores are visible; when collapsed, only tier + narrative show.
   * @returns {boolean} New expanded state.
   */
  toggleSubscores() {
    this._expanded = !this._expanded;
    return this._expanded;
  }

  /** Whether dimensional subscores are currently expanded. @returns {boolean} */
  isExpanded() {
    return this._expanded;
  }

  /** Clear the display and reset expansion state. */
  clear() {
    this._expanded = false;
    this._clearFn();
  }

  // ---------------------------------------------------------------------------
  // View-model builder
  // ---------------------------------------------------------------------------

  /**
   * Build the view model passed to renderFn.
   *
   * @param {Object}      result
   * @param {Object|null} personalBest
   * @returns {Object}
   * @private
   */
  _buildViewModel(result, personalBest) {
    const { score, tier, dimensionScores, unlockedDimensions } = result;

    // Build dimension subscore lines (progress-bar format)
    const dimensionRows = (unlockedDimensions || []).map(dim => {
      const pct = dimensionScores[dim] !== undefined ? dimensionScores[dim] : null;
      return {
        label:      _dimensionLabel(dim),
        score:      pct,
        bar:        pct !== null ? renderProgressBar(pct) : '(unavailable)',
        available:  pct !== null,
      };
    });

    // Personal best section (omit entirely if null — graceful degradation)
    let personalBestSection = null;
    if (personalBest !== null && personalBest !== undefined) {
      const isNewBest = score > personalBest.score;
      personalBestSection = {
        previousScore: personalBest.score,
        previousTier:  personalBest.tier,
        isNewBest,
        message: isNewBest
          ? `🏆 New personal best! (was ${personalBest.tier} at ${personalBest.score}%)`
          : `Personal best: ${personalBest.tier} at ${personalBest.score}% (unchanged)`,
      };
    }

    // Improvement tip
    const isPerfect   = score >= 100;
    const tipContent  = isPerfect ? PERFECT_SCORE_MESSAGE : (IMPROVEMENT_TIPS[tier] || null);

    return {
      score,
      tier,
      narrative:         TIER_NARRATIVES[tier] || '',
      subscoresExpanded: this._expanded,
      dimensionRows,
      personalBest:      personalBestSection,
      improvementTip:    tipContent,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Human-readable label for each dimension identifier.
 * @param {string} dim
 * @returns {string}
 */
function _dimensionLabel(dim) {
  switch (dim) {
    case 'cosmetic':    return 'Cosmetic Restoration';
    case 'mechanical':  return 'Mechanical Precision';
    case 'diagnostic':  return 'Diagnostic Accuracy';
    case 'economic':    return 'Economic Efficiency';
    default:            return dim;
  }
}

module.exports = {
  CraftsmanshipScoreDisplay,
  renderProgressBar,
  TIER_NARRATIVES,
  IMPROVEMENT_TIPS,
  PERFECT_SCORE_MESSAGE,
};
