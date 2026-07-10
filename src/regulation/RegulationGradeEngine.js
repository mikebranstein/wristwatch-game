/**
 * RegulationGradeEngine — computes accuracy grade from beat-rate deviation.
 *
 * Issue #294 — Movement Regulation Phase 1
 *
 * Grade tiers (all thresholds from RegulationConfig — tunable):
 *   Certified Chronometer: |deviation| ≤ 5 s/day
 *   Excellent:             |deviation| ≤ 8 s/day
 *   Good:                  |deviation| ≤ 15 s/day
 *   Acceptable:            |deviation| ≤ 30 s/day
 *   null (not passing):    |deviation| > 30 s/day
 *
 * Pass threshold: Acceptable grade or better (|deviation| ≤ 30 s/day).
 */
'use strict';

const { GRADES, GRADE_THRESHOLDS, GRADE_TO_ACCURACY_SCORE } = require('./RegulationConfig');

/** Grades ordered from best to worst for threshold evaluation. */
const GRADE_ORDER = [
  GRADES.CERTIFIED_CHRONOMETER,
  GRADES.EXCELLENT,
  GRADES.GOOD,
  GRADES.ACCEPTABLE,
];

class RegulationGradeEngine {
  /**
   * Compute the accuracy grade for a given deviation.
   * Evaluates grades best-to-worst and returns the first matching grade.
   *
   * @param {number} deviationSecPerDay  Beat-rate deviation in s/day (positive or negative)
   * @returns {string|null}  One of GRADES values, or null if outside all grade bands
   */
  static computeGrade(deviationSecPerDay) {
    const absDeviation = Math.abs(deviationSecPerDay);
    for (const grade of GRADE_ORDER) {
      if (absDeviation <= GRADE_THRESHOLDS[grade]) {
        return grade;
      }
    }
    return null;
  }

  /**
   * Determine whether a deviation qualifies as a passing grade (Acceptable or better).
   * @param {number} deviationSecPerDay
   * @returns {boolean}
   */
  static isPassingGrade(deviationSecPerDay) {
    return RegulationGradeEngine.computeGrade(deviationSecPerDay) !== null;
  }

  /**
   * Convert a grade string to a 0–100 numeric score for craftsmanship injection.
   * Returns null for null grade (not yet submitted or failed to pass).
   * @param {string|null} grade
   * @returns {number|null}
   */
  static gradeToAccuracyScore(grade) {
    if (!grade) return null;
    const score = GRADE_TO_ACCURACY_SCORE[grade];
    return score !== undefined ? score : null;
  }

  /**
   * Get all grade identifiers ordered from best to worst.
   * @returns {string[]}
   */
  static getGradeOrder() {
    return [...GRADE_ORDER];
  }

  /**
   * Get the tolerance threshold (s/day) for a given grade.
   * @param {string} grade
   * @returns {number|null}
   */
  static getThreshold(grade) {
    const threshold = GRADE_THRESHOLDS[grade];
    return threshold !== undefined ? threshold : null;
  }
}

module.exports = { RegulationGradeEngine, GRADE_ORDER };
