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

const { DeliveryHandler } = require('../../src/completion/DeliveryHandler');
const { LedgerManager }   = require('../../src/economy/LedgerManager');

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
