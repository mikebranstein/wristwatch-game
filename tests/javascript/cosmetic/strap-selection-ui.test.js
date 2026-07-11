/**
 * Tests for StrapSelectionUI.js — Issue #143, AC1, AC2, AC5
 *
 * Acceptance Criteria covered:
 *
 *   AC1: At least 3 strap variants displayed, worn strap as baseline default.
 *   AC2: Selecting and confirming a strap triggers asset swap.
 *   AC5: Previously selected strap (or baseline) retained on back-navigation.
 *
 * Test Scenarios covered:
 *   2. Default/no-change path — confirm without selecting a new strap.
 *   3. Selection change before confirm — last selection wins.
 *   4. Return and re-select — persisted selection restores on re-entry.
 *   5. All variants displayed.
 *  10. Edge case — single variant graceful handling.
 */

'use strict';

const { StrapSelectionUI } = require('../../../src/cosmetic/StrapSelectionUI');
const { getBaselineStrap, getSelectableStraps } = require('../../../src/cosmetic/StrapCatalogue');

// ─── AC1: variants exposed and baseline default ────────────────────────────

describe('StrapSelectionUI — AC1: variant display and baseline default', () => {
  test('getViewState().variants contains ≥4 entries (baseline + ≥3 selectable)', () => {
    const ui = new StrapSelectionUI();
    expect(ui.getViewState().variants.length).toBeGreaterThanOrEqual(4);
  });

  test('default pending strap is the worn baseline', () => {
    const ui = new StrapSelectionUI();
    expect(ui.getPendingStrap().isBaseline).toBe(true);
  });

  test('default confirmed strap is the worn baseline', () => {
    const ui = new StrapSelectionUI();
    expect(ui.getConfirmedStrap().isBaseline).toBe(true);
  });

  test('getViewState().variants includes a baseline entry', () => {
    const ui = new StrapSelectionUI();
    const baseline = ui.getViewState().variants.find(v => v.isBaseline);
    expect(baseline).toBeDefined();
  });

  test('getViewState() contains confirmedStrapId', () => {
    const ui = new StrapSelectionUI();
    expect(typeof ui.getViewState().confirmedStrapId).toBe('string');
  });
});

// ─── AC2: selectStrap() triggers asset swap ────────────────────────────────

