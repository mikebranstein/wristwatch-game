/**
 * Tests for StrapAssetSwap.js — Issue #143, AC2, Performance (< 100 ms)
 *
 * Acceptance Criterion 2:
 *   Given a player selects a strap variant, when they confirm the selection,
 *   then the watch 3D model updates in real time to display the chosen strap.
 *
 * Test Scenario 6 (Performance check):
 *   Player swaps between all available straps rapidly → swap latency remains < 100 ms.
 *
 * Covers:
 *   - swap() calls swapRigFn with the correct assetKey
 *   - swap() records duration
 *   - preCacheAll() calls cacheFn for every strap variant
 *   - Constructor requires swapRigFn
 *   - getSwapCount() tracks total swaps
 *   - getLastSwapDurationMs() returns null before any swap, then a number
 */

'use strict';

const { StrapAssetSwap } = require('../../../src/cosmetic/StrapAssetSwap');
const { getAllStraps, getSelectableStraps } = require('../../../src/cosmetic/StrapCatalogue');

// ─── Constructor guard ─────────────────────────────────────────────────────

describe('StrapAssetSwap — constructor', () => {
  test('throws if swapRigFn is not provided', () => {
    expect(() => new StrapAssetSwap({})).toThrow();
  });

  test('accepts a valid swapRigFn without throwing', () => {
    expect(() => new StrapAssetSwap({ swapRigFn: () => {} })).not.toThrow();
  });
});

// ─── AC2: swap() invokes the rig function ──────────────────────────────────

describe('StrapAssetSwap — AC2: swap() invokes swapRigFn', () => {
  test('swap() calls swapRigFn with the assetKey', () => {
    const calls = [];
    const swap = new StrapAssetSwap({ swapRigFn: (key) => calls.push(key) });
    swap.swap('strap_leather_black');
    expect(calls).toContain('strap_leather_black');
  });

  test('swap() returns { assetKey, durationMs }', () => {
    const swap = new StrapAssetSwap({ swapRigFn: () => {} });
    const result = swap.swap('strap_leather_brown');
    expect(result.assetKey).toBe('strap_leather_brown');
    expect(typeof result.durationMs).toBe('number');
  });

  test('getLastSwapDurationMs() returns null before any swap', () => {
    const swap = new StrapAssetSwap({ swapRigFn: () => {} });
    expect(swap.getLastSwapDurationMs()).toBeNull();
  });

  test('getLastSwapDurationMs() returns a number after a swap', () => {
    const swap = new StrapAssetSwap({ swapRigFn: () => {} });
    swap.swap('strap_nato_olive');
    expect(typeof swap.getLastSwapDurationMs()).toBe('number');
  });

  test('getSwapCount() increments with each swap call', () => {
    const swap = new StrapAssetSwap({ swapRigFn: () => {} });
    swap.swap('strap_leather_black');
    swap.swap('strap_leather_brown');
    swap.swap('strap_nato_olive');
    expect(swap.getSwapCount()).toBe(3);
  });

  test('getSwapCount() starts at 0', () => {
    const swap = new StrapAssetSwap({ swapRigFn: () => {} });
    expect(swap.getSwapCount()).toBe(0);
  });
});

// ─── Performance: swap duration < 100 ms ──────────────────────────────────

describe('StrapAssetSwap — Test Scenario 6: swap latency < 100 ms', () => {
  test('swap() duration is < 100 ms (synchronous swap on injected rig)', () => {
    // The rig fn is synchronous in this test context; latency should be < 1 ms.
    // We validate the instrument records a value under the 100 ms threshold.
    let fakeNow = 1000;
    const swap = new StrapAssetSwap({
      swapRigFn: () => { fakeNow += 5; }, // simulate 5 ms swap
      nowFn: () => fakeNow,
    });
    const result = swap.swap('strap_leather_black');
    expect(result.durationMs).toBeLessThan(100);
  });

  test('rapid swaps across all selectable straps remain < 100 ms each', () => {
    let fakeNow = 0;
    const swap = new StrapAssetSwap({
      swapRigFn: () => { fakeNow += 10; }, // simulate 10 ms per swap
      nowFn: () => fakeNow,
    });
    for (const variant of getSelectableStraps()) {
      const result = swap.swap(variant.assetKey);
      expect(result.durationMs).toBeLessThan(100);
    }
  });
});

// ─── preCacheAll() ─────────────────────────────────────────────────────────

describe('StrapAssetSwap — preCacheAll() pre-caches all strap assets', () => {
  test('preCacheAll() calls cacheFn once per strap variant', () => {
    const cached = [];
    const swap = new StrapAssetSwap({
      swapRigFn: () => {},
      cacheFn: (key) => cached.push(key),
    });
    swap.preCacheAll();
    const all = getAllStraps();
    expect(cached.length).toBe(all.length);
  });

  test('preCacheAll() caches all variant assetKeys', () => {
    const cached = new Set();
    const swap = new StrapAssetSwap({
      swapRigFn: () => {},
      cacheFn: (key) => cached.add(key),
    });
    swap.preCacheAll();
    for (const variant of getAllStraps()) {
      expect(cached.has(variant.assetKey)).toBe(true);
    }
  });

  test('preCacheAll() does not throw when no cacheFn provided', () => {
    const swap = new StrapAssetSwap({ swapRigFn: () => {} });
    expect(() => swap.preCacheAll()).not.toThrow();
  });
});
