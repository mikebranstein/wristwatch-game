/**
 * Tests: JobQualityAggregator Phase 2 — 6-Dimension Integration (Issue #255)
 *
 * Verifies that timing_calibration and sourcing_quality slots are correctly
 * integrated into the existing aggregator via the injectDimensionScores interface.
 *
 * Covers:
 *   AC3 (Issue #255): 6-dimension composite when all dimensions are unlocked
 *   AC4 (Issue #255): phase-gate exclusion — composite from available dims only
 *   AC5 (Issue #255): Phase 1 regression — 4-dimension scoring unchanged when Phase 2 is null
 *   Interface contract: timing_calibration and sourcing_quality in ALL_DIMENSIONS
 *   Backward compat: Phase 2 null scores produce identical result to Phase 1 baseline
 *
 * Run with: npm test
 */

'use strict';

const { JobQualityAggregator, ALL_DIMENSIONS, DEFAULT_UNLOCKED_DIMENSIONS } = require('../../../src/completion/JobQualityAggregator');

// ---------------------------------------------------------------------------
// Helpers (same mock pattern as Phase 1 tests)
// ---------------------------------------------------------------------------

function makeSaveState(overrides = {}) {
  const store = Object.assign({
    craftsmanship_dimensions_unlocked: null,
    craftsmanship_personal_best:       null,
    cozy_mode_enabled:                 false,
  }, overrides);
  return {
    get:    (key) => (key in store ? store[key] : null),
    set:    (key, value) => { store[key] = value; },
    _store: store,
  };
}

function makeCosmeticSummary({ strap = false, crystal = false, case: cs = false } = {}) {
  return {
    getSummaryState: () => ({
      strap:   { complete: strap },
      crystal: { complete: crystal },
      case:    { complete: cs },
    }),
  };
}

function makeCompletionState(faultsFixed, totalParts) {
  return { getSessionSummary: () => ({ faultsFixed, totalParts }) };
}

function makeHintSystem(hintUsedMap = {}) {
  return { wasHintUsed: (id) => hintUsedMap[id] === true };
}

/** Build aggregator with all 6 dimensions unlocked (Phase 1 + Phase 2). */
function makeAggregatorAllSixUnlocked(saveStateOverrides = {}) {
  return new JobQualityAggregator({
    cosmeticSummary:  makeCosmeticSummary({ strap: true, crystal: true, case: true }),
    completionState:  makeCompletionState(10, 10),
    hintSystem:       makeHintSystem({}),
    ledgerManager:    null,
    saveState: makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'diagnostic', 'economic', 'timing_calibration', 'sourcing_quality'],
      ...saveStateOverrides,
    }),
  });
}

/** Build aggregator with only Phase 1 dimensions unlocked (Phase 2 excluded). */
function makeAggregatorPhase1Only(saveStateOverrides = {}) {
  return new JobQualityAggregator({
    cosmeticSummary:  makeCosmeticSummary({ strap: true, crystal: true, case: true }),
    completionState:  makeCompletionState(10, 10),
    hintSystem:       makeHintSystem({}),
    ledgerManager:    null,
    saveState: makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'diagnostic', 'economic'],
      ...saveStateOverrides,
    }),
  });
}

// ---------------------------------------------------------------------------
// ALL_DIMENSIONS includes Phase 2 names
// ---------------------------------------------------------------------------

describe('JobQualityAggregator — ALL_DIMENSIONS includes Phase 2 dimension names', () => {
  it('ALL_DIMENSIONS includes timing_calibration (slot 5)', () => {
    expect(ALL_DIMENSIONS).toContain('timing_calibration');
  });

  it('ALL_DIMENSIONS includes sourcing_quality (slot 6)', () => {
    expect(ALL_DIMENSIONS).toContain('sourcing_quality');
  });

  it('ALL_DIMENSIONS still includes all 4 Phase 1 dimensions', () => {
    expect(ALL_DIMENSIONS).toContain('cosmetic');
    expect(ALL_DIMENSIONS).toContain('mechanical');
    expect(ALL_DIMENSIONS).toContain('diagnostic');
    expect(ALL_DIMENSIONS).toContain('economic');
  });

  it('DEFAULT_UNLOCKED_DIMENSIONS is still cosmetic + mechanical (unchanged)', () => {
    expect(DEFAULT_UNLOCKED_DIMENSIONS).toEqual(['cosmetic', 'mechanical']);
  });
});

