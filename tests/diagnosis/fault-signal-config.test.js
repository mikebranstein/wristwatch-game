/**
 * Tests for FaultSignalConfig — Issue #117 Scaffolded Fault-Signal System
 *
 * Covers:
 *   AC1 — known fault types resolve to a non-null signal variant
 *   AC2 — healthy / null / unknown fault types resolve to null (no false signal)
 *   AC5 — all authored fault type → variant mappings are present and valid
 */

const {
  FAULT_SIGNAL_MAP,
  VALID_SIGNAL_VARIANTS,
  getSignalVariant,
  isKnownFaultType,
  getAllSignaledFaultTypes,
} = require('../../src/diagnosis/FaultSignalConfig');

// ─── AC1: known fault types produce a valid signal variant ───────────────────

describe('FaultSignalConfig — AC1: known fault types produce a signal variant', () => {
  test('worn_pivot maps to faint-tint', () => {
    expect(getSignalVariant('worn_pivot')).toBe('faint-tint');
  });

  test('mainspring_failure maps to faint-tint', () => {
    expect(getSignalVariant('mainspring_failure')).toBe('faint-tint');
  });

  test('balance_wheel_fault maps to faint-tint', () => {
    expect(getSignalVariant('balance_wheel_fault')).toBe('faint-tint');
  });

  test('dried_lubricant maps to texture-overlay', () => {
    expect(getSignalVariant('dried_lubricant')).toBe('texture-overlay');
  });

  test('cannon_pinion_slip maps to texture-overlay', () => {
    expect(getSignalVariant('cannon_pinion_slip')).toBe('texture-overlay');
  });

  test('date_mechanism_fault maps to texture-overlay', () => {
    expect(getSignalVariant('date_mechanism_fault')).toBe('texture-overlay');
  });

  test('water_ingress_damage maps to texture-overlay', () => {
    expect(getSignalVariant('water_ingress_damage')).toBe('texture-overlay');
  });

  test('cracked_jewel maps to material-differentiation', () => {
    expect(getSignalVariant('cracked_jewel')).toBe('material-differentiation');
  });

  test('crown_stem_fault maps to material-differentiation', () => {
    expect(getSignalVariant('crown_stem_fault')).toBe('material-differentiation');
  });

  test('oxidation_tarnish_damage maps to material-differentiation', () => {
    expect(getSignalVariant('oxidation_tarnish_damage')).toBe('material-differentiation');
  });

  test('crystal_crazing_damage maps to material-differentiation', () => {
    expect(getSignalVariant('crystal_crazing_damage')).toBe('material-differentiation');
  });

  test('escapement_fault maps to material-differentiation', () => {
    expect(getSignalVariant('escapement_fault')).toBe('material-differentiation');
  });

  test('all returned variants are in the VALID_SIGNAL_VARIANTS list', () => {
    const faultTypes = getAllSignaledFaultTypes();
    faultTypes.forEach((ft) => {
      const variant = getSignalVariant(ft);
      expect(VALID_SIGNAL_VARIANTS).toContain(variant);
    });
  });
});

// ─── AC2: null / healthy / unknown fault types produce no signal ──────────────

describe('FaultSignalConfig — AC2: no false signal for healthy or unknown components', () => {
  test('null faultType returns null (healthy component guard)', () => {
    expect(getSignalVariant(null)).toBeNull();
  });

  test('undefined faultType returns null', () => {
    expect(getSignalVariant(undefined)).toBeNull();
  });

  test('empty string faultType returns null', () => {
    expect(getSignalVariant('')).toBeNull();
  });

  test('unknown fault type returns null (not on allowlist)', () => {
    expect(getSignalVariant('nonexistent_fault')).toBeNull();
  });

  test('healthy string not in map returns null', () => {
    expect(getSignalVariant('healthy')).toBeNull();
  });
});

// ─── isKnownFaultType helper ──────────────────────────────────────────────────

describe('FaultSignalConfig — isKnownFaultType helper', () => {
  test('returns true for a known fault type', () => {
    expect(isKnownFaultType('worn_pivot')).toBe(true);
  });

  test('returns false for an unknown fault type', () => {
    expect(isKnownFaultType('not_a_fault')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isKnownFaultType(null)).toBe(false);
  });
});

// ─── AC5: technical accuracy — all signal variants are from the known set ─────

describe('FaultSignalConfig — AC5: all signal variants are technically valid', () => {
  test('FAULT_SIGNAL_MAP only uses values from VALID_SIGNAL_VARIANTS', () => {
    Object.values(FAULT_SIGNAL_MAP).forEach((variant) => {
      expect(VALID_SIGNAL_VARIANTS).toContain(variant);
    });
  });

  test('getAllSignaledFaultTypes returns the complete set of authored fault types', () => {
    const all = getAllSignaledFaultTypes();
    expect(all.length).toBeGreaterThan(0);
    // Each returned type must resolve to a non-null variant
    all.forEach((ft) => {
      expect(getSignalVariant(ft)).not.toBeNull();
    });
  });

  test('VALID_SIGNAL_VARIANTS contains all three expected variant identifiers', () => {
    expect(VALID_SIGNAL_VARIANTS).toContain('faint-tint');
    expect(VALID_SIGNAL_VARIANTS).toContain('texture-overlay');
    expect(VALID_SIGNAL_VARIANTS).toContain('material-differentiation');
  });
});
