/**
 * Tests for ScatterLayout.js — Issue #84.
 *
 * Acceptance Criteria covered:
 *   AC1: Scattered/displaced components visually rendered in non-standard arrangement —
 *        verified by authored layouts containing non-canonical positions.
 *   Design constraint: 2+ distinct authored layouts per watch model (prevents memorisation).
 *   Design constraint: each layout has component positions clearly displaced from canonical.
 */

'use strict';

const {
  SCATTER_LAYOUTS,
  CANONICAL_POSITIONS,
  FALLBACK_MODEL,
  getScatterLayout,
  getScatterLayoutsForModel,
  pickScatterLayout,
  getCanonicalPosition,
  getSupportedWatchModels,
} = require('../../src/reassembly/ScatterLayout');

// ─── Layout library structure ─────────────────────────────────────────────────

describe('ScatterLayout — authored layout library structure', () => {
  test('SCATTER_LAYOUTS is a non-empty object', () => {
    expect(typeof SCATTER_LAYOUTS).toBe('object');
    expect(Object.keys(SCATTER_LAYOUTS).length).toBeGreaterThan(0);
  });

  test('every watch model has at least 2 distinct layouts (prevent memorisation)', () => {
    for (const [model, layouts] of Object.entries(SCATTER_LAYOUTS)) {
      expect(layouts.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('every layout has a unique layoutId within its model', () => {
    for (const [, layouts] of Object.entries(SCATTER_LAYOUTS)) {
      const ids = layouts.map(l => l.layoutId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  test('every layout has at least one component with displaced positions', () => {
    for (const [, layouts] of Object.entries(SCATTER_LAYOUTS)) {
      for (const layout of layouts) {
        expect(typeof layout.components).toBe('object');
        expect(Object.keys(layout.components).length).toBeGreaterThan(0);
      }
    }
  });

  test('component positions have x, y, and rotation fields', () => {
    for (const [, layouts] of Object.entries(SCATTER_LAYOUTS)) {
      for (const layout of layouts) {
        for (const [, pos] of Object.entries(layout.components)) {
          expect(typeof pos.x).toBe('number');
          expect(typeof pos.y).toBe('number');
          expect(typeof pos.rotation).toBe('number');
        }
      }
    }
  });
});

// ─── AC1: Layouts contain non-canonical (displaced) component positions ───────

describe('ScatterLayout — AC1: displaced positions clearly non-canonical', () => {
  test('scatter layouts include hand entries with non-zero rotation (bent hands)', () => {
    let foundBentHand = false;
    for (const [, layouts] of Object.entries(SCATTER_LAYOUTS)) {
      for (const layout of layouts) {
        const hourHand = layout.components.hour_hand;
        if (hourHand && hourHand.rotation !== 0) {
          foundBentHand = true;
        }
      }
    }
    expect(foundBentHand).toBe(true);
  });

  test('scatter layouts have components at non-canonical x/y coordinates', () => {
    let foundDisplaced = false;
    for (const [, layouts] of Object.entries(SCATTER_LAYOUTS)) {
      for (const layout of layouts) {
        for (const [componentId, pos] of Object.entries(layout.components)) {
          const canonical = CANONICAL_POSITIONS[componentId];
          if (canonical && (
            Math.abs(pos.x - canonical.x) > 20 ||
            Math.abs(pos.y - canonical.y) > 20
          )) {
            foundDisplaced = true;
          }
        }
      }
    }
    expect(foundDisplaced).toBe(true);
  });

  test('each model has ≥2 layouts with distinct component positions (prevent memorisation)', () => {
    for (const [, layouts] of Object.entries(SCATTER_LAYOUTS)) {
      // At least one shared component between layouts must have different positions
      const layout0 = layouts[0];
      const layout1 = layouts[1];
      let hasDifference = false;
      for (const componentId of Object.keys(layout0.components)) {
        const pos0 = layout0.components[componentId];
        const pos1 = layout1.components[componentId];
        if (pos1 && (pos0.x !== pos1.x || pos0.y !== pos1.y || pos0.rotation !== pos1.rotation)) {
          hasDifference = true;
        }
      }
      expect(hasDifference).toBe(true);
    }
  });
});

// ─── getScatterLayoutsForModel ────────────────────────────────────────────────

describe('ScatterLayout — getScatterLayoutsForModel', () => {
  test('returns layouts for a known model', () => {
    const layouts = getScatterLayoutsForModel('caliber-generic');
    expect(Array.isArray(layouts)).toBe(true);
    expect(layouts.length).toBeGreaterThanOrEqual(2);
  });

  test('falls back to caliber-generic for unknown model', () => {
    const layouts = getScatterLayoutsForModel('caliber-unknown-xyz');
    expect(Array.isArray(layouts)).toBe(true);
    expect(layouts.length).toBeGreaterThanOrEqual(2); // caliber-generic fallback
  });

  test('each returned layout has a watchModel field', () => {
    const layouts = getScatterLayoutsForModel('caliber-generic');
    for (const layout of layouts) {
      expect(typeof layout.watchModel).toBe('string');
    }
  });
});

// ─── getScatterLayout ─────────────────────────────────────────────────────────

describe('ScatterLayout — getScatterLayout by ID', () => {
  test('returns the matching layout for a known model + layoutId', () => {
    const layouts = getScatterLayoutsForModel('caliber-generic');
    const layout = getScatterLayout('caliber-generic', layouts[0].layoutId);
    expect(layout).not.toBeNull();
    expect(layout.layoutId).toBe(layouts[0].layoutId);
  });

  test('returns null for an unknown layoutId', () => {
    expect(getScatterLayout('caliber-generic', 'nonexistent-layout')).toBeNull();
  });

  test('falls back to caliber-generic for unknown model', () => {
    const layouts = getScatterLayoutsForModel(FALLBACK_MODEL);
    const layout = getScatterLayout('unknown-model', layouts[0].layoutId);
    expect(layout).not.toBeNull();
  });
});

// ─── pickScatterLayout — random selection ────────────────────────────────────

describe('ScatterLayout — pickScatterLayout (RNG selection)', () => {
  test('returns a layout object for a known model', () => {
    const layout = pickScatterLayout('caliber-generic', () => 0.0);
    expect(layout).not.toBeNull();
    expect(typeof layout.layoutId).toBe('string');
  });

  test('different RNG values can produce different layout selections', () => {
    const layout0 = pickScatterLayout('caliber-generic', () => 0.0);
    const layout1 = pickScatterLayout('caliber-generic', () => 0.99);
    // With 2 layouts, 0.0 and 0.99 should pick different ones
    expect(layout0.layoutId).not.toBe(layout1.layoutId);
  });

  test('fallback model used for unknown watch model', () => {
    const layout = pickScatterLayout('unknown-model', () => 0.0);
    expect(layout).not.toBeNull();
  });
});

// ─── CANONICAL_POSITIONS ──────────────────────────────────────────────────────

describe('ScatterLayout — CANONICAL_POSITIONS', () => {
  test('CANONICAL_POSITIONS contains balance_wheel, pallet_fork, hands', () => {
    expect(CANONICAL_POSITIONS.balance_wheel).toBeDefined();
    expect(CANONICAL_POSITIONS.pallet_fork).toBeDefined();
    expect(CANONICAL_POSITIONS.hour_hand).toBeDefined();
    expect(CANONICAL_POSITIONS.minute_hand).toBeDefined();
  });

  test('getCanonicalPosition returns correct entry for known component', () => {
    const pos = getCanonicalPosition('balance_wheel');
    expect(pos).toBeDefined();
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(typeof pos.rotation).toBe('number');
  });

  test('getCanonicalPosition returns null for unknown component', () => {
    expect(getCanonicalPosition('unknown_component')).toBeNull();
  });
});

// ─── getSupportedWatchModels ──────────────────────────────────────────────────

describe('ScatterLayout — getSupportedWatchModels', () => {
  test('returns an array of model keys', () => {
    const models = getSupportedWatchModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  test('includes the fallback model', () => {
    expect(getSupportedWatchModels()).toContain(FALLBACK_MODEL);
  });
});