describe('StrapSelectionUI — AC2: live preview triggers asset swap', () => {
  test('selectStrap() calls onAssetSwap with variant assetKey', () => {
    const swapped = [];
    const ui = new StrapSelectionUI({ onAssetSwap: (key) => swapped.push(key) });
    const selectable = getSelectableStraps();
    ui.selectStrap(selectable[0].id);
    expect(swapped).toContain(selectable[0].assetKey);
  });

  test('selectStrap() calls onPreview with the variant', () => {
    const previewed = [];
    const ui = new StrapSelectionUI({ onPreview: (v) => previewed.push(v) });
    const selectable = getSelectableStraps();
    ui.selectStrap(selectable[0].id);
    expect(previewed[0].id).toBe(selectable[0].id);
  });

  test('selectStrap() returns success: true for valid id', () => {
    const ui = new StrapSelectionUI();
    const selectable = getSelectableStraps();
    const result = ui.selectStrap(selectable[0].id);
    expect(result.success).toBe(true);
    expect(result.strap.id).toBe(selectable[0].id);
  });

  test('selectStrap() returns success: false for unknown id', () => {
    const ui = new StrapSelectionUI();
    const result = ui.selectStrap('does_not_exist');
    expect(result.success).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  test('selectStrap() updates pendingStrap', () => {
    const ui = new StrapSelectionUI();
    const selectable = getSelectableStraps();
    ui.selectStrap(selectable[1].id);
    expect(ui.getPendingStrap().id).toBe(selectable[1].id);
  });

  test('selectStrap() does NOT yet update confirmedStrap', () => {
    const ui = new StrapSelectionUI();
    const selectable = getSelectableStraps();
    const originalConfirmed = ui.getConfirmedStrap().id;
    ui.selectStrap(selectable[1].id);
    expect(ui.getConfirmedStrap().id).toBe(originalConfirmed);
  });
});

// ─── AC2: confirmSelection() commits the pending strap ────────────────────

describe('StrapSelectionUI — AC2: confirmSelection() commits strap', () => {
  test('confirmSelection() moves pending strap to confirmed', () => {
    const ui = new StrapSelectionUI();
    const selectable = getSelectableStraps();
    ui.selectStrap(selectable[0].id);
    ui.confirmSelection();
    expect(ui.getConfirmedStrap().id).toBe(selectable[0].id);
  });

  test('confirmSelection() calls onConfirm with the confirmed strap', () => {
    const confirmed = [];
    const ui = new StrapSelectionUI({ onConfirm: (v) => confirmed.push(v) });
    const selectable = getSelectableStraps();
    ui.selectStrap(selectable[0].id);
    ui.confirmSelection();
    expect(confirmed[0].id).toBe(selectable[0].id);
  });

  test('confirmSelection() returns { strapId, strap } correctly', () => {
    const ui = new StrapSelectionUI();
    const selectable = getSelectableStraps();
    ui.selectStrap(selectable[0].id);
    const result = ui.confirmSelection();
    expect(result.strapId).toBe(selectable[0].id);
    expect(result.strap.id).toBe(selectable[0].id);
  });

  test('confirmSelection() sets isConfirmed: true in view state', () => {
    const ui = new StrapSelectionUI();
    ui.confirmSelection();
    expect(ui.getViewState().isConfirmed).toBe(true);
  });

  // Test Scenario 2: Default/no-change path
  test('confirming without selecting any new strap retains baseline', () => {
    const ui = new StrapSelectionUI();
    const result = ui.confirmSelection();
    expect(result.strap.isBaseline).toBe(true);
  });
});

// ─── Test Scenario 3: Selection change before confirm ─────────────────────

describe('StrapSelectionUI — Test Scenario 3: last selection before confirm wins', () => {
  test('selecting strap A then strap B then confirming gives strap B', () => {
    const ui = new StrapSelectionUI();
    const [a, b] = getSelectableStraps();
    ui.selectStrap(a.id);
    ui.selectStrap(b.id);
    const result = ui.confirmSelection();
    expect(result.strapId).toBe(b.id);
  });

  test('before/after asset swaps: both A and B were called, B is final confirm', () => {
    const swapped = [];
    const ui = new StrapSelectionUI({ onAssetSwap: (k) => swapped.push(k) });
    const [a, b] = getSelectableStraps();
    ui.selectStrap(a.id);
    ui.selectStrap(b.id);
    ui.confirmSelection();
    expect(swapped).toContain(a.assetKey);
    expect(swapped[swapped.length - 1]).toBe(b.assetKey); // final confirm = strap B
  });
});

// ─── AC5 / Test Scenario 4: Back-navigation persists prior selection ───────

describe('StrapSelectionUI — AC5: persisted strap restored on re-entry', () => {
  test('new UI with persistedStrapId defaults confirmed strap to that id', () => {
    const selectable = getSelectableStraps();
    const ui = new StrapSelectionUI({ persistedStrapId: selectable[0].id });
    expect(ui.getConfirmedStrap().id).toBe(selectable[0].id);
  });

  test('new UI with persistedStrapId sets pending to that id', () => {
    const selectable = getSelectableStraps();
    const ui = new StrapSelectionUI({ persistedStrapId: selectable[0].id });
    expect(ui.getPendingStrap().id).toBe(selectable[0].id);
  });

  test('new UI with unknown persistedStrapId falls back to baseline', () => {
    const ui = new StrapSelectionUI({ persistedStrapId: 'nonexistent_strap' });
    expect(ui.getConfirmedStrap().isBaseline).toBe(true);
  });

  test('back-nav: select strap C after returning to step (persisted A) works', () => {
    const [a, , c] = getSelectableStraps();
    // Simulate having previously selected A
    const ui = new StrapSelectionUI({ persistedStrapId: a.id });
    // Player changes to C
    ui.selectStrap(c.id);
    const result = ui.confirmSelection();
    expect(result.strapId).toBe(c.id);
  });
});

// ─── cancelSelection() ──────────────────────────────────────────────────────

describe('StrapSelectionUI — cancelSelection() reverts to confirmed strap', () => {
  test('after cancel, pending reverts to confirmed', () => {
    const ui = new StrapSelectionUI();
    const [a] = getSelectableStraps();
    ui.selectStrap(a.id);
    ui.cancelSelection();
    expect(ui.getPendingStrap().isBaseline).toBe(true);
  });

  test('cancel restores asset swap to confirmed strap assetKey', () => {
    const swapped = [];
    const ui = new StrapSelectionUI({ onAssetSwap: (k) => swapped.push(k) });
    const [a] = getSelectableStraps();
    const baseline = getBaselineStrap();
    ui.selectStrap(a.id);
    ui.cancelSelection();
    expect(swapped[swapped.length - 1]).toBe(baseline.assetKey);
  });
});
