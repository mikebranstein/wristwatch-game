/**
 * Tests: UpgradeShop — Workshop Economy MVP (Issue #145)
 *
 * Acceptance Criteria covered:
 *   AC3 — Purchase flow: balance deducted, upgrade applied, cannot re-purchase.
 *   AC5 — Insufficient balance: locked state with "Need X more credits"; no balance change.
 *
 * Test Scenarios covered:
 *   Scenario 3 — Upgrade purchase flow (Precision Tweezers)
 *   Scenario 4 — All upgrades purchased; fully-upgraded state shown
 *   Scenario 5 — Insufficient balance: purchase blocked, clear indicator shown
 *
 * Run with: npm test
 */

'use strict';

const { LedgerManager }                    = require('../../../javascript/economy/LedgerManager');
const { UpgradeShop, ALL_UPGRADE_IDS }     = require('../../../javascript/economy/UpgradeShop');

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

function makeShop(balanceOverride = 0, upgradesOverride = []) {
  const save   = makeSaveState({ ledger_balance: balanceOverride, workshop_upgrades: upgradesOverride });
  const ledger = new LedgerManager(save);
  const shop   = new UpgradeShop(save, ledger);
  return { save, ledger, shop };
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('UpgradeShop — constructor', () => {
  test('throws if saveState is missing', () => {
    const save   = makeSaveState();
    const ledger = new LedgerManager(save);
    expect(() => new UpgradeShop(null, ledger)).toThrow('saveState must implement');
  });

  test('throws if ledgerManager is missing', () => {
    const save = makeSaveState();
    expect(() => new UpgradeShop(save, null)).toThrow('ledgerManager must be a LedgerManager instance');
  });

  test('constructs successfully with valid arguments', () => {
    const { shop } = makeShop(200);
    expect(shop.purchasedUpgrades).toEqual([]);
    expect(shop.isFullyUpgraded).toBe(false);
  });
});

// ── AC3: Purchase flow (Scenario 3) ──────────────────────────────────────────

describe('UpgradeShop.purchase() — AC3 (Scenario 3: upgrade purchase flow)', () => {
  test('Scenario 3 — Purchase Precision Tweezers: balance deducted, upgrade owned', () => {
    const { shop, ledger } = makeShop(200);

    const result = shop.purchase('precision_tweezers');

    expect(result.success).toBe(true);
    expect(result.upgrade.id).toBe('precision_tweezers');
    expect(result.newBalance).toBe(200 - 80);   // cost = 80
    expect(ledger.balance).toBe(120);
    expect(shop.isOwned('precision_tweezers')).toBe(true);
    expect(shop.purchasedUpgrades).toContain('precision_tweezers');
  });

  test('AC3 — Upgrade cannot be purchased a second time (idempotency guard)', () => {
    const { shop } = makeShop(500);

    shop.purchase('precision_tweezers');
    const result = shop.purchase('precision_tweezers');  // second attempt

    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_owned');
  });

  test('AC3 — Balance is NOT deducted on second purchase attempt', () => {
    const { shop, ledger } = makeShop(500);
    shop.purchase('precision_tweezers');
    const balanceAfterFirst = ledger.balance;

    shop.purchase('precision_tweezers');  // second attempt
    expect(ledger.balance).toBe(balanceAfterFirst);  // unchanged
  });

  test('AC3 — Shop view-model shows upgrade as owned after purchase', () => {
    const { shop } = makeShop(500);
    shop.purchase('magnification');

    const vm = shop.getShopViewModel();
    const magEntry = vm.upgrades.find(u => u.id === 'magnification');
    expect(magEntry.owned).toBe(true);
    expect(magEntry.locked).toBe(true);  // owned → locked from further purchase
  });

  test('throws for unknown upgrade ID', () => {
    const { shop } = makeShop(500);
    expect(() => shop.purchase('ultra_tweezer_9000')).toThrow("unknown upgrade 'ultra_tweezer_9000'");
  });
});

// ── Scenario 4: All upgrades purchased ───────────────────────────────────────

describe('UpgradeShop — Scenario 4 (all upgrades purchased)', () => {
  test('Scenario 4 — Purchase all upgrades; isFullyUpgraded = true; no further purchases possible', () => {
    const { shop, ledger } = makeShop(1000);

    for (const id of ALL_UPGRADE_IDS) {
      const r = shop.purchase(id);
      expect(r.success).toBe(true);
    }

    expect(shop.isFullyUpgraded).toBe(true);

    // All upgrades owned — no re-purchase possible
    for (const id of ALL_UPGRADE_IDS) {
      const r = shop.purchase(id);
      expect(r.success).toBe(false);
      expect(r.reason).toBe('already_owned');
    }
  });

  test('Scenario 4 — Shop view-model shows fullyUpgraded when all owned', () => {
    const { shop } = makeShop(1000);
    ALL_UPGRADE_IDS.forEach(id => shop.purchase(id));

    const vm = shop.getShopViewModel();
    expect(vm.fullyUpgraded).toBe(true);
    vm.upgrades.forEach(u => {
      expect(u.owned).toBe(true);
      expect(u.locked).toBe(true);
    });
  });
});

// ── AC5: Insufficient balance (Scenario 5) ───────────────────────────────────

describe('UpgradeShop.purchase() — AC5 (Scenario 5: insufficient balance)', () => {
  test('Scenario 5 — Insufficient balance: purchase blocked, no balance change', () => {
    const { shop, ledger } = makeShop(50);  // balance = 50, tweezers cost 80

    const result = shop.purchase('precision_tweezers');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('insufficient_balance');
    expect(result.needed).toBe(30);         // 80 - 50
    expect(ledger.balance).toBe(50);        // unchanged — no negative balance
    expect(shop.isOwned('precision_tweezers')).toBe(false);
  });

  test('AC5 — Shop view-model shows locked state + balanceRequired for unaffordable upgrades', () => {
    const { shop } = makeShop(50);  // balance = 50

    const vm = shop.getShopViewModel();
    const tweezersEntry = vm.upgrades.find(u => u.id === 'precision_tweezers');
    expect(tweezersEntry.locked).toBe(true);
    expect(tweezersEntry.affordable).toBe(false);
    expect(tweezersEntry.balanceRequired).toBe(30);   // need 30 more
  });

  test('AC5 — No negative balance states possible', () => {
    const { shop, ledger } = makeShop(0);

    shop.purchase('precision_tweezers');
    shop.purchase('magnification');
    shop.purchase('lighting_improvement');

    expect(ledger.balance).toBeGreaterThanOrEqual(0);
    expect(ledger.balance).toBe(0);
  });

  test('AC5 — Exact balance covers cost: purchase succeeds', () => {
    const { shop, ledger } = makeShop(80);  // exact cost for tweezers
    const result = shop.purchase('precision_tweezers');
    expect(result.success).toBe(true);
    expect(ledger.balance).toBe(0);
  });
});

// ── isOwned + purchasedUpgrades ───────────────────────────────────────────────

describe('UpgradeShop — read accessors', () => {
  test('isOwned() returns false for unowned upgrade', () => {
    const { shop } = makeShop(0);
    expect(shop.isOwned('magnification')).toBe(false);
  });

  test('purchasedUpgrades returns [] for new player', () => {
    const { shop } = makeShop(0);
    expect(shop.purchasedUpgrades).toEqual([]);
  });

  test('purchasedUpgrades correctly reflects save state (simulated reload)', () => {
    const save   = makeSaveState({ ledger_balance: 500, workshop_upgrades: ['magnification'] });
    const ledger = new LedgerManager(save);
    const shop   = new UpgradeShop(save, ledger);

    expect(shop.isOwned('magnification')).toBe(true);
    expect(shop.isOwned('precision_tweezers')).toBe(false);
  });
});
