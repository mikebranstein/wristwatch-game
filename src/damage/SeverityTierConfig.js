/**
 * SeverityTierConfig — configurable tier boundary thresholds for the Severity Tiers feature.
 *
 * Issue #153 — Part Damage Recovery: Severity Tiers
 *
 * CRITICAL CONSTRAINT (AC4): Tier thresholds MUST be derived from ≥4 weeks of Core System
 * telemetry data. There are NO hardcoded production defaults. Callers must supply calibrated
 * values from the telemetry analysis pipeline before instantiating a SeverityTierClassifier.
 *
 * Distribution gate (must be satisfied before release, enforced in AC4 / Test Scenario 5):
 *   - Minor Slip   ≥ 50% of all damage events
 *   - Extreme Neg. ≤  5% of all damage events
 *
 * Usage:
 *   const config = buildSeverityTierConfig({ minorSlipMaxForce: 0.30, extremeNegligenceMinForce: 0.85 });
 *   const classifier = new SeverityTierClassifier(config);
 */

'use strict';

/**
 * Validates and builds a severity tier configuration object.
 *
 * @param {Object} params
 * @param {number} params.minorSlipMaxForce
 *   Force magnitude upper bound (inclusive) for Minor Slip classification.
 *   Must be in range (0, 1) exclusive. Derived from telemetry distribution — NOT a hardcoded default.
 * @param {number} params.extremeNegligenceMinForce
 *   Force magnitude lower bound (inclusive) for Extreme Negligence classification.
 *   Must be in range (0, 1] exclusive-lower, and strictly greater than minorSlipMaxForce.
 * @returns {{ minorSlipMaxForce: number, extremeNegligenceMinForce: number }}
 * @throws {Error} if thresholds are invalid or would produce an empty Significant Damage band
 */
function buildSeverityTierConfig({ minorSlipMaxForce, extremeNegligenceMinForce }) {
  if (typeof minorSlipMaxForce !== 'number' || isNaN(minorSlipMaxForce)) {
    throw new Error('minorSlipMaxForce must be a finite number.');
  }
  if (typeof extremeNegligenceMinForce !== 'number' || isNaN(extremeNegligenceMinForce)) {
    throw new Error('extremeNegligenceMinForce must be a finite number.');
  }
  if (minorSlipMaxForce <= 0 || minorSlipMaxForce >= 1) {
    throw new Error(
      `minorSlipMaxForce must be in the open interval (0, 1); received ${minorSlipMaxForce}.`
    );
  }
  if (extremeNegligenceMinForce <= 0 || extremeNegligenceMinForce > 1) {
    throw new Error(
      `extremeNegligenceMinForce must be in the range (0, 1]; received ${extremeNegligenceMinForce}.`
    );
  }
  if (minorSlipMaxForce >= extremeNegligenceMinForce) {
    throw new Error(
      `minorSlipMaxForce (${minorSlipMaxForce}) must be strictly less than ` +
      `extremeNegligenceMinForce (${extremeNegligenceMinForce}) to leave a Significant Damage band.`
    );
  }

  return Object.freeze({ minorSlipMaxForce, extremeNegligenceMinForce });
}

/**
 * Structural template that documents the required config shape.
 * Both fields are null to signal "not yet calibrated from telemetry."
 * Never use this object directly as a production config.
 */
const SEVERITY_TIER_CONFIG_TEMPLATE = Object.freeze({
  minorSlipMaxForce:          null, // Populate from ≥4-week Core System telemetry data
  extremeNegligenceMinForce:  null, // Populate from ≥4-week Core System telemetry data
});

module.exports = { buildSeverityTierConfig, SEVERITY_TIER_CONFIG_TEMPLATE };
