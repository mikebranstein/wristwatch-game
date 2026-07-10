/**
 * WorkshopController — orchestrates multi-slot bench management for the
 * Two-Bench Workshop Probe (Issue #116).
 *
 * Responsibilities:
 *   1. Manage the bench slot array (1 slot for everyone; 2 slots for eligible probe players).
 *   2. Enforce the unlock gate: second slot requires ≥ UNLOCK_THRESHOLD restorations
 *      AND the player must be in the probe cohort arm.
 *   3. Expose slot-level operations (accept job, start sourcing, tick, repair step,
 *      confirm delivery) while keeping slots fully independent.
 *   4. Emit telemetry events for A/B session-frequency and session-start-behaviour tracking.
 *   5. Support save/load via versioned snapshots with a migration layer that upgrades
 *      legacy single-slot saves to the dual-slot array format.
 *
 * Acceptance criteria covered:
 *   AC1 — Second slot visible/available only for probe cohort with ≥2 restorations.
 *   AC2 — First slot unaffected when second slot is ignored.
 *   AC3 — Each slot's sourcing timer, repair steps, and delivery operate independently.
 *   AC4 — Session-frequency telemetry data recorded per cohort arm.
 *
 * Design invariants:
 *   - MAX_SLOTS = 2 (probe does not expand beyond 2 slots — Non-Goal).
 *   - UNLOCK_THRESHOLD defaults to 2 (configurable per AC unlockGateThreshold setting).
 *   - Second slot is NEVER forced — it appears as available; player drives activation.
 *   - No client names, urgency, or queue pressure (FR3 boundary enforced).
 *
 * Save format versioning:
 *   version 1 — legacy single-slot format (pre-probe saves)
 *   version 2 — dual-slot array format (this implementation)
 *   Migration: on load, v1 saves are promoted to v2 by wrapping the single slot in an array.
 */

'use strict';

const { BenchSlot, SlotState } = require('./BenchSlot');
const { CohortAssignment, CohortArm } = require('./CohortAssignment');

const MAX_SLOTS                 = 2;
const SAVE_FORMAT_VERSION       = 2;
const DEFAULT_UNLOCK_THRESHOLD  = 2;

/**
 * @typedef {Object} WorkshopConfig
 * @property {number} [unlockGateThreshold]  Restorations required to unlock second slot (default 2)
 */

