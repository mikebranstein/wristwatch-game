/**
 * Tests: DeliveryHandler + JobQualityAggregator integration — Issue #253
 *
 * Tests the extended handleDelivery() method with jobQualityAggregator wired in.
 * Verifies personal best tracking, backward-compatibility, and fault_instance_ids default.
 *
 * Acceptance Criteria covered:
 *   AC4 — Personal best persisted; null field on first load degrades gracefully
 *   AC1 — Composite score computed and attached to delivery entry
 *
 * Test Scenarios:
 *   Happy path: aggregator wired, handleDelivery returns craftsmanship field
 *   Personal best update: new score > previous → save field updated
 *   Personal best no-update: new score ≤ previous → save field unchanged
 *   Backward-compat: no aggregator supplied → entry unchanged, no crash
 *   fault_instance_ids default: missing from payload → defaults to []
 *   Null craftsmanship_personal_best: graceful degradation (no display, no error)
 *
 * Run with: npm test
 */

'use strict';

const { DeliveryHandler }       = require('../../src/completion/DeliveryHandler');
const { LedgerManager }         = require('../../src/economy/LedgerManager');
const { JobQualityAggregator }  = require('../../src/completion/JobQualityAggregator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSaveState(overrides = {}) {
  const store = Object.assign({
    completed_watches:                 [],
    ledger_income_total:               0,
    ledger_parts_cost_total:           0,
    ledger_balance:                    0,
    cozy_mode_enabled:                 false,
    workshop_upgrades:                 [],
    craftsmanship_dimensions_unlocked: ['cosmetic', 'mechanical', 'diagnostic', 'economic'],
    craftsmanship_personal_best:       null,
  }, overrides);
  return {
    get: (key) => (key in store ? store[key] : null),
    set: (key, value) => { store[key] = value; },
    appendCompletedWatch: (entry) => { store.completed_watches.push(entry); },
    snapshot: () => ({ ...store }),
    _store: store,
  };
}

function makeCosmeticSummary({ strap = true, crystal = true, cs = true } = {}) {
  return {
    getSummaryState: () => ({
      strap:   { complete: strap },
      crystal: { complete: crystal },
      case:    { complete: cs },
    }),
  };
}

function makeCompletionState(faultsFixed, totalParts) {
  return {
    getSessionSummary: () => ({ faultsFixed, totalParts }),
  };
}

function makeHintSystem(hintUsedMap = {}) {
  return {
    wasHintUsed: (id) => hintUsedMap[id] === true,
  };
}

function makeAggregatorAndSave(saveOverrides = {}) {
  const save = makeSaveState(saveOverrides);
  const aggregator = new JobQualityAggregator({
    cosmeticSummary:  makeCosmeticSummary(),
    completionState:  makeCompletionState(8, 10),
    hintSystem:       makeHintSystem({}),
    ledgerManager:    null,
    saveState:        save,
  });
  return { save, aggregator };
}

const BASE_PAYLOAD = {
  watch_name:         'Omega Seamaster',
  client_name:        'Test Client',
  completion_date:    '2026-07-10',
  portrait_asset_key: 'seamaster_portrait',
};

// ---------------------------------------------------------------------------
// Happy path — aggregator wired
// ---------------------------------------------------------------------------

describe('DeliveryHandler (craftsmanship) — happy path', () => {

  test('handleDelivery with aggregator returns craftsmanship field', () => {
    const { save, aggregator } = makeAggregatorAndSave();
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: aggregator });

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:      'simple_service',
      parts_cost:        0,
      fault_instance_ids: [],
    });

    expect(entry).toHaveProperty('craftsmanship');
    expect(entry.craftsmanship).toHaveProperty('score');
    expect(entry.craftsmanship).toHaveProperty('tier');
    expect(typeof entry.craftsmanship.score).toBe('number');
    expect(typeof entry.craftsmanship.tier).toBe('string');
  });

  test('handleDelivery also sets craftsmanship_score and craftsmanship_tier on entry', () => {
    const { save, aggregator } = makeAggregatorAndSave();
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: aggregator });

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:      'complex_service',
      parts_cost:        20,
      fault_instance_ids: [],
    });

    expect(entry.craftsmanship_score).toBeDefined();
    expect(entry.craftsmanship_tier).toBeDefined();
  });

  test('getJobQualityAggregator() returns the wired aggregator', () => {
    const { save, aggregator } = makeAggregatorAndSave();
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: aggregator });
    expect(handler.getJobQualityAggregator()).toBe(aggregator);
  });

});

