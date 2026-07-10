/**
 * WatchPartModel — MVP watch definition for the Core Workbench Prototype.
 *
 * Issue #164: Minimal Playable Shell — Core Workbench Prototype
 *
 * Defines the single watch model used throughout the repair loop:
 *   - 15 parts (scope: 15–20 per issue)
 *   - Disassembly order (prerequisite graph)
 *   - Reassembly order (reverse prerequisites)
 *   - One pre-seeded fault on a specific part (diagnosis requirement)
 *   - Part visual states: ON_WATCH | IN_TRAY | REPAIRED | UNREPAIRED | ASSEMBLED
 *
 * Design constraint: this module is pure data and logic — no renderer imports.
 * The rendering layer reads from WatchPartModel state via the public API.
 */

'use strict';

// ── Part state constants ────────────────────────────────────────────────────

const PART_STATE = Object.freeze({
  ON_WATCH:   'ON_WATCH',    // Part is on the watch, not yet removed
  IN_TRAY:    'IN_TRAY',     // Part has been disassembled, no fault
  UNREPAIRED: 'UNREPAIRED',  // Part is in tray with an uncleared fault
  REPAIRED:   'REPAIRED',    // Part has been repaired (fault cleared)
  ASSEMBLED:  'ASSEMBLED',   // Part has been reassembled back onto the watch
});

// ── Fault constants ─────────────────────────────────────────────────────────

const FAULT_TYPE = Object.freeze({
  WORN_MAINSPRING:      'worn_mainspring',
  DIRTY_BALANCE_WHEEL:  'dirty_balance_wheel',
  BENT_CLICK_SPRING:    'bent_click_spring',
});

// ── MVP watch definition ────────────────────────────────────────────────────
// Parts listed in disassembly order (outer → inner).
// `prerequisite` = partId that must be removed first (null = no prerequisite).

const MVP_WATCH_PARTS = [
  { id: 'caseback',        name: 'Case Back',      prerequisite: null,             faultType: null },
  { id: 'crown',           name: 'Crown & Stem',   prerequisite: null,             faultType: null },
  { id: 'movement_holder', name: 'Movement Holder',prerequisite: 'caseback',       faultType: null },
  { id: 'dial',            name: 'Dial',           prerequisite: 'movement_holder',faultType: null },
  { id: 'hour_hand',       name: 'Hour Hand',      prerequisite: 'dial',           faultType: null },
  { id: 'minute_hand',     name: 'Minute Hand',    prerequisite: 'dial',           faultType: null },
  { id: 'second_hand',     name: 'Second Hand',    prerequisite: 'minute_hand',    faultType: null },
  { id: 'keyless_works',   name: 'Keyless Works',  prerequisite: 'crown',          faultType: null },
  { id: 'click_spring',    name: 'Click Spring',   prerequisite: 'keyless_works',  faultType: null },
  { id: 'ratchet_wheel',   name: 'Ratchet Wheel',  prerequisite: 'click_spring',   faultType: null },
  { id: 'barrel_bridge',   name: 'Barrel Bridge',  prerequisite: 'ratchet_wheel',  faultType: null },
  { id: 'mainspring',      name: 'Mainspring',     prerequisite: 'barrel_bridge',  faultType: FAULT_TYPE.WORN_MAINSPRING },
  { id: 'gear_train',      name: 'Gear Train',     prerequisite: 'barrel_bridge',  faultType: null },
  { id: 'balance_wheel',   name: 'Balance Wheel',  prerequisite: 'gear_train',     faultType: null },
  { id: 'escapement',      name: 'Escapement',     prerequisite: 'balance_wheel',  faultType: null },
];

// The pre-seeded fault for this repair session (AC2: at least one fault after diagnosis)
const SESSION_FAULT_PART_ID = 'mainspring';
const SESSION_FAULT_TYPE    = FAULT_TYPE.WORN_MAINSPRING;

/**
 * WatchPartModel — tracks the state of all parts in the repair session.
 */
