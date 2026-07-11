/**
 * Tests for CosmeticPhaseController.js — Issue #143, AC1–AC5
 *
 * Acceptance Criteria covered:
 *
 *   AC1: enterPhase() exposes ≥3 variants and baseline default.
 *   AC2: selectStrap() and confirmStrap() trigger asset swaps.
 *   AC3: confirmStrap() builds a before/after display payload.
 *   AC4: confirmStrap() persists strap_selection to save state.
 *   AC5: enterPhase() restores previously persisted strap_selection.
 *
 * Test Scenarios covered:
 *   1. Happy path — full strap swap flow.
 *   2. Default/no-change — confirm without selecting.
 *   3. Selection change before confirm — last pending wins.
 *   4. Return and re-select — persisted state restored on re-entry.
 *   7. Restoration summary accuracy — confirmed strap available via exitPhase().
 *   9. Integration with full restoration flow — enterPhase, select, confirm, exit.
 */

'use strict';

const { CosmeticPhaseController } = require('../../../src/cosmetic/CosmeticPhaseController');
const { PlayerSaveState }         = require('../../../src/state/PlayerSaveState');
const { getSelectableStraps, getBaselineStrap } = require('../../../src/cosmetic/StrapCatalogue');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeController(overrides = {}) {
  const saveState = overrides.saveState || new PlayerSaveState();
  const swapCalls = overrides.swapCalls || [];
  const cacheCalls = overrides.cacheCalls || [];
  const beforeAfterPayloads = overrides.beforeAfterPayloads || [];

  const controller = new CosmeticPhaseController({
    saveState,
    swapRigFn: (key) => swapCalls.push(key),
    cacheFn:   (key) => cacheCalls.push(key),
    onBeforeAfter: (p) => beforeAfterPayloads.push(p),
    displayMode: overrides.displayMode || 'side_by_side',
  });

  return { controller, saveState, swapCalls, cacheCalls, beforeAfterPayloads };
}

// ── AC1: enterPhase exposes variants and baseline ────────────────────────────

describe('CosmeticPhaseController — AC1: enterPhase() exposes variants and baseline', () => {
  test('enterPhase() returns ≥4 variants (baseline + ≥3 selectable)', () => {
    const { controller } = makeController();
    const { variants } = controller.enterPhase();
    expect(variants.length).toBeGreaterThanOrEqual(4);
  });

  test('enterPhase() returns baseline as currentStrapId when no prior selection', () => {
    const { controller } = makeController();
    const { currentStrapId } = controller.enterPhase();
    expect(currentStrapId).toBe('worn_original');
  });

  test('enterPhase() pre-caches all strap assets', () => {
    const { controller, cacheCalls } = makeController();
    controller.enterPhase();
    expect(cacheCalls.length).toBeGreaterThanOrEqual(4); // all variants cached
  });

  test('enterPhase() triggers initial asset swap for the current strap', () => {
    const { controller, swapCalls } = makeController();
    controller.enterPhase();
    const baseline = getBaselineStrap();
    expect(swapCalls).toContain(baseline.assetKey);
  });
});

// ── AC2: selectStrap() triggers live preview ─────────────────────────────────

describe('CosmeticPhaseController — AC2: selectStrap() triggers live asset swap', () => {
  test('selectStrap() calls the rig swap function', () => {
    const { controller, swapCalls } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    expect(swapCalls).toContain(a.assetKey);
  });

  test('selectStrap() returns success: true for known strap', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    const result = controller.selectStrap(a.id);
    expect(result.success).toBe(true);
  });

  test('selectStrap() returns success: false for unknown strap', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const result = controller.selectStrap('fake_strap');
    expect(result.success).toBe(false);
  });
});

// ── AC2: confirmStrap() commits selection ────────────────────────────────────

describe('CosmeticPhaseController — AC2: confirmStrap() commits strap', () => {
  test('confirmStrap() returns the selected strapId', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    const result = controller.confirmStrap();
    expect(result.strapId).toBe(a.id);
  });

  test('confirmStrap() without prior selectStrap retains baseline (default/no-change)', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const result = controller.confirmStrap();
    expect(result.strap.isBaseline).toBe(true);
  });
});

// ── AC3: confirmStrap() builds before/after payload ─────────────────────────

