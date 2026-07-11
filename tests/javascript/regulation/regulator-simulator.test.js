/**
 * Tests: RegulatorSimulator — physical simulation model.
 * Issue #294 — Movement Regulation Phase 1
 *
 * Run with: npm test
 */
'use strict';

const { RegulatorSimulator } = require('../../../src/regulation/RegulatorSimulator');
const { REGULATOR_INDEX, LINEAR_SENSITIVITY_CONSTANT } = require('../../../src/regulation/RegulationConfig');

describe('RegulatorSimulator', () => {
  describe('constructor', () => {
    it('initializes with NEUTRAL index', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 60 });
      expect(sim.getRegulatorIndex()).toBe(REGULATOR_INDEX.NEUTRAL);
    });

    it('accepts override initialDeviation', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 75 });
      expect(sim.getInitialDeviation()).toBe(75);
    });

    it('accepts negative initialDeviation', () => {
      const sim = new RegulatorSimulator({ initialDeviation: -50 });
      expect(sim.getInitialDeviation()).toBe(-50);
    });

    it('seeds random deviation within configured range when no override', () => {
      const { INITIAL_DEVIATION_RANGE } = require('../../../src/regulation/RegulationConfig');
      const sim = new RegulatorSimulator();
      const abs = Math.abs(sim.getInitialDeviation());
      expect(abs).toBeGreaterThanOrEqual(INITIAL_DEVIATION_RANGE.MIN_ABS);
      expect(abs).toBeLessThanOrEqual(INITIAL_DEVIATION_RANGE.MAX_ABS);
    });
  });

  describe('getDeviation()', () => {
    it('at NEUTRAL index: deviation equals initial deviation', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 60 });
      expect(sim.getDeviation()).toBeCloseTo(60, 5);
    });

    it('advancing index increases deviation (AC1: real-time update)', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 60 });
      sim.setRegulatorIndex(60);  // +10 from neutral
      const expected = 60 + (10 * LINEAR_SENSITIVITY_CONSTANT);
      expect(sim.getDeviation()).toBeCloseTo(expected, 5);
    });

    it('retarding index decreases deviation', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 60 });
      sim.setRegulatorIndex(40);  // -10 from neutral
      const expected = 60 + (-10 * LINEAR_SENSITIVITY_CONSTANT);
      expect(sim.getDeviation()).toBeCloseTo(expected, 5);
    });

    it('can reach near-zero deviation by setting correct index', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 60 });
      const targetIndex = sim.computeIndexForDeviation(0);
      sim.setRegulatorIndex(targetIndex);
      expect(Math.abs(sim.getDeviation())).toBeLessThan(0.01);
    });
  });

  describe('setRegulatorIndex()', () => {
    it('clamps to MIN', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 0 });
      sim.setRegulatorIndex(-10);
      expect(sim.getRegulatorIndex()).toBe(REGULATOR_INDEX.MIN);
    });

    it('clamps to MAX', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 0 });
      sim.setRegulatorIndex(150);
      expect(sim.getRegulatorIndex()).toBe(REGULATOR_INDEX.MAX);
    });

    it('accepts valid range', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 0 });
      sim.setRegulatorIndex(75);
      expect(sim.getRegulatorIndex()).toBe(75);
    });
  });

  describe('computeIndexForDeviation()', () => {
    it('computes correct index for target deviation 0', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 60 });
      const idx = sim.computeIndexForDeviation(0);
      sim.setRegulatorIndex(idx);
      expect(Math.abs(sim.getDeviation())).toBeLessThan(0.01);
    });

    it('computes correct index for positive target deviation', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 60 });
      const idx = sim.computeIndexForDeviation(10);
      sim.setRegulatorIndex(idx);
      expect(sim.getDeviation()).toBeCloseTo(10, 5);
    });

    it('clamps to REGULATOR_INDEX.MAX when deviation is unreachable', () => {
      // Very large positive initial deviation — setting to MAX reduces it but cannot exceed MAX
      const sim = new RegulatorSimulator({ initialDeviation: -500 });
      const idx = sim.computeIndexForDeviation(0);
      expect(idx).toBe(REGULATOR_INDEX.MAX);
    });
  });

  describe('getDirectionLabel()', () => {
    it('returns "advance" when index > NEUTRAL', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 0 });
      sim.setRegulatorIndex(60);
      expect(sim.getDirectionLabel()).toBe('advance');
    });

    it('returns "retard" when index < NEUTRAL', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 0 });
      sim.setRegulatorIndex(40);
      expect(sim.getDirectionLabel()).toBe('retard');
    });

    it('returns "neutral" when index === NEUTRAL', () => {
      const sim = new RegulatorSimulator({ initialDeviation: 0 });
      expect(sim.getDirectionLabel()).toBe('neutral');
    });
  });
});