class WatchPartModel {
  constructor() {
    // Map of partId → { ...partDef, state, hasFault, faultCleared }
    this._parts = new Map();
    this._initParts();
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  _initParts() {
    for (const def of MVP_WATCH_PARTS) {
      this._parts.set(def.id, {
        ...def,
        state:        PART_STATE.ON_WATCH,
        hasFault:     def.id === SESSION_FAULT_PART_ID,
        faultCleared: false,
      });
    }
  }

  // ── Part state queries ────────────────────────────────────────────────────

  /** @returns {Array} All part definitions with current state. */
  getAllParts() {
    return Array.from(this._parts.values());
  }

  /** @returns {Object|null} Part by id, or null if not found. */
  getPart(partId) {
    return this._parts.get(partId) || null;
  }

  /** @returns {boolean} True if all parts are no longer ON_WATCH (disassembly complete). */
  isFullyDisassembled() {
    return this.getAllParts().every(p => p.state !== PART_STATE.ON_WATCH);
  }

  /** @returns {boolean} True if all parts are ASSEMBLED. */
  isFullyReassembled() {
    return this.getAllParts().every(p => p.state === PART_STATE.ASSEMBLED);
  }

  /** @returns {Array} Parts that currently have an active (uncleared) fault. */
  getActiveFaultParts() {
    return this.getAllParts().filter(p => p.hasFault && !p.faultCleared);
  }

  /** @returns {boolean} True if all faults have been cleared. */
  allFaultsCleared() {
    return this.getActiveFaultParts().length === 0;
  }

  // ── Disassembly ───────────────────────────────────────────────────────────

  /**
   * Check whether a part can be removed given current part states.
   * A part's prerequisite (if any) must have already been removed first.
   *
   * @param {string} partId
   * @returns {{ canRemove: boolean, reason: string|null }}
   */
  canRemovePart(partId) {
    const part = this._parts.get(partId);
    if (!part) {
      return { canRemove: false, reason: `Unknown part: ${partId}` };
    }
    if (part.state !== PART_STATE.ON_WATCH) {
      return { canRemove: false, reason: `Part '${part.name}' is not on the watch.` };
    }
    if (part.prerequisite) {
      const prereq = this._parts.get(part.prerequisite);
      if (prereq && prereq.state === PART_STATE.ON_WATCH) {
        return {
          canRemove: false,
          reason: `Remove '${prereq.name}' first before removing '${part.name}'.`,
        };
      }
    }
    return { canRemove: true, reason: null };
  }

  /**
   * Remove a part from the watch and place it in the tray.
   * Sets state to UNREPAIRED if it has an active fault, IN_TRAY otherwise.
   *
   * @param {string} partId
   * @returns {{ success: boolean, reason: string|null }}
   */
  removePart(partId) {
    const { canRemove, reason } = this.canRemovePart(partId);
    if (!canRemove) return { success: false, reason };

    const part = this._parts.get(partId);
    part.state = (part.hasFault && !part.faultCleared) ? PART_STATE.UNREPAIRED : PART_STATE.IN_TRAY;
    return { success: true, reason: null };
  }

  // ── Repair actions ────────────────────────────────────────────────────────

  /**
   * Apply a repair action to a part in the tray.
   *   - If the part has an active fault → clears the fault, transitions to REPAIRED.
   *   - If the part has no fault → returns "good condition" feedback, no state change (AC3, Scenario 7).
   *
   * @param {string} partId
   * @returns {{ applied: boolean, message: string }}
   */
  applyRepairAction(partId) {
    const part = this._parts.get(partId);
    if (!part) {
      return { applied: false, message: `Unknown part: ${partId}` };
    }
    if (part.state === PART_STATE.ON_WATCH || part.state === PART_STATE.ASSEMBLED) {
      return { applied: false, message: `Part '${part.name}' must be in the tray to be repaired.` };
    }
    if (!part.hasFault || part.faultCleared) {
      // AC3 / Scenario 7: repair action on non-faulty part → feedback only, no state change
      return { applied: false, message: `This part is in good condition.` };
    }

    // Clear the fault and mark repaired
    part.faultCleared = true;
    part.state = PART_STATE.REPAIRED;
    return {
      applied: true,
      message: `Fault cleared on '${part.name}'. Part is now repaired.`,
    };
  }

  // ── Reassembly ────────────────────────────────────────────────────────────

  /**
   * Check whether a part can be reassembled back onto the watch.
   * Rules:
   *   1. Part must not already be ASSEMBLED or ON_WATCH.
   *   2. Part must have no uncleared faults.
   *   3. Any parts that depend on this part (list it as prerequisite) must be assembled first
   *      — this enforces the correct reverse-disassembly reassembly order.
   *
   * @param {string} partId
   * @returns {{ canAssemble: boolean, reason: string|null }}
   */
  canAssemblePart(partId) {
    const part = this._parts.get(partId);
    if (!part) {
      return { canAssemble: false, reason: `Unknown part: ${partId}` };
    }
    if (part.state === PART_STATE.ON_WATCH || part.state === PART_STATE.ASSEMBLED) {
      return { canAssemble: false, reason: `Part '${part.name}' is already on the watch.` };
    }
    if (part.hasFault && !part.faultCleared) {
      return { canAssemble: false, reason: `Part '${part.name}' has an uncleared fault. Repair it first.` };
    }
    // Dependents must be assembled first (deepest parts go back first)
    const dependents = this.getAllParts().filter(p => p.prerequisite === partId);
    for (const dep of dependents) {
      if (dep.state !== PART_STATE.ASSEMBLED) {
        return {
          canAssemble: false,
          reason: `Reassemble '${dep.name}' before placing '${part.name}'.`,
        };
      }
    }
    return { canAssemble: true, reason: null };
  }

  /**
   * Reassemble a part back onto the watch.
   *
   * @param {string} partId
   * @returns {{ success: boolean, reason: string|null }}
   */
  assemblePart(partId) {
    const { canAssemble, reason } = this.canAssemblePart(partId);
    if (!canAssemble) return { success: false, reason };

    const part = this._parts.get(partId);
    part.state = PART_STATE.ASSEMBLED;
    return { success: true, reason: null };
  }

  // ── Save/restore ──────────────────────────────────────────────────────────

  /**
   * Serialise current part states for persistence (AC5).
   * @returns {Object} Plain-object snapshot safe for JSON serialisation.
   */
  toSaveData() {
    const parts = {};
    for (const [id, part] of this._parts.entries()) {
      parts[id] = {
        state:        part.state,
        hasFault:     part.hasFault,
        faultCleared: part.faultCleared,
      };
    }
    return { parts };
  }

  /**
   * Restore part states from a previously saved snapshot (AC5).
   * Null-safe: parts missing from save data keep their initialised default.
   *
   * @param {Object} saveData  Output of a previous toSaveData() call.
   */
  fromSaveData(saveData) {
    if (!saveData || !saveData.parts) return;
    for (const [id, saved] of Object.entries(saveData.parts)) {
      const part = this._parts.get(id);
      if (!part) continue;
      if (Object.values(PART_STATE).includes(saved.state)) {
        part.state = saved.state;
      }
      if (typeof saved.faultCleared === 'boolean') {
        part.faultCleared = saved.faultCleared;
      }
    }
  }

  // ── Session fault seed ────────────────────────────────────────────────────

  /** @returns {{ partId: string, faultType: string }} The pre-seeded session fault. */
  static getSessionFault() {
    return { partId: SESSION_FAULT_PART_ID, faultType: SESSION_FAULT_TYPE };
  }

  /** @returns {number} Total number of parts in the MVP watch model. */
  static getPartCount() {
    return MVP_WATCH_PARTS.length;
  }
}

module.exports = {
  WatchPartModel,
  PART_STATE,
  FAULT_TYPE,
  MVP_WATCH_PARTS,
  SESSION_FAULT_PART_ID,
  SESSION_FAULT_TYPE,
};
