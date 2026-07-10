/**
 * MovementAnimationLODController — determines the level-of-detail for the
 * Phase 2 gear train animation based on hardware performance tier.
 *
 * Design: Issue #150 (Full Movement Animation — Phase 2: Escapement & Gear Train)
 *
 * Responsibility:
 *   - Accepts a hardware performance tier and returns an LOD configuration
 *     that the MovementAnimationOrchestrator uses to configure each sub-controller.
 *   - At minimum spec: gear train animation is disabled (lodReduced = true);
 *     balance wheel + escapement are preserved at full quality (AC3).
 *   - At high spec: full animation at target frame rate with no regression (AC3).
 *   - LOD tier thresholds are configurable because they must be calibrated
 *     from Phase 1 performance baselines (design decision for #150, risk note).
 *
 * LOD tiers:
 *   HIGH   — full gear train animation, all four wheels.
 *   MEDIUM — full gear train animation, reduced update frequency.
 *   LOW    — gear train disabled; balance + escapement only.
 *            (minimum spec hardware — AC3 must preserve balance + escapement)
 *
 * Acceptance criteria covered:
 *   AC3 — LOD management reduces gear train on minimum-spec hardware gracefully.
 *   AC5 — no Phase 1 code modified.
 */

'use strict';

/** LOD tier identifiers. */
const LOD_TIER = {
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
};

/**
 * Default LOD configuration per tier.
 * `lodReduced` maps to GearTrainAnimationController.start(_, lodReduced).
 * `gearTrainEnabled` controls whether the gear train renders at all (AC3).
 */
const DEFAULT_LOD_CONFIG = {
  [LOD_TIER.HIGH]:   { lodReduced: false, gearTrainEnabled: true,  updateRateHz: 60 },
  [LOD_TIER.MEDIUM]: { lodReduced: false, gearTrainEnabled: true,  updateRateHz: 30 },
  [LOD_TIER.LOW]:    { lodReduced: true,  gearTrainEnabled: false, updateRateHz: 0  },
};

class MovementAnimationLODController {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.lodConfig]  Override LOD configuration per tier.
   *   Merged with DEFAULT_LOD_CONFIG so only changed tiers need to be supplied.
   */
  constructor({ lodConfig = {} } = {}) {
    this._lodConfig = {};
    for (const tier of Object.values(LOD_TIER)) {
      this._lodConfig[tier] = Object.assign({}, DEFAULT_LOD_CONFIG[tier], lodConfig[tier] || {});
    }
    this._currentTier = LOD_TIER.HIGH;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Determine the LOD tier from a hardware performance measurement.
   *
   * The evaluation function is intentionally simple: callers provide an fps
   * measurement from the Phase 1 animation baseline, and this controller maps
   * it to a tier.  Thresholds will be calibrated from Phase 1 baselines.
   *
   * Default thresholds (placeholder — to be updated with Phase 1 baselines):
   *   fps >= 55 → HIGH
   *   fps >= 28 → MEDIUM
   *   fps <  28 → LOW
   *
   * @param {number} measuredFps  Measured FPS from Phase 1 animation baseline.
   * @returns {string}  LOD tier (HIGH | MEDIUM | LOW).
   */
  evaluateTier(measuredFps) {
    if (typeof measuredFps !== 'number' || measuredFps < 0) {
      throw new Error('MovementAnimationLODController: measuredFps must be a non-negative number.');
    }

    if (measuredFps >= 55) {
      this._currentTier = LOD_TIER.HIGH;
    } else if (measuredFps >= 28) {
      this._currentTier = LOD_TIER.MEDIUM;
    } else {
      this._currentTier = LOD_TIER.LOW;
    }

    return this._currentTier;
  }

  /**
   * Manually set the LOD tier (e.g. for testing or override).
   * @param {string} tier  One of LOD_TIER values.
   */
  setTier(tier) {
    if (!Object.values(LOD_TIER).includes(tier)) {
      throw new Error(`MovementAnimationLODController: unknown tier "${tier}".`);
    }
    this._currentTier = tier;
  }

  /**
   * Get the LOD configuration for the current tier.
   * @returns {{ lodReduced: boolean, gearTrainEnabled: boolean, updateRateHz: number }}
   */
  getCurrentConfig() {
    return Object.assign({}, this._lodConfig[this._currentTier]);
  }

  /** @returns {string} Current LOD tier. */
  getCurrentTier() { return this._currentTier; }
}

module.exports = { MovementAnimationLODController, LOD_TIER, DEFAULT_LOD_CONFIG };
