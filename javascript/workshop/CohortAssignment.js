/**
 * CohortAssignment — stable per-player A/B cohort arm for the Two-Bench Workshop Probe.
 *
 * Issue #116 — Two-Bench Workshop Probe: Second Parallel Bench Slot (Phase 1 A/B)
 *
 * Design invariants (from Design Decision):
 *   - Cohort arm is written ONCE at the player's first session start.
 *   - After assignment the arm is READ-ONLY — no code path reassigns it.
 *   - Two arms: 'probe' (second bench slot enabled) | 'control' (no second bench slot).
 *   - Assignment is stable across session reloads and app updates.
 *   - Default split: 50% probe / 50% control (configurable via CohortConfig).
 *
 * AC4: Cohort assignment must survive session reload without switching arms.
 * AC7 (Test Scenario 7): probe cohort player sees second slot on all sessions;
 *   control cohort never sees it; assignment does not change between sessions.
 *
 * The CohortAssignment class is a pure assignment helper — it does NOT own
 * the persistence layer.  The caller (WorkshopController / game bootstrap)
 * reads the cohort arm from PlayerSaveState and passes it in for validation.
 * Assignment only runs when the stored arm is null (first session).
 */

'use strict';

/** @enum {string} */
const CohortArm = {
  PROBE:   'probe',
  CONTROL: 'control',
};

/**
 * @typedef {{ probeRatio: number }} CohortConfig
 * probeRatio — fraction of players assigned to probe arm (default 0.5 = 50/50 split)
 */
const DEFAULT_COHORT_CONFIG = {
  probeRatio: 0.5,
};

class CohortAssignment {
  /**
   * @param {CohortConfig} [config]
   * @param {() => number} [rng]  Injectable RNG for deterministic tests; default: Math.random
   */
  constructor(config = DEFAULT_COHORT_CONFIG, rng = Math.random) {
    this._config = Object.assign({}, DEFAULT_COHORT_CONFIG, config);
    this._rng    = rng;
  }

  /**
   * Assign an arm for a new player (first session — stored arm is null).
   *
   * Contract:
   *   - Returns a CohortArm value ('probe' | 'control').
   *   - Caller MUST persist the returned value immediately (before any game-loop code).
   *   - Must NOT be called again for the same player once an arm is persisted.
   *
   * @returns {'probe' | 'control'}
   */
  assign() {
    return this._rng() < this._config.probeRatio
      ? CohortArm.PROBE
      : CohortArm.CONTROL;
  }

  /**
   * Resolve the cohort arm for an existing player session.
   *
   * If storedArm is already set, it is returned unchanged (immutability guarantee).
   * If storedArm is null (first-ever session), a new arm is assigned.
   *
   * @param {string|null} storedArm  The arm stored in PlayerSaveState (null if first session)
   * @returns {'probe' | 'control'}
   */
  resolve(storedArm) {
    if (storedArm === CohortArm.PROBE || storedArm === CohortArm.CONTROL) {
      return storedArm;   // Arm already assigned — immutable; return as-is
    }
    return this.assign();  // First session — assign and return (caller must persist)
  }

  /**
   * Returns true if the given arm value is the probe arm (second bench slot enabled).
   * @param {string|null} arm
   * @returns {boolean}
   */
  static isProbeArm(arm) {
    return arm === CohortArm.PROBE;
  }

  /**
   * Returns true if the given arm value is the control arm (no second bench slot).
   * @param {string|null} arm
   * @returns {boolean}
   */
  static isControlArm(arm) {
    return arm === CohortArm.CONTROL;
  }
}

module.exports = { CohortAssignment, CohortArm, DEFAULT_COHORT_CONFIG };
