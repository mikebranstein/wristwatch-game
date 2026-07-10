/**
 * Tests: LedgerManager — Workshop Economy MVP (Issue #145)
 *
 * Acceptance Criteria covered:
 *   AC1 — Pricing tier, parts cost breakdown, net income displayed correctly; ledger balance updated.
 *   AC2 — Totals correctly aggregated across multiple jobs; persist between sessions.
 *   AC4 — Cozy Mode: deductions hidden/suppressed; toggle state persists.
 *   AC5 — Insufficient balance: canAfford() guard; no negative balance.
 *
 * Test Scenarios covered:
 *   Scenario 1 — Happy path single job (Complex Service, parts deducted, balance updated)
 *   Scenario 2 — All three pricing tiers aggregated correctly
 *   Scenario 6 — Cozy Mode ON: no deductions on subsequent jobs
 *   Scenario 7 — Cozy Mode OFF: deductions resume on next job
 *   Scenario 8 — Session persistence: ledger values survive save/reload cycle
 *   Scenario 9 — Zero-cost parts job: full revenue credited, no errors
 *
 * Run with: npm test
 */

'use strict';

const { LedgerManager, PRICING_TIERS } = require('../../src/economy/LedgerManager');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSaveState(initial = {}) {
  const store = Object.assign({
    ledger_income_total:     0,
    ledger_parts_cost_total: 0,
    ledger_balance:          0,
    cozy_mode_enabled:       false,
    workshop_upgrades:       [],
  }, initial);
  return {
    get: (key) => (key in store ? store[key] : null),
    set: (key, value) => { store[key] = value; },
    _store: store,
  };
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('LedgerManager — constructor', () => {
  test('throws if saveState is missing', () => {
    expect(() => new LedgerManager(null)).toThrow('saveState must implement get(key) and set(key, value)');
  });

  test('throws if saveState lacks get/set', () => {
    expect(() => new LedgerManager({ get: () => {} })).toThrow();
  });

  test('constructs successfully with valid saveState', () => {
    const ledger = new LedgerManager(makeSaveState());
    expect(ledger.balance).toBe(0);
    expect(ledger.incomeTotal).toBe(0);
    expect(ledger.partsCostTotal).toBe(0);
    expect(ledger.cosyModeEnabled).toBe(false);
  });
});

// ── Pricing tier table ────────────────────────────────────────────────────────

describe('LedgerManager.revenueForTier()', () => {
  test('returns correct revenue for simple_service', () => {
    expect(LedgerManager.revenueForTier('simple_service')).toBe(PRICING_TIERS.simple_service);
  });

  test('returns correct revenue for complex_service', () => {
    expect(LedgerManager.revenueForTier('complex_service')).toBe(PRICING_TIERS.complex_service);
  });

  test('returns correct revenue for full_restoration', () => {
    expect(LedgerManager.revenueForTier('full_restoration')).toBe(PRICING_TIERS.full_restoration);
  });

  test('throws for unknown tier', () => {
    expect(() => LedgerManager.revenueForTier('legendary_restoration')).toThrow("unknown pricing tier 'legendary_restoration'");
  });
});

// ── AC1: recordJobCompletion — single job (Scenario 1) ────────────────────────

describe('LedgerManager.recordJobCompletion() — AC1 (Scenario 1: Happy path)', () => {
  test('Scenario 1 — Complex Service job: parts deducted, balance updated, net income correct', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('complex_service', 30);

    expect(result.revenue).toBe(PRICING_TIERS.complex_service);    // 120
    expect(result.partsCost).toBe(30);
    expect(result.netIncome).toBe(90);                             // 120 - 30
    expect(result.newBalance).toBe(90);

    expect(ledger.incomeTotal).toBe(120);
    expect(ledger.partsCostTotal).toBe(30);
    expect(ledger.balance).toBe(90);
  });

  test('AC1 — job summary fields: pricing_tier selection drives revenue correctly', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);

    // Simple Service
    let r = ledger.recordJobCompletion('simple_service', 10);
    expect(r.revenue).toBe(PRICING_TIERS.simple_service);  // 50
    expect(r.netIncome).toBe(40);

    // Full Restoration
    r = ledger.recordJobCompletion('full_restoration', 50);
    expect(r.revenue).toBe(PRICING_TIERS.full_restoration);  // 200
    expect(r.netIncome).toBe(150);
  });
});

// ── AC2: Aggregation across multiple jobs (Scenario 2) ───────────────────────

describe('LedgerManager.recordJobCompletion() — AC2 (Scenario 2: All three tiers)', () => {
  test('Scenario 2 — Three different tiers: totals correctly aggregated', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);

    ledger.recordJobCompletion('simple_service',   10);  // revenue=50, cost=10, net=40
    ledger.recordJobCompletion('complex_service',  20);  // revenue=120, cost=20, net=100
    ledger.recordJobCompletion('full_restoration', 40);  // revenue=200, cost=40, net=160

    expect(ledger.incomeTotal).toBe(50 + 120 + 200);        // 370
    expect(ledger.partsCostTotal).toBe(10 + 20 + 40);       // 70
    expect(ledger.balance).toBe(40 + 100 + 160);            // 300
  });

  test('AC2 — totals aggregate correctly across sessions (simulated save/reload)', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);

    ledger.recordJobCompletion('simple_service',   5);   // balance=45
    ledger.recordJobCompletion('complex_service',  0);   // balance=165

    // Simulate reload: new LedgerManager from same save state
    const ledger2 = new LedgerManager(save);
    expect(ledger2.balance).toBe(45 + 120);   // 165
    expect(ledger2.incomeTotal).toBe(50 + 120);
  });
});

