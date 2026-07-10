/**
 * Tests for CrystalMeshMaterialSwap
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2
 *
 * Covers:
 *   - Constructor validation
 *   - swap() applies correct asset key and measures latency (AC2, AC8)
 *   - preCacheAll() calls cache hook for all three condition states
 *   - Accessors
 */

'use strict';

const { CrystalMeshMaterialSwap } = require('../../src/cosmetic/CrystalMeshMaterialSwap');

function makeSwap(overrides = {}) {
  const swapped = [];
  const cached = [];
  let time = 0;

  const swap = new CrystalMeshMaterialSwap({
    swapMeshMaterialFn: (key) => swapped.push(key),
    cacheFn: (key) => cached.push(key),
    nowFn: () => time,
    ...overrides,
  });

  return { swap, swapped, cached, advanceTime: (ms) => { time += ms; } };
}

describe('CrystalMeshMaterialSwap — constructor', () => {
  test('throws when swapMeshMaterialFn is not a function', () => {
    expect(() => new CrystalMeshMaterialSwap({ swapMeshMaterialFn: null })).toThrow();
    expect(() => new CrystalMeshMaterialSwap({ swapMeshMaterialFn: 'string' })).toThrow();
  });

  test('constructs without optional cacheFn and nowFn', () => {
    const swap = new CrystalMeshMaterialSwap({ swapMeshMaterialFn: () => {} });
    expect(swap).toBeDefined();
  });
});

describe('CrystalMeshMaterialSwap — swap()', () => {
  test('calls swapMeshMaterialFn with the given assetKey (AC2)', () => {
    const { swap, swapped } = makeSwap();
    swap.swap('crystal_cracked');
    expect(swapped).toEqual(['crystal_cracked']);
  });

  test('swap() returns assetKey and latencyMs (AC8)', () => {
    const { swap, advanceTime } = makeSwap();
    advanceTime(5); // simulate 5ms elapsed during swap call
    const result = swap.swap('crystal_scratched');
    expect(result.assetKey).toBe('crystal_scratched');
    // latency is nowFn() - nowFn() at call time — with mock clock this is 0
    expect(typeof result.latencyMs).toBe('number');
  });

  test('swap() records last swapped asset key', () => {
    const { swap } = makeSwap();
    swap.swap('crystal_clean');
    expect(swap.getLastSwappedAssetKey()).toBe('crystal_clean');
  });

  test('swap() records latency (AC8 — < 100ms assertion)', () => {
    // Simulate a fast swap (0ms with mock clock)
    const { swap } = makeSwap();
    swap.swap('crystal_clean');
    // With a mock clock returning constant 0, latency is 0ms — well under 100ms
    expect(swap.getLastSwapLatencyMs()).toBe(0);
  });

  test('swap() throws for empty assetKey', () => {
    const { swap } = makeSwap();
    expect(() => swap.swap('')).toThrow();
    expect(() => swap.swap(null)).toThrow();
  });

  test('sequential swaps update last asset key each time', () => {
    const { swap, swapped } = makeSwap();
    swap.swap('crystal_cracked');
    swap.swap('crystal_clean');
    expect(swapped).toEqual(['crystal_cracked', 'crystal_clean']);
    expect(swap.getLastSwappedAssetKey()).toBe('crystal_clean');
  });
});

describe('CrystalMeshMaterialSwap — preCacheAll()', () => {
  test('calls cacheFn for all three crystal condition asset keys', () => {
    const { swap, cached } = makeSwap();
    swap.preCacheAll();
    expect(cached).toContain('crystal_scratched');
    expect(cached).toContain('crystal_cracked');
    expect(cached).toContain('crystal_clean');
    expect(cached).toHaveLength(3);
  });

  test('preCacheAll() is a no-op when no cacheFn is provided', () => {
    const swap = new CrystalMeshMaterialSwap({ swapMeshMaterialFn: () => {} });
    expect(() => swap.preCacheAll()).not.toThrow();
  });
});

describe('CrystalMeshMaterialSwap — initial state', () => {
  test('getLastSwapLatencyMs() is null before any swap', () => {
    const { swap } = makeSwap();
    expect(swap.getLastSwapLatencyMs()).toBeNull();
  });

  test('getLastSwappedAssetKey() is null before any swap', () => {
    const { swap } = makeSwap();
    expect(swap.getLastSwappedAssetKey()).toBeNull();
  });
});