// ---------------------------------------------------------------------------
// AC5 (Issue #255): Phase 1 regression — Phase 2 null scores produce same result
// ---------------------------------------------------------------------------

describe('JobQualityAggregator — AC5 Phase 1 regression (Phase 2 dimensions null)', () => {
  it('4-dimension result is identical whether Phase 2 scores are absent or null', () => {
    const aggregator = makeAggregatorPhase1Only();

    // Without Phase 2 injections (Phase 1 baseline)
    const baseline = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:   100,
        mechanical: 100,
        diagnostic: 100,
        economic:   100,
      },
    });

    // With null Phase 2 injections — should be identical
    const withNullPhase2 = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:              100,
        mechanical:            100,
        diagnostic:            100,
        economic:              100,
        timing_calibration:    null,   // null → excluded
        sourcing_quality:      null,   // null → excluded
      },
    });

    expect(withNullPhase2.score).toBeCloseTo(baseline.score, 5);
    expect(withNullPhase2.tier).toBe(baseline.tier);
  });

  it('4-dimension composite unchanged when Phase 2 dimensions are not in unlocked list', () => {
    const aggregator = makeAggregatorPhase1Only();
    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic: 80, mechanical: 60, diagnostic: 40, economic: 20,
      },
    });
    // mean = (80+60+40+20)/4 = 50 → Journeyman
    expect(result.score).toBeCloseTo(50, 5);
    expect(result.tier).toBe('Journeyman');
    expect(result.unlockedDimensions).not.toContain('timing_calibration');
    expect(result.unlockedDimensions).not.toContain('sourcing_quality');
  });
});

// ---------------------------------------------------------------------------
// AC3 (Issue #255): 6-dimension composite
// ---------------------------------------------------------------------------

describe('JobQualityAggregator — AC3: 6-dimension composite when all dimensions available', () => {
  it('AC3: 6-dimension composite = arithmetic mean of all 6 scores', () => {
    const aggregator = makeAggregatorAllSixUnlocked();
    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:              100,
        mechanical:            100,
        diagnostic:            100,
        economic:              100,
        timing_calibration:    100,
        sourcing_quality:      100,
      },
    });
    // All 6 = 100 → composite = 100 → Grandmaster
    expect(result.score).toBeCloseTo(100, 5);
    expect(result.tier).toBe('Grandmaster');
    expect(result.unlockedDimensions).toHaveLength(6);
    expect(result.dimensionScores.timing_calibration).toBe(100);
    expect(result.dimensionScores.sourcing_quality).toBe(100);
  });

  it('AC3: Grandmaster tier requires strong timing and sourcing performance (6-dimension)', () => {
    const aggregator = makeAggregatorAllSixUnlocked();
    // Strong Phase 1, weak Phase 2: average drops below 90 → not Grandmaster
    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:           100,
        mechanical:         100,
        diagnostic:         100,
        economic:           100,
        timing_calibration:  40,   // rushed
        sourcing_quality:    40,   // poor parts
      },
    });
    // mean = (100+100+100+100+40+40)/6 ≈ 80 → Master
    expect(result.score).toBeCloseTo(80, 5);
    expect(result.tier).toBe('Master');
  });

  it('AC3: 6-dimension composite with mixed scores', () => {
    const aggregator = makeAggregatorAllSixUnlocked();
    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:           90,
        mechanical:         80,
        diagnostic:         70,
        economic:           60,
        timing_calibration: 50,
        sourcing_quality:   40,
      },
    });
    // mean = (90+80+70+60+50+40)/6 = 390/6 = 65 → Journeyman
    expect(result.score).toBeCloseTo(65, 5);
    expect(result.tier).toBe('Journeyman');
  });
});

// ---------------------------------------------------------------------------
// AC4 (Issue #255): phase-gate exclusion for timing and sourcing dimensions
// ---------------------------------------------------------------------------

