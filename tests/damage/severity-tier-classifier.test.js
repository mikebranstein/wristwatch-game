/**
 * Tests for src/damage/SeverityTierClassifier.js — Issue #153, AC1–AC3.
 *
 * Covers:
 *   - SEVERITY_TIER constants
 *   - Constructor validation
 *   - classify() — Minor Slip classification (AC1)
 *   - classify() — Significant Damage classification (AC2)
 *   - classify() — Extreme Negligence classification (AC3)
 *   - Tier boundary accuracy (Test Scenario 4): events at exact threshold values
 *   - Fragility multiplier adjustments (fragile, robust, normal)
 *   - forceMagnitude validation
 *   - getThresholds() accessor
 */

'use strict';

const { SeverityTierClassifier, SEVERITY_TIER, FRAGILITY_MULTIPLIERS } = require('../../src/damage/SeverityTierClassifier');
const { buildSeverityTierConfig } = require('../../src/damage/SeverityTierConfig');

// ---------------------------------------------------------------------------
// Shared calibrated config used across all tests
// ---------------------------------------------------------------------------

// Telemetry-calibrated example thresholds for test purposes:
//   force ≤ 0.30 → Minor Slip
//   0.30 < force < 0.85 → Significant Damage
//   force ≥ 0.85 → Extreme Negligence
const TEST_CONFIG = buildSeverityTierConfig({
  minorSlipMaxForce:          0.30,
  extremeNegligenceMinForce:  0.85,
});


// ---------------------------------------------------------------------------
// SEVERITY_TIER constants
// ---------------------------------------------------------------------------

describe('SEVERITY_TIER constants', () => {
  test('MINOR_SLIP is "minor_slip"', () => {
    expect(SEVERITY_TIER.MINOR_SLIP).toBe('minor_slip');
  });
  test('SIGNIFICANT_DAMAGE is "significant_damage"', () => {
    expect(SEVERITY_TIER.SIGNIFICANT_DAMAGE).toBe('significant_damage');
  });
  test('EXTREME_NEGLIGENCE is "extreme_negligence"', () => {
    expect(SEVERITY_TIER.EXTREME_NEGLIGENCE).toBe('extreme_negligence');
  });
});


// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------

describe('SeverityTierClassifier constructor', () => {
  test('instantiates with a valid config', () => {
    expect(() => new SeverityTierClassifier(TEST_CONFIG)).not.toThrow();
  });

  test('throws if config is null', () => {
    expect(() => new SeverityTierClassifier(null)).toThrow(/config/i);
  });

  test('throws if config is missing minorSlipMaxForce', () => {
    expect(() => new SeverityTierClassifier({ extremeNegligenceMinForce: 0.85 })).toThrow(/config/i);
  });

  test('throws if config is missing extremeNegligenceMinForce', () => {
    expect(() => new SeverityTierClassifier({ minorSlipMaxForce: 0.30 })).toThrow(/config/i);
  });
});


// ---------------------------------------------------------------------------
// classify() — Minor Slip (AC1)
// ---------------------------------------------------------------------------

describe('classify() — Minor Slip (AC1)', () => {
  const classifier = new SeverityTierClassifier(TEST_CONFIG);

  test('force = 0.0 → minor_slip', () => {
    expect(classifier.classify({ forceMagnitude: 0.0 })).toBe(SEVERITY_TIER.MINOR_SLIP);
  });

  test('force well below threshold → minor_slip', () => {
    expect(classifier.classify({ forceMagnitude: 0.15 })).toBe(SEVERITY_TIER.MINOR_SLIP);
  });

  test('force exactly at minorSlipMaxForce (inclusive upper bound) → minor_slip', () => {
    // Boundary: force === 0.30 → still Minor Slip (inclusive)
    expect(classifier.classify({ forceMagnitude: 0.30 })).toBe(SEVERITY_TIER.MINOR_SLIP);
  });
});


// ---------------------------------------------------------------------------
// classify() — Significant Damage (AC2)
// ---------------------------------------------------------------------------

