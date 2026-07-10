/**
 * Tests: FaultSignalConfig — Issue #117 AC1, AC2, AC5
 *
 * Verifies that:
 *   - Known fault types return the correct visual signal variant (AC1)
 *   - Null/unknown fault types return null — no false signal on healthy components (AC2)
 *   - All expected diagnosis-phase fault types are covered in the allowlist (AC5)
 *
 * Run with: npm test
 */

const { FAULT_SIGNAL_MAP, getSignalVariant } = require('../../src/diagnosis/FaultSignalConfig');

describe('FaultSignalConfig — AC1: known fault types return correct signal variants', () => {
  test('worn_pivot returns faint_amber_tint variant', () => {
    const signal = getSignalVariant('worn_pivot');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('faint_amber_tint');
    expect(signal.description).toMatch(/pivot/i);
  });

  test('dried_lubricant returns dried_lubricant_haze variant', () => {
    const signal = getSignalVariant('dried_lubricant');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('dried_lubricant_haze');
  });

  test('cracked_jewel returns hairline_crack_overlay variant', () => {
    const signal = getSignalVariant('cracked_jewel');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('hairline_crack_overlay');
  });

  test('worn_wheel returns surface_pitting variant', () => {
    const signal = getSignalVariant('worn_wheel');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('surface_pitting');
  });

  test('moisture_damage returns corrosion_spotting variant', () => {
    const signal = getSignalVariant('moisture_damage');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('corrosion_spotting');
  });

  test('mainspring_failure returns a signal variant', () => {
    const signal = getSignalVariant('mainspring_failure');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBeDefined();
  });

  test('escapement_fault returns a signal variant', () => {
    const signal = getSignalVariant('escapement_fault');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBeDefined();
  });

  test('balance_wheel_fault returns a signal variant', () => {
    const signal = getSignalVariant('balance_wheel_fault');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBeDefined();
  });

  test('each signal variant includes a description string', () => {
    for (const faultTypeId of Object.keys(FAULT_SIGNAL_MAP)) {
      const signal = getSignalVariant(faultTypeId);
      expect(typeof signal.description).toBe('string');
      expect(signal.description.length).toBeGreaterThan(0);
    }
  });
});

describe('FaultSignalConfig — AC2: null/unknown types return null (no false signal)', () => {
  test('null faultTypeId returns null', () => {
    expect(getSignalVariant(null)).toBeNull();
  });

  test('undefined faultTypeId returns null', () => {
    expect(getSignalVariant(undefined)).toBeNull();
  });

  test('empty string faultTypeId returns null', () => {
    expect(getSignalVariant('')).toBeNull();
  });

  test('unknown fault type ID returns null', () => {
    expect(getSignalVariant('completely_unknown_fault')).toBeNull();
  });

  test('healthy_component (not in allowlist) returns null', () => {
    expect(getSignalVariant('healthy_component')).toBeNull();
  });
});

describe('FaultSignalConfig — AC5: allowlist covers all diagnosis-phase fault types', () => {
  const expectedFaultTypes = [
    'worn_pivot',
    'dried_lubricant',
    'cracked_jewel',
    'worn_wheel',
    'moisture_damage',
    'mainspring_failure',
    'escapement_fault',
    'balance_wheel_fault',
  ];

  test.each(expectedFaultTypes)(
    'fault type "%s" is present in FAULT_SIGNAL_MAP',
    (faultTypeId) => {
      expect(FAULT_SIGNAL_MAP).toHaveProperty(faultTypeId);
    }
  );

  test('every entry in FAULT_SIGNAL_MAP has a non-empty variant string', () => {
    for (const [key, value] of Object.entries(FAULT_SIGNAL_MAP)) {
      expect(typeof value.variant).toBe('string');
      expect(value.variant.length).toBeGreaterThan(0);
    }
  });
});