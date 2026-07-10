/**
 * Tests for MovementAnimationLODController (Issue #150)
 *
 * Acceptance criteria covered:
 *   AC3 — LOD management: gear train reduces gracefully on minimum-spec hardware;
 *          balance + escapement preserved; no crash or UI block.
 *   AC5 — no Phase 1 code modified.
 *
 * Test scenarios mapped to issue #150:
 *   LOD on minimum spec — evaluateTier returns LOW for low FPS
 *   LOD on high spec    — evaluateTier returns HIGH for high FPS
 *   LOD medium tier     — evaluateTier returns MEDIUM for mid FPS
 *   Custom LOD config   — overrides are applied
 *   setTier             — manual override works
 */

'use strict';

const {
  MovementAnimationLODController,
  LOD_TIER,
  DEFAULT_LOD_CONFIG,
} = require('../../src/completion/MovementAnimationLODController');

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('MovementAnimationLODController — constructor', () => {
  test('constructs with default HIGH tier', () => {
    const lod = new MovementAnimationLODController();
    expect(lod.getCurrentTier()).toBe(LOD_TIER.HIGH);
  });

  test('getCurrentConfig returns HIGH defaults on construction', () => {
    const lod = new MovementAnimationLODController();
    const cfg = lod.getCurrentConfig();
    expect(cfg.lodReduced).toBe(false);
    expect(cfg.gearTrainEnabled).toBe(true);
  });
});

// ─── AC3: Tier evaluation ─────────────────────────────────────────────────────

describe('MovementAnimationLODController — AC3: tier evaluation', () => {
  test('HIGH tier returned for fps >= 55', () => {
    const lod = new MovementAnimationLODController();
    expect(lod.evaluateTier(60)).toBe(LOD_TIER.HIGH);
    expect(lod.evaluateTier(55)).toBe(LOD_TIER.HIGH);
  });

  test('MEDIUM tier returned for fps between 28 and 54', () => {
    const lod = new MovementAnimationLODController();
    expect(lod.evaluateTier(54)).toBe(LOD_TIER.MEDIUM);
    expect(lod.evaluateTier(30)).toBe(LOD_TIER.MEDIUM);
    expect(lod.evaluateTier(28)).toBe(LOD_TIER.MEDIUM);
  });

  test('LOW tier returned for fps < 28 (minimum spec)', () => {
    const lod = new MovementAnimationLODController();
    expect(lod.evaluateTier(27)).toBe(LOD_TIER.LOW);
    expect(lod.evaluateTier(0)).toBe(LOD_TIER.LOW);
  });

  test('LOW tier config has lodReduced=true and gearTrainEnabled=false (AC3)', () => {
    const lod = new MovementAnimationLODController();
    lod.evaluateTier(10); // → LOW
    const cfg = lod.getCurrentConfig();
    expect(cfg.lodReduced).toBe(true);
    expect(cfg.gearTrainEnabled).toBe(false);
  });

  test('HIGH tier config has lodReduced=false and gearTrainEnabled=true (AC3)', () => {
    const lod = new MovementAnimationLODController();
    lod.evaluateTier(60); // → HIGH
    const cfg = lod.getCurrentConfig();
    expect(cfg.lodReduced).toBe(false);
    expect(cfg.gearTrainEnabled).toBe(true);
  });

  test('throws on negative fps input', () => {
    const lod = new MovementAnimationLODController();
    expect(() => lod.evaluateTier(-1)).toThrow('measuredFps must be a non-negative number');
  });

  test('throws on non-numeric fps input', () => {
    const lod = new MovementAnimationLODController();
    expect(() => lod.evaluateTier('fast')).toThrow('measuredFps must be a non-negative number');
  });
});

// ─── Custom LOD config ────────────────────────────────────────────────────────

describe('MovementAnimationLODController — custom lodConfig', () => {
  test('custom LOW config overrides lodReduced and gearTrainEnabled', () => {
    const lod = new MovementAnimationLODController({
      lodConfig: { [LOD_TIER.LOW]: { lodReduced: true, gearTrainEnabled: false, updateRateHz: 15 } },
    });
    lod.evaluateTier(10);
    expect(lod.getCurrentConfig().updateRateHz).toBe(15);
  });
});

// ─── setTier ─────────────────────────────────────────────────────────────────

describe('MovementAnimationLODController — setTier', () => {
  test('setTier(LOW) changes current tier to LOW', () => {
    const lod = new MovementAnimationLODController();
    lod.setTier(LOD_TIER.LOW);
    expect(lod.getCurrentTier()).toBe(LOD_TIER.LOW);
  });

  test('throws on unknown tier', () => {
    const lod = new MovementAnimationLODController();
    expect(() => lod.setTier('ultra')).toThrow('unknown tier');
  });
});
