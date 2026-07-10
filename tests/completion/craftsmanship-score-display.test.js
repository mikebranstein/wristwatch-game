/**
 * Tests: CraftsmanshipScoreDisplay — Phase 2 Display Coverage (Issue #255)
 *
 * Verifies that CraftsmanshipScoreDisplay correctly renders Phase 2 dimension
 * labels and handles graceful degradation when Phase 2 scores are absent.
 *
 * Covers:
 *   AC6  — "Timing Calibration" label rendered for timing_calibration dimension
 *   AC7  — "Sourcing Quality" label rendered for sourcing_quality dimension
 *   AC8  — 6 dimension rows when all Phase 1 + Phase 2 scores provided
 *   AC9  — Graceful degradation to 4 rows when Phase 2 scores are absent
 *
 * Also exercises core component behaviour (constructor, render, toggleSubscores,
 * isExpanded, clear, personalBest, improvementTip, renderProgressBar) to meet
 * the ≥ 70% statement/branch/function/line coverage requirement.
 *
 * Run with: npm test
 */

'use strict';

const {
  CraftsmanshipScoreDisplay,
  renderProgressBar,
  TIER_NARRATIVES,
  IMPROVEMENT_TIPS,
  PERFECT_SCORE_MESSAGE,
} = require('../../src/completion/CraftsmanshipScoreDisplay');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal result object for use with render().
 *
 * @param {Object} overrides
 * @returns {Object}
 */
function makeResult(overrides = {}) {
  return Object.assign({
    score:               80,
    tier:                'Master',
    dimensionScores:     { cosmetic: 80, mechanical: 80, diagnostic: 80, economic: 80 },
    unlockedDimensions:  ['cosmetic', 'mechanical', 'diagnostic', 'economic'],
  }, overrides);
}

/**
 * Build a CraftsmanshipScoreDisplay that captures the last view model passed to
 * renderFn — convenient for assertions.
 *
 * @returns {{ display: CraftsmanshipScoreDisplay, lastVM: () => Object }}
 */
function makeDisplay() {
  let captured = null;
  const display = new CraftsmanshipScoreDisplay((vm) => { captured = vm; });
  return { display, lastVM: () => captured };
}

// ---------------------------------------------------------------------------
// renderProgressBar — exported utility
// ---------------------------------------------------------------------------

