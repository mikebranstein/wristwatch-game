/**
 * StrapAssetSwap — applies a strap variant to the watch 3D model rig.
 *
 * Issue #143 — Strap Swap: Cosmetic Restoration Phase 1 (AC2, AC6-perf)
 *
 * Responsibilities:
 *   - Accept a strap asset key and invoke the render layer's mesh/material
 *     swap function on the existing watch rig.
 *   - Record swap timing so callers can verify the < 100 ms latency
 *     constraint (AC6 / Test Scenario 6).
 *   - Pre-cache all strap material assets when the cosmetic phase step is
 *     entered, eliminating on-demand load latency during the swap interaction
 *     (design mitigation: pre-cache on phase enter, not on selection).
 *
 * No new rigging work is in scope — this module calls the existing rig's
 * swap surface only.
 */

'use strict';

const { getAllStraps } = require('./StrapCatalogue');

class StrapAssetSwap {
  /**
   * @param {Object}   opts
   * @param {Function} opts.swapRigFn    — (assetKey: string) => void — injected rig swap call
   * @param {Function} [opts.cacheFn]    — (assetKey: string) => void — pre-cache hook
   * @param {Function} [opts.nowFn]      — () => number — timestamp source (default: Date.now)
   */
  constructor({ swapRigFn, cacheFn = null, nowFn = null }) {
    if (typeof swapRigFn !== 'function') {
      throw new Error('StrapAssetSwap requires a swapRigFn');
    }
    this._swapRigFn = swapRigFn;
    this._cacheFn = cacheFn;
    this._nowFn = nowFn || (() => Date.now());
    this._lastSwapDurationMs = null;
    this._swapCount = 0;
  }

  // ── Phase-enter pre-caching ───────────────────────────────────────────────

  /**
   * Pre-cache all strap material assets when the cosmetic phase step is entered.
   * Should be called once on phase entry, not on individual strap selections.
   * This ensures < 100 ms swap latency during the selection interaction.
   */
  preCacheAll() {
    if (!this._cacheFn) return;
    for (const variant of getAllStraps()) {
      this._cacheFn(variant.assetKey);
    }
  }

  // ── Swap ─────────────────────────────────────────────────────────────────

  /**
   * Swap the strap on the watch rig to the given asset key.
   * Records swap duration in ms for latency validation.
   *
   * @param {string} assetKey
   * @returns {{ assetKey: string, durationMs: number }}
   */
  swap(assetKey) {
    const start = this._nowFn();
    this._swapRigFn(assetKey);
    const end = this._nowFn();
    this._lastSwapDurationMs = end - start;
    this._swapCount += 1;
    return { assetKey, durationMs: this._lastSwapDurationMs };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /**
   * Returns the duration (ms) of the most recent swap operation.
   * Returns null if no swap has been performed yet.
   * @returns {number|null}
   */
  getLastSwapDurationMs() {
    return this._lastSwapDurationMs;
  }

  /**
   * Returns the total number of swap operations performed.
   * @returns {number}
   */
  getSwapCount() {
    return this._swapCount;
  }
}

module.exports = { StrapAssetSwap };
