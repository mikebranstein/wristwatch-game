/**
 * CosmeticPhaseController — top-level orchestrator for the cosmetic
 * restoration phase step.
 *
 * Issue #143 — Strap Swap: Cosmetic Restoration Phase 1
 * (AC1, AC2, AC3, AC4, AC5)
 *
 * Wires together:
 *   1. StrapCatalogue         — static strap variant data (AC1)
 *   2. StrapSelectionUI       — selection and preview state (AC1, AC2, AC5)
 *   3. StrapAssetSwap         — real-time 3D rig swap (AC2)
 *   4. StrapBeforeAfterDisplay — generic before/after payload (AC3)
 *   5. PlayerSaveState         — strap_selection persisted to restoration state (AC4, AC5)
 *
 * Design pattern: constructor injection for all side-effect hooks
 * (swap rig, save state, cache fn) so every code path is testable in isolation.
 *
 * Lifecycle:
 *   1. enterPhase()   — pre-cache assets, capture before-state, restore previous selection
 *   2. selectStrap()  — live preview (optional — player can browse before confirming)
 *   3. confirmStrap() — commit selection, trigger before/after display, persist to save state
 *   4. exitPhase()    — get final phase result for the restoration summary (AC4)
 */

'use strict';

const { StrapSelectionUI }       = require('./StrapSelectionUI');
const { StrapAssetSwap }         = require('./StrapAssetSwap');
const { StrapBeforeAfterDisplay } = require('./StrapBeforeAfterDisplay');
const { getBaselineStrap }       = require('./StrapCatalogue');

class CosmeticPhaseController {
  /**
   * @param {Object}   opts
   * @param {Object}   opts.saveState         — PlayerSaveState instance (or compatible duck-type)
   * @param {Function} opts.swapRigFn         — (assetKey: string) => void
   * @param {Function} [opts.cacheFn]         — (assetKey: string) => void  (pre-cache hook)
   * @param {Function} [opts.onBeforeAfter]   — (payload: BeforeAfterDisplayPayload) => void
   * @param {Function} [opts.nowFn]           — () => number (timestamp override for testing)
   * @param {string}   [opts.displayMode]     — 'side_by_side' | 'sequential_reveal'
   */
  constructor({ saveState, swapRigFn, cacheFn = null, onBeforeAfter = null, nowFn = null, displayMode = 'side_by_side' }) {
    this._saveState = saveState;
    this._onBeforeAfter = onBeforeAfter;

    this._assetSwap = new StrapAssetSwap({ swapRigFn, cacheFn, nowFn });
    this._beforeAfter = new StrapBeforeAfterDisplay({ phaseId: 'strap', displayMode });

    this._selectionUI = null; // created in enterPhase()
    this._lastBeforeAfterPayload = null;
    this._phaseActive = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Enter the cosmetic restoration phase step.
   *
   * 1. Pre-caches all strap assets to satisfy < 100 ms swap latency (design mitigation).
   * 2. Captures the before-state snapshot using the persisted or baseline strap.
   * 3. Initialises the selection UI, restoring any previously saved selection (AC5).
   * 4. Applies the persisted/baseline strap to the rig immediately on entry.
   *
   * @returns {{ variants: StrapVariant[], currentStrapId: string }}
   */
  enterPhase() {
    this._phaseActive = true;

    // Pre-cache all strap assets (design mitigation for < 100 ms swap latency)
    this._assetSwap.preCacheAll();

    // Restore persisted selection (AC5: back-navigation retains previous choice)
    const persistedStrapId = this._saveState.get('strap_selection') || null;

    // Build the selection UI (restores persisted state automatically)
    this._selectionUI = new StrapSelectionUI({
      persistedStrapId,
      onAssetSwap: (assetKey) => this._assetSwap.swap(assetKey),
    });

    // Capture before-state (worn/baseline strap at phase entry)
    const currentStrap = this._selectionUI.getConfirmedStrap();
    this._beforeAfter.captureBeforeState({
      assetKey: currentStrap.assetKey,
      label: currentStrap.label,
      description: currentStrap.description,
    });

    // Apply persisted/baseline strap to rig on entry
    this._assetSwap.swap(currentStrap.assetKey);

    const viewState = this._selectionUI.getViewState();
    return {
      variants: viewState.variants,
      currentStrapId: viewState.confirmedStrapId,
    };
  }

  // ── Player actions ────────────────────────────────────────────────────────

  /**
   * Player selects (previews) a strap before confirming.
   * Triggers a real-time asset swap for live 3D preview (AC2).
   *
   * @param {string} strapId
   * @returns {{ success: boolean, reason: string|null, strap: StrapVariant|null }}
   */
  selectStrap(strapId) {
    this._assertPhaseActive();
    return this._selectionUI.selectStrap(strapId);
  }

  /**
   * Player confirms their current pending strap selection.
   *
   * 1. Commits the selection (AC2: rig already updated via live preview).
   * 2. Persists strap_selection to PlayerSaveState (AC4, AC5).
   * 3. Builds the before/after display payload (AC3).
   * 4. Fires the onBeforeAfter callback so the UI can display the reveal.
   *
   * @returns {{ strapId: string, strap: StrapVariant, beforeAfterPayload: BeforeAfterDisplayPayload }}
   */
  confirmStrap() {
    this._assertPhaseActive();
    const { strapId, strap } = this._selectionUI.confirmSelection();

    // Persist to save state (AC4: survives navigation; reflected in summary)
    this._saveState.set('strap_selection', strapId);

    // Build before/after display payload (AC3)
    const afterSnapshot = {
      assetKey: strap.assetKey,
      label: strap.label,
      description: strap.description,
    };
    const payload = this._beforeAfter.buildPayload(afterSnapshot);
    this._lastBeforeAfterPayload = payload;

    if (payload && this._onBeforeAfter) {
      this._onBeforeAfter(payload);
    }

    return { strapId, strap, beforeAfterPayload: payload };
  }

  // ── Phase exit ────────────────────────────────────────────────────────────

  /**
   * Exit the cosmetic restoration phase step and return the final result
   * for consumption by the restoration summary screen (AC4).
   *
   * @returns {{
   *   confirmedStrapId: string,
   *   confirmedStrap: StrapVariant,
   *   beforeAfterPayload: BeforeAfterDisplayPayload|null
   * }}
   */
  exitPhase() {
    this._assertPhaseActive();
    this._phaseActive = false;
    const confirmedStrap = this._selectionUI.getConfirmedStrap();
    return {
      confirmedStrapId: confirmedStrap.id,
      confirmedStrap,
      beforeAfterPayload: this._lastBeforeAfterPayload,
    };
  }

  // ── Accessors (for testing) ───────────────────────────────────────────────

  /** @returns {StrapAssetSwap} */
  getAssetSwap() { return this._assetSwap; }

  /** @returns {StrapSelectionUI|null} */
  getSelectionUI() { return this._selectionUI; }

  /** @returns {StrapBeforeAfterDisplay} */
  getBeforeAfterDisplay() { return this._beforeAfter; }

  /** @returns {BeforeAfterDisplayPayload|null} */
  getLastBeforeAfterPayload() { return this._lastBeforeAfterPayload; }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * @private
   */
  _assertPhaseActive() {
    if (!this._phaseActive) {
      throw new Error('CosmeticPhaseController: phase is not active — call enterPhase() first');
    }
  }
}

module.exports = { CosmeticPhaseController };
