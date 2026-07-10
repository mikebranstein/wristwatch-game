/**
 * TimegrapherDisplay — visual readout for the simulated timegrapher.
 *
 * Issue #294 — Movement Regulation Phase 1
 *
 * Responsibilities:
 *   AC1: Shows current beat-rate deviation in real time (deviationLabel, liveDeviation)
 *   AC3: Highlights the Acceptable tolerance zone when visual indicator is ON (default)
 *   Test Scenario 5: Toggle indicator OFF — live reading still shown, tooltip available
 *
 * Pure rendering: no side effects beyond calling renderFn.
 * Visual indicator is ON by default per AC3 and DEFAULT_VISUAL_INDICATOR_ON = true.
 */
'use strict';

const { GRADES, GRADE_THRESHOLDS, DEFAULT_VISUAL_INDICATOR_ON } = require('./RegulationConfig');

class TimegrapherDisplay {
  /**
   * @param {Object}   opts
   * @param {Function} opts.renderFn           (viewModel) => void — called to paint the display
   * @param {boolean}  [opts.visualIndicatorOn]  Default: true — highlights Acceptable zone (AC3)
   */
  constructor({ renderFn, visualIndicatorOn = DEFAULT_VISUAL_INDICATOR_ON }) {
    if (typeof renderFn !== 'function') {
      throw new Error('TimegrapherDisplay requires a renderFn function.');
    }
    this._renderFn          = renderFn;
    this._visualIndicatorOn = Boolean(visualIndicatorOn);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Render the timegrapher display for the current state.
   *
   * AC1: live readout of deviation, current grade, regulator position.
   * AC3: Acceptable zone highlighted when visualIndicatorOn === true.
   *
   * @param {number}      deviation       Current deviation in s/day
   * @param {string|null} currentGrade    Grade string or null (not passing)
   * @param {number}      regulatorIndex  Current index (0–100)
   * @param {string}      directionLabel  'advance'|'retard'|'neutral' — tooltip
   */
  render(deviation, currentGrade, regulatorIndex, directionLabel) {
    const vm = this._buildViewModel(deviation, currentGrade, regulatorIndex, directionLabel);
    this._renderFn(vm);
  }

  /**
   * Toggle the visual target range indicator ON/OFF.
   * When ON  (AC3): Acceptable zone is highlighted on readout.
   * When OFF (Test Scenario 5): live reading still shown; directional tooltip remains.
   * @returns {boolean} New state of visual indicator
   */
  toggleVisualIndicator() {
    this._visualIndicatorOn = !this._visualIndicatorOn;
    return this._visualIndicatorOn;
  }

  /**
   * Get whether the visual indicator is currently ON.
   * @returns {boolean}
   */
  isVisualIndicatorOn() {
    return this._visualIndicatorOn;
  }

  // ---------------------------------------------------------------------------
  // Private: view model builder
  // ---------------------------------------------------------------------------

  /**
   * @private
   */
  _buildViewModel(deviation, currentGrade, regulatorIndex, directionLabel) {
    const absDeviation        = Math.abs(deviation);
    const acceptableThreshold = GRADE_THRESHOLDS[GRADES.ACCEPTABLE];

    return {
      // AC1 — live readout
      deviation:        deviation,
      absDeviation:     absDeviation,
      deviationLabel:   `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)} s/day`,
      isRunningFast:    deviation > 0,
      isRunningNeutral: deviation === 0,

      // Current grade readout
      currentGrade:     currentGrade,
      isPassing:        currentGrade !== null,

      // Regulator control — interactive (AC1)
      regulatorIndex:   regulatorIndex,
      directionLabel:   directionLabel,   // 'advance'|'retard'|'neutral' — tooltip (AC1)

      // AC3 — visual target zone indicator
      visualIndicatorOn: this._visualIndicatorOn,
      acceptableZone: {
        highlighted: this._visualIndicatorOn,
        threshold:   acceptableThreshold,
        // AC3: label shown when indicator is ON so player identifies target without tooltip
        label:       this._visualIndicatorOn ? `Target zone: ±${acceptableThreshold} s/day` : null,
        inZone:      absDeviation <= acceptableThreshold,
      },
    };
  }
}

module.exports = { TimegrapherDisplay };
