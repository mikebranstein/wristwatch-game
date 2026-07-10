/**
 * GearTrainAnimationController — rotates mainspring barrel, centre wheel,
 * third wheel, and fourth wheel at correct relative rates for the movement
 * being serviced.
 *
 * Design: Issue #150 (Full Movement Animation — Phase 2: Escapement & Gear Train)
 *
 * Responsibility:
 *   - Drives four wheels at mechanically correct relative angular velocities
 *     derived from their gear ratios (AC1 — correct synchrony).
 *   - Supports per-caliber gear ratio configuration (AC1 — multi-movement accuracy).
 *   - Supports LOD flag: when `lodReduced` is true, gear train animation
 *     complexity is reduced (gear train simplifies while balance + escapement
 *     are preserved, AC3).
 *   - Supports over-spinning failure state for incorrect assembly (AC2).
 *   - Exposes renderHook for DI (same pattern across Phase 2 controllers).
 *   - Resets cleanly on scene exit (AC5 — scene transition no state leaks).
 *
 * Gear ratio constants (Swiss ETA 2824 reference movement):
 *   - Mainspring barrel : Centre  = 1 : 8   (barrel drives centre wheel)
 *   - Centre            : Third   = 1 : 8
 *   - Third             : Fourth  = 1 : 7.5
 *   These are overridable via the `gearRatios` constructor option to support
 *   other calibers (multi-movement accuracy — AC1 / test scenario 10).
 *
 * NOTE: LOD thresholds (hardware tier → reduction decision) are deferred to
 * Phase 1 performance baselines (as documented in design decision for #150).
 * The LOD flag is injected by MovementAnimationLODController at runtime.
 *
 * Acceptance criteria covered:
 *   AC1 — all four gear train wheels rotate at correct relative gear ratios.
 *   AC2 — over-spinning failure state for incorrect assembly.
 *   AC3 — gear train animation reduces gracefully when lodReduced = true.
 *   AC5 — no Phase 1 code modified.
 */

'use strict';

/** Gear train animation states. */
const GEAR_TRAIN_STATE = {
  IDLE:          'idle',
  RUNNING:       'running',
  RUNNING_LOD:   'running_lod',   // reduced complexity (AC3)
  OVER_SPINNING: 'over_spinning', // failure state (AC2)
  STALLED:       'stalled',       // failure state (AC2)
};

/**
 * Default gear ratios (ETA 2824 reference).
 * Values represent how many teeth/steps each wheel advances per escape wheel tooth.
 * Expressed as relative angular velocity multipliers normalised to escape wheel = 1.
 *
 * In a real movement the escape wheel turns slowest; fourth wheel turns fastest
 * (seconds hand). We model angular velocity as float multipliers relative to
 * the escape wheel's tooth-advance rate.
 */
const DEFAULT_GEAR_RATIOS = {
  mainspringBarrel: 1 / 64,   // slowest — drives everything
  centreWheel:      1 / 8,
  thirdWheel:       1 / 1,    // similar speed to escape wheel in this simplification
  fourthWheel:      7.5,      // fastest — drives seconds hand
};

