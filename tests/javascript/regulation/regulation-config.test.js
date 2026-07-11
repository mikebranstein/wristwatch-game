/**
 * Tests: RegulationConfig — configuration constants for the Regulation Phase.
 * Issue #294 — Movement Regulation Phase 1
 *
 * Run with: npm test
 */
'use strict';

const {
  GRADES,
  GRADE_THRESHOLDS,
  GRADE_TO_ACCURACY_SCORE,
  REGULATOR_INDEX,
  LINEAR_SENSITIVITY_CONSTANT,
  INITIAL_DEVIATION_RANGE,
  ASSIST_MODE_TARGET_DEVIATION,
  DEFAULT_VISUAL_INDICATOR_ON,
} = require('../../../src/regulation/RegulationConfig');

describe('RegulationConfig', () => {
  describe('GRADES', () => {
    it('defines four grade identifiers', () => {
      expect(GRADES.CERTIFIED_CHRONOMETER).toBe('certified_chronometer');
      expect(GRADES.EXCELLENT).toBe('excellent');
      expect(GRADES.GOOD).toBe('good');
      expect(GRADES.ACCEPTABLE).toBe('acceptable');
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(GRADES)).toBe(true);
    });
  });

  describe('GRADE_THRESHOLDS', () => {
    it('Acceptable threshold is 30 s/day (casual first-attempt pass)', () => {
      expect(GRADE_THRESHOLDS[GRADES.ACCEPTABLE]).toBe(30);
    });

    it('Good threshold is 15 s/day', () => {
      expect(GRADE_THRESHOLDS[GRADES.GOOD]).toBe(15);
    });

    it('Excellent threshold is 8 s/day', () => {
      expect(GRADE_THRESHOLDS[GRADES.EXCELLENT]).toBe(8);
    });

    it('Certified Chronometer threshold is 5 s/day', () => {
      expect(GRADE_THRESHOLDS[GRADES.CERTIFIED_CHRONOMETER]).toBe(5);
    });

    it('thresholds are strictly ordered best < better (tighter tolerances for higher grades)', () => {
      expect(GRADE_THRESHOLDS[GRADES.CERTIFIED_CHRONOMETER])
        .toBeLessThan(GRADE_THRESHOLDS[GRADES.EXCELLENT]);
      expect(GRADE_THRESHOLDS[GRADES.EXCELLENT])
        .toBeLessThan(GRADE_THRESHOLDS[GRADES.GOOD]);
      expect(GRADE_THRESHOLDS[GRADES.GOOD])
        .toBeLessThan(GRADE_THRESHOLDS[GRADES.ACCEPTABLE]);
    });
  });

  describe('GRADE_TO_ACCURACY_SCORE', () => {
    it('Certified Chronometer maps to 100', () => {
      expect(GRADE_TO_ACCURACY_SCORE[GRADES.CERTIFIED_CHRONOMETER]).toBe(100);
    });

    it('Acceptable maps to 50', () => {
      expect(GRADE_TO_ACCURACY_SCORE[GRADES.ACCEPTABLE]).toBe(50);
    });

    it('all grades have a score between 0 and 100', () => {
      for (const grade of Object.values(GRADES)) {
        const score = GRADE_TO_ACCURACY_SCORE[grade];
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('REGULATOR_INDEX', () => {
    it('has MIN=0, MAX=100, NEUTRAL=50', () => {
      expect(REGULATOR_INDEX.MIN).toBe(0);
      expect(REGULATOR_INDEX.MAX).toBe(100);
      expect(REGULATOR_INDEX.NEUTRAL).toBe(50);
    });
  });

  describe('visual indicator default', () => {
    it('DEFAULT_VISUAL_INDICATOR_ON is true (AC3)', () => {
      expect(DEFAULT_VISUAL_INDICATOR_ON).toBe(true);
    });
  });

  describe('assist mode target', () => {
    it('ASSIST_MODE_TARGET_DEVIATION is 0 (perfect calibration target)', () => {
      expect(ASSIST_MODE_TARGET_DEVIATION).toBe(0);
    });
  });

  describe('INITIAL_DEVIATION_RANGE', () => {
    it('MIN_ABS < MAX_ABS', () => {
      expect(INITIAL_DEVIATION_RANGE.MIN_ABS).toBeLessThan(INITIAL_DEVIATION_RANGE.MAX_ABS);
    });

    it('MIN_ABS is at least the Acceptable threshold (always starts with a challenge)', () => {
      // MIN_ABS should be at or above Acceptable so job always starts outside the target zone
      expect(INITIAL_DEVIATION_RANGE.MIN_ABS).toBeGreaterThanOrEqual(GRADE_THRESHOLDS[GRADES.ACCEPTABLE]);
    });
  });

  describe('LINEAR_SENSITIVITY_CONSTANT', () => {
    it('is a positive number', () => {
      expect(LINEAR_SENSITIVITY_CONSTANT).toBeGreaterThan(0);
    });

    it('allows full ±50 index range to cover at least ±Acceptable deviation', () => {
      const halfRange = 50 * LINEAR_SENSITIVITY_CONSTANT;
      expect(halfRange).toBeGreaterThanOrEqual(GRADE_THRESHOLDS[GRADES.ACCEPTABLE]);
    });
  });
});
