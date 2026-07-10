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
 *
 * Issue #126 — Client Backstory Card System:
 *   Added `ab_backstory_cohort` (null default, backward-compatible).
 *   Written once before any intake-screen code runs (AC1 / AC2).
 *   Values: 'backstory' | 'control' | null (null = not yet assigned).
 *
 * Issue #127 — Workshop Collection Gallery MVP:
 *   Added `completed_watches: []` (empty-array default, backward-compatible).
 *   Each entry: { watchId, watchName, clientName, completionDate, portraitAssetKey }.
 *   Populated by DeliveryHandler.completeDelivery() at delivery completion boundary.
 *   Pre-existing saves lacking this key receive [] via Object.assign defaults.
 *
 * Issue #129 — Workshop Gallery Enhanced Showcase:
 *   Extended `completed_watches` entries with `before_portrait_url` (null default,
 *   backward-compatible). Captured at WatchIntake time; null for watches delivered
 *   before this feature shipped (AC5 / Test Scenario 3 handle the null case gracefully).
 *
 * Issue #141 — Full-Watch Completion Reveal — Core System:
 *   Added `job_state_captures: {}` (empty-object default, backward-compatible).
 *   Keyed by stable jobId; each entry holds `{ before, after }` watch state
 *   snapshots captured by CompletionRevealSequence.
 *   - `before` is written once at job-start (no mid-repair overwrites).
 *   - `after`  is written at job-complete (reveal trigger time).
 *   Pre-existing saves that lack this key receive {} via Object.assign defaults.
 *   Designed with Issue #142 replay access in mind (read-only access to same structure).
 *
 * Issue #143 — Strap Swap: Cosmetic Restoration Phase 1:
 *   Added `strap_selection` (null default, backward-compatible).
 *   Written by CosmeticPhaseController.confirmStrap() at strap-selection confirmation.
 *   Read by CosmeticPhaseController.enterPhase() to restore prior selection on back-navigation (AC5).
 *   Reflected in the restoration summary screen (AC4).
 *   Values: strap variant id string (e.g. 'leather_black') | null (none selected yet).
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2:
 *   Added `crystal_outcome` (null default, backward-compatible).
 *   Written by CosmeticRestorationController.completeInstallCrystal() at replacement completion.
 *   Values: 'replaced' | 'skipped' | null (null = crystal phase not yet reached).
 *   Added `crystal_condition_before` (null default, backward-compatible).
 *   Written alongside crystal_outcome; records the condition state before replacement.
 *   Values: 'scratched' | 'cracked' | 'clean' | null.
 *   Both fields reflected in the restoration summary screen (AC5).
 *
 * Issue #148 — In-Repair Part Damage Recovery — Core System:
 *   Added `damage_recovery_state` (null default, backward-compatible).
 *   Serialised snapshot of DamageRecoveryController state: damaged part IDs,
 *   outstanding replacement orders, and current restoration damage state.
 *   Written by DamageRecoveryController._persistDamageState() on every state
 *   change; round-trips cleanly through the #93 checkpoint system (Test Scenario 7).
 *
 * Issue #145 — Workshop Economy MVP:
 *   Added economy ledger fields (all additive, backward-compatible, 0/false/[] defaults):
 *     ledger_income_total      {number}   Total gross income from all completed jobs.
 *     ledger_parts_cost_total  {number}   Total parts costs across all jobs.
 *     ledger_balance           {number}   Net balance (income − parts costs; Cozy Mode: no deductions).
 *     workshop_upgrades        {string[]} IDs of purchased tool/workspace upgrades.
 *     cozy_mode_enabled        {boolean}  Cozy Mode toggle (display-only financial layer).
 *   Updated by LedgerManager at the delivery-completion boundary.
 *   Cozy Mode toggle semantics: applies from next job forward, never retroactively.
 *
 * Issue #132 — Full Audio Design Pass, Phase 2:
 *   Added `audio_volume: 100` (0–100, backward-compatible).
 *   Used by AudioVolumeSettings as a save-profile fallback when localStorage is absent.
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

  // Issue #130: Backstory Card Expansion — Post-Launch
  // Client persona history: maps persona_id → { last_job_id, arc_position }
  // null default; backward-compatible with all pre-feature saves.
  client_persona_history:          null,

  // Issue #126: Client Backstory Card System — A/B cohort assignment (additive, backward-compatible)
  // Written synchronously before any intake-screen code runs (AC1 / AC2).
  // Values: 'backstory' | 'control' | null (null = not yet assigned for this player)
  ab_backstory_cohort:    null,
  ab_audio_cohort:       null,

  // Issue #127 / #129: Workshop Collection Gallery — completed watch entries (additive, backward-compatible)
  // Each entry: { watchId, watchName, clientName, completionDate, portraitAssetKey, before_portrait_url }
  // Populated by DeliveryHandler.completeDelivery() at the delivery-completion boundary.
  // before_portrait_url added by #129 (null for watches delivered before that feature shipped).
  // Pre-existing saves without this key receive [] via Object.assign defaults.
  completed_watches:      [],

  // Issue #141: Full-Watch Completion Reveal — per-job before/after state captures (additive, backward-compatible)
  // Keyed by stable jobId: { [jobId]: { before: <snapshot>, after: <snapshot> } }
  // Written by CompletionRevealSequence:
  //   - `before` is written once at job-start only; no mid-repair overwrites (AC4).
  //   - `after`  is written at job-complete reveal trigger time.
  // Pre-existing saves lacking this key receive {} via Object.assign defaults.
  // Designed with Issue #142 replay access in mind — same structure consumed read-only.
  job_state_captures:     {},

  // Issue #143: Strap Swap — Cosmetic Restoration Phase 1 (additive, backward-compatible)
  // Written by CosmeticPhaseController.confirmStrap() at strap-selection confirmation.
  // null = no strap selected yet for the current restoration job (defaults to baseline worn strap).
  // Pre-existing saves lacking this key receive null via Object.assign defaults.
  strap_selection:        null,

  // Issue #146: Crystal Replacement — Cosmetic Restoration Phase 2 (additive, backward-compatible)
  // crystal_outcome: written by CosmeticRestorationController.completeInstallCrystal().
  //   'replaced' = player replaced the damaged crystal; 'skipped' = crystal was already clean.
  //   null = crystal phase not yet reached for this restoration job.
  // crystal_condition_before: the crystal_condition id recorded at phase entry.
  //   Values: 'scratched' | 'cracked' | 'clean' | null (null = phase not yet reached).
  // Pre-existing saves lacking these keys receive null via Object.assign defaults.
  crystal_outcome:           null,
  crystal_condition_before:  null,
  // Issue #148: In-Repair Part Damage Recovery — Core System (additive, backward-compatible)
  // Serialised snapshot written by DamageRecoveryController on every damage/order state change.
  // null = no damage events have occurred in the current restoration session.
  // On save load, DamageRecoveryController.fromSnapshot() restores the order timers.
  // Compatible with #93 checkpoint system — added as an additive field, no schema migration needed.
  damage_recovery_state:  null,

  // Issue #145: Workshop Economy MVP — ledger, upgrades, cozy mode (additive, backward-compatible)
  // All fields default to safe zero/false/empty values; pre-existing saves lacking these keys
  // will receive their defaults via Object.assign and load correctly.
  //
  // ledger_income_total:     Running total of gross income from all completed jobs (0 default).
  // ledger_parts_cost_total: Running total of parts costs across all jobs (0 default).
  // ledger_balance:          Net balance = income − parts costs. In Cozy Mode: parts costs not
  //                          deducted; balance = sum of all revenues (0 default).
  // workshop_upgrades:       Array of purchased upgrade IDs — ['precision_tweezers', etc.] ([] default).
  //                          Populated by UpgradeShop.purchase() at purchase time.
  // cozy_mode_enabled:       Cozy Mode toggle. When true, financial layer is display-only:
  //                          parts cost tracked but not deducted from balance (false default).
  //                          Toggle semantics: applies from NEXT job forward, not retroactively.
  ledger_income_total:     0,
  ledger_parts_cost_total: 0,
  ledger_balance:          0,
  workshop_upgrades:       [],
  cozy_mode_enabled:       false,
  // Issue #132: Audio volume slider (additive, backward-compatible)
  // 0–100 inclusive. Mirrors the localStorage-backed AudioVolumeSettings value
  // so pre-existing saves receive the default volume without migration.
  audio_volume:           100,

};

