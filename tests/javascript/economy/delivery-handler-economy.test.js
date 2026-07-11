/**
 * Tests: DeliveryHandler (economy integration) — Workshop Economy MVP (Issue #145)
 *
 * Tests the extended handleDelivery() method with pricing_tier and parts_cost.
 * Verifies that the ledger is updated atomically at the delivery-completion boundary.
 *
 * Acceptance Criteria covered:
 *   AC1 — Selected pricing tier, parts cost breakdown, and net income displayed; ledger updated.
 *   AC2 — Ledger totals persist; multiple deliveries accumulate correctly.
 *
 * Test Scenarios covered:
 *   Scenario 1 — Single job delivery: ledger updated at delivery boundary
 *   Scenario 2 — Multiple deliveries: ledger accumulates correctly
 *   Scenario 8 — Backward compatibility: delivery without economy fields works
 *
 * Run with: npm test
 */

'use strict';

const { DeliveryHandler } = require('../../../javascript/completion/DeliveryHandler');
const { LedgerManager }   = require('../../../javascript/economy/LedgerManager');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSaveState(initial = {}) {
  const store = Object.assign({
    completed_watches:       [],
    ledger_income_total:     0,
    ledger_parts_cost_total: 0,
    ledger_balance:          0,
    cozy_mode_enabled:       false,
    workshop_upgrades:       [],
  }, initial);
  return {
    get: (key) => (key in store ? store[key] : null),
    set: (key, value) => { store[key] = value; },
    appendCompletedWatch: (entry) => { store.completed_watches.push(entry); },
    snapshot: () => ({ ...store }),
    _store: store,
  };
}

function makeDeliveryHandler(balanceOverride = 0) {
  const save   = makeSaveState({ ledger_balance: balanceOverride });
  const ledger = new LedgerManager(save);
  const handler = new DeliveryHandler({ saveState: save, ledgerManager: ledger });
  return { save, ledger, handler };
}

const BASE_PAYLOAD = {
  watch_name:         'Omega Seamaster',
  client_name:        'Test Client',
  completion_date:    '2026-07-10',
  portrait_asset_key: 'seamaster_portrait',
};

// ── AC1: Single job delivery (Scenario 1) ────────────────────────────────────

describe('DeliveryHandler (economy) — AC1 (Scenario 1: happy path)', () => {
  test('Scenario 1 — Complex Service: ledger updated at delivery boundary', () => {
    const { handler, ledger } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier: 'complex_service',
      parts_cost:   30,
    });

    expect(entry.pricing_tier).toBe('complex_service');
    expect(entry.parts_cost).toBe(30);
    expect(entry.net_income).toBe(90);   // 120 - 30
    expect(entry.ledger_balance).toBe(90);

    expect(ledger.balance).toBe(90);
    expect(ledger.incomeTotal).toBe(120);
    expect(ledger.partsCostTotal).toBe(30);
  });

  test('AC1 — Job summary entry appended to completed_watches', () => {
    const { handler, save } = makeDeliveryHandler();

    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier: 'simple_service',
      parts_cost:   10,
    });

    expect(save._store.completed_watches).toHaveLength(1);
    expect(save._store.completed_watches[0].watch_name).toBe('Omega Seamaster');
    expect(save._store.completed_watches[0].pricing_tier).toBe('simple_service');
    expect(save._store.completed_watches[0].net_income).toBe(40);
  });
});

// ── AC2: Multiple deliveries accumulate (Scenario 2) ─────────────────────────

describe('DeliveryHandler (economy) — AC2 (Scenario 2: accumulation)', () => {
  test('Scenario 2 — Three different tiers: ledger accumulates correctly', () => {
    const { handler, ledger } = makeDeliveryHandler();

    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'simple_service',   parts_cost: 5  });
    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'complex_service',  parts_cost: 20 });
    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'full_restoration', parts_cost: 50 });

    expect(ledger.incomeTotal).toBe(50 + 120 + 200);       // 370
    expect(ledger.partsCostTotal).toBe(5 + 20 + 50);       // 75
    expect(ledger.balance).toBe(45 + 100 + 150);           // 295
  });
});

// ── Backward compatibility ────────────────────────────────────────────────────

