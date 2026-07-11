/**
 * Tests for StrapCatalogue.js — Issue #143, AC1
 *
 * Acceptance Criterion 1:
 *   Given a player has reached the cosmetic restoration phase of a watch,
 *   When they open the strap selection UI,
 *   Then at least 3 strap variants are displayed with visible material/colour
 *   differences, and the current (worn) strap is shown as the baseline.
 *
 * Covers:
 *   - STRAP_VARIANTS contains ≥3 entries beyond the baseline
 *   - Each variant has id, label, material, colour, assetKey, description
 *   - Exactly one baseline variant (isBaseline: true)
 *   - getSelectableStraps() returns ≥3 non-baseline variants
 *   - getBaselineStrap() returns the worn original strap
 *   - getStrapById() returns correct variant or null
 *   - All variant materials/colours are unique across the selectable set (differentiated)
 *   - getAllStraps() baseline is first entry
 */

'use strict';

const {
  STRAP_VARIANTS,
  getAllStraps,
  getSelectableStraps,
  getBaselineStrap,
  getStrapById,
} = require('../../../javascript/cosmetic/StrapCatalogue');

describe('StrapCatalogue — AC1: at least 3 selectable strap variants', () => {
  test('getSelectableStraps() returns 3 or more non-baseline variants', () => {
    expect(getSelectableStraps().length).toBeGreaterThanOrEqual(3);
  });

  test('getAllStraps() returns all variants including baseline', () => {
    expect(getAllStraps().length).toBeGreaterThanOrEqual(4); // baseline + ≥3 selectable
  });
});

describe('StrapCatalogue — AC1: baseline (worn) strap is present and correctly flagged', () => {
  test('exactly one variant has isBaseline: true', () => {
    const baselines = STRAP_VARIANTS.filter(v => v.isBaseline);
    expect(baselines).toHaveLength(1);
  });

  test('getBaselineStrap() returns the baseline variant', () => {
    const baseline = getBaselineStrap();
    expect(baseline).toBeDefined();
    expect(baseline.isBaseline).toBe(true);
  });

  test('baseline strap id is worn_original', () => {
    expect(getBaselineStrap().id).toBe('worn_original');
  });

  test('getAllStraps() places baseline first', () => {
    const all = getAllStraps();
    expect(all[0].isBaseline).toBe(true);
  });
});

describe('StrapCatalogue — AC1: each variant has required fields', () => {
  test.each(STRAP_VARIANTS)('variant "%s" has a non-empty id', (v) => {
    expect(typeof v.id).toBe('string');
    expect(v.id.length).toBeGreaterThan(0);
  });

  test.each(STRAP_VARIANTS)('variant "%s" has a non-empty label', (v) => {
    expect(typeof v.label).toBe('string');
    expect(v.label.length).toBeGreaterThan(0);
  });

  test.each(STRAP_VARIANTS)('variant "%s" has a non-empty material', (v) => {
    expect(typeof v.material).toBe('string');
    expect(v.material.length).toBeGreaterThan(0);
  });

  test.each(STRAP_VARIANTS)('variant "%s" has a non-empty colour', (v) => {
    expect(typeof v.colour).toBe('string');
    expect(v.colour.length).toBeGreaterThan(0);
  });

  test.each(STRAP_VARIANTS)('variant "%s" has a non-empty assetKey', (v) => {
    expect(typeof v.assetKey).toBe('string');
    expect(v.assetKey.length).toBeGreaterThan(0);
  });

  test.each(STRAP_VARIANTS)('variant "%s" has a non-empty description', (v) => {
    expect(typeof v.description).toBe('string');
    expect(v.description.length).toBeGreaterThan(0);
  });
});

describe('StrapCatalogue — AC1: selectable variants are visually differentiated', () => {
  test('selectable straps have at least 2 distinct materials', () => {
    const materials = new Set(getSelectableStraps().map(v => v.material));
    expect(materials.size).toBeGreaterThanOrEqual(2);
  });

  test('selectable straps have at least 3 distinct colours', () => {
    const colours = new Set(getSelectableStraps().map(v => v.colour));
    expect(colours.size).toBeGreaterThanOrEqual(3);
  });

  test('all variant ids are unique', () => {
    const ids = STRAP_VARIANTS.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all variant assetKeys are unique', () => {
    const keys = STRAP_VARIANTS.map(v => v.assetKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('StrapCatalogue — getStrapById()', () => {
  test('returns correct variant for a known id', () => {
    const v = getStrapById('leather_black');
    expect(v).not.toBeNull();
    expect(v.id).toBe('leather_black');
  });

  test('returns the baseline for worn_original id', () => {
    const v = getStrapById('worn_original');
    expect(v).not.toBeNull();
    expect(v.isBaseline).toBe(true);
  });

  test('returns null for an unknown id', () => {
    expect(getStrapById('does_not_exist')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(getStrapById('')).toBeNull();
  });
});

describe('StrapCatalogue — getSelectableStraps() excludes baseline', () => {
  test('none of the selectable straps have isBaseline: true', () => {
    const selectable = getSelectableStraps();
    expect(selectable.every(v => !v.isBaseline)).toBe(true);
  });
});

describe('StrapCatalogue — getAllStraps() returns a copy (no reference aliasing)', () => {
  test('mutating the returned array does not affect the module', () => {
    const first = getAllStraps();
    first.pop();
    const second = getAllStraps();
    expect(second.length).toBeGreaterThan(first.length);
  });
});