describe('classify() — Significant Damage (AC2)', () => {
  const classifier = new SeverityTierClassifier(TEST_CONFIG);

  test('force just above minorSlipMaxForce → significant_damage', () => {
    expect(classifier.classify({ forceMagnitude: 0.31 })).toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('force in middle of band → significant_damage', () => {
    expect(classifier.classify({ forceMagnitude: 0.60 })).toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('force just below extremeNegligenceMinForce → significant_damage', () => {
    expect(classifier.classify({ forceMagnitude: 0.84 })).toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });
});


// ---------------------------------------------------------------------------
// classify() — Extreme Negligence (AC3)
// ---------------------------------------------------------------------------

describe('classify() — Extreme Negligence (AC3)', () => {
  const classifier = new SeverityTierClassifier(TEST_CONFIG);

  test('force exactly at extremeNegligenceMinForce → extreme_negligence', () => {
    expect(classifier.classify({ forceMagnitude: 0.85 })).toBe(SEVERITY_TIER.EXTREME_NEGLIGENCE);
  });

  test('force above extremeNegligenceMinForce → extreme_negligence', () => {
    expect(classifier.classify({ forceMagnitude: 0.95 })).toBe(SEVERITY_TIER.EXTREME_NEGLIGENCE);
  });

  test('force = 1.0 (maximum) → extreme_negligence', () => {
    expect(classifier.classify({ forceMagnitude: 1.0 })).toBe(SEVERITY_TIER.EXTREME_NEGLIGENCE);
  });
});


// ---------------------------------------------------------------------------
// Tier boundary accuracy (Test Scenario 4)
// ---------------------------------------------------------------------------

describe('Tier boundary accuracy — Test Scenario 4', () => {
  const classifier = new SeverityTierClassifier(TEST_CONFIG);

  test('just below Minor threshold (0.29) → minor_slip', () => {
    expect(classifier.classify({ forceMagnitude: 0.29 })).toBe(SEVERITY_TIER.MINOR_SLIP);
  });

  test('exactly at Minor/Significant boundary (0.30) → minor_slip', () => {
    expect(classifier.classify({ forceMagnitude: 0.30 })).toBe(SEVERITY_TIER.MINOR_SLIP);
  });

  test('just above Minor/Significant boundary (0.31) → significant_damage', () => {
    expect(classifier.classify({ forceMagnitude: 0.31 })).toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('just below Significant/Extreme boundary (0.84) → significant_damage', () => {
    expect(classifier.classify({ forceMagnitude: 0.84 })).toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('exactly at Significant/Extreme boundary (0.85) → extreme_negligence', () => {
    expect(classifier.classify({ forceMagnitude: 0.85 })).toBe(SEVERITY_TIER.EXTREME_NEGLIGENCE);
  });

  test('just above Significant/Extreme boundary (0.86) → extreme_negligence', () => {
    expect(classifier.classify({ forceMagnitude: 0.86 })).toBe(SEVERITY_TIER.EXTREME_NEGLIGENCE);
  });
});


// ---------------------------------------------------------------------------
// Fragility multiplier adjustments
// ---------------------------------------------------------------------------

describe('Fragility multiplier adjustments', () => {
  const classifier = new SeverityTierClassifier(TEST_CONFIG);

  test('fragile part escalates force: 0.25 × 1.25 = 0.3125 → significant_damage', () => {
    // Without fragility: 0.25 ≤ 0.30 → minor_slip
    // With fragile ×1.25: effective = 0.3125 > 0.30 → significant_damage
    expect(classifier.classify({ forceMagnitude: 0.25, partFragility: 'fragile' }))
      .toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('robust part de-escalates force: 0.38 × 0.75 = 0.285 → minor_slip', () => {
    // Without fragility: 0.38 > 0.30 → significant_damage
    // With robust ×0.75: effective = 0.285 ≤ 0.30 → minor_slip
    expect(classifier.classify({ forceMagnitude: 0.38, partFragility: 'robust' }))
      .toBe(SEVERITY_TIER.MINOR_SLIP);
  });

  test('normal fragility is no adjustment (×1.00)', () => {
    expect(classifier.classify({ forceMagnitude: 0.60, partFragility: 'normal' }))
      .toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('defaults to normal fragility when partFragility is omitted', () => {
    expect(classifier.classify({ forceMagnitude: 0.60 }))
      .toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('fragile part clamped to 1.0: very high force stays extreme_negligence', () => {
    // 0.9 × 1.25 = 1.125 → clamped to 1.0 → still extreme_negligence
    expect(classifier.classify({ forceMagnitude: 0.90, partFragility: 'fragile' }))
      .toBe(SEVERITY_TIER.EXTREME_NEGLIGENCE);
  });

  test('robust part with extreme base force: 0.90 × 0.75 = 0.675 → significant_damage', () => {
    // 0.90 alone → extreme_negligence; robust pushes it back to significant
    expect(classifier.classify({ forceMagnitude: 0.90, partFragility: 'robust' }))
      .toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });

  test('unknown fragility treated as normal (no multiplier applied)', () => {
    // 0.60 with unknown fragility → still significant_damage (same as normal)
    expect(classifier.classify({ forceMagnitude: 0.60, partFragility: 'unknown_value' }))
      .toBe(SEVERITY_TIER.SIGNIFICANT_DAMAGE);
  });
});


// ---------------------------------------------------------------------------
// forceMagnitude validation
// ---------------------------------------------------------------------------

describe('classify() — forceMagnitude validation', () => {
  const classifier = new SeverityTierClassifier(TEST_CONFIG);

  test('throws if forceMagnitude is a string', () => {
    expect(() => classifier.classify({ forceMagnitude: '0.5' })).toThrow(/forceMagnitude/);
  });

  test('throws if forceMagnitude is NaN', () => {
    expect(() => classifier.classify({ forceMagnitude: NaN })).toThrow(/forceMagnitude/);
  });

  test('throws if forceMagnitude is negative', () => {
    expect(() => classifier.classify({ forceMagnitude: -0.1 })).toThrow(/forceMagnitude/);
  });

  test('throws if forceMagnitude exceeds 1', () => {
    expect(() => classifier.classify({ forceMagnitude: 1.1 })).toThrow(/forceMagnitude/);
  });
});


// ---------------------------------------------------------------------------
// getThresholds() accessor
// ---------------------------------------------------------------------------

describe('getThresholds()', () => {
  const classifier = new SeverityTierClassifier(TEST_CONFIG);

  test('returns the configured minorSlipMaxForce', () => {
    expect(classifier.getThresholds().minorSlipMaxForce).toBe(0.30);
  });

  test('returns the configured extremeNegligenceMinForce', () => {
    expect(classifier.getThresholds().extremeNegligenceMinForce).toBe(0.85);
  });

  test('returns a plain object (not a reference to internal config)', () => {
    const t = classifier.getThresholds();
    t.minorSlipMaxForce = 999; // mutate returned copy
    expect(classifier.getThresholds().minorSlipMaxForce).toBe(0.30); // original unchanged
  });
});
