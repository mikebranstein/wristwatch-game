/**
 * StrapSelectionUI — manages the strap selection state during the cosmetic
 * restoration phase.
 *
 * Issue #143 — Strap Swap: Cosmetic Restoration Phase 1 (AC1, AC2, AC5)
 *
 * Responsibilities:
 *   - Present the list of available strap variants (baseline worn strap shown first).
 *   - Track the "pending" selection while the player browses (before confirm).
 *   - On confirm, commit the selection and notify the asset-swap system.
 *   - On initialise (or back-navigation), restore from previously persisted
 *     selection state so no data is lost (AC5).
 *
 * This is a pure data/state component — no DOM dependency — fully testable
 * in isolation. The UI render layer consumes getViewState() to drive display.
 */

'use strict';

const { getAllStraps, getBaselineStrap, getStrapById } = require('./StrapCatalogue');

class StrapSelectionUI {
  /**
   * @param {Object}   opts
   * @param {string|null} [opts.persistedStrapId]   — previously saved selection (AC5);
   *                                                   null → defaults to baseline worn strap
   * @param {Function} [opts.onPreview]             — (strapVariant) => void  — called when player
   *                                                   hovers/selects before confirming (for live preview)
   * @param {Function} [opts.onConfirm]             — (strapVariant) => void  — called at confirm
   * @param {Function} [opts.onAssetSwap]           — (assetKey: string) => void — asset-swap call
   */
  constructor({ persistedStrapId = null, onPreview = null, onConfirm = null, onAssetSwap = null } = {}) {
    this._variants = getAllStraps();
    this._baseline = getBaselineStrap();
    this._onPreview = onPreview;
    this._onConfirm = onConfirm;
    this._onAssetSwap = onAssetSwap;

    // Restore persisted selection or default to baseline (AC5)
    const restored = persistedStrapId ? getStrapById(persistedStrapId) : null;
    this._confirmedStrap = restored || this._baseline;
    this._pendingStrap = this._confirmedStrap;
    this._isConfirmed = false;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Returns a snapshot view state for the render layer.
   * @returns {{
   *   variants: StrapVariant[],
   *   pendingStrapId: string,
   *   confirmedStrapId: string,
   *   isConfirmed: boolean
   * }}
   */
  getViewState() {
    return {
      variants: this._variants.slice(),
      pendingStrapId: this._pendingStrap.id,
      confirmedStrapId: this._confirmedStrap.id,
      isConfirmed: this._isConfirmed,
    };
  }

  /**
   * Returns the currently confirmed strap variant.
   * Before any confirm action, returns the persisted/baseline strap.
   * @returns {StrapVariant}
   */
  getConfirmedStrap() {
    return this._confirmedStrap;
  }

  /**
   * Returns the pending (previewed but not confirmed) strap variant.
   * @returns {StrapVariant}
   */
  getPendingStrap() {
    return this._pendingStrap;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Player selects (previews) a strap variant before confirming.
   * Triggers the asset-swap for live preview and the onPreview callback.
   * Does NOT commit the selection to confirmed state.
   *
   * AC2: the 3D model updates in real time as the player browses.
   *
   * @param {string} strapId
   * @returns {{ success: boolean, reason: string|null, strap: StrapVariant|null }}
   */
  selectStrap(strapId) {
    const variant = getStrapById(strapId);
    if (!variant) {
      return { success: false, reason: `Unknown strap id: ${strapId}`, strap: null };
    }
    this._pendingStrap = variant;
    if (this._onAssetSwap) this._onAssetSwap(variant.assetKey);
    if (this._onPreview) this._onPreview(variant);
    return { success: true, reason: null, strap: variant };
  }

  /**
   * Player confirms their current pending strap selection.
   * Commits the pending strap to confirmed state and triggers the onConfirm
   * callback so the restoration state and summary can be updated.
   *
   * AC2, AC4: confirmed selection persists into the restoration summary.
   *
   * @returns {{ strapId: string, strap: StrapVariant }}
   */
  confirmSelection() {
    this._confirmedStrap = this._pendingStrap;
    this._isConfirmed = true;
    if (this._onAssetSwap) this._onAssetSwap(this._confirmedStrap.assetKey);
    if (this._onConfirm) this._onConfirm(this._confirmedStrap);
    return { strapId: this._confirmedStrap.id, strap: this._confirmedStrap };
  }

  /**
   * Resets pending selection back to the current confirmed strap (cancel browse).
   * Restores asset swap to confirmed state.
   */
  cancelSelection() {
    this._pendingStrap = this._confirmedStrap;
    if (this._onAssetSwap) this._onAssetSwap(this._confirmedStrap.assetKey);
  }
}

module.exports = { StrapSelectionUI };
