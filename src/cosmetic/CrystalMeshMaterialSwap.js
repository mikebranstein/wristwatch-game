/**
 * CrystalMeshMaterialSwap — texture/shader swap driver for the crystal mesh.
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2 (AC2, AC8)
 *
 * Responsibilities:
 *   - Accept a swapMeshMaterialFn hook to apply a shader/texture asset key to
 *     the existing crystal mesh on the 3D watch model.
 *   - Measure swap latency and expose it so tests can assert < 100 ms (AC8).
 *   - Support pre-caching all three crystal condition asset keys so the first
 *     swap is fast (mirrors StrapAssetSwap design pattern from Phase 1).
 *
 * Constraint: no new rigging required — condition is driven by texture/shader
 *   swap on the existing crystal mesh (Constraints section of the issue).
 *
 * Design note: identical structure to Phase 1 StrapAssetSwap, which allows
 *   CosmeticRestorationController to call both in the same lifecycle.
 */

'use strict';

const { getAllCrystalConditionStates } = require('./CrystalConditionStates');

class CrystalMeshMaterialSwap {
  /**
   * @param {Object}   opts
   * @param {Function} opts.swapMeshMaterialFn — (assetKey: string) => void
   *   Hook that applies the given texture/shader asset key to the crystal mesh.
   * @param {Function} [opts.cacheFn]          — (assetKey: string) => void
   *   Optional pre-cache hook (called for each asset in preCacheAll).
   * @param {Function} [opts.nowFn]            — () => number
   *   Timestamp override (for deterministic latency testing).
   */
  constructor({ swapMeshMaterialFn, cacheFn = null, nowFn = null }) {
    if (typeof swapMeshMaterialFn !== 'function') {
      throw new Error('CrystalMeshMaterialSwap: swapMeshMaterialFn must be a function');
    }
    this._swapMeshMaterialFn = swapMeshMaterialFn;
    this._cacheFn = cacheFn;
    this._nowFn = nowFn || (() => Date.now());
    this._lastSwapLatencyMs = null;
    this._lastSwappedAssetKey = null;
  }

  // ── Pre-cache ─────────────────────────────────────────────────────────────

  /**
   * Pre-cache all crystal condition material assets.
   * Call this on phase entry to ensure subsequent swaps stay within < 100 ms (AC8).
   * No-op when no cacheFn is provided.
   */
  preCacheAll() {
    if (!this._cacheFn) return;
    for (const state of getAllCrystalConditionStates()) {
      this._cacheFn(state.assetKey);
    }
  }

  // ── Swap ──────────────────────────────────────────────────────────────────

  /**
   * Apply a crystal material to the watch's crystal mesh.
   * Measures latency in milliseconds (AC8: must complete in < 100 ms on target hw).
   *
   * @param {string} assetKey — texture/shader asset key (from CrystalConditionState.assetKey)
   * @returns {{ assetKey: string, latencyMs: number }}
   */
  swap(assetKey) {
    if (!assetKey || typeof assetKey !== 'string') {
      throw new Error('CrystalMeshMaterialSwap.swap: assetKey must be a non-empty string');
    }
    const start = this._nowFn();
    this._swapMeshMaterialFn(assetKey);
    const latencyMs = this._nowFn() - start;

    this._lastSwapLatencyMs = latencyMs;
    this._lastSwappedAssetKey = assetKey;

    return { assetKey, latencyMs };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /**
   * Returns the latency (ms) of the most recent swap, or null if no swap has occurred.
   * @returns {number|null}
   */
  getLastSwapLatencyMs() {
    return this._lastSwapLatencyMs;
  }

  /**
   * Returns the asset key applied in the most recent swap, or null.
   * @returns {string|null}
   */
  getLastSwappedAssetKey() {
    return this._lastSwappedAssetKey;
  }
}

module.exports = { CrystalMeshMaterialSwap };