// ── AC4: Cozy Mode (Scenarios 6, 7) ─────────────────────────────────────────

describe('LedgerManager — AC4 Cozy Mode (Scenarios 6, 7)', () => {
  test('Scenario 6 — Cozy Mode ON: parts cost not deducted from balance', () => {
    const save   = makeSaveState({ cozy_mode_enabled: true });
    const ledger = new LedgerManager(save);

    const result = ledger.recordJobCompletion('complex_service', 40);

    // In Cozy Mode: full revenue credited, no deduction
    expect(result.revenue).toBe(120);
    expect(result.partsCost).toBe(40);
    expect(result.netIncome).toBe(120);    // no deduction
    expect(result.newBalance).toBe(120);
    // Parts cost still tracked for display
    expect(ledger.partsCostTotal).toBe(40);
    expect(ledger.balance).toBe(120);
  });

  test('Scenario 6 — Cozy Mode toggle state persists in save state', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);

    expect(ledger.cosyModeEnabled).toBe(false);
    save.set('cozy_mode_enabled', true);
    expect(ledger.cosyModeEnabled).toBe(true);  // reads live from save state
  });

  test('Scenario 7 — Cozy Mode OFF: deductions resume on next job', () => {
    const save   = makeSaveState({ cozy_mode_enabled: true });
    const ledger = new LedgerManager(save);

    // Job with Cozy Mode ON: no deduction
    ledger.recordJobCompletion('simple_service', 10);
    expect(ledger.balance).toBe(50);  // no deduction

    // Toggle OFF
    save.set('cozy_mode_enabled', false);
    expect(ledger.cosyModeEnabled).toBe(false);

    // Next job: deduction applies
    ledger.recordJobCompletion('simple_service', 10);
    expect(ledger.balance).toBe(50 + 40);  // 90 (50 - 10 net = 40 added)
  });
});

// ── AC5: canAfford / deductUpgradePurchase ────────────────────────────────────

describe('LedgerManager — AC5 insufficient balance guard', () => {
  test('canAfford() returns true when balance covers cost', () => {
    const save   = makeSaveState({ ledger_balance: 100 });
    const ledger = new LedgerManager(save);
    expect(ledger.canAfford(100)).toBe(true);
    expect(ledger.canAfford(99)).toBe(true);
    expect(ledger.canAfford(101)).toBe(false);
  });

  test('deductUpgradePurchase() deducts correctly when affordable', () => {
    const save   = makeSaveState({ ledger_balance: 150 });
    const ledger = new LedgerManager(save);
    const newBal = ledger.deductUpgradePurchase(80);
    expect(newBal).toBe(70);
    expect(ledger.balance).toBe(70);
  });

  test('deductUpgradePurchase() throws when balance insufficient — no state change', () => {
    const save   = makeSaveState({ ledger_balance: 50 });
    const ledger = new LedgerManager(save);
    expect(() => ledger.deductUpgradePurchase(80)).toThrow('insufficient balance');
    expect(ledger.balance).toBe(50);  // unchanged
  });

  test('deductUpgradePurchase() throws for zero/negative cost', () => {
    const save   = makeSaveState({ ledger_balance: 100 });
    const ledger = new LedgerManager(save);
    expect(() => ledger.deductUpgradePurchase(0)).toThrow('upgrade cost must be positive');
  });
});

// ── Scenario 9: Zero-cost parts job ───────────────────────────────────────────

describe('LedgerManager — Scenario 9 (zero-cost parts)', () => {
  test('Scenario 9 — No parts consumed: full revenue credited, no division errors', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);

    const result = ledger.recordJobCompletion('full_restoration', 0);

    expect(result.revenue).toBe(200);
    expect(result.partsCost).toBe(0);
    expect(result.netIncome).toBe(200);
    expect(result.newBalance).toBe(200);
    expect(ledger.partsCostTotal).toBe(0);
  });
});

// ── getLedgerViewModel ─────────────────────────────────────────────────────────

describe('LedgerManager.getLedgerViewModel()', () => {
  test('returns correct summary for HUD display', () => {
    const save   = makeSaveState({ ledger_balance: 150, ledger_income_total: 200, ledger_parts_cost_total: 50 });
    const ledger = new LedgerManager(save);

    const vm = ledger.getLedgerViewModel();
    expect(vm.balance).toBe(150);
    expect(vm.incomeTotal).toBe(200);
    expect(vm.partsCostTotal).toBe(50);
    expect(vm.cosyMode).toBe(false);
  });
});
