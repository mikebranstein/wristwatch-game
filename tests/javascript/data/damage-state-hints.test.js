/**
 * Tests for damage-state-hints.js — Issue #81 Phase 1
 *
 * Covers:
 *   - All 3 Phase 1 damage-state fault IDs return non-null hint objects
 *   - All 3 tiers (tier1, tier2, tier3) are authored and non-empty
 *   - Unknown fault IDs return null (consistent with fault-hints.js contract)
 *   - getDamageStateHints returns fault_id field matching the requested key
 *   - getAllDamageStateFaultIds returns all 3 expected Phase 1 fault IDs
 */

'use strict';

const {
  DAMAGE_STATE_HINTS,
  getDamageStateHints,
  getAllDamageStateFaultIds,
} = require('../../../src/data/damage-state-hints');

const EXPECTED_FAULT_IDS = [
  'water_ingress_damage',
  'oxidation_tarnish_damage',
  'crystal_crazing_damage',
];

describe('damage-state-hints: getDamageStateHints — Phase 1 fault IDs return valid hint objects', () => {
  test.each(EXPECTED_FAULT_IDS)('getDamageStateHints("%s") returns non-null', (faultId) => {
    expect(getDamageStateHints(faultId)).not.toBeNull();
  });

  test.each(EXPECTED_FAULT_IDS)('getDamageStateHints("%s") has fault_id field matching key', (faultId) => {
    const hints = getDamageStateHints(faultId);
    expect(hints.fault_id).toBe(faultId);
  });

  test.each(EXPECTED_FAULT_IDS)('getDamageStateHints("%s") has non-empty tier1', (faultId) => {
    const hints = getDamageStateHints(faultId);
    expect(typeof hints.tier1).toBe('string');
    expect(hints.tier1.length).toBeGreaterThan(0);
  });

  test.each(EXPECTED_FAULT_IDS)('getDamageStateHints("%s") has non-empty tier2', (faultId) => {
    const hints = getDamageStateHints(faultId);
    expect(typeof hints.tier2).toBe('string');
    expect(hints.tier2.length).toBeGreaterThan(0);
  });

  test.each(EXPECTED_FAULT_IDS)('getDamageStateHints("%s") has non-empty tier3', (faultId) => {
    const hints = getDamageStateHints(faultId);
    expect(typeof hints.tier3).toBe('string');
    expect(hints.tier3.length).toBeGreaterThan(0);
  });
});

describe('damage-state-hints: getDamageStateHints — unknown fault IDs return null', () => {
  test('returns null for an unknown fault ID', () => {
    expect(getDamageStateHints('shock_damage')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(getDamageStateHints('')).toBeNull();
  });

  test('return value is strictly null, not undefined', () => {
    const result = getDamageStateHints('nonexistent_xyz');
    expect(result).not.toBeUndefined();
    expect(result).toBeNull();
  });
});

describe('damage-state-hints: getAllDamageStateFaultIds — returns Phase 1 + Phase 2 fault IDs', () => {
  test('returns at least 3 Phase 1 damage-state fault IDs (Phase 2 additions are additive)', () => {
    const ids = getAllDamageStateFaultIds();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const expected of EXPECTED_FAULT_IDS) {
      expect(ids).toContain(expected);
    }
  });

  test('all IDs in getAllDamageStateFaultIds() have non-null hint objects', () => {
    for (const faultId of getAllDamageStateFaultIds()) {
      expect(getDamageStateHints(faultId)).not.toBeNull();
    }
  });
});
