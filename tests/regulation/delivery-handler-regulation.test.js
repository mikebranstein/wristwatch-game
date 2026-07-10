/**
 * Tests: DeliveryHandler + regulation_grade (Issue #294).
 *
 * Covers AC5: regulation grade shown in delivery summary and passed to
 * Holistic Craftsmanship Score as regulation_accuracy dimension.
 *
 * Also covers Test Scenario 8 backward compatibility:
 *   Jobs completed before the feature shipped show no accuracy grade;
 *   null grade handled without error or UI breakage.
 *
 * Run with: npm test
 */
'use strict';

const { DeliveryHandler }      = require('../../src/completion/DeliveryHandler');
const { JobQualityAggregator } = require('../../src/completion/JobQualityAggregator');
const { GRADES }               = require('../../src/regulation/RegulationConfig');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSaveState(initial = {}) {
  const store = Object.assign({
    craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'regulation_accuracy'],
    craftsmanship_personal_best:       null,
    cozy_mode_enabled:                 false,
    completed_watches:                 [],
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
  watch_name:         'Omega Seamaster',
  client_name:        'Alice',
  completion_date:    '2026-07-11',
  portrait_asset_key: 'alice_portrait',
};

// ---------------------------------------------------------------------------
// AC5 tests
// ---------------------------------------------------------------------------

describe('DeliveryHandler — Issue #294: regulation_grade AC5', () => {
  it('AC5: regulation_grade is attached to delivery entry', () => {
    const saveState = makeSaveState();
    const handler = new DeliveryHandler({ saveState });
    const result = handler.handleDelivery({
      ...BASE_PAYLOAD,
      regulation_grade: GRADES.ACCEPTABLE,
    });
    expect(result.regulation_grade).toBe(GRADES.ACCEPTABLE);
  });

  it('AC5: regulation_grade is persisted in completed_watches entry', () => {
    const saveState = makeSaveState();
    const handler = new DeliveryHandler({ saveState });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      regulation_grade: GRADES.EXCELLENT,
    });
    expect(saveState._store.completed_watches[0].regulation_grade).toBe(GRADES.EXCELLENT);
  });

  it('AC5: regulation_accuracy dimension injected into craftsmanship score (Acceptable → 50)', () => {
    const saveState = makeSaveState();
    const aggregator = makeAggregator(saveState);
    let capturedInjections = null;
    const original = aggregator.computeScore.bind(aggregator);
    aggregator.computeScore = (opts) => {
      capturedInjections = opts.injectDimensionScores;
      return original(opts);
    };

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregator });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      regulation_grade: GRADES.ACCEPTABLE,
    });

    expect(capturedInjections).toBeDefined();
    expect(capturedInjections.regulation_accuracy).toBe(50);
  });

  it('AC5: regulation_accuracy = 100 for Certified Chronometer', () => {
    const saveState = makeSaveState();
    const aggregator = makeAggregator(saveState);
    let capturedInjections = null;
    const original = aggregator.computeScore.bind(aggregator);
    aggregator.computeScore = (opts) => {
      capturedInjections = opts.injectDimensionScores;
      return original(opts);
    };

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregator });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      regulation_grade: GRADES.CERTIFIED_CHRONOMETER,
    });

    expect(capturedInjections.regulation_accuracy).toBe(100);
  });

  it('AC5: regulation_accuracy dimension NOT injected when regulation_grade is null', () => {
    const saveState = makeSaveState();
    const aggregator = makeAggregator(saveState);
    let capturedInjections = null;
    const original = aggregator.computeScore.bind(aggregator);
    aggregator.computeScore = (opts) => {
      capturedInjections = opts.injectDimensionScores;
      return original(opts);
    };

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregator });
    handler.handleDelivery({
      ...BASE_PAYLOAD,
      regulation_grade: null,
    });

    expect(capturedInjections).toBeDefined();
    expect(capturedInjections.regulation_accuracy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test Scenario 8: Backward compatibility (null grade)
// ---------------------------------------------------------------------------

describe('DeliveryHandler — Issue #294: backward compatibility (Test Scenario 8)', () => {
  it('Test Scenario 8: omitting regulation_grade produces null in entry (no error)', () => {
    const saveState = makeSaveState();
    const handler = new DeliveryHandler({ saveState });
    // Omit regulation_grade entirely — pre-feature job
    const result = handler.handleDelivery({ ...BASE_PAYLOAD });
    // regulation_grade should be null (not undefined, not error)
    expect(result.regulation_grade).toBeNull();
  });

  it('Test Scenario 8: delivery succeeds without aggregator and null regulation_grade', () => {
    const saveState = makeSaveState();
    const handler = new DeliveryHandler({ saveState });
    expect(() => handler.handleDelivery({ ...BASE_PAYLOAD })).not.toThrow();
  });

  it('Test Scenario 8: existing delivery callers unaffected (no regulation_grade = no change)', () => {
    const saveState = makeSaveState();
    const aggregator = makeAggregator(saveState);

    const handler = new DeliveryHandler({ saveState, jobQualityAggregator: aggregator });
    // Pre-feature call: no regulation_grade, no timing_calibration_score, no sourcing_quality_score
    const result = handler.handleDelivery({ ...BASE_PAYLOAD });

    // Craftsmanship score still computed from available dimensions
    expect(result.craftsmanship_score).toBeDefined();
    expect(result.regulation_grade).toBeNull();
  });
});