describe('renderProgressBar — exported utility', () => {
  it('renders a full bar at 100%', () => {
    expect(renderProgressBar(100)).toBe('██████████ 100%');
  });

  it('renders an empty bar at 0%', () => {
    expect(renderProgressBar(0)).toBe('░░░░░░░░░░ 0%');
  });

  it('renders a partial bar at 72% (7 filled, 3 empty)', () => {
    const bar = renderProgressBar(72);
    expect(bar).toContain('72%');
    expect(bar).toBe('███████░░░ 72%');
  });

  it('renders a partial bar at 85% (9 filled, 1 empty)', () => {
    const bar = renderProgressBar(85);
    expect(bar).toContain('85%');
    expect(bar).toBe('█████████░ 85%');
  });

  it('renders 50% as 5 filled and 5 empty', () => {
    expect(renderProgressBar(50)).toBe('█████░░░░░ 50%');
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — constructor', () => {
  it('throws when renderFn is not a function', () => {
    expect(() => new CraftsmanshipScoreDisplay(null)).toThrow(
      'CraftsmanshipScoreDisplay requires a renderFn function.'
    );
    expect(() => new CraftsmanshipScoreDisplay('not a fn')).toThrow();
    expect(() => new CraftsmanshipScoreDisplay(undefined)).toThrow();
  });

  it('accepts a valid renderFn without clearFn', () => {
    expect(() => new CraftsmanshipScoreDisplay(() => {})).not.toThrow();
  });

  it('accepts a valid renderFn and clearFn', () => {
    expect(() => new CraftsmanshipScoreDisplay(() => {}, () => {})).not.toThrow();
  });

  it('starts with subscoresExpanded = false', () => {
    const { display } = makeDisplay();
    expect(display.isExpanded()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleSubscores / isExpanded / clear
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — toggleSubscores / isExpanded / clear', () => {
  it('toggleSubscores flips from false to true', () => {
    const { display } = makeDisplay();
    expect(display.toggleSubscores()).toBe(true);
    expect(display.isExpanded()).toBe(true);
  });

  it('toggleSubscores flips back to false on second call', () => {
    const { display } = makeDisplay();
    display.toggleSubscores();
    expect(display.toggleSubscores()).toBe(false);
    expect(display.isExpanded()).toBe(false);
  });

  it('clear resets expanded state to false', () => {
    const { display } = makeDisplay();
    display.toggleSubscores();
    expect(display.isExpanded()).toBe(true);
    display.clear();
    expect(display.isExpanded()).toBe(false);
  });

  it('clear calls the clearFn', () => {
    let cleared = false;
    const display = new CraftsmanshipScoreDisplay(() => {}, () => { cleared = true; });
    display.clear();
    expect(cleared).toBe(true);
  });

  it('render passes subscoresExpanded = false when not expanded', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult());
    expect(lastVM().subscoresExpanded).toBe(false);
  });

  it('render passes subscoresExpanded = true when expanded', () => {
    const { display, lastVM } = makeDisplay();
    display.toggleSubscores();
    display.render(makeResult());
    expect(lastVM().subscoresExpanded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC6 — "Timing Calibration" label rendered for timing_calibration dimension
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — AC6: "Timing Calibration" label', () => {
  it('AC6: renders label "Timing Calibration" for timing_calibration dimension', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    { timing_calibration: 72 },
      unlockedDimensions: ['timing_calibration'],
    }));

    const rows = lastVM().dimensionRows;
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Timing Calibration');
  });

  it('AC6: progress bar for timing_calibration score of 72 contains "72%"', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    { timing_calibration: 72 },
      unlockedDimensions: ['timing_calibration'],
    }));

    const rows = lastVM().dimensionRows;
    expect(rows[0].bar).toContain('72%');
    expect(rows[0].score).toBe(72);
    expect(rows[0].available).toBe(true);
  });

  it('AC6: timing_calibration row is available when score is numeric', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    { timing_calibration: 100 },
      unlockedDimensions: ['timing_calibration'],
    }));

    expect(lastVM().dimensionRows[0].available).toBe(true);
    expect(lastVM().dimensionRows[0].bar).toContain('100%');
  });
});