class GearTrainAnimationController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.renderHook   Injected render hook:
   *   ({ command, angles, state, lodReduced }) => void.
   * @param {Object}   [opts.gearRatios] Per-caliber gear ratio overrides.
   *   Keys: mainspringBarrel, centreWheel, thirdWheel, fourthWheel.
   * @param {string}   [opts.failureMode] 'over_spinning' | 'stalled' (default 'over_spinning').
   */
  constructor({ renderHook, gearRatios = {}, failureMode = 'over_spinning' }) {
    if (typeof renderHook !== 'function') {
      throw new Error('GearTrainAnimationController: renderHook must be a function.');
    }
    if (failureMode !== 'over_spinning' && failureMode !== 'stalled') {
      throw new Error(`GearTrainAnimationController: unknown failureMode "${failureMode}".`);
    }

    this._renderHook   = renderHook;
    this._failureMode  = failureMode;
    this._gearRatios   = Object.assign({}, DEFAULT_GEAR_RATIOS, gearRatios);
    this._state        = GEAR_TRAIN_STATE.IDLE;
    this._lodReduced   = false;

    // Cumulative angle accumulator per wheel (in tooth-advance units)
    this._angles = {
      mainspringBarrel: 0,
      centreWheel:      0,
      thirdWheel:       0,
      fourthWheel:      0,
    };

    this._escapeWheelAdvances = 0;
    this._assembledCorrectly  = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start gear train animation.
   * @param {boolean} [assembledCorrectly]
   * @param {boolean} [lodReduced]  True = run at reduced LOD complexity (AC3).
   */
  start(assembledCorrectly = true, lodReduced = false) {
    this._assembledCorrectly = assembledCorrectly;
    this._lodReduced         = lodReduced;

    if (assembledCorrectly) {
      this._state = lodReduced ? GEAR_TRAIN_STATE.RUNNING_LOD : GEAR_TRAIN_STATE.RUNNING;
      this._renderHook({
        command:    'gear_train_start',
        angles:     this._cloneAngles(),
        state:      this._state,
        lodReduced: this._lodReduced,
      });
    } else {
      this._state = this._failureMode === 'stalled'
        ? GEAR_TRAIN_STATE.STALLED
        : GEAR_TRAIN_STATE.OVER_SPINNING;
      this._renderHook({
        command:    'gear_train_failure',
        angles:     this._cloneAngles(),
        state:      this._state,
        lodReduced: false,
      });
    }
  }

  /**
   * Called when the escape wheel advances one tooth.
   * Updates all gear wheel angles by their respective gear ratios.
   * No-op if not in RUNNING or RUNNING_LOD state.
   *
   * @param {number} [toothAdvances]  Number of escape wheel tooth advances (default 1).
   */
  onEscapeWheelAdvance(toothAdvances = 1) {
    if (this._state !== GEAR_TRAIN_STATE.RUNNING && this._state !== GEAR_TRAIN_STATE.RUNNING_LOD) return;

    this._escapeWheelAdvances += toothAdvances;

    // In LOD mode, skip gear train rendering but still track angles (AC3)
    if (this._lodReduced) {
      // Gear train angle tracking is paused at low LOD — balance + escapement are preserved
      return;
    }

    // Advance all gear angles proportionally to gear ratios
    for (const wheel of Object.keys(this._angles)) {
      this._angles[wheel] += this._gearRatios[wheel] * toothAdvances;
    }

    this._renderHook({
      command:    'gear_train_advance',
      angles:     this._cloneAngles(),
      state:      this._state,
      lodReduced: this._lodReduced,
    });
  }

  /**
   * Stop gear train animation.  Call on scene exit (AC5).
   */
  stop() {
    this._state = GEAR_TRAIN_STATE.IDLE;
    this._renderHook({
      command:    'gear_train_stop',
      angles:     this._cloneAngles(),
      state:      this._state,
      lodReduced: this._lodReduced,
    });
  }

  /**
   * Full reset — zero all angles and return to IDLE.
   */
  reset() {
    this._state               = GEAR_TRAIN_STATE.IDLE;
    this._lodReduced          = false;
    this._escapeWheelAdvances = 0;
    this._assembledCorrectly  = true;
    for (const wheel of Object.keys(this._angles)) {
      this._angles[wheel] = 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  getState()                  { return this._state; }
  getAngles()                 { return this._cloneAngles(); }
  getGearRatios()             { return Object.assign({}, this._gearRatios); }
  getEscapeWheelAdvances()    { return this._escapeWheelAdvances; }
  isLodReduced()              { return this._lodReduced; }

  _cloneAngles() {
    return Object.assign({}, this._angles);
  }
}

module.exports = { GearTrainAnimationController, GEAR_TRAIN_STATE, DEFAULT_GEAR_RATIOS };