// ---------------------------------------------------------------------------
// Personal best update logic (AC4)
// ---------------------------------------------------------------------------

describe('DeliveryHandler (craftsmanship) — personal best tracking (AC4)', () => {

  test('First delivery: personal best set (prev was null)', () => {
    const { save, aggregator } = makeAggregatorAndSave();
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: aggregator });

    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:      'full_restoration',
      parts_cost:        0,
      fault_instance_ids: [],
      job_id:            'job-001',
    });

    const pb = save.get('craftsmanship_personal_best');
    expect(pb).not.toBeNull();
    expect(typeof pb.score).toBe('number');
    expect(typeof pb.tier).toBe('string');
    expect(pb.jobId).toBe('job-001');
  });

  test('Personal best update: new score (78) > prev score (74) → updated', () => {
    const { save, aggregator } = makeAggregatorAndSave({
      craftsmanship_personal_best: { score: 74, tier: 'Journeyman', jobId: 'old-job' },
    });
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: aggregator });

    // Inject synthetic score of 78 via injectDimensionScores-less path:
    // We'll use a custom aggregator that always returns 78
    const stubbedAggregator = {
      computeScore: () => ({ score: 78, tier: 'Master', dimensionScores: {}, unlockedDimensions: ['cosmetic', 'mechanical'] }),
    };
    const handler2 = new DeliveryHandler({ saveState: save, jobQualityAggregator: stubbedAggregator });

    handler2.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:      'full_restoration',
      parts_cost:        10,
      fault_instance_ids: [],
      job_id:            'new-job',
    });

    const pb = save.get('craftsmanship_personal_best');
    expect(pb.score).toBe(78);
    expect(pb.tier).toBe('Master');
    expect(pb.jobId).toBe('new-job');
  });

  test('Personal best no-update: new score (60) ≤ prev score (74) → unchanged', () => {
    const { save } = makeAggregatorAndSave({
      craftsmanship_personal_best: { score: 74, tier: 'Journeyman', jobId: 'old-job' },
    });

    const stubbedAggregator = {
      computeScore: () => ({ score: 60, tier: 'Journeyman', dimensionScores: {}, unlockedDimensions: ['cosmetic'] }),
    };
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: stubbedAggregator });

    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'simple_service', parts_cost: 0, fault_instance_ids: [] });

    const pb = save.get('craftsmanship_personal_best');
    expect(pb.score).toBe(74);     // unchanged
    expect(pb.jobId).toBe('old-job'); // still the old job
  });

  test('AC4: null personal best on load → graceful degradation (no crash, field set after first delivery)', () => {
    const { save } = makeAggregatorAndSave({ craftsmanship_personal_best: null });

    const stubbedAggregator = {
      computeScore: () => ({ score: 55, tier: 'Journeyman', dimensionScores: {}, unlockedDimensions: ['cosmetic'] }),
    };

    expect(() => {
      const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: stubbedAggregator });
      handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'simple_service', parts_cost: 0, fault_instance_ids: [] });
    }).not.toThrow();

    expect(save.get('craftsmanship_personal_best')).not.toBeNull();
  });

});

// ---------------------------------------------------------------------------
// Backward compatibility — no aggregator supplied
// ---------------------------------------------------------------------------

