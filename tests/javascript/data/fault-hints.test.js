/**
 * Unit tests for fault-hints.js — AC9 (Scenario 17)
 *
 * AC9: getHintsForFault() must return null (not undefined, not an empty array)
 * when the supplied faultId is not present in FAULT_HINTS (covers line 60
 * null-return branch).
 */

const { getHintsForFault, FAULT_HINTS, getAllFaultIds } = require('../../../src/data/fault-hints');

// ─── AC9 — Scenario 17: unknown faultId returns null (line 60) ────────────────

describe('AC9 — fault-hints: getHintsForFault with unknown faultId returns null (line 60)', () => {
  test('returns null for a faultId that does not exist in FAULT_HINTS', () => {
    const result = getHintsForFault('unknown_fault_id_xyz');
    expect(result).toBeNull();
  });

  test('return value is strictly null, not undefined', () => {
    const result = getHintsForFault('nonexistent_fault_type_abc');
    expect(result).not.toBeUndefined();
    expect(result).toBeNull();
  });

  test('returns null for an empty string faultId', () => {
    const result = getHintsForFault('');
    expect(result).toBeNull();
  });
});

// ─── Positive path: known faultIds return valid hint objects ──────────────────

describe('fault-hints: getHintsForFault returns correct data for known faultIds', () => {
  test('returns a hint object with all three tiers for mainspring_failure', () => {
    const result = getHintsForFault('mainspring_failure');
    expect(result).not.toBeNull();
    expect(result.fault_id).toBe('mainspring_failure');
    expect(typeof result.tier1).toBe('string');
    expect(typeof result.tier2).toBe('string');
    expect(typeof result.tier3).toBe('string');
    expect(result.tier1.length).toBeGreaterThan(0);
    expect(result.tier2.length).toBeGreaterThan(0);
    expect(result.tier3.length).toBeGreaterThan(0);
  });

  test('every authored fault in getAllFaultIds() has a non-null hint object', () => {
    for (const faultId of getAllFaultIds()) {
      const result = getHintsForFault(faultId);
      expect(result).not.toBeNull();
    }
  });
});
