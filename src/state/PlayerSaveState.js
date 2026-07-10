/**
 * PlayerSaveState — manages persistent player data.
 *
 * Stores player progress flags using an in-memory store (swap this for
 * actual persistence — localStorage, IndexedDB, or a save-file API — in
 * the production integration layer).
 *
 * Issue #82 — Save/Load Reliability System:
 *   Added `current_stage`, `last_checkpoint_stage`, and `autosave_slot`
 *   fields (backward-compatible additive extension; pre-existing saves that
 *   lack these keys will receive null defaults and load correctly).
 *
 * Issue #111 — Guided First-Job Onboarding System:
 *   Added `ab_first_job_cohort` (null default, backward-compatible).
 *   Written once at session start before any game-loop code runs (AC5 / Test Scenario 8).
 *   Values: 'guided' | 'control' | null (null = not yet assigned).
 *
 * Issue #116 — Two-Bench Workshop Probe: Second Parallel Bench Slot (Phase 1 A/B):
 *   Added `restorations_completed` (0 default), `ab_second_bench_cohort` (null default),
 *   `second_bench_feedback_prompted` (false default), and `bench_slots` (null default).
 *   All are additive and backward-compatible.
 */

const DEFAULT_SAVE = {
  tutorial_first_fault_seen: false,


  // Chronograph Discovery Path — Phase 1 (Issue #88)
  // Backward-compatible additions: Object.assign({}, DEFAULT_SAVE, initialState) handles
  // defaults transparently for existing save data that lacks these keys.
  chronograph_overlay_seen: false,   // overlay first-time-only trigger (AC1, AC3, AC4)
  discovery_mode_enabled: true,      // global discovery mode setting; default ON (AC3, AC4)

  // Issue #82: stage-progress tracking fields (additive, backward-compatible)
  current_stage:          null,   // e.g. 'teardown' | 'cleaning' | 'sourcing' | 'reassembly'
  last_checkpoint_stage:  null,   // last stage for which an autosave was written
  autosave_slot:          false,  // true when this save data originated from an autosave

  // Issue #111: Guided First-Job Onboarding — A/B cohort assignment (additive, backward-compatible)
  // Written synchronously before any game-loop code runs (Test Scenario 8 invariant).
  // Values: 'guided' | 'control' | null (null = not yet assigned for this player)
  ab_first_job_cohort:    null,

  // Issue #116: Two-Bench Workshop Probe — Second Parallel Bench Slot (Phase 1 A/B)
  // All fields are additive and backward-compatible; pre-existing saves that lack these
  // keys receive their defaults and load correctly.
  //
  // restorations_completed: running count of fully delivered watch restorations (used for
  //   the ≥2 mastery unlock gate and for retention-analytics cohort segmentation).
  // ab_second_bench_cohort: stable per-player A/B arm assigned once at first session.
  //   Values: 'probe' | 'control' | null (null = not yet assigned)
  // second_bench_feedback_prompted: true once the 2-week qualitative feedback prompt has
  //   been shown to a probe-arm player (prevents duplicate prompts).
  // bench_slots: null until BenchSlotManager serialises its snapshot here; null = single
  //   legacy slot still in use (BenchSlotManager migration layer handles upgrade on load).
  restorations_completed:          0,
  ab_second_bench_cohort:          null,
  second_bench_feedback_prompted:  false,
  bench_slots:                     null,

};

class PlayerSaveState {
  constructor(initialState = {}) {
    this._store = Object.assign({}, DEFAULT_SAVE, initialState);
  }

  /**
   * Read a value from the save state.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._store[key];
  }

  /**
   * Write a value to the save state.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    this._store[key] = value;
  }

  /**
   * Advance the current restoration stage and record it on the save state.
   * Issue #82: called by stage orchestrators when entering a new stage.
   *
   * @param {string} stage — one of 'teardown' | 'cleaning' | 'sourcing' | 'reassembly'
   */
  setCurrentStage(stage) {
    this._store.current_stage = stage;
  }

  /**
   * Record that an autosave checkpoint was written for *stage*.
   * Issue #82: called by the autosave hook after a successful checkpoint write.
   *
   * @param {string} stage
   */
  markCheckpointStage(stage) {
    this._store.last_checkpoint_stage = stage;
    this._store.autosave_slot = true;
  }

  /**
   * Returns a shallow snapshot of the entire save state (for serialisation).
   * @returns {Object}
   */
  snapshot() {
    return Object.assign({}, this._store);
  }
}

module.exports = { PlayerSaveState };

