/**
 * Tests for src/damage/SeverityTierConfig.js — Issue #153, AC4.
 *
 * Covers:
 *   - buildSeverityTierConfig validates minorSlipMaxForce range
 *   - buildSeverityTierConfig validates extremeNegligenceMinForce range
 *   - buildSeverityTierConfig rejects configs where minor >= extreme (empty Significant Damage band)
 *   - buildSeverityTierConfig returns a frozen config object with correct fields
 *   - SEVERITY_TIER_CONFIG_TEMPLATE has null thresholds (no hardcoded defaults — AC4)
 */

'use strict';

const {
  buildSeverityTierConfig,
  SEVERITY_TIER_CONFIG_TEMPLATE,
} = require('../../src/damage/SeverityTierConfig');


// ---------------------------------------------------------------------------
// buildSeverityTierConfig — valid inputs
// ---------------------------------------------------------------------------

describe('buildSeverityTierConfig — valid inputs', () => {
  test('returns object with correct minorSlipMaxForce and extremeNegligenceMinForce', () => {
    const config = buildSeverityTierConfig({
      minorSlipMaxForce:          0.30,
      extremeNegligenceMinForce:  0.85,
    });
    expect(config.minorSlipMaxForce).toBe(0.30);
    expect(config.extremeNegligenceMinForce).toBe(0.85);
  });

  test('returned config is frozen (immutable)', () => {
    const config = buildSeverityTierConfig({
      minorSlipMaxForce:          0.30,
      extremeNegligenceMinForce:  0.85,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('accepts thresholds at valid boundary edges', () => {
    // Just above 0 for minor, just below 1 for extreme — legal range
    const config = buildSeverityTierConfig({
      minorSlipMaxForce:         0.01,
      extremeNegligenceMinForce: 0.99,
    });
    expect(config.minorSlipMaxForce).toBe(0.01);
    expect(config.extremeNegligenceMinForce).toBe(0.99);
  });

  test('extremeNegligenceMinForce can be exactly 1.0', () => {
    // 1.0 is allowed for extreme (force saturated to 1.0 = guaranteed Extreme)
    const config = buildSeverityTierConfig({
      minorSlipMaxForce:         0.50,
      extremeNegligenceMinForce: 1.0,
    });
    expect(config.extremeNegligenceMinForce).toBe(1.0);
  });
});


// ---------------------------------------------------------------------------
// buildSeverityTierConfig — invalid inputs (AC4: no hardcoded defaults)
// ---------------------------------------------------------------------------

describe('buildSeverityTierConfig — invalid inputs', () => {
  test('throws if minorSlipMaxForce is 0 (exclusive lower bound)', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          0,
      extremeNegligenceMinForce:  0.85,
    })).toThrow(/minorSlipMaxForce/);
  });

  test('throws if minorSlipMaxForce is 1 (exclusive upper bound)', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          1,
      extremeNegligenceMinForce:  1,
    })).toThrow(/minorSlipMaxForce/);
  });

  test('throws if minorSlipMaxForce is negative', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:         -0.1,
      extremeNegligenceMinForce:  0.85,
    })).toThrow(/minorSlipMaxForce/);
  });

  test('throws if extremeNegligenceMinForce is 0 (exclusive lower bound)', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          0.30,
      extremeNegligenceMinForce:  0,
    })).toThrow(/extremeNegligenceMinForce/);
  });

  test('throws if extremeNegligenceMinForce exceeds 1', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          0.30,
      extremeNegligenceMinForce:  1.1,
    })).toThrow(/extremeNegligenceMinForce/);
  });

  test('throws if minorSlipMaxForce equals extremeNegligenceMinForce (empty Significant Damage band)', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          0.50,
      extremeNegligenceMinForce:  0.50,
    })).toThrow(/minorSlipMaxForce.*extremeNegligenceMinForce|extremeNegligenceMinForce.*minorSlipMaxForce/i);
  });

  test('throws if minorSlipMaxForce > extremeNegligenceMinForce (inverted band)', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          0.80,
      extremeNegligenceMinForce:  0.30,
    })).toThrow();
  });

  test('throws if minorSlipMaxForce is not a number', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          '0.30',
      extremeNegligenceMinForce:  0.85,
    })).toThrow(/minorSlipMaxForce/);
  });

  test('throws if extremeNegligenceMinForce is not a number', () => {
    expect(() => buildSeverityTierConfig({
      minorSlipMaxForce:          0.30,
      extremeNegligenceMinForce:  null,
    })).toThrow(/extremeNegligenceMinForce/);
  });
});


// ---------------------------------------------------------------------------
// SEVERITY_TIER_CONFIG_TEMPLATE — no hardcoded defaults (AC4)
// ---------------------------------------------------------------------------

describe('SEVERITY_TIER_CONFIG_TEMPLATE — no hardcoded defaults', () => {
  test('minorSlipMaxForce is null (not a hardcoded production default)', () => {
    // AC4: Thresholds must come from telemetry data, not defaults.
    expect(SEVERITY_TIER_CONFIG_TEMPLATE.minorSlipMaxForce).toBeNull();
  });

  test('extremeNegligenceMinForce is null (not a hardcoded production default)', () => {
    expect(SEVERITY_TIER_CONFIG_TEMPLATE.extremeNegligenceMinForce).toBeNull();
  });

  test('template is frozen (cannot be used directly as a config)', () => {
    expect(Object.isFrozen(SEVERITY_TIER_CONFIG_TEMPLATE)).toBe(true);
  });
});
