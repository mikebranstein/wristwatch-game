/**
 * Tests: RegulationGradeEngine — grade computation from deviation.
 * Issue #294 — Movement Regulation Phase 1
 *
 * Run with: npm test
 */
'use strict';

const { RegulationGradeEngine } = require('../../src/regulation/RegulationGradeEngine');
const { GRADES, GRADE_THRESHOLDS, GRADE_TO_ACCURACY_SCORE } = require('../../src/regulation/RegulationConfig');

describe('RegulationGradeEngine', () => {
  describe('computeGrade()', () => {
    it('returns Certified Chronometer at exact threshold (5 s/day)', () => {
      expect(RegulationGradeEngine.computeGrade(5)).toBe(GRADES.CERTIFIED_CHRONOMETER);
      expect(RegulationGradeEngine.computeGrade(-5)).toBe(GRADES.CERTIFIED_CHRONOMETER);
    });

    it('returns Certified Chronometer below threshold', () => {
      expect(RegulationGradeEngine.computeGrade(0)).toBe(GRADES.CERTIFIED_CHRONOMETER);
      expect(RegulationGradeEngine.computeGrade(2.5)).toBe(GRADES.CERTIFIED_CHRONOMETER);
    });

    it('returns Excellent at ≤8 s/day but > 5 s/day', () => {
      expect(RegulationGradeEngine.computeGrade(8)).toBe(GRADES.EXCELLENT);
      expect(RegulationGradeEngine.computeGrade(6)).toBe(GRADES.EXCELLENT);
      expect(RegulationGradeEngine.computeGrade(-7)).toBe(GRADES.EXCELLENT);
    });

    it('returns Good at ≤15 s/day but > 8 s/day', () => {
      expect(RegulationGradeEngine.computeGrade(15)).toBe(GRADES.GOOD);
      expect(RegulationGradeEngine.computeGrade(10)).toBe(GRADES.GOOD);
      expect(RegulationGradeEngine.computeGrade(-12)).toBe(GRADES.GOOD);
    });

    it('returns Acceptable at ≤30 s/day but > 15 s/day (AC2)', () => {
      expect(RegulationGradeEngine.computeGrade(30)).toBe(GRADES.ACCEPTABLE);
      expect(RegulationGradeEngine.computeGrade(20)).toBe(GRADES.ACCEPTABLE);
      expect(RegulationGradeEngine.computeGrade(-25)).toBe(GRADES.ACCEPTABLE);
    });

    it('returns null above Acceptable threshold (AC2: not yet passing)', () => {
      expect(RegulationGradeEngine.computeGrade(31)).toBeNull();
      expect(RegulationGradeEngine.computeGrade(-60)).toBeNull();
      expect(RegulationGradeEngine.computeGrade(100)).toBeNull();
    });

    it('handles exactly on grade boundaries (inclusive)', () => {
      // Boundaries are inclusive — exactly at threshold returns that grade
      expect(RegulationGradeEngine.computeGrade(GRADE_THRESHOLDS[GRADES.ACCEPTABLE])).toBe(GRADES.ACCEPTABLE);
      expect(RegulationGradeEngine.computeGrade(GRADE_THRESHOLDS[GRADES.GOOD])).toBe(GRADES.GOOD);
      expect(RegulationGradeEngine.computeGrade(GRADE_THRESHOLDS[GRADES.EXCELLENT])).toBe(GRADES.EXCELLENT);
      expect(RegulationGradeEngine.computeGrade(GRADE_THRESHOLDS[GRADES.CERTIFIED_CHRONOMETER])).toBe(GRADES.CERTIFIED_CHRONOMETER);
    });
  });

  describe('isPassingGrade()', () => {
    it('returns true for deviation ≤ 30 s/day (Acceptable threshold)', () => {
      expect(RegulationGradeEngine.isPassingGrade(0)).toBe(true);
      expect(RegulationGradeEngine.isPassingGrade(30)).toBe(true);
      expect(RegulationGradeEngine.isPassingGrade(-15)).toBe(true);
    });

    it('returns false for deviation > 30 s/day (not yet passing)', () => {
      expect(RegulationGradeEngine.isPassingGrade(31)).toBe(false);
      expect(RegulationGradeEngine.isPassingGrade(100)).toBe(false);
    });
  });

  describe('gradeToAccuracyScore()', () => {
    it('maps Certified Chronometer to 100', () => {
      expect(RegulationGradeEngine.gradeToAccuracyScore(GRADES.CERTIFIED_CHRONOMETER)).toBe(100);
    });

    it('maps Excellent to 85', () => {
      expect(RegulationGradeEngine.gradeToAccuracyScore(GRADES.EXCELLENT)).toBe(85);
    });

    it('maps Good to 70', () => {
      expect(RegulationGradeEngine.gradeToAccuracyScore(GRADES.GOOD)).toBe(70);
    });

    it('maps Acceptable to 50', () => {
      expect(RegulationGradeEngine.gradeToAccuracyScore(GRADES.ACCEPTABLE)).toBe(50);
    });

    it('returns null for null grade', () => {
      expect(RegulationGradeEngine.gradeToAccuracyScore(null)).toBeNull();
    });

    it('returns null for undefined grade', () => {
      expect(RegulationGradeEngine.gradeToAccuracyScore(undefined)).toBeNull();
    });
  });

  describe('getGradeOrder()', () => {
    it('returns grades in order from best to worst', () => {
      const order = RegulationGradeEngine.getGradeOrder();
      expect(order[0]).toBe(GRADES.CERTIFIED_CHRONOMETER);
      expect(order[order.length - 1]).toBe(GRADES.ACCEPTABLE);
    });
  });

  describe('getThreshold()', () => {
    it('returns the threshold for each grade', () => {
      expect(RegulationGradeEngine.getThreshold(GRADES.ACCEPTABLE)).toBe(30);
      expect(RegulationGradeEngine.getThreshold(GRADES.CERTIFIED_CHRONOMETER)).toBe(5);
    });

    it('returns null for unknown grade', () => {
      expect(RegulationGradeEngine.getThreshold('unknown_grade')).toBeNull();
    });
  });
});
