/**
 * Tests for symptom-parts-map.js — Issue #292: magnetism fault symptom entry (AC2, AC4)
 *
 * AC2: running_fast_no_visible_damage symptom key exists and maps to ['demagnetizer'].
 * AC4: demagnetizer is the sole candidate part for the magnetism symptom
 *      (fault-type-agnostic repair path resolved by submitDiagnosis selecting demagnetizer).
 */

'use strict';

const {
  SYMPTOM_PARTS_MAP,
  getPartsForSymptom,
  getAllSymptomKeys,
} = require('../../../javascript/data/symptom-parts-map');

// ─── AC2 — running_fast_no_visible_damage symptom key exists ─────────────────

describe('AC2 — symptom-parts-map: running_fast_no_visible_damage key is present', () => {
  test('running_fast_no_visible_damage exists in SYMPTOM_PARTS_MAP', () => {
    expect(SYMPTOM_PARTS_MAP).toHaveProperty('running_fast_no_visible_damage');
  });

  test('getAllSymptomKeys() includes running_fast_no_visible_damage', () => {
    expect(getAllSymptomKeys()).toContain('running_fast_no_visible_damage');
  });

  test('getPartsForSymptom returns a non-empty array for running_fast_no_visible_damage', () => {
    const parts = getPartsForSymptom('running_fast_no_visible_damage');
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
  });
});

// ─── AC4 — demagnetizer is the candidate part for magnetism symptom ───────────

describe('AC4 — symptom-parts-map: running_fast_no_visible_damage maps to demagnetizer', () => {
  test('running_fast_no_visible_damage parts array contains demagnetizer', () => {
    const parts = getPartsForSymptom('running_fast_no_visible_damage');
    expect(parts).toContain('demagnetizer');
  });

  test('running_fast_no_visible_damage maps only to demagnetizer (sole candidate)', () => {
    const parts = getPartsForSymptom('running_fast_no_visible_damage');
    expect(parts).toEqual(['demagnetizer']);
  });

  test('demagnetizer is not a candidate for gains_time (magnetism UX isolation)', () => {
    const parts = getPartsForSymptom('gains_time');
    expect(parts).not.toContain('demagnetizer');
  });

  test('demagnetizer is not a candidate for stops_running (magnetism UX isolation)', () => {
    const parts = getPartsForSymptom('stops_running');
    expect(parts).not.toContain('demagnetizer');
  });
});

// ─── Regression — existing symptom keys are unaffected ───────────────────────

describe('symptom-parts-map: existing symptom keys are unaffected by magnetism addition (regression)', () => {
  const existingKeys = [
    'stops_running',
    'loses_time',
    'gains_time',
    'crown_wont_engage',
    'no_power_reserve',
    'seconds_hand_stuck',
    'dial_face_damage',
    'water_damage_visible',
    'oxidation_visible',
    'crystal_crazing_visible',
    'skipping_seconds',
    'date_not_advancing',
  ];

  test.each(existingKeys)('existing key "%s" still returns a non-empty array', (key) => {
    const parts = getPartsForSymptom(key);
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
  });
});