describe('DeliveryHandler (craftsmanship) — backward compatibility', () => {

  test('No aggregator: handleDelivery works as before — no craftsmanship field, no crash', () => {
    const save    = makeSaveState();
    const handler = new DeliveryHandler({ saveState: save });

    const entry = handler.handleDelivery({ ...BASE_PAYLOAD });

    expect(entry.watch_name).toBe('Omega Seamaster');
    expect(entry.craftsmanship).toBeUndefined();
    expect(entry.craftsmanship_score).toBeUndefined();
    expect(save._store.craftsmanship_personal_best).toBeNull();
  });

  test('No aggregator: fault_instance_ids omitted → no crash', () => {
    const save    = makeSaveState();
    const handler = new DeliveryHandler({ saveState: save });

    expect(() => {
      handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'simple_service', parts_cost: 5 });
    }).not.toThrow();
  });

  test('Aggregator wired: fault_instance_ids omitted from payload → defaults to []', () => {
    const { save, aggregator } = makeAggregatorAndSave();
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: aggregator });

    expect(() => {
      const entry = handler.handleDelivery({
        ...BASE_PAYLOAD,
        pricing_tier: 'simple_service',
        parts_cost:   0,
        // fault_instance_ids deliberately omitted
      });
      expect(entry).toHaveProperty('craftsmanship');
    }).not.toThrow();
  });

  test('Existing ledger + no aggregator: economy still works correctly', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const handler = new DeliveryHandler({ saveState: save, ledgerManager: ledger });

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier: 'complex_service',
      parts_cost:   30,
    });

    expect(entry.net_income).toBe(90);
    expect(ledger.balance).toBe(90);
    expect(entry.craftsmanship).toBeUndefined();  // no aggregator
  });

  test('Existing ledger + aggregator wired: both economy and craftsmanship work together', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const stubbedAggregator = {
      computeScore: () => ({ score: 82, tier: 'Master', dimensionScores: {}, unlockedDimensions: ['cosmetic', 'mechanical'] }),
    };
    const handler = new DeliveryHandler({ saveState: save, ledgerManager: ledger, jobQualityAggregator: stubbedAggregator });

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:      'full_restoration',
      parts_cost:        50,
      fault_instance_ids: [],
    });

    // Economy
    expect(entry.net_income).toBe(150);
    expect(ledger.balance).toBe(150);
    // Craftsmanship
    expect(entry.craftsmanship.score).toBe(82);
    expect(entry.craftsmanship.tier).toBe('Master');
  });

});

// ---------------------------------------------------------------------------
// Regression: existing delivery flow unaffected
// ---------------------------------------------------------------------------

describe('DeliveryHandler (craftsmanship) — regression: existing flow unaffected', () => {

  test('Regression: completed_watches entry still appended when aggregator is wired', () => {
    const { save, aggregator } = makeAggregatorAndSave();
    const handler = new DeliveryHandler({ saveState: save, jobQualityAggregator: aggregator });

    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:      'simple_service',
      parts_cost:        5,
      fault_instance_ids: [],
    });

    expect(save._store.completed_watches).toHaveLength(1);
    expect(save._store.completed_watches[0].watch_name).toBe('Omega Seamaster');
  });

  test('Regression: onDelivered callback fires with entry', () => {
    const { save, aggregator } = makeAggregatorAndSave();
    const delivered = [];
    const handler = new DeliveryHandler({
      saveState:           save,
      jobQualityAggregator: aggregator,
      onDelivered:         (e) => delivered.push(e),
    });

    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'simple_service', parts_cost: 0, fault_instance_ids: [] });

    expect(delivered).toHaveLength(1);
  });

  test('Regression: saveAsyncFn called with snapshot when aggregator is wired', () => {
    const snapshots = [];
    const { save, aggregator } = makeAggregatorAndSave();
    const handler = new DeliveryHandler({
      saveState:           save,
      jobQualityAggregator: aggregator,
      saveAsyncFn:         (s) => snapshots.push(s),
    });

    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'simple_service', parts_cost: 0, fault_instance_ids: [] });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveProperty('craftsmanship_personal_best');
  });

});