describe('DeliveryHandler (economy) — backward compatibility', () => {
  test('Scenario 8 — Delivery without economy fields (no ledger): works as before', () => {
    const save    = makeSaveState();
    const handler = new DeliveryHandler({ saveState: save });  // no ledgerManager

    const entry = handler.handleDelivery({ ...BASE_PAYLOAD });

    expect(entry.watch_name).toBe('Omega Seamaster');
    expect(save._store.completed_watches).toHaveLength(1);
    // No economy fields on entry
    expect(entry.pricing_tier).toBeUndefined();
    expect(entry.net_income).toBeUndefined();
    // Balance unchanged
    expect(save._store.ledger_balance).toBe(0);
  });

  test('Delivery with ledger but no pricing_tier: economy not applied', () => {
    const { handler, ledger } = makeDeliveryHandler();

    handler.handleDelivery({ ...BASE_PAYLOAD });  // no pricing_tier

    expect(ledger.balance).toBe(0);   // no ledger update
  });
});

// ── Issue #254: Cosmetic Grade Modifier — DeliveryHandler integration ─────────

describe('DeliveryHandler (economy) — Issue #254 Cosmetic Grade Modifier (AC5)', () => {

  // ── Scenario 1: Mirror grade, full_restoration ────────────────────────────

  test('Scenario 1 (Issue #254) — Mirror grade: revenue $260, satisfaction_message present', () => {
    const { handler, ledger } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'full_restoration',
      parts_cost:     0,
      cosmetic_grade: 'mirror',
    });

    expect(entry.net_income).toBe(260);           // 200 × 1.30
    expect(entry.ledger_balance).toBe(260);
    expect(entry.satisfaction_message).toBe('The mirror polish is exceptional — exactly as I hoped.');
    expect(ledger.balance).toBe(260);
  });

  // ── Scenario 2: Good grade, full_restoration ──────────────────────────────

  test('Scenario 2 (Issue #254) — Good grade: revenue $240, correct satisfaction_message', () => {
    const { handler } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'full_restoration',
      parts_cost:     0,
      cosmetic_grade: 'good',
    });

    expect(entry.net_income).toBe(240);
    expect(entry.satisfaction_message).toBe('The case finish looks great. I\'m very pleased.');
  });

  // ── Scenario 3: Adequate grade, full_restoration ──────────────────────────

  test('Scenario 3 (Issue #254) — Adequate grade: revenue $220, correct satisfaction_message', () => {
    const { handler } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'full_restoration',
      parts_cost:     0,
      cosmetic_grade: 'adequate',
    });

    expect(entry.net_income).toBe(220);
    expect(entry.satisfaction_message).toBe('It\'s functional, but the case finish is just adequate.');
  });

  // ── Scenario 4: No cosmetic_grade — no message, no multiplier ────────────

  test('Scenario 4 (Issue #254) — No cosmetic_grade: $200, no satisfaction_message, no error', () => {
    const { handler } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier: 'full_restoration',
      parts_cost:   0,
      // cosmetic_grade omitted
    });

    expect(entry.net_income).toBe(200);
    expect(entry.satisfaction_message).toBeUndefined();
  });

  // ── Scenario 5: AC2 — grade doesn't apply to other tiers ─────────────────

  test('Scenario 5 (Issue #254) — simple_service + cosmetic_grade: no multiplier ($50), satisfaction_message still set', () => {
    const { handler } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'simple_service',
      parts_cost:     0,
      cosmetic_grade: 'mirror',
    });

    expect(entry.net_income).toBe(50);    // no multiplier for simple_service
    // satisfaction_message is still appended regardless of tier (grade signal is independent)
    expect(entry.satisfaction_message).toBe('The mirror polish is exceptional — exactly as I hoped.');
  });

  test('Scenario 5 (Issue #254) — complex_service + cosmetic_grade: no multiplier ($120)', () => {
    const { handler } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'complex_service',
      parts_cost:     0,
      cosmetic_grade: 'mirror',
    });

    expect(entry.net_income).toBe(120);   // no multiplier for complex_service
  });

  // ── Scenario 6: Cozy Mode + Mirror grade ─────────────────────────────────

  test('Scenario 6 (Issue #254) — Cozy Mode ON + mirror grade: displayed $260, parts NOT deducted', () => {
    const save   = makeSaveState({ cozy_mode_enabled: true });
    const ledger = new LedgerManager(save);
    const handler = new DeliveryHandler({ saveState: save, ledgerManager: ledger });

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'full_restoration',
      parts_cost:     30,
      cosmetic_grade: 'mirror',
    });

    expect(entry.net_income).toBe(260);           // grade-adjusted, Cozy Mode no deduction
    expect(entry.ledger_balance).toBe(260);
    expect(entry.satisfaction_message).toBe('The mirror polish is exceptional — exactly as I hoped.');
    expect(ledger.partsCostTotal).toBe(30);       // parts tracked for display
    expect(ledger.balance).toBe(260);             // NOT 260-30 — Cozy Mode suppresses deduction
  });

  // ── Scenario 8: Backward-compat (DeliveryHandler) ────────────────────────

  test('Scenario 8 (Issue #254) — Existing callers omitting cosmetic_grade: no satisfaction_message, no error', () => {
    const { handler, ledger } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier: 'full_restoration',
      parts_cost:   20,
      // cosmetic_grade deliberately omitted
    });

    expect(entry.net_income).toBe(180);             // 200 - 20 (no multiplier)
    expect(entry.satisfaction_message).toBeUndefined();
    expect(() => entry.satisfaction_message).not.toThrow();
  });

  test('Scenario 8b (Issue #254) — Delivery without economy AND without cosmetic_grade: no change', () => {
    const save    = makeSaveState();
    const handler = new DeliveryHandler({ saveState: save });  // no ledger

    const entry = handler.handleDelivery({ ...BASE_PAYLOAD });

    expect(entry.net_income).toBeUndefined();
    expect(entry.satisfaction_message).toBeUndefined();
    expect(save._store.completed_watches).toHaveLength(1);
  });

  // ── Scenario 9: Multiple mixed-grade jobs accumulate correctly ────────────

  test('Scenario 9 (Issue #254) — Multiple deliveries with mixed grades: ledger accumulates correctly', () => {
    const { handler, ledger } = makeDeliveryHandler();

    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'full_restoration', parts_cost: 10, cosmetic_grade: 'mirror' });    // 260-10=250
    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'full_restoration', parts_cost: 20, cosmetic_grade: 'good' });      // 240-20=220
    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'full_restoration', parts_cost: 30, cosmetic_grade: 'adequate' });  // 220-30=190
    handler.handleDelivery({ ...BASE_PAYLOAD, pricing_tier: 'simple_service',   parts_cost: 5                              });  // 50-5=45

    expect(ledger.incomeTotal).toBe(260 + 240 + 220 + 50);   // 770
    expect(ledger.partsCostTotal).toBe(10 + 20 + 30 + 5);    // 65
    expect(ledger.balance).toBe(250 + 220 + 190 + 45);       // 705
  });

  // ── Scenario 10: Invalid cosmetic_grade values ────────────────────────────

  test('Scenario 10 (Issue #254) — null cosmetic_grade: $200 base, no satisfaction_message, no error', () => {
    const { handler } = makeDeliveryHandler();

    expect(() => {
      const entry = handler.handleDelivery({
        ...BASE_PAYLOAD,
        pricing_tier:   'full_restoration',
        parts_cost:     0,
        cosmetic_grade: null,
      });
      expect(entry.net_income).toBe(200);
      expect(entry.satisfaction_message).toBeUndefined();
    }).not.toThrow();
  });

  test('Scenario 10 (Issue #254) — unrecognised cosmetic_grade: $200 base, no satisfaction_message, no error', () => {
    const { handler } = makeDeliveryHandler();

    const entry = handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'full_restoration',
      parts_cost:     0,
      cosmetic_grade: 'legendary',
    });

    expect(entry.net_income).toBe(200);
    expect(entry.satisfaction_message).toBeUndefined();
  });

  // ── Satisfaction messages are appended to the delivery entry ─────────────

  test('Mirror: satisfaction_message is written into the delivery entry appended to completed_watches', () => {
    const { handler, save } = makeDeliveryHandler();

    handler.handleDelivery({
      ...BASE_PAYLOAD,
      pricing_tier:   'full_restoration',
      parts_cost:     0,
      cosmetic_grade: 'mirror',
    });

    const stored = save._store.completed_watches[0];
    expect(stored.satisfaction_message).toBe('The mirror polish is exceptional — exactly as I hoped.');
  });
});
