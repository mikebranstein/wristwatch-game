/**
 * RegulatorSimulator — simulates the physical regulator-index → beat-rate model.
 *
 * Issue #294 — Movement Regulation Phase 1
 *
 * Simulation model:
 *   current_deviation = initial_deviation + (index − NEUTRAL) × LINEAR_SENSITIVITY_CONSTANT
 *
 * Where:
 *   initial_deviation  — seeded randomly within INITIAL_DEVIATION_RANGE (configurable stub)
 *   index              — current regulator position (0–100; 50 = neutral)
 *   NEUTRAL            — 50
 *   SENSITIVITY        — LINEAR_SENSITIVITY_CONSTANT (2.4 s/day per index unit; tunable)
 *
 * Advancing (index > 50) shifts deviation positive (faster).
 * Retarding  (index < 50) shifts deviation negative (slower).
 *
 * All sim parameters are tunable via RegulationConfig for playtest iteration.
 */
'use strict';

const {
  REGULATOR_INDEX,
  LINEAR_SENSITIVITY_CONSTANT,
  INITIAL_DEVIATION_RANGE,
} = require('./RegulationConfig');

class RegulatorSimulator {
  /**
   * @param {Object} [opts]
   * @param {number|null} [opts.initialDeviation]  Override initial deviation (skips RNG if provided)
   * @param {Function}    [opts.seedFn]            Optional RNG function () => [0,1) (default: Math.random)
   */
  constructor({ initialDeviation = null, seedFn = null } = {}) {
    const rng = typeof seedFn === 'function' ? seedFn : Math.random;

    if (initialDeviation !== null && initialDeviation !== undefined) {
      this._initialDeviation = Number(initialDeviation);
    } else {
      // Seed a random deviation in the configured range with a random sign.
      const { MIN_ABS, MAX_ABS } = INITIAL_DEVIATION_RANGE;
      const absValue = MIN_ABS + rng() * (MAX_ABS - MIN_ABS);
      this._initialDeviation = rng() < 0.5 ? absValue : -absValue;
    }

    this._regulatorIndex = REGULATOR_INDEX.NEUTRAL;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get the current beat-rate deviation in seconds/day.
   * Positive = running fast; negative = running slow.
   * @returns {number}
   */
  getDeviation() {
    const offset = (this._regulatorIndex - REGULATOR_INDEX.NEUTRAL) * LINEAR_SENSITIVITY_CONSTANT;
    return this._initialDeviation + offset;
  }

  /**
   * Get the current regulator index position (0–100).
   * @returns {number}
   */
  getRegulatorIndex() {
    return this._regulatorIndex;
  }

  /**
   * Set the regulator index position. Clamped to [MIN, MAX].
   * @param {number} index
   */
  setRegulatorIndex(index) {
    this._regulatorIndex = Math.max(
      REGULATOR_INDEX.MIN,
      Math.min(REGULATOR_INDEX.MAX, Number(index))
    );
  }

  /**
   * Compute the regulator index required to reach a target deviation.
   * Used by assist mode to auto-calibrate.
   *
   * Solve: targetDeviation = initialDeviation + (index − NEUTRAL) × SENSITIVITY
   * → index = NEUTRAL + (targetDeviation − initialDeviation) / SENSITIVITY
   *
   * @param {number} targetDeviation  Target deviation in s/day
   * @returns {number} Required regulator index (clamped to valid range)
   */
  computeIndexForDeviation(targetDeviation) {
    const rawIndex = REGULATOR_INDEX.NEUTRAL +
      (targetDeviation - this._initialDeviation) / LINEAR_SENSITIVITY_CONSTANT;
    return Math.max(REGULATOR_INDEX.MIN, Math.min(REGULATOR_INDEX.MAX, rawIndex));
  }

  /**
   * Get the initial (seed) deviation before any regulator adjustment.
   * @returns {number}
   */
  getInitialDeviation() {
    return this._initialDeviation;
  }

  /**
   * Human-readable directional tooltip for the current regulator position.
   * 'advance' = index > NEUTRAL (speeds movement up)
   * 'retard'  = index < NEUTRAL (slows movement down)
   * 'neutral' = index === NEUTRAL
   * @returns {'advance'|'retard'|'neutral'}
   */
  getDirectionLabel() {
    if (this._regulatorIndex > REGULATOR_INDEX.NEUTRAL) return 'advance';
    if (this._regulatorIndex < REGULATOR_INDEX.NEUTRAL) return 'retard';
    return 'neutral';
  }
}

module.exports = { RegulatorSimulator };