describe('JobQualityAggregator — AC4: phase-gate exclusion for Phase 2 dimensions', () => {
  it('AC4: composite from available dims only when timing_calibration not unlocked', () => {
    // Only cosmetic, mechanical, diagnostic, economic, sourcing_quality unlocked (no timing)
    const aggregator = new JobQualityAggregator({
      cosmeticSummary:  makeCosmeticSummary({ strap: true, crystal: true, case: true }),
      completionState:  makeCompletionState(10, 10),
      hintSystem:       makeHintSystem({}),
      ledgerManager:    null,
      saveState:        makeSaveState({
        craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'diagnostic', 'economic', 'sourcing_quality'],
      }),
    });

    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic: 80, mechanical: 80, diagnostic: 80, economic: 80,
        sourcing_quality: 80,
        // timing_calibration not unlocked → not in dimension list → not included
      },
    });
    // 5 dims all 80 → mean = 80 → Master
    expect(result.score).toBeCloseTo(80, 5);
    expect(result.unlockedDimensions).not.toContain('timing_calibration');
    expect(result.unlockedDimensions).toContain('sourcing_quality');
  });

  it('AC4: composite from available dims only when sourcing_quality not unlocked', () => {
    const aggregator = new JobQualityAggregator({
      cosmeticSummary:  makeCosmeticSummary({ strap: true, crystal: true, case: true }),
      completionState:  makeCompletionState(10, 10),
      hintSystem:       makeHintSystem({}),
      ledgerManager:    null,
      saveState:        makeSaveState({
        craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'diagnostic', 'economic', 'timing_calibration'],
      }),
    });

    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic: 80, mechanical: 80, diagnostic: 80, economic: 80,
        timing_calibration: 80,
      },
    });
    // 5 dims all 80 → mean = 80 → Master
    expect(result.score).toBeCloseTo(80, 5);
    expect(result.unlockedDimensions).toContain('timing_calibration');
    expect(result.unlockedDimensions).not.toContain('sourcing_quality');
  });

  it('AC4: neither Phase 2 dimension unlocked → 4-dimension composite (no penalty)', () => {
    const aggregator = makeAggregatorPhase1Only();
    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic: 90, mechanical: 90, diagnostic: 90, economic: 90,
      },
    });
    expect(result.score).toBeCloseTo(90, 5);
    expect(result.tier).toBe('Grandmaster');
  });

  it('AC4: when Phase 2 tracker null score is passed (via injection), dimension excluded', () => {
    const aggregator = makeAggregatorAllSixUnlocked();
    // timing_calibration injected as null → null/undefined injection values are skipped
    // by the existing injectDimensionScores null-check in computeScore()
    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:           90,
        mechanical:         90,
        diagnostic:         90,
        economic:           90,
        timing_calibration: null,      // phase-gated — excluded from composite
        sourcing_quality:   null,      // phase-gated — excluded from composite
      },
    });
    // Only 4 dims contribute: mean = 90 → Grandmaster
    expect(result.score).toBeCloseTo(90, 5);
    expect(result.tier).toBe('Grandmaster');
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: jobs completed before Phase 2 (AC5 regression)
// ---------------------------------------------------------------------------

describe('JobQualityAggregator — AC5: backward compatibility for pre-Phase-2 jobs', () => {
  it('aggregator handles missing timing_calibration and sourcing_quality gracefully', () => {
    // Simulate a Phase 1 call with no Phase 2 injections at all
    const aggregator = makeAggregatorPhase1Only();
    const result = aggregator.computeScore({
      pricingTier:      'simple_service',
      partsCost:        0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic: 75, mechanical: 75, diagnostic: 75, economic: 75,
      },
    });
    expect(result.score).toBeCloseTo(75, 5);
    expect(result.tier).toBe('Master');
    expect(result.dimensionScores.timing_calibration).toBeUndefined();
    expect(result.dimensionScores.sourcing_quality).toBeUndefined();
  });

  it('Phase 2 aggregator handles graceful degradation when aggregator has no scoreable dims', () => {
    // Build an aggregator where all source systems return null/fail,
    // so the graceful degradation path is triggered.
    // Use a minimal aggregator with no real source systems and no injections.
    const aggNoSystems = new JobQualityAggregator({
      cosmeticSummary:  null,  // returns null from _cosmeticScore()
      completionState:  null,  // returns null from _mechanicalScore()
      hintSystem:       null,  // returns null from _diagnosticScore()
      ledgerManager:    null,  // economic → null (no pricingTier)
      saveState: makeSaveState({
        craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical'],
      }),
    });
    // No injections, no source systems → no dimensions score → graceful degradation
    const result = aggNoSystems.computeScore({
      pricingTier:          null,
      partsCost:            0,
      faultInstanceIds:     [],
      injectDimensionScores: {},
    });
    // Aggregator graceful degradation: no scored dimensions → score=0, tier=Apprentice
    expect(result.tier).toBe('Apprentice');
    expect(result.score).toBe(0);
  });
});
