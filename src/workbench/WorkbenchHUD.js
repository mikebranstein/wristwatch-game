/**
 * WorkbenchHUD — HUD state manager for the Core Workbench Prototype.
 *
 * Issue #164: Minimal Playable Shell — Core Workbench Prototype
 *
 * Tracks and exposes the HUD state for the rendering layer:
 *   - Current repair loop step (INTAKE | DISASSEMBLY | DIAGNOSIS | REPAIR | REASSEMBLY | COMPLETION)
 *   - Active fault name and affected part (populated after diagnosis, AC2)
 *   - Selected tool (SCREWDRIVER | TWEEZERS)
 *   - Remaining faults count
 *
 * Design constraint: this module is pure state — no renderer or DOM imports.
 * The rendering layer reads from WorkbenchHUD via the public API and re-renders
 * on change callbacks.
 */

'use strict';

// ── Repair loop step constants ──────────────────────────────────────────────

const REPAIR_STEP = Object.freeze({
  INTAKE:       'INTAKE',
  DISASSEMBLY:  'DISASSEMBLY',
  DIAGNOSIS:    'DIAGNOSIS',
  REPAIR:       'REPAIR',
  REASSEMBLY:   'REASSEMBLY',
  COMPLETION:   'COMPLETION',
});

// ── Tool constants ──────────────────────────────────────────────────────────

const TOOL = Object.freeze({
  SCREWDRIVER: 'SCREWDRIVER',
  TWEEZERS:    'TWEEZERS',
});

/**
 * WorkbenchHUD — maintains HUD state and notifies listeners on change.
 */
class WorkbenchHUD {
  /**
   * @param {Object}   [opts]
   * @param {Function} [opts.onStateChange] Called with the new state snapshot on every change.
   */
  constructor({ onStateChange = null } = {}) {
    this._onStateChange = onStateChange;

    this._step         = REPAIR_STEP.INTAKE;
    this._activeFaults = [];   // [{ partId, partName, faultType }]
    this._selectedTool = TOOL.SCREWDRIVER;
    this._stepHint     = null; // Optional hint text for current step
  }

  // ── Step management ───────────────────────────────────────────────────────

  /**
   * Advance the HUD to a new repair step.
   * @param {string} step  One of REPAIR_STEP values.
   */
  setStep(step) {
    if (!Object.values(REPAIR_STEP).includes(step)) {
      throw new Error(`Unknown repair step: ${step}`);
    }
    this._step = step;
    this._stepHint = null;
    this._notify();
  }

  /** @returns {string} Current repair step. */
  getStep() {
    return this._step;
  }

  // ── Fault display ─────────────────────────────────────────────────────────

  /**
   * Set the active fault list for HUD display (AC2 — shown after diagnosis).
   * @param {Array<{partId: string, partName: string, faultType: string}>} faults
   */
  setActiveFaults(faults) {
    this._activeFaults = Array.isArray(faults) ? [...faults] : [];
    this._notify();
  }

  /**
   * Clear the active fault for a specific part (AC3 — after repair).
   * @param {string} partId
   */
  clearFaultForPart(partId) {
    this._activeFaults = this._activeFaults.filter(f => f.partId !== partId);
    this._notify();
  }

  /** @returns {Array} Current active faults. */
  getActiveFaults() {
    return [...this._activeFaults];
  }

  /** @returns {number} Count of remaining uncleared faults. */
  getRemainingFaultCount() {
    return this._activeFaults.length;
  }

  // ── Tool selection ────────────────────────────────────────────────────────

  /**
   * Select a tool for the player's active tool.
   * @param {string} tool  One of TOOL values.
   */
  selectTool(tool) {
    if (!Object.values(TOOL).includes(tool)) {
      throw new Error(`Unknown tool: ${tool}`);
    }
    this._selectedTool = tool;
    this._notify();
  }

  /** @returns {string} Currently selected tool. */
  getSelectedTool() {
    return this._selectedTool;
  }

  // ── Hints ─────────────────────────────────────────────────────────────────

  /**
   * Set a contextual hint for the current step (e.g. incorrect reassembly order).
   * @param {string|null} hint
   */
  setStepHint(hint) {
    this._stepHint = hint || null;
    this._notify();
  }

  /** @returns {string|null} Current hint text, or null. */
  getStepHint() {
    return this._stepHint;
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  /**
   * Return a plain-object snapshot of the current HUD state.
   * Used by the rendering layer to render the HUD without holding a direct reference.
   *
   * @returns {{ step, activeFaults, selectedTool, stepHint, remainingFaultCount }}
   */
  getSnapshot() {
    return {
      step:               this._step,
      activeFaults:       this.getActiveFaults(),
      selectedTool:       this._selectedTool,
      stepHint:           this._stepHint,
      remainingFaultCount: this.getRemainingFaultCount(),
    };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _notify() {
    if (typeof this._onStateChange === 'function') {
      this._onStateChange(this.getSnapshot());
    }
  }
}

module.exports = { WorkbenchHUD, REPAIR_STEP, TOOL };
