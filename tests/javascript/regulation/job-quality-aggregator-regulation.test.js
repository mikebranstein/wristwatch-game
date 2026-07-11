/**
 * Tests: JobQualityAggregator — regulation_accuracy as 7th dimension (Issue #294).
 *
 * Covers AC5: regulation accuracy grade integrated with Holistic Craftsmanship Score.
 * Verifies the build-start design decision: regulation_accuracy is a new 7th dimension
 * separate from timing_calibration (per design mitigation comment).
 *
 * Run with: npm test
 */
'use strict';

const { JobQualityAggregator, ALL_DIMENSIONS } = require('../../../src/completion/JobQualityAggregator');

function makeSaveState(initial = {}) {
  const store = Object.assign({
    craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical'],
    cozy_mode_enabled: false,
  }, initial);
  return {
    get:  (k) => store[k] !== undefined ? store[k] : null,
    set:  (k, v) => { store[k] = v; },
    _store: store,
  };
}

function makeAggregator(saveState) {
  return new JobQualityAggregator({
    cosmeticSummary:  { getSummaryState: () => ({ strap: { complete: true }, crystal: { complete: true }, case: { complete: true } }) },
    completionState:  { getSessionSummary: () => ({ faultsFixed: 10, totalParts: 10 }) },
    hintSystem:       { wasHintUsed: () => false },
    ledgerManager:    null,
    saveState,
  });
}

describe('JobQualityAggregator — Issue #294: regulation_accuracy dimension', () => {
  it('ALL_DIMENSIONS includes regulation_accuracy', () => {
    expect(ALL_DIMENSIONS).toContain('regulation_accuracy');
  });

  it('regulation_accuracy is separate from timing_calibration (7th dimension)', () => {
    expect(ALL_DIMENSIONS.indexOf('regulation_accuracy'))
      .not.toBe(ALL_DIMENSIONS.indexOf('timing_calibration'));
  });

  it('regulation_accuracy contributes to score when unlocked and injected', () => {
    const saveState = makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'regulation_accuracy'],
    });
    const aggregator = makeAggregator(saveState);

    const result = aggregator.computeScore({
      pricingTier: null,
      partsCost: 0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:            100,
        mechanical:          100,
        regulation_accuracy:  50,  // GRADE_TO_ACCURACY_SCORE[ACCEPTABLE]
      },
    });

    // Should be average of three dimensions: (100 + 100 + 50) / 3 ≈ 83.33
    expect(result.score).toBeCloseTo(83.33, 1);
    expect(result.dimensionScores.regulation_accuracy).toBe(50);
  });

  it('regulation_accuracy = 100 (Certified Chronometer) pushes composite higher', () => {
    const saveState = makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'regulation_accuracy'],
    });
    const aggregator = makeAggregator(saveState);

    const result = aggregator.computeScore({
      pricingTier: null,
      partsCost: 0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:            100,
        mechanical:          100,
        regulation_accuracy: 100,
      },
    });

    expect(result.score).toBe(100);
  });

  it('regulation_accuracy excluded from composite when not in unlocked dimensions', () => {
    const saveState = makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical'],  // regulation_accuracy NOT unlocked
    });
    const aggregator = makeAggregator(saveState);

    const result = aggregator.computeScore({
      pricingTier: null,
      partsCost: 0,
      faultInstanceIds: [],
      injectDimensionScores: {
        cosmetic:            80,
        mechanical:          80,
        regulation_accuracy: 50,
      },
    });

    // Only cosmetic + mechanical should count: (80 + 80) / 2 = 80
    expect(result.score).toBe(80);
    expect(result.dimensionScores.regulation_accuracy).toBeUndefined();
  });

  it('_computeDimensionScore returns null for regulation_accuracy (injection-only contract)', () => {
    const saveState = makeSaveState({
      craftsmanship_dimensions_unlocked: ['regulation_accuracy'],
    });
    const aggregator = makeAggregator(saveState);

    // No injection provided — should gracefully fall back to null (dimension excluded)
    const result = aggregator.computeScore({
      pricingTier: null,
      partsCost: 0,
      faultInstanceIds: [],
      injectDimensionScores: {},  // no injection
    });

    // No dimensions could be scored — graceful degradation to 0/Apprentice
    expect(result.score).toBe(0);
    expect(result.tier).toBe('Apprentice');
  });

  it('Issue #255 regression: timing_calibration and sourcing_quality still work independently', () => {
    const saveState = makeSaveState({
      craftsmanship_dimensions_unlocked: ['timing_calibration', 'sourcing_quality'],
    });
    const aggregator = makeAggregator(saveState);

    const result = aggregator.computeScore({
      pricingTier: null,
      partsCost: 0,
      faultInstanceIds: [],
      injectDimensionScores: {
        timing_calibration: 80,
        sourcing_quality:   60,
      },
    });

    expect(result.score).toBeCloseTo(70, 1);
    expect(result.dimensionScores.timing_calibration).toBe(80);
    expect(result.dimensionScores.sourcing_quality).toBe(60);
    expect(result.dimensionScores.regulation_accuracy).toBeUndefined();
  });
});
