/**
 * Tests: WorkshopHubNav (ledger HUD) — Workshop Economy MVP (Issue #145)
 *
 * Tests the getLedgerHudViewModel() addition to WorkshopHubNav.
 * Verifies that the persistent HUD display reflects the current ledger state
 * and is safely backward-compatible with pre-economy save files.
 *
 * Acceptance Criteria covered:
 *   AC2 — Ledger totals visible from workshop HUD at all times.
 *   AC4 — Cozy Mode state visible in HUD.
 *
 * Test Scenarios covered:
 *   Scenario 8 — HUD reads persisted ledger state from save (no stale data)
 *   Backward compat — Pre-economy save: all HUD fields default to 0/false
 *
 * Run with: npm test
 */

'use strict';

const { WorkshopHubNav } = require('../../../javascript/ui/WorkshopHubNav');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSaveState(initial = {}) {
  const store = Object.assign({
    completed_watches:       [],
    ledger_income_total:     0,
    ledger_parts_cost_total: 0,
    ledger_balance:          0,
    cozy_mode_enabled:       false,
  }, initial);
  return {
    get: (key) => (key in store ? store[key] : null),
    set: (key, value) => { store[key] = value; },
    appendCompletedWatch: (entry) => { store.completed_watches.push(entry); },
    snapshot: () => ({ ...store }),
    _store: store,
    getCompletedWatches: () => [...store.completed_watches],
  };
}

// ── getLedgerHudViewModel ─────────────────────────────────────────────────────

describe('WorkshopHubNav.getLedgerHudViewModel() — AC2', () => {
  test('returns zero defaults for new save (pre-economy backward compat)', () => {
    const nav = new WorkshopHubNav({ saveState: makeSaveState() });
    const vm  = nav.getLedgerHudViewModel();

    expect(vm.balance).toBe(0);
    expect(vm.incomeTotal).toBe(0);
    expect(vm.partsCostTotal).toBe(0);
    expect(vm.cosyMode).toBe(false);
  });

  test('Scenario 8 — reads current ledger balance from save state', () => {
    const save = makeSaveState({
      ledger_balance:          150,
      ledger_income_total:     200,
      ledger_parts_cost_total: 50,
      cozy_mode_enabled:       false,
    });
    const nav = new WorkshopHubNav({ saveState: save });
    const vm  = nav.getLedgerHudViewModel();

    expect(vm.balance).toBe(150);
    expect(vm.incomeTotal).toBe(200);
    expect(vm.partsCostTotal).toBe(50);
    expect(vm.cosyMode).toBe(false);
  });

  test('AC4 — Cozy Mode state reflected in HUD view-model', () => {
    const save = makeSaveState({ cozy_mode_enabled: true, ledger_balance: 99 });
    const nav  = new WorkshopHubNav({ saveState: save });
    const vm   = nav.getLedgerHudViewModel();

    expect(vm.cosyMode).toBe(true);
    expect(vm.balance).toBe(99);
  });

  test('HUD reflects live save state changes (no stale cached values)', () => {
    const save = makeSaveState({ ledger_balance: 100 });
    const nav  = new WorkshopHubNav({ saveState: save });

    expect(nav.getLedgerHudViewModel().balance).toBe(100);

    // Simulate balance update (e.g. after delivery)
    save.set('ledger_balance', 250);
    expect(nav.getLedgerHudViewModel().balance).toBe(250);
  });
});

// ── Existing hub nav functionality unaffected ─────────────────────────────────

describe('WorkshopHubNav — existing functionality unaffected by economy additions', () => {
  test('getHubNavViewModel() still returns collection_gallery button', () => {
    const nav = new WorkshopHubNav({ saveState: makeSaveState() });
    const vm  = nav.getHubNavViewModel();
    expect(vm.buttons).toHaveLength(1);
    expect(vm.buttons[0].id).toBe('collection_gallery');
    expect(vm.buttons[0].enabled).toBe(true);
  });
});
