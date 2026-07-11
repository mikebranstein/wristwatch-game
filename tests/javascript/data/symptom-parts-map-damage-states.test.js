/**
 * Tests for symptom-parts-map.js — Phase 1 damage state additions (Issue #81)
 *
 * Covers new entries added for AC2 (water_damage_visible already existed),
 * AC3 (oxidation_visible) and AC4 (crystal_crazing_visible).
 */

'use strict';

const {
  SYMPTOM_PARTS_MAP,
  getPartsForSymptom,
  getAllSymptomKeys,
} = require('../../../javascript/data/symptom-parts-map');

describe('symptom-parts-map: Phase 1 damage state symptom keys present', () => {
  test('water_damage_visible maps to gasket, crown, crystal (pre-existing, unchanged)', () => {
    const parts = getPartsForSymptom('water_damage_visible');
    expect(parts).toContain('gasket');
    expect(parts).toContain('crown');
    expect(parts).toContain('crystal');
  });

  test('oxidation_visible is a new key mapping to case_metal, dial, lubrication (AC3)', () => {
    const parts = getPartsForSymptom('oxidation_visible');
    expect(parts).toBeInstanceOf(Array);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts).toContain('case_metal');
    expect(parts).toContain('dial');
    expect(parts).toContain('lubrication');
  });

  test('crystal_crazing_visible is a new key mapping to crystal and dial (AC4)', () => {
    const parts = getPartsForSymptom('crystal_crazing_visible');
    expect(parts).toBeInstanceOf(Array);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts).toContain('crystal');
    expect(parts).toContain('dial');
  });

  test('all three Phase 1 symptom keys are present in getAllSymptomKeys()', () => {
    const keys = getAllSymptomKeys();
    expect(keys).toContain('water_damage_visible');
    expect(keys).toContain('oxidation_visible');
    expect(keys).toContain('crystal_crazing_visible');
  });
});

describe('symptom-parts-map: getPartsForSymptom returns arrays (not strings)', () => {
  test('oxidation_visible returns an array', () => {
    expect(Array.isArray(getPartsForSymptom('oxidation_visible'))).toBe(true);
  });

  test('crystal_crazing_visible returns an array', () => {
    expect(Array.isArray(getPartsForSymptom('crystal_crazing_visible'))).toBe(true);
  });

  test('unknown symptom key still returns empty array (regression check)', () => {
    expect(getPartsForSymptom('nonexistent_symptom')).toEqual([]);
  });
});

describe('symptom-parts-map: existing standard-wear symptom keys unaffected (regression)', () => {
  const existingKeys = [
    'stops_running',
    'loses_time',
    'gains_time',
    'crown_wont_engage',
    'no_power_reserve',
    'seconds_hand_stuck',
    'dial_face_damage',
    'skipping_seconds',
    'date_not_advancing',
  ];

  test.each(existingKeys)('existing key "%s" still returns non-empty array', (key) => {
    const parts = getPartsForSymptom(key);
    expect(parts).toBeInstanceOf(Array);
    expect(parts.length).toBeGreaterThan(0);
  });
});
