/**
 * BenchSlot — independent per-slot state machine for the two-bench workshop probe.
 *
 * Issue #116 — Two-Bench Workshop Probe: Second Parallel Bench Slot (Phase 1 A/B)
 *
 * Each bench slot owns its own:
 *   - Job assignment (watchId, jobId)
 *   - Repair step sequence (ordered list of step IDs; mutable per active job)
 *   - Part-sourcing timer (session count until parts arrive)
 *   - Delivery confirmation flag
 *
 * Slot state machine:
 *   empty → active (job accepted)
 *   active → sourcing (parts ordered)
 *   sourcing → sourcing (tick: timer decremented; not yet ready)
 *   sourcing → active (parts arrived: timer reaches 0)
 *   active → awaiting_delivery (all repair steps completed)
 *   awaiting_delivery → empty (delivery confirmed; slot resets)
 *
 * Design invariant: no shared mutable state between slots.
 * Slots communicate only through the WorkshopController orchestration layer.
 *
 * AC3: Part-sourcing timer, repair steps, and delivery confirmation operate
 * independently per slot without interference.
 */

'use strict';

/** @enum {string} */
const SlotState = {
  EMPTY:              'empty',
  ACTIVE:             'active',
  SOURCING:           'sourcing',
  AWAITING_DELIVERY:  'awaiting_delivery',
};

