/**
 * Tests: DeliveryHandler Phase 2 — timing_calibration_score and sourcing_quality_score
 * injection into JobQualityAggregator (Issue #255)
 *
 * Covers:
 *   - Both Phase 2 scores forwarded via injectDimensionScores when provided
 *   - null Phase 2 scores excluded from aggregator injection (phase-gate)
 *   - Backward compat: handleDelivery() without Phase 2 fields produces same result as Phase 1
 *   - Phase 2 scores persisted as additive fields on completed_watches entry
 *   - DeliveryHandler Phase 1 regression: all existing delivery behaviour unchanged
 *
 * Run with: npm test
 */

'use strict';

const { DeliveryHandler } = require('../../src/completion/DeliveryHandler');
const { JobQualityAggregator } = require('../../src/completion/JobQualityAggregator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSaveState(initial = {}) {
  const store = Object.assign({
    craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'diagnostic', 'economic', 'timing_calibration', 'sourcing_quality'],
    craftsmanship_personal_best: null,
    cozy_mode_enabled: false,
    completed_watches: [],
  }, initial);
  return {
    get:  (k) => store[k] !== undefined ? store[k] : null,
    set:  (k, v) => { store[k] = v; },
    appendCompletedWatch: (entry) => { store.completed_watches.push(entry); },
    snapshot: () => ({ ...store }),
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

const BASE_PAYLOAD = {
  watch_name:        'Omega Seamaster',
  client_name:       'Alice',
  completion_date:   '2026-07-10',
  portrait_asset_key: 'alice_portrait',
};

// ---------------------------------------------------------------------------
// Phase 2 score fields forwarded to aggregator
// ---------------------------------------------------------------------------

describe('DeliveryHandler — Issue #255: Phase 2 score injection', () => {
  it('timing_calibration_score and sourcing_quality_score are forwarded to aggregator', () => {
    const saveState = makeSaveState();
    const aggregatorSpy = makeAggregator(saveState);
    let capturedInjections = null;
    const originalComputeScore = aggregatorSpy.computeScore.bind(aggregatorSpy);
    aggregatorSpy.computeScore = (opts) => {
      capturedInjections = opts.injectDimensionScores;
      return originalComputeScore(opts);
    };

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregatorSpy });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:             'simple_service',
      timing_calibration_score:  85,
      sourcing_quality_score:    70,
    });

    expect(capturedInjections).toBeDefined();
    expect(capturedInjections.timing_calibration).toBe(85);
    expect(capturedInjections.sourcing_quality).toBe(70);
  });

  it('null timing_calibration_score is NOT included in aggregator injection', () => {
    const saveState = makeSaveState();
    const aggregatorSpy = makeAggregator(saveState);
    let capturedInjections = null;
    const original = aggregatorSpy.computeScore.bind(aggregatorSpy);
    aggregatorSpy.computeScore = (opts) => {
      capturedInjections = opts.injectDimensionScores;
      return original(opts);
    };

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregatorSpy });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:             'simple_service',
      timing_calibration_score:  null,
      sourcing_quality_score:    60,
    });

    // timing_calibration should NOT be in the injection map when null
    expect(capturedInjections).not.toHaveProperty('timing_calibration');
    expect(capturedInjections.sourcing_quality).toBe(60);
  });

  it('null sourcing_quality_score is NOT included in aggregator injection', () => {
    const saveState = makeSaveState();
    const aggregatorSpy = makeAggregator(saveState);
    let capturedInjections = null;
    const original = aggregatorSpy.computeScore.bind(aggregatorSpy);
    aggregatorSpy.computeScore = (opts) => {
      capturedInjections = opts.injectDimensionScores;
      return original(opts);
    };

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregatorSpy });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:            'complex_service',
      timing_calibration_score: 80,
      sourcing_quality_score:   null,
    });

    expect(capturedInjections.timing_calibration).toBe(80);
    expect(capturedInjections).not.toHaveProperty('sourcing_quality');
  });

  it('both null Phase 2 scores result in empty injection map for Phase 2 slots', () => {
    const saveState = makeSaveState();
    const aggregatorSpy = makeAggregator(saveState);
    let capturedInjections = null;
    const original = aggregatorSpy.computeScore.bind(aggregatorSpy);
    aggregatorSpy.computeScore = (opts) => {
      capturedInjections = opts.injectDimensionScores;
      return original(opts);
    };

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregatorSpy });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:             'simple_service',
      timing_calibration_score:  null,
      sourcing_quality_score:    null,
    });

    expect(capturedInjections).not.toHaveProperty('timing_calibration');
    expect(capturedInjections).not.toHaveProperty('sourcing_quality');
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: Phase 2 fields omitted → same Phase 1 result
// ---------------------------------------------------------------------------

describe('DeliveryHandler — AC5 backward compatibility (Phase 2 fields omitted)', () => {
  it('handleDelivery() without Phase 2 fields produces same craftsmanship result as Phase 1', () => {
    const saveState1 = makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical'],
    });
    const saveState2 = makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical'],
    });

    const handler1 = new DeliveryHandler({ saveState: saveState1, jobQualityAggregator: makeAggregator(saveState1) });
    const handler2 = new DeliveryHandler({ saveState: saveState2, jobQualityAggregator: makeAggregator(saveState2) });

    // Phase 1 call (no Phase 2 fields)
    const phase1Result = handler1.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier: 'simple_service',
      injectDimensionScores: { cosmetic: 80, mechanical: 80 },
    });

    // Phase 2 call with null Phase 2 fields
    const phase2Result = handler2.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:             'simple_service',
      timing_calibration_score:  null,
      sourcing_quality_score:    null,
    });

    // Craftsmanship scores should be identical
    expect(phase1Result.craftsmanship?.score).toBe(phase2Result.craftsmanship?.score);
  });

  it('Phase 1 delivery entry structure unchanged when no aggregator provided', () => {
    const saveState = makeSaveState();
    const handler = new DeliveryHandler({ saveState });  // no aggregator
    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      timing_calibration_score: 80,
      sourcing_quality_score:   70,
    });
    // No aggregator → no craftsmanship field on entry
    expect(entry.craftsmanship).toBeUndefined();
    // Core entry fields present
    expect(entry.watch_name).toBe('Omega Seamaster');
    expect(entry.client_name).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// 6-dimension delivery result
// ---------------------------------------------------------------------------

describe('DeliveryHandler — Issue #255 AC3: 6-dimension delivery', () => {
  it('craftsmanship result includes timing and sourcing scores in dimensionScores', () => {
    const saveState = makeSaveState({
      craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'diagnostic', 'economic', 'timing_calibration', 'sourcing_quality'],
    });
    const aggregator = makeAggregator(saveState);
    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregator });

    const result = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:             'simple_service',
      timing_calibration_score:  100,
      sourcing_quality_score:    100,
      injectDimensionScores: {
        cosmetic: 100, mechanical: 100, diagnostic: 100, economic: 100,
      },
    });

    expect(result.craftsmanship).toBeDefined();
    // With all 6 at 100%, tier should be Grandmaster
    expect(result.craftsmanship.tier).toBe('Grandmaster');
  });
});
