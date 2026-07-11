/**
 * Tests: CohortAssignment — Issue #116 Two-Bench Workshop Probe
 *
 * Covers AC7 (Test Scenario 7): Cohort assignment stability.
 *   - Player assigned to probe cohort sees second slot on all sessions.
 *   - Player assigned to control never sees it.
 *   - Assignment does not change between sessions.
 *
 * Run with: npm test
 */

'use strict';

const { CohortAssignment, CohortArm, DEFAULT_COHORT_CONFIG } = require('../../../src/workshop/CohortAssignment');

describe('CohortAssignment — Issue #116 stable A/B cohort arm', () => {

  // ── assign() ──────────────────────────────────────────────────────────────

  describe('assign()', () => {
    it('returns "probe" when RNG is below probeRatio', () => {
      const ca = new CohortAssignment({ probeRatio: 0.5 }, () => 0.3);
      expect(ca.assign()).toBe(CohortArm.PROBE);
    });

    it('returns "control" when RNG is at or above probeRatio', () => {
      const ca = new CohortAssignment({ probeRatio: 0.5 }, () => 0.5);
      expect(ca.assign()).toBe(CohortArm.CONTROL);
    });

    it('returns "probe" for 100% probe ratio', () => {
      const ca = new CohortAssignment({ probeRatio: 1.0 }, Math.random);
      expect(ca.assign()).toBe(CohortArm.PROBE);
    });

    it('returns "control" for 0% probe ratio', () => {
      const ca = new CohortAssignment({ probeRatio: 0.0 }, Math.random);
      expect(ca.assign()).toBe(CohortArm.CONTROL);
    });
  });

  // ── resolve() — immutability invariant ────────────────────────────────────

  describe('resolve() — arm immutability invariant (Scenario 7)', () => {
    it('returns the stored arm unchanged when already assigned to "probe"', () => {
      const ca = new CohortAssignment({}, () => 0.9); // RNG would assign control
      // But stored arm is probe — must NOT be overridden
      const result = ca.resolve(CohortArm.PROBE);
      expect(result).toBe(CohortArm.PROBE);
    });

    it('returns the stored arm unchanged when already assigned to "control"', () => {
      const ca = new CohortAssignment({}, () => 0.1); // RNG would assign probe
      // But stored arm is control — must NOT be overridden
      const result = ca.resolve(CohortArm.CONTROL);
      expect(result).toBe(CohortArm.CONTROL);
    });

    it('assigns a new arm when stored arm is null (first session)', () => {
      const ca = new CohortAssignment({ probeRatio: 1.0 }, Math.random);
      const result = ca.resolve(null);
      expect(result).toBe(CohortArm.PROBE);
    });

    it('assigns a new arm when stored arm is undefined (first session)', () => {
      const ca = new CohortAssignment({ probeRatio: 0.0 }, Math.random);
      const result = ca.resolve(undefined);
      expect(result).toBe(CohortArm.CONTROL);
    });

    it('Scenario 7 — probe player: resolve always returns probe across multiple calls', () => {
      const rngControlOnly = () => 0.99; // would always pick control
      const ca = new CohortAssignment({ probeRatio: 0.5 }, rngControlOnly);
      // Simulate 5 session starts for a probe-assigned player
      for (let i = 0; i < 5; i++) {
        expect(ca.resolve(CohortArm.PROBE)).toBe(CohortArm.PROBE);
      }
    });

    it('Scenario 7 — control player: resolve always returns control across multiple calls', () => {
      const rngProbeOnly = () => 0.01; // would always pick probe
      const ca = new CohortAssignment({ probeRatio: 0.5 }, rngProbeOnly);
      // Simulate 5 session starts for a control-assigned player
      for (let i = 0; i < 5; i++) {
        expect(ca.resolve(CohortArm.CONTROL)).toBe(CohortArm.CONTROL);
      }
    });
  });

  // ── static helpers ─────────────────────────────────────────────────────────

  describe('CohortAssignment.isProbeArm() / isControlArm()', () => {
    it('isProbeArm returns true for probe arm', () => {
      expect(CohortAssignment.isProbeArm(CohortArm.PROBE)).toBe(true);
      expect(CohortAssignment.isProbeArm(CohortArm.CONTROL)).toBe(false);
      expect(CohortAssignment.isProbeArm(null)).toBe(false);
    });

    it('isControlArm returns true for control arm', () => {
      expect(CohortAssignment.isControlArm(CohortArm.CONTROL)).toBe(true);
      expect(CohortAssignment.isControlArm(CohortArm.PROBE)).toBe(false);
      expect(CohortAssignment.isControlArm(null)).toBe(false);
    });
  });

  // ── default config ────────────────────────────────────────────────────────

  describe('DEFAULT_COHORT_CONFIG', () => {
    it('default probeRatio is 0.5', () => {
      expect(DEFAULT_COHORT_CONFIG.probeRatio).toBe(0.5);
    });

    it('uses default config when none provided', () => {
      // With 50/50 split: RNG < 0.5 → probe
      const ca = new CohortAssignment(undefined, () => 0.49);
      expect(ca.assign()).toBe(CohortArm.PROBE);
      const ca2 = new CohortAssignment(undefined, () => 0.51);
      expect(ca2.assign()).toBe(CohortArm.CONTROL);
    });
  });

});