class BenchSlot {
  /**
   * @param {number} slotIndex  0-based slot index (0 = first bench, 1 = second bench)
   */
  constructor(slotIndex) {
    if (typeof slotIndex !== 'number' || slotIndex < 0) {
      throw new Error('BenchSlot requires a non-negative numeric slotIndex.');
    }
    this._slotIndex       = slotIndex;
    this._state           = SlotState.EMPTY;
    this._jobId           = null;
    this._watchId         = null;
    this._repairSteps     = [];     // ordered array of step IDs remaining
    this._sourcingTimer   = 0;      // sessions until parts arrive (0 = not sourcing)
    this._awaitingDelivery = false;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get slotIndex()       { return this._slotIndex; }
  get state()           { return this._state; }
  get jobId()           { return this._jobId; }
  get watchId()         { return this._watchId; }
  get repairSteps()     { return this._repairSteps.slice(); }   // defensive copy
  get sourcingTimer()   { return this._sourcingTimer; }
  get isEmpty()         { return this._state === SlotState.EMPTY; }
  get isActive()        { return this._state === SlotState.ACTIVE; }
  get isSourcing()      { return this._state === SlotState.SOURCING; }
  get isAwaitingDelivery() { return this._state === SlotState.AWAITING_DELIVERY; }

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  /**
   * Accept a new job into this slot.
   * Slot must be EMPTY.
   *
   * @param {string} jobId
   * @param {string} watchId
   * @param {string[]} repairSteps  — ordered step IDs for this job
   */
  acceptJob(jobId, watchId, repairSteps = []) {
    if (this._state !== SlotState.EMPTY) {
      throw new Error(`BenchSlot[${this._slotIndex}]: cannot accept job — slot is ${this._state}.`);
    }
    if (!jobId || !watchId) {
      throw new Error('BenchSlot.acceptJob: jobId and watchId are required.');
    }
    this._jobId       = jobId;
    this._watchId     = watchId;
    this._repairSteps = Array.isArray(repairSteps) ? repairSteps.slice() : [];
    this._state       = SlotState.ACTIVE;
  }

  /**
   * Start part sourcing for this slot.
   * Slot must be ACTIVE.
   *
   * @param {number} sessionCount  Number of sessions until parts arrive (>= 1)
   */
  startSourcing(sessionCount) {
    if (this._state !== SlotState.ACTIVE) {
      throw new Error(`BenchSlot[${this._slotIndex}]: cannot start sourcing — slot is ${this._state}.`);
    }
    if (!Number.isInteger(sessionCount) || sessionCount < 1) {
      throw new Error('BenchSlot.startSourcing: sessionCount must be an integer >= 1.');
    }
    this._sourcingTimer = sessionCount;
    this._state         = SlotState.SOURCING;
  }

  /**
   * Advance the sourcing timer by one session tick.
   * Slot must be SOURCING. Automatically transitions to ACTIVE when timer reaches 0.
   *
   * @returns {boolean} true if parts have arrived (transition to ACTIVE), false if still waiting
   */
  tickSourcing() {
    if (this._state !== SlotState.SOURCING) {
      throw new Error(`BenchSlot[${this._slotIndex}]: cannot tick sourcing — slot is ${this._state}.`);
    }
    this._sourcingTimer = Math.max(0, this._sourcingTimer - 1);
    if (this._sourcingTimer === 0) {
      this._state = SlotState.ACTIVE;
      return true;  // parts arrived
    }
    return false;   // still waiting
  }

  /**
   * Complete a repair step by step ID.
   * Slot must be ACTIVE.
   * Automatically transitions to AWAITING_DELIVERY when all steps are complete.
   *
   * @param {string} stepId
   * @returns {boolean} true if all steps are now complete (transition to AWAITING_DELIVERY)
   */
  completeRepairStep(stepId) {
    if (this._state !== SlotState.ACTIVE) {
      throw new Error(`BenchSlot[${this._slotIndex}]: cannot complete step — slot is ${this._state}.`);
    }
    const idx = this._repairSteps.indexOf(stepId);
    if (idx === -1) {
      throw new Error(`BenchSlot[${this._slotIndex}]: unknown repair step "${stepId}".`);
    }
    this._repairSteps.splice(idx, 1);

    if (this._repairSteps.length === 0) {
      this._state            = SlotState.AWAITING_DELIVERY;
      this._awaitingDelivery = true;
      return true;  // all steps done
    }
    return false;   // more steps remain
  }

  /**
   * Confirm delivery for this slot.
   * Slot must be AWAITING_DELIVERY. Resets slot to EMPTY.
   */
  confirmDelivery() {
    if (this._state !== SlotState.AWAITING_DELIVERY) {
      throw new Error(`BenchSlot[${this._slotIndex}]: cannot confirm delivery — slot is ${this._state}.`);
    }
    this._reset();
  }

  // ---------------------------------------------------------------------------
  // Serialisation (for save/load)
  // ---------------------------------------------------------------------------

  /**
   * Returns a plain serialisable snapshot of slot state.
   * @returns {Object}
   */
  snapshot() {
    return {
      slotIndex:        this._slotIndex,
      state:            this._state,
      jobId:            this._jobId,
      watchId:          this._watchId,
      repairSteps:      this._repairSteps.slice(),
      sourcingTimer:    this._sourcingTimer,
      awaitingDelivery: this._awaitingDelivery,
    };
  }

  /**
   * Restore slot state from a plain snapshot object.
   * Used by the migration/load layer to reconstruct slot state from a saved game.
   *
   * @param {Object} snap
   */
  static fromSnapshot(snap) {
    const slot = new BenchSlot(snap.slotIndex);
    slot._state           = snap.state           || SlotState.EMPTY;
    slot._jobId           = snap.jobId           || null;
    slot._watchId         = snap.watchId         || null;
    slot._repairSteps     = Array.isArray(snap.repairSteps) ? snap.repairSteps.slice() : [];
    slot._sourcingTimer   = typeof snap.sourcingTimer === 'number' ? snap.sourcingTimer : 0;
    slot._awaitingDelivery = !!snap.awaitingDelivery;
    return slot;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _reset() {
    this._state           = SlotState.EMPTY;
    this._jobId           = null;
    this._watchId         = null;
    this._repairSteps     = [];
    this._sourcingTimer   = 0;
    this._awaitingDelivery = false;
  }
}

module.exports = { BenchSlot, SlotState };