// ---------------------------------------------------------------------------
// AC7 — "Sourcing Quality" label rendered for sourcing_quality dimension
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — AC7: "Sourcing Quality" label', () => {
  it('AC7: renders label "Sourcing Quality" for sourcing_quality dimension', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    { sourcing_quality: 85 },
      unlockedDimensions: ['sourcing_quality'],
    }));

    const rows = lastVM().dimensionRows;
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Sourcing Quality');
  });

  it('AC7: progress bar for sourcing_quality score of 85 contains "85%"', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    { sourcing_quality: 85 },
      unlockedDimensions: ['sourcing_quality'],
    }));

    const rows = lastVM().dimensionRows;
    expect(rows[0].bar).toContain('85%');
    expect(rows[0].score).toBe(85);
    expect(rows[0].available).toBe(true);
  });

  it('AC7: sourcing_quality row with score 0 shows 0% bar', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    { sourcing_quality: 0 },
      unlockedDimensions: ['sourcing_quality'],
    }));

    const rows = lastVM().dimensionRows;
    expect(rows[0].bar).toContain('0%');
    expect(rows[0].score).toBe(0);
    expect(rows[0].available).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC8 — 6 dimension rows when all Phase 1 + Phase 2 scores provided
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — AC8: 6 dimension rows for full Phase 1 + Phase 2', () => {
  const allSixDims = ['cosmetic', 'mechanical', 'diagnostic', 'economic', 'timing_calibration', 'sourcing_quality'];
  const allSixScores = {
    cosmetic:           90,
    mechanical:         80,
    diagnostic:         70,
    economic:           60,
    timing_calibration: 72,
    sourcing_quality:   85,
  };

  it('AC8: renders exactly 6 dimension rows when all 6 scores are provided', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      score:               76,
      tier:                'Master',
      dimensionScores:     allSixScores,
      unlockedDimensions:  allSixDims,
    }));
    expect(lastVM().dimensionRows).toHaveLength(6);
  });

  it('AC8: rows appear in order — cosmetic, mechanical, diagnostic, economic, timing_calibration, sourcing_quality', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      dimensionScores:    allSixScores,
      unlockedDimensions: allSixDims,
    }));

    const labels = lastVM().dimensionRows.map(r => r.label);
    expect(labels[0]).toBe('Cosmetic Restoration');
    expect(labels[1]).toBe('Mechanical Precision');
    expect(labels[2]).toBe('Diagnostic Accuracy');
    expect(labels[3]).toBe('Economic Efficiency');
    expect(labels[4]).toBe('Timing Calibration');
    expect(labels[5]).toBe('Sourcing Quality');
  });

  it('AC8: each row carries the correct score and a non-empty progress bar', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      dimensionScores:    allSixScores,
      unlockedDimensions: allSixDims,
    }));

    const rows = lastVM().dimensionRows;
    expect(rows[4].score).toBe(72);
    expect(rows[4].bar).toContain('72%');
    expect(rows[5].score).toBe(85);
    expect(rows[5].bar).toContain('85%');

    rows.forEach(row => {
      expect(row.available).toBe(true);
      expect(typeof row.bar).toBe('string');
      expect(row.bar.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// AC9 — Graceful degradation to 4 rows when Phase 2 scores are absent
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — AC9: graceful degradation to 4 rows without Phase 2', () => {
  it('AC9: renders exactly 4 rows when only Phase 1 dimensions are unlocked', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      score:               80,
      tier:                'Master',
      dimensionScores:     { cosmetic: 90, mechanical: 80, diagnostic: 70, economic: 60 },
      unlockedDimensions:  ['cosmetic', 'mechanical', 'diagnostic', 'economic'],
    }));

    expect(lastVM().dimensionRows).toHaveLength(4);
  });

  it('AC9: no timing_calibration or sourcing_quality rows present without Phase 2', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    { cosmetic: 90, mechanical: 80, diagnostic: 70, economic: 60 },
      unlockedDimensions: ['cosmetic', 'mechanical', 'diagnostic', 'economic'],
    }));

    const labels = lastVM().dimensionRows.map(r => r.label);
    expect(labels).not.toContain('Timing Calibration');
    expect(labels).not.toContain('Sourcing Quality');
  });

  it('AC9: does not crash when unlockedDimensions is empty', () => {
    const { display, lastVM } = makeDisplay();

    expect(() => {
      display.render(makeResult({
        dimensionScores:    {},
        unlockedDimensions: [],
      }));
    }).not.toThrow();

    expect(lastVM().dimensionRows).toHaveLength(0);
  });

  it('AC9: does not crash when unlockedDimensions is null/undefined', () => {
    const { display, lastVM } = makeDisplay();

    expect(() => {
      display.render(makeResult({
        dimensionScores:    {},
        unlockedDimensions: null,
      }));
    }).not.toThrow();

    expect(lastVM().dimensionRows).toHaveLength(0);
  });

  it('AC9: row with no matching score shows "(unavailable)" bar and available=false', () => {
    const { display, lastVM } = makeDisplay();

    display.render(makeResult({
      dimensionScores:    {},   // no scores provided
      unlockedDimensions: ['cosmetic'],
    }));

    const row = lastVM().dimensionRows[0];
    expect(row.available).toBe(false);
    expect(row.bar).toBe('(unavailable)');
    expect(row.score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dimension labels for Phase 1 dimensions
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — Phase 1 dimension labels', () => {
  it('renders "Cosmetic Restoration" for cosmetic', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      dimensionScores: { cosmetic: 80 }, unlockedDimensions: ['cosmetic'],
    }));
    expect(lastVM().dimensionRows[0].label).toBe('Cosmetic Restoration');
  });

  it('renders "Mechanical Precision" for mechanical', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      dimensionScores: { mechanical: 80 }, unlockedDimensions: ['mechanical'],
    }));
    expect(lastVM().dimensionRows[0].label).toBe('Mechanical Precision');
  });

  it('renders "Diagnostic Accuracy" for diagnostic', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      dimensionScores: { diagnostic: 80 }, unlockedDimensions: ['diagnostic'],
    }));
    expect(lastVM().dimensionRows[0].label).toBe('Diagnostic Accuracy');
  });

  it('renders "Economic Efficiency" for economic', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      dimensionScores: { economic: 80 }, unlockedDimensions: ['economic'],
    }));
    expect(lastVM().dimensionRows[0].label).toBe('Economic Efficiency');
  });

  it('returns the raw key as label for an unknown dimension', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({
      dimensionScores: { unknown_dim: 50 }, unlockedDimensions: ['unknown_dim'],
    }));
    expect(lastVM().dimensionRows[0].label).toBe('unknown_dim');
  });
});

