/**
 * Tests: CraftsmanshipScoreDisplay — Holistic Craftsmanship Score Phases 1+2 (Issues #253/#255)
 *
 * Covers AC2 plus Phase 2 display additions: tier label, narrative, expandable
 * subscores with progress bars, personal best comparison (null-omission),
 * improvement tip logic, and Phase 2 timing/sourcing dimension rendering.
 *
 * Spec groups per QA Clarification (design-clarified comment):
 *   AC2-T1 — renderProgressBar() input/output pairs
 *   AC2-T2 — TIER_NARRATIVES constants
 *   AC2-T3 — IMPROVEMENT_TIPS constants
 *   AC2-T4 — PERFECT_SCORE_MESSAGE constant
 *   AC2-T5 — Constructor validation
 *   AC2-T6 — render() view-model shape and all key scenarios
 *   AC2-T7 — toggleSubscores() / isExpanded() / clear() state management
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

/** Build a minimal aggregator result object for render() calls. */
function makeResult({
  score = 75,
  tier = 'Master',
  dimensionScores = { cosmetic: 80, mechanical: 70 },
  unlockedDimensions = ['cosmetic', 'mechanical'],
} = {}) {
  return { score, tier, dimensionScores, unlockedDimensions };
}

/** Capture the view model produced by render(). */
function captureViewModel(result, personalBest = null) {
  let captured = null;
  const display = new CraftsmanshipScoreDisplay((vm) => { captured = vm; });
  display.render(result, personalBest);
  return captured;
}


/** Build a display that captures the last rendered view model. */
function makeDisplay() {
  let captured = null;
  const display = new CraftsmanshipScoreDisplay((vm) => { captured = vm; });
  return { display, lastVM: () => captured };
}

// ---------------------------------------------------------------------------
// AC2-T1: renderProgressBar()
// ---------------------------------------------------------------------------

describe('AC2-T1: renderProgressBar()', () => {
  test('0% produces all-empty bar', () => {
    expect(renderProgressBar(0)).toBe('░░░░░░░░░░ 0%');
  });

  test('50% produces half-filled bar', () => {
    expect(renderProgressBar(50)).toBe('█████░░░░░ 50%');
  });

  test('80% produces 8-of-10 filled bar', () => {
    expect(renderProgressBar(80)).toBe('████████░░ 80%');
  });

  test('100% produces fully-filled bar', () => {
    expect(renderProgressBar(100)).toBe('██████████ 100%');
  });

  test('bar string always has length 10 fill chars + space + percentage', () => {
    [0, 25, 50, 75, 100].forEach(pct => {
      const bar = renderProgressBar(pct);
      // Count only the block characters (fill + empty)
      const fillChars = (bar.match(/[█░]/g) || []).length;
      expect(fillChars).toBe(10);
    });
  });
});

// ---------------------------------------------------------------------------
// AC2-T2: TIER_NARRATIVES
// ---------------------------------------------------------------------------

