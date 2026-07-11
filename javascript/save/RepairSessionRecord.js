/**
 * RepairSessionRecord — extended repair session record for Phase 2 damage states.
 *
 * Issue #84: Phase 2 — Repair State Persistence (AC5).
 *
 * Design contract (from design decision):
 *   - Extends the repair session record with new nullable fields for Phase 2 data.
 *   - Backward-compatible: all Phase 2 fields default to null so pre-Phase-2 saves
 *     deserialise without error (AC5 — mid-session persistence survives exit/return).
 *   - New fields:
 *       scattered_component_positions  — map of componentId → {x, y, rotation, repositioned}
 *       fastener_states               — map of fastenerId → FastenerState
 *       hand_straightened             — map of handId → boolean
 *       pre_repair_scatter_snapshot   — snapshot captured at watch acceptance for before/after
 *   - Serialises cleanly to/from JSON for save-file persistence.
 *
 * Usage:
 *   const record = RepairSessionRecord.create({ watchId: 'watch-001', damageStateId: 'shock_damage' });
 *   record.setHandStraightened({ hour_hand: true, minute_hand: false });
 *   const data = record.serialize();
 *   const restored = RepairSessionRecord.deserialize(data);
 */

'use strict';

class RepairSessionRecord {
  /**
   * @param {Object} data — partial or full serialised record
   */
  constructor(data = {}) {
    // Core fields (always present)
    this._watchId       = data.watchId       || null;
    this._damageStateId = data.damageStateId || null;
    this._repairSteps   = Array.isArray(data.repairSteps) ? data.repairSteps.slice() : [];
    this._startedAt     = data.startedAt     || null;
    this._completedAt   = data.completedAt   || null;

    // Phase 2 fields — nullable for backward compatibility
    this._scatteredComponentPositions = data.scattered_component_positions || null;
    this._fastenerStates              = data.fastener_states               || null;
    this._handStraightened            = data.hand_straightened             || null;
    this._preRepairScatterSnapshot    = data.pre_repair_scatter_snapshot   || null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Factory methods
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create a new repair session record.
   *
   * @param {{ watchId?: string, damageStateId?: string }} [opts]
   * @returns {RepairSessionRecord}
   */
  static create(opts = {}) {
    return new RepairSessionRecord({
      watchId:       opts.watchId       || null,
      damageStateId: opts.damageStateId || null,
      startedAt:     opts.startedAt     || Date.now(),
    });
  }

  /**
   * Deserialise a repair session record from raw save-file data.
   * Backward-compatible: missing Phase 2 fields → null (no error).
   *
   * @param {Object|null} rawData
   * @returns {RepairSessionRecord}
   */
  static deserialize(rawData) {
    if (!rawData || typeof rawData !== 'object') {
      return new RepairSessionRecord();
    }
    return new RepairSessionRecord(rawData);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core field accessors
  // ──────────────────────────────────────────────────────────────────────────

  getWatchId()       { return this._watchId; }
  getDamageStateId() { return this._damageStateId; }
  getRepairSteps()   { return this._repairSteps.slice(); }
  getStartedAt()     { return this._startedAt; }
  getCompletedAt()   { return this._completedAt; }

  /**
   * Append a completed repair step ID.
   * @param {string} stepId
   */
  addRepairStep(stepId) {
    this._repairSteps.push(stepId);
  }

  /**
   * Mark the repair session as complete.
   * @param {number} [timestamp]
   */
  markComplete(timestamp = Date.now()) {
    this._completedAt = timestamp;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 2: Shock Damage — scattered component positions
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the current scattered-component position map.
   * Map structure: { componentId: { x, y, rotation, repositioned: boolean } }
   * Returns null for non-shock-damage watches.
   *
   * @returns {Object.<string, {x:number, y:number, rotation:number, repositioned:boolean}>|null}
   */
  getScatteredComponentPositions() {
    return this._scatteredComponentPositions
      ? Object.assign({}, this._scatteredComponentPositions)
      : null;
  }

  /**
   * Update the scattered-component position map.
   * Call after each component repositioning event to persist progress.
   *
   * @param {Object.<string, {x:number, y:number, rotation:number, repositioned:boolean}>} positions
   */
  setScatteredComponentPositions(positions) {
    this._scatteredComponentPositions = positions ? Object.assign({}, positions) : null;
  }

  /**
   * Update a single component's position in the scattered-component map.
   * Creates the map if it does not yet exist.
   *
   * @param {string} componentId
   * @param {{x:number, y:number, rotation:number, repositioned:boolean}} positionData
   */
  updateComponentPosition(componentId, positionData) {
    if (!this._scatteredComponentPositions) {
      this._scatteredComponentPositions = {};
    }
    this._scatteredComponentPositions[componentId] = Object.assign({}, positionData);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 2: Rust-Fused Fasteners — fastener state map
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the fastener state map.
   * Map structure: { fastenerId: FastenerState }
   * Returns null for non-rust-fused-fasteners watches.
   *
   * @returns {Object.<string, string>|null}
   */
  getFastenerStates() {
    return this._fastenerStates
      ? Object.assign({}, this._fastenerStates)
      : null;
  }

  /**
   * Replace the entire fastener state map.
   * Used after penetrant or extractor tool transitions to persist new states.
   *
   * @param {Object.<string, string>|null} fastenerStates
   */
  setFastenerStates(fastenerStates) {
    this._fastenerStates = fastenerStates ? Object.assign({}, fastenerStates) : null;
  }

  /**
   * Update a single fastener's state.
   * Creates the map if it does not yet exist.
   *
   * @param {string} fastenerId
   * @param {string} state — FastenerState value
   */
  updateFastenerState(fastenerId, state) {
    if (!this._fastenerStates) {
      this._fastenerStates = {};
    }
    this._fastenerStates[fastenerId] = state;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 2: Shock Damage — hand_straightened flags
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the hand-straightened flag map.
   * Map structure: { handId: boolean }
   * Returns null for non-shock-damage watches.
   *
   * @returns {Object.<string, boolean>|null}
   */
  getHandStraightened() {
    return this._handStraightened
      ? Object.assign({}, this._handStraightened)
      : null;
  }

  /**
   * Replace the entire hand-straightened flag map.
   *
   * @param {Object.<string, boolean>|null} flags
   */
  setHandStraightened(flags) {
    this._handStraightened = flags ? Object.assign({}, flags) : null;
  }

  /**
   * Mark a single hand as straightened (or not).
   *
   * @param {string} handId — e.g. 'hour_hand', 'minute_hand'
   * @param {boolean} straightened
   */
  setHandStraightenedFlag(handId, straightened) {
    if (!this._handStraightened) {
      this._handStraightened = {};
    }
    this._handStraightened[handId] = !!straightened;
  }

  /**
   * Returns true when all tracked hands have been straightened.
   * Returns false if no hand flags are recorded.
   *
   * @returns {boolean}
   */
  areAllHandsStraightened() {
    if (!this._handStraightened) return false;
    const flags = Object.values(this._handStraightened);
    return flags.length > 0 && flags.every(Boolean);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 2: Before/after snapshot (completion screen — AC3)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the pre-repair scatter snapshot captured at watch acceptance.
   * Used by BeforeAfterComparison to render the "before" state with scattered components.
   * Returns null if no snapshot was captured (standard wear, Phase 1 states).
   *
   * @returns {Object|null}
   */
  getPreRepairScatterSnapshot() {
    return this._preRepairScatterSnapshot
      ? Object.assign({}, this._preRepairScatterSnapshot)
      : null;
  }

  /**
   * Store the pre-repair scatter snapshot.
   * Should be called once at watch acceptance when shock_damage is assigned.
   *
   * @param {Object|null} snapshot — scatter layout + initial positions at intake
   */
  setPreRepairScatterSnapshot(snapshot) {
    this._preRepairScatterSnapshot = snapshot ? Object.assign({}, snapshot) : null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Serialisation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Serialise the record to a plain object for JSON persistence.
   * Phase 2 fields are only included if non-null (compact saves for Phase 1 / standard watches).
   *
   * @returns {Object}
   */
  serialize() {
    const out = {
      watchId:       this._watchId,
      damageStateId: this._damageStateId,
      repairSteps:   this._repairSteps.slice(),
      startedAt:     this._startedAt,
      completedAt:   this._completedAt,
    };

    // Phase 2 fields — only serialised when non-null (backward-compatible)
    if (this._scatteredComponentPositions !== null) {
      out.scattered_component_positions = Object.assign({}, this._scatteredComponentPositions);
    }
    if (this._fastenerStates !== null) {
      out.fastener_states = Object.assign({}, this._fastenerStates);
    }
    if (this._handStraightened !== null) {
      out.hand_straightened = Object.assign({}, this._handStraightened);
    }
    if (this._preRepairScatterSnapshot !== null) {
      out.pre_repair_scatter_snapshot = Object.assign({}, this._preRepairScatterSnapshot);
    }

    return out;
  }
}

module.exports = { RepairSessionRecord };
