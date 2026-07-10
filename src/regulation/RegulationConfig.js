/**
 * RegulationConfig — configurable constants for the Movement Regulation Phase.
 *
 * Issue #294 — Movement Regulation Phase 1
 *
 * All tolerance thresholds are stored as a config object (NOT inline magic numbers)
 * per the design mitigation: "implement tolerance thresholds as a config object so
 * playtest feedback can update values without a logic change."
 *
 * Design-phase dependency: the ±30 s/day Acceptable threshold is a PM-research
 * assumption pending internal playtest validation (5–8 participants). These values
 * MUST be treated as tunable parameters until confirmed.
 */
'use strict';

/**
 * Accuracy grade identifiers (ordered best → worst).
 * @readonly
 */
const GRADES = Object.freeze({
  CERTIFIED_CHRONOMETER: 'certified_chronometer',
  EXCELLENT:             'excellent',
  GOOD:                  'good',
  ACCEPTABLE:            'acceptable',
});

/**
 * Tolerance thresholds in seconds-per-day (absolute value of deviation).
 * Tunable: update these after internal playtest validation.
 *
 * Certified Chronometer: |deviation| ≤ 5 s/day  — enthusiast elite
 * Excellent:             |deviation| ≤ 8 s/day  — skilled player target
 * Good:                  |deviation| ≤ 15 s/day — engaged player target
 * Acceptable:            |deviation| ≤ 30 s/day — casual first-attempt pass threshold
 */
const GRADE_THRESHOLDS = Object.freeze({
  [GRADES.CERTIFIED_CHRONOMETER]: 5,
  [GRADES.EXCELLENT]:             8,
  [GRADES.GOOD]:                  15,
  [GRADES.ACCEPTABLE]:            30,
});

/**
 * Grade-to-regulation_accuracy score mapping for JobQualityAggregator injection.
 * Converts a grade string to a 0–100 numeric score for craftsmanship dimension.
 */
const GRADE_TO_ACCURACY_SCORE = Object.freeze({
  [GRADES.CERTIFIED_CHRONOMETER]: 100,
  [GRADES.EXCELLENT]:              85,
  [GRADES.GOOD]:                   70,
  [GRADES.ACCEPTABLE]:             50,
});

/**
 * Regulator index range (0–100 inclusive; 50 = neutral).
 * At index 50 the simulated movement runs at its natural (unregulated) deviation.
 * Advancing (>50) increases beat rate; retarding (<50) decreases beat rate.
 */
const REGULATOR_INDEX = Object.freeze({
  MIN:     0,
  MAX:     100,
  NEUTRAL: 50,
});

/**
 * Linear sensitivity constant: seconds-per-day deviation shift per regulator
 * index unit away from NEUTRAL.
 *
 * Stub value (tunable per design mitigation): chosen so that the full index
 * range (±50 from neutral) covers ±120 s/day:
 *   range = 50 × 2.4 = 120 s/day
 */
const LINEAR_SENSITIVITY_CONSTANT = 2.4;

/**
 * Initial deviation seeding range [MIN_ABS, MAX_ABS] in seconds/day (absolute value).
 * RandomBPHDeviation seed — tunable stub param per design mitigation.
 * Ensures the game always starts with a measurable calibration challenge.
 */
const INITIAL_DEVIATION_RANGE = Object.freeze({
  MIN_ABS: 35,   // Minimum absolute deviation on job start (s/day) — above Acceptable (30) so job always starts with a challenge
  MAX_ABS: 90,   // Maximum absolute deviation on job start (s/day)
});

/**
 * Assist mode target deviation: auto-calibrates to ~0 s/day (well within Acceptable).
 */
const ASSIST_MODE_TARGET_DEVIATION = 0;

/**
 * Visual indicator is ON by default (AC3 — highlights Acceptable zone on readout).
 */
const DEFAULT_VISUAL_INDICATOR_ON = true;

/**
 * Timegrapher display refresh interval in milliseconds.
 */
const DISPLAY_REFRESH_INTERVAL_MS = 100;

module.exports = {
  GRADES,
  GRADE_THRESHOLDS,
  GRADE_TO_ACCURACY_SCORE,
  REGULATOR_INDEX,
  LINEAR_SENSITIVITY_CONSTANT,
  INITIAL_DEVIATION_RANGE,
  ASSIST_MODE_TARGET_DEVIATION,
  DEFAULT_VISUAL_INDICATOR_ON,
  DISPLAY_REFRESH_INTERVAL_MS,
};