describe('CosmeticPhaseController — AC3: before/after display payload', () => {
  test('confirmStrap() returns a non-null beforeAfterPayload', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    const { beforeAfterPayload } = controller.confirmStrap();
    expect(beforeAfterPayload).not.toBeNull();
  });

  test('payload.before.assetKey is the baseline worn strap', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    const { beforeAfterPayload } = controller.confirmStrap();
    expect(beforeAfterPayload.before.assetKey).toBe('strap_worn_original');
  });

  test('payload.after.assetKey is the selected strap', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    const { beforeAfterPayload } = controller.confirmStrap();
    expect(beforeAfterPayload.after.assetKey).toBe(a.assetKey);
  });

  test('payload.hasChange is true when a new strap was selected', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    const { beforeAfterPayload } = controller.confirmStrap();
    expect(beforeAfterPayload.hasChange).toBe(true);
  });

  test('payload.hasChange is false when no strap change was made (baseline confirmed)', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const { beforeAfterPayload } = controller.confirmStrap(); // no selectStrap call
    expect(beforeAfterPayload.hasChange).toBe(false);
  });

  test('onBeforeAfter callback is fired with the payload', () => {
    const { controller, beforeAfterPayloads } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    controller.confirmStrap();
    expect(beforeAfterPayloads.length).toBe(1);
    expect(beforeAfterPayloads[0].phaseId).toBe('strap');
  });
});

// ── AC4: strap_selection persisted to save state ─────────────────────────────

describe('CosmeticPhaseController — AC4: strap_selection persisted to save state', () => {
  test('confirmStrap() writes strap_selection to save state', () => {
    const { controller, saveState } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    controller.confirmStrap();
    expect(saveState.get('strap_selection')).toBe(a.id);
  });

  test('exitPhase() returns confirmedStrapId matching what was confirmed', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    controller.confirmStrap();
    const { confirmedStrapId } = controller.exitPhase();
    expect(confirmedStrapId).toBe(a.id);
  });

  test('exitPhase() returns beforeAfterPayload for restoration summary', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    controller.confirmStrap();
    const { beforeAfterPayload } = controller.exitPhase();
    expect(beforeAfterPayload).not.toBeNull();
  });
});

// ── AC5: strap_selection restored from save state on re-entry ─────────────────

describe('CosmeticPhaseController — AC5: persisted strap restored on back-navigation', () => {
  test('entering phase with prior strap_selection restores that strap', () => {
    const [a] = getSelectableStraps();
    const saveState = new PlayerSaveState({ strap_selection: a.id });
    const { controller } = makeController({ saveState });
    const { currentStrapId } = controller.enterPhase();
    expect(currentStrapId).toBe(a.id);
  });

  test('re-entering with persisted selection applies that strap to the rig', () => {
    const [a] = getSelectableStraps();
    const saveState = new PlayerSaveState({ strap_selection: a.id });
    const { controller, swapCalls } = makeController({ saveState });
    controller.enterPhase();
    expect(swapCalls).toContain(a.assetKey);
  });

  test('re-entering with no prior selection defaults to baseline worn strap', () => {
    const saveState = new PlayerSaveState(); // no strap_selection
    const { controller } = makeController({ saveState });
    const { currentStrapId } = controller.enterPhase();
    expect(currentStrapId).toBe('worn_original');
  });
});

// ── Test Scenario 3: Selection change before confirm ──────────────────────

describe('CosmeticPhaseController — Test Scenario 3: last selection before confirm wins', () => {
  test('selecting A then B then confirming persists B, not A', () => {
    const { controller, saveState } = makeController();
    controller.enterPhase();
    const [a, b] = getSelectableStraps();
    controller.selectStrap(a.id);
    controller.selectStrap(b.id);
    controller.confirmStrap();
    expect(saveState.get('strap_selection')).toBe(b.id);
  });
});

// ── Test Scenario 9: Integration — full phase flow ────────────────────────

describe('CosmeticPhaseController — Test Scenario 9: full cosmetic phase flow', () => {
  test('enter → select → confirm → exit completes without error', () => {
    const { controller } = makeController();
    const { variants } = controller.enterPhase();
    expect(variants.length).toBeGreaterThanOrEqual(4);

    const [a] = getSelectableStraps();
    const selectResult = controller.selectStrap(a.id);
    expect(selectResult.success).toBe(true);

    const { strapId, beforeAfterPayload } = controller.confirmStrap();
    expect(strapId).toBe(a.id);
    expect(beforeAfterPayload).not.toBeNull();

    const exitResult = controller.exitPhase();
    expect(exitResult.confirmedStrapId).toBe(a.id);
    expect(exitResult.confirmedStrap.id).toBe(a.id);
  });

  test('calling methods before enterPhase() throws an error', () => {
    const { controller } = makeController();
    expect(() => controller.selectStrap('leather_black')).toThrow();
    expect(() => controller.confirmStrap()).toThrow();
    expect(() => controller.exitPhase()).toThrow();
  });
});

// ── Accessor: getLastBeforeAfterPayload() ─────────────────────────────────

describe('CosmeticPhaseController — getLastBeforeAfterPayload()', () => {
  test('returns null before any confirm', () => {
    const { controller } = makeController();
    controller.enterPhase();
    expect(controller.getLastBeforeAfterPayload()).toBeNull();
  });

  test('returns the payload after confirmStrap()', () => {
    const { controller } = makeController();
    controller.enterPhase();
    const [a] = getSelectableStraps();
    controller.selectStrap(a.id);
    controller.confirmStrap();
    expect(controller.getLastBeforeAfterPayload()).not.toBeNull();
  });
});
