/**
 * Tests: CosyModeManager — Workshop Economy MVP (Issue #145)
 *
 * Acceptance Criteria covered:
 *   AC4 — Cozy Mode toggle: cost-pressure indicators hidden/suppressed; toggle persists.
 *
 * Test Scenarios covered:
 *   Scenario 6 — Cozy Mode toggle ON: financial indicators become display-only
 *   Scenario 7 — Cozy Mode toggle OFF: financial deductions resume on next job
 *   Scenario 8 — Session persistence: cozy mode state persists after simulated reload
 *
 * Run with: npm test
 */

'use strict';

const { CosyModeManager } = require('../../../src/economy/CosyModeManager');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSaveState(initial = {}) {
  const store = Object.assign({ cozy_mode_enabled: false }, initial);
  return {
    get: (key) => (key in store ? store[key] : null),
    set: (key, value) => { store[key] = value; },
    _store: store,
  };
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('CosyModeManager — constructor', () => {
  test('throws if saveState is missing', () => {
    expect(() => new CosyModeManager(null)).toThrow('saveState must implement');
  });

  test('constructs successfully; defaults to disabled', () => {
    const mgr = new CosyModeManager(makeSaveState());
    expect(mgr.isEnabled).toBe(false);
  });

  test('reads cozy_mode_enabled from existing save state', () => {
    const mgr = new CosyModeManager(makeSaveState({ cozy_mode_enabled: true }));
    expect(mgr.isEnabled).toBe(true);
  });
});

// ── AC4: Toggle on / off (Scenarios 6, 7) ────────────────────────────────────

describe('CosyModeManager — AC4 toggle (Scenarios 6, 7)', () => {
  test('Scenario 6 — enable(): sets cozy_mode_enabled to true', () => {
    const save = makeSaveState();
    const mgr  = new CosyModeManager(save);

    const newState = mgr.enable();

    expect(newState).toBe(true);
    expect(mgr.isEnabled).toBe(true);
    expect(save._store.cozy_mode_enabled).toBe(true);
  });

  test('Scenario 7 — disable(): sets cozy_mode_enabled to false', () => {
    const save = makeSaveState({ cozy_mode_enabled: true });
    const mgr  = new CosyModeManager(save);

    const newState = mgr.disable();

    expect(newState).toBe(false);
    expect(mgr.isEnabled).toBe(false);
    expect(save._store.cozy_mode_enabled).toBe(false);
  });

  test('toggle() flips state: false → true', () => {
    const mgr = new CosyModeManager(makeSaveState({ cozy_mode_enabled: false }));
    expect(mgr.toggle()).toBe(true);
    expect(mgr.isEnabled).toBe(true);
  });

  test('toggle() flips state: true → false', () => {
    const mgr = new CosyModeManager(makeSaveState({ cozy_mode_enabled: true }));
    expect(mgr.toggle()).toBe(false);
    expect(mgr.isEnabled).toBe(false);
  });
});

// ── AC4: Toggle semantics — applies from NEXT job forward ────────────────────

describe('CosyModeManager — toggle semantics', () => {
  test('toggle mid-session is reflected in isEnabled immediately (next-job boundary)', () => {
    const save = makeSaveState();
    const mgr  = new CosyModeManager(save);

    expect(mgr.isEnabled).toBe(false);  // economy mode

    mgr.enable();
    expect(mgr.isEnabled).toBe(true);   // cozy mode active for next job

    mgr.disable();
    expect(mgr.isEnabled).toBe(false);  // economy resumed for next job
  });
});

// ── AC4: Persistence (Scenario 8) ────────────────────────────────────────────

describe('CosyModeManager — AC4 Scenario 8 (session persistence)', () => {
  test('Scenario 8 — Cozy Mode ON persists across simulated session reload', () => {
    const save = makeSaveState();
    const mgr1 = new CosyModeManager(save);
    mgr1.enable();

    // Simulate reload: new manager from same save state
    const mgr2 = new CosyModeManager(save);
    expect(mgr2.isEnabled).toBe(true);
  });

  test('Scenario 8 — Cozy Mode OFF persists across simulated session reload', () => {
    const save = makeSaveState({ cozy_mode_enabled: true });
    const mgr1 = new CosyModeManager(save);
    mgr1.disable();

    const mgr2 = new CosyModeManager(save);
    expect(mgr2.isEnabled).toBe(false);
  });
});

// ── View model ────────────────────────────────────────────────────────────────

describe('CosyModeManager.getViewModel()', () => {
  test('returns ON label and display-only description when enabled', () => {
    const mgr = new CosyModeManager(makeSaveState({ cozy_mode_enabled: true }));
    const vm  = mgr.getViewModel();
    expect(vm.enabled).toBe(true);
    expect(vm.label).toContain('ON');
    expect(vm.description).toContain('no cost deductions');
  });

  test('returns OFF label and standard description when disabled', () => {
    const mgr = new CosyModeManager(makeSaveState({ cozy_mode_enabled: false }));
    const vm  = mgr.getViewModel();
    expect(vm.enabled).toBe(false);
    expect(vm.label).toContain('OFF');
    expect(vm.description).toContain('Standard');
  });
});
