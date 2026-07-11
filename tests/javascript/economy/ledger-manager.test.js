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

const { LedgerManager, PRICING_TIERS } = require('../../../javascript/economy/LedgerManager');

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

// ── Issue #254: Cosmetic Grade Modifier ───────────────────────────────────────

describe('LedgerManager.recordJobCompletion() — Issue #254 Cosmetic Grade Modifier (AC1, AC2, AC3)', () => {

  // ── Scenario 1: Mirror grade, full_restoration ────────────────────────────

  test('Scenario 1 (Issue #254) — Mirror grade, full_restoration: revenue $260', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('full_restoration', 0, 'mirror');

    expect(result.revenue).toBe(260);      // 200 × 1.30
    expect(result.partsCost).toBe(0);
    expect(result.netIncome).toBe(260);
    expect(result.newBalance).toBe(260);
    expect(ledger.incomeTotal).toBe(260);
    expect(ledger.balance).toBe(260);
  });

  // ── Scenario 2: Good grade, full_restoration ──────────────────────────────

  test('Scenario 2 (Issue #254) — Good grade, full_restoration: revenue $240', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('full_restoration', 0, 'good');

    expect(result.revenue).toBe(240);      // 200 × 1.20
    expect(result.netIncome).toBe(240);
    expect(result.newBalance).toBe(240);
  });

  // ── Scenario 3: Adequate grade, full_restoration ──────────────────────────

  test('Scenario 3 (Issue #254) — Adequate grade, full_restoration: revenue $220', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('full_restoration', 0, 'adequate');

    expect(result.revenue).toBe(220);      // 200 × 1.10
    expect(result.netIncome).toBe(220);
    expect(result.newBalance).toBe(220);
  });

  // ── Scenario 4: No cosmetic grade — no multiplier ────────────────────────

  test('Scenario 4 (Issue #254) — No cosmeticGrade: base $200, no error', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('full_restoration', 0);  // no grade

    expect(result.revenue).toBe(200);
    expect(result.netIncome).toBe(200);
  });

  // ── Scenario 5: AC2 — grade multiplier does NOT apply to other tiers ─────

  test('Scenario 5 (Issue #254) — AC2: simple_service + mirror grade → no multiplier, $50', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('simple_service', 0, 'mirror');

    expect(result.revenue).toBe(50);   // no multiplier — tier is not full_restoration
  });

  test('Scenario 5 (Issue #254) — AC2: complex_service + mirror grade → no multiplier, $120', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('complex_service', 0, 'mirror');

    expect(result.revenue).toBe(120);  // no multiplier
  });

  // ── Scenario 6: AC3 — Cozy Mode + Mirror grade ───────────────────────────

  test('Scenario 6 (Issue #254) — AC3: Cozy Mode ON + mirror grade → displayed revenue $260, no cost deduction', () => {
    const save   = makeSaveState({ cozy_mode_enabled: true });
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('full_restoration', 30, 'mirror');

    expect(result.revenue).toBe(260);      // 200 × 1.30 (grade-adjusted)
    expect(result.partsCost).toBe(30);
    expect(result.netIncome).toBe(260);    // Cozy Mode: no deduction
    expect(result.newBalance).toBe(260);
    expect(ledger.incomeTotal).toBe(260);  // grade-adjusted gross income (AC3)
    expect(ledger.partsCostTotal).toBe(30);  // parts cost tracked for display
  });

  // ── Scenario 9: Multiple jobs — correct accumulation ─────────────────────

  test('Scenario 9 (Issue #254) — Multiple jobs with mixed grades: totals correct', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);

    ledger.recordJobCompletion('full_restoration', 10, 'mirror');    // 260 revenue, net 250
    ledger.recordJobCompletion('full_restoration', 20, 'good');      // 240 revenue, net 220
    ledger.recordJobCompletion('full_restoration', 30, 'adequate');  // 220 revenue, net 190
    ledger.recordJobCompletion('simple_service',   5,  'mirror');    // 50 revenue, net 45 (no multiplier)

    expect(ledger.incomeTotal).toBe(260 + 240 + 220 + 50);          // 770
    expect(ledger.partsCostTotal).toBe(10 + 20 + 30 + 5);           // 65
    expect(ledger.balance).toBe(250 + 220 + 190 + 45);              // 705
  });

  // ── Scenario 10: Invalid/null/undefined cosmeticGrade ────────────────────

  test('Scenario 10 (Issue #254) — null cosmeticGrade: falls back to $200, no exception', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    expect(() => ledger.recordJobCompletion('full_restoration', 0, null)).not.toThrow();
    expect(ledger.balance).toBe(200);
  });

  test('Scenario 10 (Issue #254) — undefined cosmeticGrade: falls back to $200, no exception', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    expect(() => ledger.recordJobCompletion('full_restoration', 0, undefined)).not.toThrow();
    expect(ledger.balance).toBe(200);
  });

  test('Scenario 10 (Issue #254) — unrecognised grade string: falls back to $200, no exception', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    expect(() => ledger.recordJobCompletion('full_restoration', 0, 'legendary')).not.toThrow();
    expect(ledger.balance).toBe(200);
  });

  // ── AC1 backward-compatibility: existing callers without cosmeticGrade ───

  test('Scenario 7 (Issue #254) — AC1 backward-compat: existing callers without cosmeticGrade param → $200, no error', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    const result = ledger.recordJobCompletion('full_restoration', 50);  // no third param

    expect(result.revenue).toBe(200);
    expect(result.netIncome).toBe(150);   // 200 - 50
    expect(result.newBalance).toBe(150);
  });

  // ── Grade multiplier values are correct (GRADE_MULTIPLIERS export) ────────

  test('GRADE_MULTIPLIERS export: adequate=1.10, good=1.20, mirror=1.30', () => {
    const { GRADE_MULTIPLIERS } = require('../../../javascript/economy/LedgerManager');
    expect(GRADE_MULTIPLIERS.adequate).toBe(1.10);
    expect(GRADE_MULTIPLIERS.good).toBe(1.20);
    expect(GRADE_MULTIPLIERS.mirror).toBe(1.30);
  });
});