// ---------------------------------------------------------------------------
// View model — tier narrative, improvementTip, personalBest
// ---------------------------------------------------------------------------

describe('CraftsmanshipScoreDisplay — view model fields', () => {
  it('narrative matches TIER_NARRATIVES for the given tier', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({ tier: 'Grandmaster', score: 100 }));
    expect(lastVM().narrative).toBe(TIER_NARRATIVES.Grandmaster);
  });

  it('narrative is empty string for an unknown tier', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({ tier: 'Unknown' }));
    expect(lastVM().narrative).toBe('');
  });

  it('improvementTip is PERFECT_SCORE_MESSAGE when score >= 100', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({ score: 100, tier: 'Grandmaster' }));
    expect(lastVM().improvementTip).toBe(PERFECT_SCORE_MESSAGE);
  });

  it('improvementTip uses IMPROVEMENT_TIPS[tier] when score < 100', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({ score: 80, tier: 'Master' }));
    expect(lastVM().improvementTip).toBe(IMPROVEMENT_TIPS.Master);
  });

  it('personalBest is null when personalBest argument is null (first time)', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult(), null);
    expect(lastVM().personalBest).toBeNull();
  });

  it('personalBest shows new-best message when score exceeds previous', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({ score: 90, tier: 'Grandmaster' }), { score: 75, tier: 'Master' });
    expect(lastVM().personalBest.isNewBest).toBe(true);
    expect(lastVM().personalBest.message).toContain('New personal best');
  });

  it('personalBest shows unchanged message when score does not exceed previous', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({ score: 70, tier: 'Master' }), { score: 85, tier: 'Grandmaster' });
    expect(lastVM().personalBest.isNewBest).toBe(false);
    expect(lastVM().personalBest.message).toContain('Personal best');
    expect(lastVM().personalBest.message).toContain('unchanged');
  });

  it('view model carries score and tier from result', () => {
    const { display, lastVM } = makeDisplay();
    display.render(makeResult({ score: 65, tier: 'Journeyman' }));
    expect(lastVM().score).toBe(65);
    expect(lastVM().tier).toBe('Journeyman');
  });
});

// ---------------------------------------------------------------------------
// Exported constants sanity checks
// ---------------------------------------------------------------------------

describe('Exported constants', () => {
  it('TIER_NARRATIVES has entries for all four tiers', () => {
    expect(typeof TIER_NARRATIVES.Grandmaster).toBe('string');
    expect(typeof TIER_NARRATIVES.Master).toBe('string');
    expect(typeof TIER_NARRATIVES.Journeyman).toBe('string');
    expect(typeof TIER_NARRATIVES.Apprentice).toBe('string');
  });

  it('IMPROVEMENT_TIPS.Grandmaster is null (perfect score → congratulatory message instead)', () => {
    expect(IMPROVEMENT_TIPS.Grandmaster).toBeNull();
  });

  it('PERFECT_SCORE_MESSAGE contains "Perfect"', () => {
    expect(PERFECT_SCORE_MESSAGE).toContain('Perfect');
  });
});
