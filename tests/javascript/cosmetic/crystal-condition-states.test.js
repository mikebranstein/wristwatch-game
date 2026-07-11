/**
 * Tests for CrystalConditionStates
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2
 *
 * Covers:
 *   - Three condition states available (scratched, cracked, clean)
 *   - Correct needsReplacement flags
 *   - resolveCrystalCondition() — happy path and edge cases (AC1, AC7)
 *   - getPartConditionDescriptor() — extensibility contract for Phase 3
 */

'use strict';

const {
  CRYSTAL_CONDITION_IDS,
  CRYSTAL_CONDITION_CATALOGUE,
  getCrystalConditionState,
  getCleanCrystalState,
  resolveCrystalCondition,
  getAllCrystalConditionStates,
  getPartConditionDescriptor,
} = require('../../../javascript/cosmetic/CrystalConditionStates');

describe('CrystalConditionStates — static data', () => {
  test('exports exactly three condition IDs: scratched, cracked, clean', () => {
    expect(CRYSTAL_CONDITION_IDS).toEqual(['scratched', 'cracked', 'clean']);
  });

  test('catalogue contains exactly three entries', () => {
    expect(CRYSTAL_CONDITION_CATALOGUE).toHaveLength(3);
  });

  test('scratched state has needsReplacement = true', () => {
    const s = getCrystalConditionState('scratched');
    expect(s).not.toBeNull();
    expect(s.needsReplacement).toBe(true);
    expect(s.assetKey).toBe('crystal_scratched');
  });

  test('cracked state has needsReplacement = true', () => {
    const s = getCrystalConditionState('cracked');
    expect(s).not.toBeNull();
    expect(s.needsReplacement).toBe(true);
    expect(s.assetKey).toBe('crystal_cracked');
  });

  test('clean state has needsReplacement = false', () => {
    const s = getCrystalConditionState('clean');
    expect(s).not.toBeNull();
    expect(s.needsReplacement).toBe(false);
    expect(s.assetKey).toBe('crystal_clean');
  });

  test('getCrystalConditionState returns null for unknown id', () => {
    expect(getCrystalConditionState('unknown')).toBeNull();
    expect(getCrystalConditionState('')).toBeNull();
    expect(getCrystalConditionState(null)).toBeNull();
  });

  test('getCleanCrystalState returns the clean state', () => {
    const clean = getCleanCrystalState();
    expect(clean.id).toBe('clean');
    expect(clean.needsReplacement).toBe(false);
  });

  test('getAllCrystalConditionStates returns a copy of the catalogue', () => {
    const all = getAllCrystalConditionStates();
    expect(all).toHaveLength(3);
    // Mutation of returned array should not affect internal state
    all.push({ id: 'fake' });
    expect(getAllCrystalConditionStates()).toHaveLength(3);
  });

  test('all catalogue entries have required fields', () => {
    for (const state of CRYSTAL_CONDITION_CATALOGUE) {
      expect(typeof state.id).toBe('string');
      expect(typeof state.assetKey).toBe('string');
      expect(typeof state.label).toBe('string');
      expect(typeof state.description).toBe('string');
      expect(typeof state.needsReplacement).toBe('boolean');
    }
  });
});

describe('resolveCrystalCondition — AC1 and AC7', () => {
  // AC1: crystal_condition assigned from watch condition data
  test('resolves scratched condition from watch data', () => {
    const result = resolveCrystalCondition({ crystal_condition: 'scratched' });
    expect(result.id).toBe('scratched');
  });

  test('resolves cracked condition from watch data', () => {
    const result = resolveCrystalCondition({ crystal_condition: 'cracked' });
    expect(result.id).toBe('cracked');
  });

  test('resolves clean condition from watch data', () => {
    const result = resolveCrystalCondition({ crystal_condition: 'clean' });
    expect(result.id).toBe('clean');
  });

  // AC7: edge case — missing condition field → default 'clean', no crash
  test('defaults to clean when watch data is null (AC7)', () => {
    const result = resolveCrystalCondition(null);
    expect(result.id).toBe('clean');
  });

  test('defaults to clean when watch data is undefined (AC7)', () => {
    const result = resolveCrystalCondition(undefined);
    expect(result.id).toBe('clean');
  });

  test('defaults to clean when crystal_condition field is missing (AC7)', () => {
    const result = resolveCrystalCondition({ watchId: 'watch_001' });
    expect(result.id).toBe('clean');
  });

  test('defaults to clean when crystal_condition is an unknown value (AC7)', () => {
    const result = resolveCrystalCondition({ crystal_condition: 'shattered' });
    expect(result.id).toBe('clean');
  });

  test('defaults to clean when crystal_condition is empty string (AC7)', () => {
    const result = resolveCrystalCondition({ crystal_condition: '' });
    expect(result.id).toBe('clean');
  });

  test('defaults to clean when watch data is an empty object (AC7)', () => {
    const result = resolveCrystalCondition({});
    expect(result.id).toBe('clean');
  });
});

describe('getPartConditionDescriptor — extensibility for Phase 3', () => {
  test('crystal part descriptor is registered', () => {
    const desc = getPartConditionDescriptor('crystal');
    expect(desc).not.toBeNull();
    expect(desc.partType).toBe('crystal');
    expect(desc.stateIds).toEqual(['scratched', 'cracked', 'clean']);
    expect(desc.defaultId).toBe('clean');
  });

  test('returns null for unregistered part type', () => {
    expect(getPartConditionDescriptor('case')).toBeNull();
    expect(getPartConditionDescriptor('unknown')).toBeNull();
  });

  test('Phase 3 can register a new part type without modifying crystal logic', () => {
    // This test documents the extension point; it validates the registry structure
    // is generic enough for Phase 3 to extend.
    const crystalDesc = getPartConditionDescriptor('crystal');
    // Phase 3 would add: { partType: 'case', stateIds: [...], defaultId: '...' }
    // The structure is identical — no breaking change required.
    expect(crystalDesc).toHaveProperty('partType');
    expect(crystalDesc).toHaveProperty('stateIds');
    expect(crystalDesc).toHaveProperty('defaultId');
  });
});
