/**
 * SeverityTierClassifier — classifies damage events into severity tiers.
 *
 * Issue #153 — Part Damage Recovery: Severity Tiers
 *
 * Three tiers (AC1–AC3):
 *   MINOR_SLIP         — auto-undo, zero cost, zero delay, brief visual indicator
 *   SIGNIFICANT_DAMAGE — replacement ordering required (Core System path, unchanged)
 *   EXTREME_NEGLIGENCE — non-recoverable state; checkpoint or restart required
 *
 * Classification inputs (from existing damage event signals — Non-Goal: no new physics engine):
 *   forceMagnitude  {number}  0.0–1.0  Normalised force reading from the damage event.
 *   partFragility   {string}  'normal' | 'fragile' | 'robust'  Part fragility attribute.
 *     Fragility adjusts the effective force before threshold comparison:
 *       'fragile' → ×1.25 (fragile parts escalate toward higher-severity tiers)
 *       'robust'  → ×0.75 (robust parts de-escalate toward lower-severity tiers)
 *       'normal'  → ×1.00 (no adjustment)
 *     Effective force is clamped to [0, 1] after adjustment.
 *
 * Thresholds must be supplied from telemetry-calibrated config (see SeverityTierConfig.js).
 * No hardcoded defaults — AC4 constraint.
 *
 * Usage:
 *   const { buildSeverityTierConfig } = require('./SeverityTierConfig');
 *   const config = buildSeverityTierConfig({ minorSlipMaxForce: 0.30, extremeNegligenceMinForce: 0.85 });
 *   const classifier = new SeverityTierClassifier(config);
 *   const tier = classifier.classify({ forceMagnitude: 0.15, partFragility: 'normal' });
 *   // → 'minor_slip'
 */

'use strict';

const SEVERITY_TIER = {
  MINOR_SLIP:         'minor_slip',
  SIGNIFICANT_DAMAGE: 'significant_damage',
  EXTREME_NEGLIGENCE: 'extreme_negligence',
};

/** Fragility multipliers applied to forceMagnitude before threshold comparison. */
const FRAGILITY_MULTIPLIERS = {
  normal:  1.00,
  fragile: 1.25,
  robust:  0.75,
};

class SeverityTierClassifier {
  /**
   * @param {{ minorSlipMaxForce: number, extremeNegligenceMinForce: number }} config
   *   Built via buildSeverityTierConfig() from telemetry-calibrated thresholds.
   */
  constructor(config) {
    if (!config ||
        typeof config.minorSlipMaxForce !== 'number' ||
        typeof config.extremeNegligenceMinForce !== 'number') {
      throw new Error(
        'SeverityTierClassifier requires a config object with ' +
        'minorSlipMaxForce and extremeNegligenceMinForce (numbers). ' +
        'Use buildSeverityTierConfig() to create one from telemetry data.'
      );
    }
    this._config = config;
  }

  /**
   * Classify a damage event into a severity tier.
   *
   * @param {Object} params
   * @param {number} params.forceMagnitude   Normalised force reading in [0, 1].
   * @param {string} [params.partFragility]  'normal' | 'fragile' | 'robust' (default: 'normal')
   * @returns {'minor_slip'|'significant_damage'|'extreme_negligence'}
   */
  classify({ forceMagnitude, partFragility = 'normal' }) {
    if (typeof forceMagnitude !== 'number' || isNaN(forceMagnitude)) {
      throw new Error('forceMagnitude must be a finite number.');
    }
    if (forceMagnitude < 0 || forceMagnitude > 1) {
      throw new Error(`forceMagnitude must be in [0, 1]; received ${forceMagnitude}.`);
    }

    const multiplier = FRAGILITY_MULTIPLIERS[partFragility] !== undefined
      ? FRAGILITY_MULTIPLIERS[partFragility]
      : FRAGILITY_MULTIPLIERS.normal;

    // Apply fragility adjustment and clamp to [0, 1]
    const effectiveForce = Math.min(1.0, Math.max(0.0, forceMagnitude * multiplier));

    if (effectiveForce <= this._config.minorSlipMaxForce) {
      return SEVERITY_TIER.MINOR_SLIP;
    }
    if (effectiveForce >= this._config.extremeNegligenceMinForce) {
      return SEVERITY_TIER.EXTREME_NEGLIGENCE;
    }
    return SEVERITY_TIER.SIGNIFICANT_DAMAGE;
  }

  /**
   * Returns the configured thresholds (read-only copy — for inspection/logging).
   * @returns {{ minorSlipMaxForce: number, extremeNegligenceMinForce: number }}
   */
  getThresholds() {
    return {
      minorSlipMaxForce:         this._config.minorSlipMaxForce,
      extremeNegligenceMinForce: this._config.extremeNegligenceMinForce,
    };
  }
}

module.exports = { SeverityTierClassifier, SEVERITY_TIER, FRAGILITY_MULTIPLIERS };