class WorkshopController {
  /**
   * @param {Object}              saveState         PlayerSaveState-compatible object (get/set API)
   * @param {Object}              telemetryEmitter  TelemetryEmitter instance
   * @param {CohortAssignment}    [cohortAssignment] Injectable; default: new CohortAssignment()
   * @param {WorkshopConfig}      [config]
   */
  constructor(saveState, telemetryEmitter, cohortAssignment = new CohortAssignment(), config = {}) {
    if (!saveState || typeof saveState.get !== 'function' || typeof saveState.set !== 'function') {
      throw new Error('WorkshopController: saveState must implement get(key) and set(key, value).');
    }
    if (!telemetryEmitter || typeof telemetryEmitter.emit !== 'function') {
      throw new Error('WorkshopController: telemetryEmitter must implement emit(eventName, payload).');
    }

    this._save     = saveState;
    this._telemetry = telemetryEmitter;
    this._cohortAssignment = cohortAssignment;
    this._unlockThreshold  = config.unlockGateThreshold ?? DEFAULT_UNLOCK_THRESHOLD;

    // Initialise: resolve cohort arm (write-once) and load/migrate bench slots
    this._cohortArm = this._resolveAndPersistCohortArm();
    this._slots     = this._loadSlots();
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Called at session start. Emits session-frequency and session-start-behaviour events.
   * AC4: session-frequency data is recorded per cohort arm at every session start.
   *
   * @param {string} sessionId
   */
  onSessionStart(sessionId) {
    const restorationCount = this._save.get('restorations_completed') || 0;

    // AC4: session frequency telemetry (segmented by cohort arm)
    this._telemetry.emit('session_frequency_probe', {
      sessionId,
      cohortArm:        this._cohortArm,
      restorationCount,
      secondSlotVisible: this.isSecondSlotUnlocked(),
    });

    // AC4: session-start behaviour — did player have Slot 1 in sourcing wait?
    const slot0 = this._slots[0];
    if (slot0 && slot0.isSourcing) {
      this._telemetry.emit('session_start_behavior_probe', {
        sessionId,
        cohortArm:   this._cohortArm,
        slot1Timer:  slot0.sourcingTimer,
        slot2Active: this._slots[1] ? !this._slots[1].isEmpty : false,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Unlock gate (AC1)
  // ---------------------------------------------------------------------------

  /**
   * Returns true if the second bench slot is unlocked for this player.
   * Requires: probe cohort arm AND restoration_count >= unlockGateThreshold.
   *
   * AC1: visible and available only when both conditions are met.
   *
   * @returns {boolean}
   */
  isSecondSlotUnlocked() {
    if (!CohortAssignment.isProbeArm(this._cohortArm)) return false;
    const restorationCount = this._save.get('restorations_completed') || 0;
    return restorationCount >= this._unlockThreshold;
  }

  /**
   * Returns the number of bench slots currently visible/available to this player.
   * Control cohort or insufficient restorations → 1.
   * Probe cohort with ≥ threshold restorations → 2.
   *
   * @returns {1|2}
   */
  get visibleSlotCount() {
    return this.isSecondSlotUnlocked() ? 2 : 1;
  }

  // ---------------------------------------------------------------------------
  // Slot accessors
  // ---------------------------------------------------------------------------

  /**
   * Get a slot by index. Throws if index is out of range or second slot is locked.
   * AC2 guard: first slot index 0 is always accessible regardless of probe status.
   *
   * @param {number} slotIndex  0 (first bench) or 1 (second bench)
   * @returns {BenchSlot}
   */
  getSlot(slotIndex) {
    if (slotIndex === 1 && !this.isSecondSlotUnlocked()) {
      throw new Error('WorkshopController: second bench slot is not unlocked for this player.');
    }
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
      throw new Error(`WorkshopController: invalid slot index ${slotIndex}.`);
    }
    return this._slots[slotIndex];
  }

  /**
   * Returns an array of all currently visible slots (AC2: always includes slot 0).
   * @returns {BenchSlot[]}
   */
  getVisibleSlots() {
    return this._slots.slice(0, this.visibleSlotCount);
  }

  // ---------------------------------------------------------------------------
  // Job operations (delegated to individual BenchSlots — AC3)
  // ---------------------------------------------------------------------------

  /**
   * Accept a job into the specified slot.
   * AC3: slots operate independently — accepting a job into slot N does not affect slot M.
   *
   * @param {number} slotIndex
   * @param {string} jobId
   * @param {string} watchId
   * @param {string[]} repairSteps
   */
  acceptJob(slotIndex, jobId, watchId, repairSteps = []) {
    const slot = this.getSlot(slotIndex);
    slot.acceptJob(jobId, watchId, repairSteps);

    if (slotIndex === 1) {
      // Emit session-start behaviour event when player activates the second slot
      this._telemetry.emit('second_bench_slot_activated', {
        cohortArm:    this._cohortArm,
        jobId,
        watchId,
        slot0State:   this._slots[0].state,
      });
    }
  }

  /**
   * Start part sourcing on a slot.
   * AC3: sourcing timer on slot N is independent of slot M.
   *
   * @param {number} slotIndex
   * @param {number} sessionCount
   */
  startSourcing(slotIndex, sessionCount) {
    this.getSlot(slotIndex).startSourcing(sessionCount);
  }

  /**
   * Advance the sourcing timer for a slot by one session tick.
   * AC3: timer ticks are per-slot; no cross-slot interference.
   *
   * @param {number} slotIndex
   * @returns {boolean} true if parts arrived (slot transitioned back to ACTIVE)
   */
  tickSourcing(slotIndex) {
    return this.getSlot(slotIndex).tickSourcing();
  }

  /**
   * Complete a repair step on a slot.
   * AC3: repair step state is per-slot.
   *
   * @param {number} slotIndex
   * @param {string} stepId
   * @returns {boolean} true if all steps completed (slot transitioned to AWAITING_DELIVERY)
   */
  completeRepairStep(slotIndex, stepId) {
    return this.getSlot(slotIndex).completeRepairStep(stepId);
  }

  /**
   * Confirm delivery for a slot. Slot resets to EMPTY after confirmation.
   * AC3: delivery confirmation on slot N does not affect slot M.
   * AC2: confirming delivery on slot 0 when slot 1 is mid-repair leaves slot 1 undisturbed.
   *
   * @param {number} slotIndex
   */
  confirmDelivery(slotIndex) {
    this.getSlot(slotIndex).confirmDelivery();

    if (slotIndex === 0) {
      // Emit so telemetry can confirm slot 1 continues unaffected (AC3 / Test Scenario 6)
      const slot1Snapshot = this._slots[1] ? this._slots[1].snapshot() : null;
      this._telemetry.emit('second_bench_slot0_delivery_confirmed', {
        cohortArm:     this._cohortArm,
        slot1Snapshot,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Restoration count tracking (unlock gate prerequisite — AC1)
  // ---------------------------------------------------------------------------

  /**
   * Record a completed restoration. Increments restoration_count in save state.
   * Called by the delivery/completion orchestration layer after each successful job.
   */
  recordRestorationCompleted() {
    const current = this._save.get('restorations_completed') || 0;
    this._save.set('restorations_completed', current + 1);
  }

  // ---------------------------------------------------------------------------
  // Save / Load (versioned migration — Design mitigation)
  // ---------------------------------------------------------------------------

  /**
   * Returns a serialisable snapshot of all slot states (for save system).
   * @returns {{ version: number, slots: Object[] }}
   */
  snapshotSlots() {
    return {
      version: SAVE_FORMAT_VERSION,
      slots:   this._slots.map(s => s.snapshot()),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve cohort arm from save state.
   * Written ONCE at first session (null stored arm); immutable thereafter.
   *
   * @returns {'probe' | 'control'}
   * @private
   */
  _resolveAndPersistCohortArm() {
    const stored = this._save.get('ab_second_bench_cohort') || null;
    const arm    = this._cohortAssignment.resolve(stored);

    if (stored === null || stored === undefined) {
      // First session — persist the arm immediately (write-once invariant)
      this._save.set('ab_second_bench_cohort', arm);
      this._telemetry.emit('second_bench_cohort_assigned', {
        cohortArm: arm,
      });
    }

    return arm;
  }

  /**
   * Load bench slot array from save state.
   * Migrates v1 (legacy single-slot) saves to v2 (dual-slot array) on first load.
   *
   * @returns {BenchSlot[]}
   * @private
   */
  _loadSlots() {
    const saved = this._save.get('bench_slots');

    if (!saved) {
      // New game or pre-probe save — initialise with two empty slots
      return [new BenchSlot(0), new BenchSlot(1)];
    }

    // Version migration: v1 saves have a single top-level slot snapshot (no version/slots wrapper)
    if (!saved.version || saved.version < 2) {
      // Promote legacy single-slot save to v2 dual-slot array
      const slot0 = BenchSlot.fromSnapshot(
        saved.slotIndex !== undefined ? saved : { slotIndex: 0, state: SlotState.EMPTY }
      );
      return [slot0, new BenchSlot(1)];
    }

    // v2 format — restore all slots
    const slots = saved.slots.map(snap => BenchSlot.fromSnapshot(snap));
    // Ensure we always have exactly MAX_SLOTS slots
    while (slots.length < MAX_SLOTS) {
      slots.push(new BenchSlot(slots.length));
    }
    return slots.slice(0, MAX_SLOTS);
  }
}

module.exports = { WorkshopController, MAX_SLOTS, SAVE_FORMAT_VERSION, DEFAULT_UNLOCK_THRESHOLD };