class PlayerSaveState {
  constructor(initialState = {}) {
    this._store = Object.assign({}, DEFAULT_SAVE, initialState);
    if (Array.isArray(this._store.completed_watches)) {
      this._store.completed_watches = [...this._store.completed_watches];
    }
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
   * Append a completed watch entry to the completed_watches array.
   * Issue #127/#129 — called by DeliveryHandler at watch delivery time.
   * @param {{ watch_name, client_name, completion_date, portrait_asset_key, before_portrait_url }} entry
   */
  appendCompletedWatch(entry) {
    if (!Array.isArray(this._store.completed_watches)) {
      this._store.completed_watches = [];
    }
    this._store.completed_watches.push(entry);
  }

  /**
   * Get client persona history for a specific persona.
   * Issue #130 — called by BackstoryCardSelector before card draw.
   * @param {string} personaId
   * @returns {{ last_job_id: string|null, arc_position: number }|null}
   */
  getPersonaHistory(personaId) {
    const history = this._store.client_persona_history;
    if (!history) return null;
    return history[personaId] || null;
  }

  /**
   * Record that a job was completed for a client persona, advancing arc position.
   * @param {string} personaId
   * @param {string} jobId
   * @param {number} arcPosition
   */
  recordPersonaJobCompletion(personaId, jobId, arcPosition) {
    if (!this._store.client_persona_history) {
      this._store.client_persona_history = {};
    }
    this._store.client_persona_history[personaId] = {
      last_job_id: jobId,
      arc_position: arcPosition,
    };
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

  // ── Issue #127: Collection Gallery ──────────────────────────────────────────

  /**
   * Append a completed watch delivery entry to the collection.
   * Called by DeliveryHandler at the delivery-completion boundary (AC1, Test Scenario 8).
   *
   * @param {{ watchId: string, watchName: string, clientName: string, completionDate: string, portraitAssetKey: string|null }} entry
   */
  recordWatchDelivery(entry) {
    const existing = Array.isArray(this._store.completed_watches)
      ? this._store.completed_watches
      : [];
    this._store.completed_watches = [...existing, entry];
  }

  /**
   * Returns a copy of the completed_watches array (immutable accessor).
   * Returns [] for pre-feature saves that lack the key (backward-compatible).
   *
   * @returns {Array}
   */
  getCompletedWatches() {
    return Array.isArray(this._store.completed_watches)
      ? [...this._store.completed_watches]
      : [];
  }

  // ── Serialisation ────────────────────────────────────────────────────────────

  /**
   * Returns a shallow snapshot of the entire save state (for serialisation).
   * @returns {Object}
   */
  snapshot() {
    return Object.assign({}, this._store);
  }
}

module.exports = { PlayerSaveState };