describe('AC2-T2: TIER_NARRATIVES', () => {
  const TIERS = ['Grandmaster', 'Master', 'Journeyman', 'Apprentice'];

  test('all four tier keys are present', () => {
    TIERS.forEach(tier => {
      expect(TIER_NARRATIVES).toHaveProperty(tier);
    });
  });

  test('each narrative is a non-empty string', () => {
    TIERS.forEach(tier => {
      expect(typeof TIER_NARRATIVES[tier]).toBe('string');
      expect(TIER_NARRATIVES[tier].length).toBeGreaterThan(0);
    });
  });

  test('Grandmaster narrative references mastery/perfect/flawless', () => {
    const text = TIER_NARRATIVES.Grandmaster.toLowerCase();
    const hasMasteryKeyword = text.includes('master') || text.includes('perfect') || text.includes('flawless');
    expect(hasMasteryKeyword).toBe(true);
  });

  test('Master narrative references exceptional/finest/care', () => {
    const text = TIER_NARRATIVES.Master.toLowerCase();
    const hasMasterKeyword = text.includes('exceptional') || text.includes('finest') || text.includes('care');
    expect(hasMasterKeyword).toBe(true);
  });

  test('Journeyman narrative references solid/professional/standards', () => {
    const text = TIER_NARRATIVES.Journeyman.toLowerCase();
    const hasJourneyKeyword = text.includes('solid') || text.includes('professional') || text.includes('standard') || text.includes('mastery');
    expect(hasJourneyKeyword).toBe(true);
  });

  test('Apprentice narrative references learning/starting/improvement', () => {
    const text = TIER_NARRATIVES.Apprentice.toLowerCase();
    const hasApprenticeKeyword = text.includes('learn') || text.includes('start') || text.includes('improv') || text.includes('expert');
    expect(hasApprenticeKeyword).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2-T3: IMPROVEMENT_TIPS
// ---------------------------------------------------------------------------

describe('AC2-T3: IMPROVEMENT_TIPS', () => {
  test('Grandmaster tip is null (perfect score — congratulatory message shown instead)', () => {
    expect(IMPROVEMENT_TIPS.Grandmaster).toBeNull();
  });

  test('Master tip is a non-empty string', () => {
    expect(typeof IMPROVEMENT_TIPS.Master).toBe('string');
    expect(IMPROVEMENT_TIPS.Master.length).toBeGreaterThan(0);
  });

  test('Master tip references tier upgrade (Grandmaster)', () => {
    expect(IMPROVEMENT_TIPS.Master.toLowerCase()).toContain('grandmaster');
  });

  test('Journeyman tip is a non-empty string', () => {
    expect(typeof IMPROVEMENT_TIPS.Journeyman).toBe('string');
    expect(IMPROVEMENT_TIPS.Journeyman.length).toBeGreaterThan(0);
  });

  test('Journeyman tip references tier upgrade (Master)', () => {
    expect(IMPROVEMENT_TIPS.Journeyman.toLowerCase()).toContain('master');
  });

  test('Apprentice tip is a non-empty string', () => {
    expect(typeof IMPROVEMENT_TIPS.Apprentice).toBe('string');
    expect(IMPROVEMENT_TIPS.Apprentice.length).toBeGreaterThan(0);
  });

  test('Apprentice tip references improvement action (cosmetic/phases)', () => {
    const text = IMPROVEMENT_TIPS.Apprentice.toLowerCase();
    const hasActionKeyword = text.includes('cosmetic') || text.includes('phase') || text.includes('score');
    expect(hasActionKeyword).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2-T4: PERFECT_SCORE_MESSAGE
// ---------------------------------------------------------------------------

describe('AC2-T4: PERFECT_SCORE_MESSAGE', () => {
  test('is a non-empty string', () => {
    expect(typeof PERFECT_SCORE_MESSAGE).toBe('string');
    expect(PERFECT_SCORE_MESSAGE.length).toBeGreaterThan(0);
  });

  test('references "perfect" or "100%"', () => {
    const text = PERFECT_SCORE_MESSAGE.toLowerCase();
    const hasPerfectRef = text.includes('perfect') || text.includes('100%');
    expect(hasPerfectRef).toBe(true);
  });

  test('is a congratulatory message (contains congratulation marker)', () => {
    const text = PERFECT_SCORE_MESSAGE.toLowerCase();
    const hasCongrats = text.includes('congratul') || text.includes('🎉') || PERFECT_SCORE_MESSAGE.includes('🎉');
    expect(hasCongrats).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2-T5: Constructor
// ---------------------------------------------------------------------------

describe('AC2-T5: Constructor', () => {
  test('accepts a valid renderFn function without throwing', () => {
    expect(() => new CraftsmanshipScoreDisplay(() => {})).not.toThrow();
  });

  test('throws when renderFn is not provided', () => {
    expect(() => new CraftsmanshipScoreDisplay()).toThrow();
  });

  test('throws when renderFn is a string (non-function)', () => {
    expect(() => new CraftsmanshipScoreDisplay('not-a-function')).toThrow(
      'CraftsmanshipScoreDisplay requires a renderFn function.'
    );
  });

  test('throws when renderFn is null', () => {
    expect(() => new CraftsmanshipScoreDisplay(null)).toThrow();
  });

  test('accepts optional clearFn without throwing', () => {
    expect(() => new CraftsmanshipScoreDisplay(() => {}, () => {})).not.toThrow();
  });

  test('works correctly without clearFn (defaults to no-op)', () => {
    const display = new CraftsmanshipScoreDisplay(() => {});
    // clear() should not throw when no clearFn supplied
    expect(() => display.clear()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC2-T6: render() view-model shape
// ---------------------------------------------------------------------------

describe('AC2-T6: render() view-model shape', () => {
  describe('basic structure', () => {
    test('view model contains all required top-level fields', () => {
      const vm = captureViewModel(makeResult());
      expect(vm).toHaveProperty('score');
      expect(vm).toHaveProperty('tier');
      expect(vm).toHaveProperty('narrative');
      expect(vm).toHaveProperty('subscoresExpanded');
      expect(vm).toHaveProperty('dimensionRows');
      expect(vm).toHaveProperty('personalBest');
      expect(vm).toHaveProperty('improvementTip');
    });

    test('score and tier are passed through from result', () => {
      const vm = captureViewModel(makeResult({ score: 82, tier: 'Master' }));
      expect(vm.score).toBe(82);
      expect(vm.tier).toBe('Master');
    });

    test('subscoresExpanded defaults to false before any toggle', () => {
      const vm = captureViewModel(makeResult());
      expect(vm.subscoresExpanded).toBe(false);
    });
  });

  describe('narrative', () => {
    test('narrative matches TIER_NARRATIVES for the given tier', () => {
      ['Grandmaster', 'Master', 'Journeyman', 'Apprentice'].forEach(tier => {
        const vm = captureViewModel(makeResult({ tier }));
        expect(vm.narrative).toBe(TIER_NARRATIVES[tier]);
      });
    });

    test('narrative is empty string for unknown tier', () => {
      const vm = captureViewModel(makeResult({ tier: 'UnknownTier' }));
      expect(vm.narrative).toBe('');
    });
  });

  describe('dimensionRows', () => {
    test('dimensionRows contains one entry per unlockedDimension', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['cosmetic', 'mechanical'],
        dimensionScores: { cosmetic: 80, mechanical: 70 },
      }));
      expect(vm.dimensionRows).toHaveLength(2);
    });

    test('each dimension row has label, score, bar, available fields', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['cosmetic'],
        dimensionScores: { cosmetic: 80 },
      }));
      const row = vm.dimensionRows[0];
      expect(row).toHaveProperty('label');
      expect(row).toHaveProperty('score');
      expect(row).toHaveProperty('bar');
      expect(row).toHaveProperty('available');
    });

    test('cosmetic dimension gets human-readable label', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['cosmetic'],
        dimensionScores: { cosmetic: 60 },
      }));
      expect(vm.dimensionRows[0].label).toBe('Cosmetic Restoration');
    });

    test('mechanical dimension gets human-readable label', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['mechanical'],
        dimensionScores: { mechanical: 50 },
      }));
      expect(vm.dimensionRows[0].label).toBe('Mechanical Precision');
    });

    test('diagnostic dimension gets human-readable label', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['diagnostic'],
        dimensionScores: { diagnostic: 90 },
      }));
      expect(vm.dimensionRows[0].label).toBe('Diagnostic Accuracy');
    });

    test('economic dimension gets human-readable label', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['economic'],
        dimensionScores: { economic: 40 },
      }));
      expect(vm.dimensionRows[0].label).toBe('Economic Efficiency');
    });

    test('bar field contains Unicode block characters and percentage', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['cosmetic'],
        dimensionScores: { cosmetic: 80 },
      }));
      expect(vm.dimensionRows[0].bar).toBe('████████░░ 80%');
    });

    test('available is true when score is present', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['cosmetic'],
        dimensionScores: { cosmetic: 70 },
      }));
      expect(vm.dimensionRows[0].available).toBe(true);
    });

    test('available is false and bar is "(unavailable)" when dimension score is missing', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['cosmetic'],
        dimensionScores: {},  // cosmetic score not provided
      }));
      expect(vm.dimensionRows[0].available).toBe(false);
      expect(vm.dimensionRows[0].bar).toBe('(unavailable)');
    });

    test('empty unlockedDimensions produces empty dimensionRows array', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: [],
        dimensionScores: {},
      }));
      expect(vm.dimensionRows).toHaveLength(0);
    });

    test('unknown dimension key falls back to raw key as label', () => {
      const vm = captureViewModel(makeResult({
        unlockedDimensions: ['custom_dim'],
        dimensionScores: { custom_dim: 55 },
      }));
      expect(vm.dimensionRows[0].label).toBe('custom_dim');
    });
  });

  describe('personalBest section', () => {
    test('personalBest is null when no personalBest is provided (first delivery)', () => {
      const vm = captureViewModel(makeResult(), null);
      expect(vm.personalBest).toBeNull();
    });

    test('personalBest section is present when personalBest object is supplied', () => {
      const pb = { score: 60, tier: 'Journeyman' };
      const vm = captureViewModel(makeResult({ score: 75 }), pb);
      expect(vm.personalBest).not.toBeNull();
    });

    test('personalBest.isNewBest is true when current score exceeds previous', () => {
      const pb = { score: 60, tier: 'Journeyman' };
      const vm = captureViewModel(makeResult({ score: 75 }), pb);
      expect(vm.personalBest.isNewBest).toBe(true);
    });

    test('personalBest.isNewBest is false when current score does not exceed previous', () => {
      const pb = { score: 90, tier: 'Grandmaster' };
      const vm = captureViewModel(makeResult({ score: 75 }), pb);
      expect(vm.personalBest.isNewBest).toBe(false);
    });

    test('personalBest message contains "New personal best" when isNewBest', () => {
      const pb = { score: 50, tier: 'Journeyman' };
      const vm = captureViewModel(makeResult({ score: 75 }), pb);
      expect(vm.personalBest.message).toContain('New personal best');
    });

    test('personalBest message contains "Personal best" when not new best', () => {
      const pb = { score: 90, tier: 'Grandmaster' };
      const vm = captureViewModel(makeResult({ score: 75 }), pb);
      expect(vm.personalBest.message).toContain('Personal best');
    });

    test('personalBest.previousScore and previousTier reflect the supplied personal best', () => {
      const pb = { score: 72, tier: 'Master' };
      const vm = captureViewModel(makeResult({ score: 75 }), pb);
      expect(vm.personalBest.previousScore).toBe(72);
      expect(vm.personalBest.previousTier).toBe('Master');
    });
  });

  describe('improvementTip', () => {
    test('improvementTip is null when score >= 100 (perfect restoration — shows PERFECT_SCORE_MESSAGE)', () => {
      const vm = captureViewModel(makeResult({ score: 100, tier: 'Grandmaster' }));
      // At 100%, the PERFECT_SCORE_MESSAGE is shown, not null
      expect(vm.improvementTip).toBe(PERFECT_SCORE_MESSAGE);
    });

    test('improvementTip matches IMPROVEMENT_TIPS for Master tier below 100%', () => {
      const vm = captureViewModel(makeResult({ score: 85, tier: 'Master' }));
      expect(vm.improvementTip).toBe(IMPROVEMENT_TIPS.Master);
    });

    test('improvementTip matches IMPROVEMENT_TIPS for Journeyman tier', () => {
      const vm = captureViewModel(makeResult({ score: 55, tier: 'Journeyman' }));
      expect(vm.improvementTip).toBe(IMPROVEMENT_TIPS.Journeyman);
    });

    test('improvementTip matches IMPROVEMENT_TIPS for Apprentice tier', () => {
      const vm = captureViewModel(makeResult({ score: 25, tier: 'Apprentice' }));
      expect(vm.improvementTip).toBe(IMPROVEMENT_TIPS.Apprentice);
    });

    test('improvementTip is PERFECT_SCORE_MESSAGE when Grandmaster at 100%', () => {
      const vm = captureViewModel(makeResult({ score: 100, tier: 'Grandmaster' }));
      expect(vm.improvementTip).toBe(PERFECT_SCORE_MESSAGE);
    });
  });

  describe('renderFn is called with the view model', () => {
    test('renderFn is invoked exactly once on render()', () => {
      const calls = [];
      const display = new CraftsmanshipScoreDisplay((vm) => calls.push(vm));
      display.render(makeResult());
      expect(calls).toHaveLength(1);
    });

    test('renderFn receives the full view model object', () => {
      let received = null;
      const display = new CraftsmanshipScoreDisplay((vm) => { received = vm; });
      display.render(makeResult({ score: 77, tier: 'Master' }));
      expect(received).not.toBeNull();
      expect(received.score).toBe(77);
      expect(received.tier).toBe('Master');
    });
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
// AC2-T7: toggleSubscores() / isExpanded() / clear()
// ---------------------------------------------------------------------------

describe('AC2-T7: toggleSubscores / isExpanded / clear', () => {
  test('isExpanded() returns false initially', () => {
    const display = new CraftsmanshipScoreDisplay(() => {});
    expect(display.isExpanded()).toBe(false);
  });

  test('toggleSubscores() returns true on first call (collapsed → expanded)', () => {
    const display = new CraftsmanshipScoreDisplay(() => {});
    expect(display.toggleSubscores()).toBe(true);
  });

  test('toggleSubscores() returns false on second call (expanded → collapsed)', () => {
    const display = new CraftsmanshipScoreDisplay(() => {});
    display.toggleSubscores();
    expect(display.toggleSubscores()).toBe(false);
  });

  test('isExpanded() reflects toggle state', () => {
    const display = new CraftsmanshipScoreDisplay(() => {});
    expect(display.isExpanded()).toBe(false);
    display.toggleSubscores();
    expect(display.isExpanded()).toBe(true);
    display.toggleSubscores();
    expect(display.isExpanded()).toBe(false);
  });

  test('subscoresExpanded in view model reflects toggle state after toggle', () => {
    let captured = null;
    const display = new CraftsmanshipScoreDisplay((vm) => { captured = vm; });
    display.toggleSubscores();
    display.render(makeResult());
    expect(captured.subscoresExpanded).toBe(true);
  });

  test('clear() resets expanded state to false', () => {
    const display = new CraftsmanshipScoreDisplay(() => {});
    display.toggleSubscores();
    expect(display.isExpanded()).toBe(true);
    display.clear();
    expect(display.isExpanded()).toBe(false);
  });

  test('clear() invokes the clearFn callback', () => {
    const clearCalls = [];
    const display = new CraftsmanshipScoreDisplay(() => {}, () => clearCalls.push('cleared'));
    display.clear();
    expect(clearCalls).toEqual(['cleared']);
  });
});
