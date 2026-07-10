/**
 * WorkbenchScene — top-level orchestrator for the Core Workbench Prototype.
 *
 * Issue #164: Minimal Playable Shell — Core Workbench Prototype (End-to-End Repair Loop)
 *
 * Wires together all existing game logic modules and new workbench modules to
 * deliver the complete end-to-end repair loop:
 *
 *   INTAKE → DISASSEMBLY → DIAGNOSIS → REPAIR → REASSEMBLY → COMPLETION
 *
 * Existing modules integrated (not rewritten):
 *   1. TeardownScreen    — disassembly stage lifecycle + telemetry + autosave (Issue #82)
 *   2. DiagnosisScreen   — guided fault diagnosis with hints and tooltips
 *   3. ReassemblyScreen  — snap-zone reassembly with feedback FSM + autosave (Issue #82)
 *
 * New workbench modules (Issue #164):
 *   4. WatchPartModel      — part state machine (15-part MVP watch)
 *   5. WorkbenchHUD        — HUD state (step, tool, fault display)
 *   6. WorkbenchSaveAdapter — save/restore bridge for workbench state (AC5)
 *   7. CompletionScreenState — completion screen summary (AC4)
 *
 * Acceptance criteria covered:
 *   AC1 — Scene ready state: watch visible, parts selectable, scene load tracking.
 *   AC2 — After full disassembly, diagnosis engine identifies ≥1 fault; HUD shows fault.
 *   AC3 — Repair action clears fault, part transitions to repaired state, HUD updates.
 *   AC4 — Completion screen state: watchRunning, "Restoration Complete", session summary.
 *   AC5 — Save/restore: workbench state fully serialised and rehydrated on session start.
 *
 * Design constraint: this orchestrator delegates all domain logic to existing
 * and new modules — no domain logic lives here, only wiring and state transitions.
 *
 * Renderer technology: Electron + Pixi.js (ADR-001, Issue #163).
 * This module is renderer-agnostic — the Electron/Pixi.js layer calls into
 * WorkbenchScene via its public API.
 */

'use strict';

const { TeardownScreen } = require('../teardown/TeardownScreen');
const { DiagnosisScreen } = require('../diagnosis/DiagnosisScreen');
const { ReassemblyScreen } = require('../reassembly/ReassemblyScreen');
const { WatchPartModel, PART_STATE, SESSION_FAULT_PART_ID, SESSION_FAULT_TYPE } = require('./WatchPartModel');
const { WorkbenchHUD, REPAIR_STEP, TOOL } = require('./WorkbenchHUD');
const { WorkbenchSaveAdapter } = require('./WorkbenchSaveAdapter');
const { CompletionScreenState } = require('./CompletionScreenState');

// ── Scene state constants ────────────────────────────────────────────────────

const SCENE_STATE = Object.freeze({
  LOADING:     'LOADING',
  READY:       'READY',
  IN_REPAIR:   'IN_REPAIR',
  COMPLETE:    'COMPLETE',
});

/**
 * WorkbenchScene — top-level repair loop orchestrator.
 */
class WorkbenchScene {
  /**
   * @param {Object}   opts
   * @param {Function} opts.instrumentationHook  Telemetry hook: (eventName, payload) => void
   * @param {Function} opts.renderOverlay        Visual overlay renderer for DiagnosisScreen
   * @param {Function} opts.clearOverlay         Visual overlay clear fn
   * @param {Object}   opts.eventBus             UI event bus for confidence indicator
   * @param {Function} opts.onConfidenceUpdate   Confidence update callback
   * @param {Function} opts.playAudio            Audio hook: (cueName: string) => void
   * @param {Function} opts.renderVisual         Render hook: ({ partId, state }) => void
   * @param {Function} [opts.autosaveHook]       Async (stage: string, gameState: Object) => void
   * @param {Function} [opts.onHUDChange]        Called with HUD snapshot on any HUD state change
   * @param {Function} [opts.onSceneStateChange] Called with scene state on transition
   * @param {Object}   [opts.initialSaveState]   Pre-loaded save data (for AC5 restore)
   */
  constructor(opts) {
    const {
      instrumentationHook,
      renderOverlay,
      clearOverlay,
      eventBus,
      onConfidenceUpdate,
      playAudio,
      renderVisual,
      autosaveHook    = null,
      onHUDChange     = null,
      onSceneStateChange = null,
      initialSaveState   = null,
    } = opts;

    // ── Core modules ─────────────────────────────────────────────────────────

    this._partModel = new WatchPartModel();

    this._hud = new WorkbenchHUD({
      onStateChange: onHUDChange,
    });

    this._saveAdapter = new WorkbenchSaveAdapter({
      autosaveHook: autosaveHook
        ? async (stage, gameState) => autosaveHook(stage, gameState)
        : null,
    });

    // ── Existing modules (integrated, not rewritten) ──────────────────────

    this._teardown = new TeardownScreen({
      instrumentationHook,
      autosaveHook: autosaveHook
        ? async (stage) => {
            await this._saveAdapter.checkpoint(stage, {}, this._partModel.toSaveData());
          }
        : null,
    });

    this._diagnosis = new DiagnosisScreen({
      instrumentationHook,
      renderOverlay,
      clearOverlay,
      eventBus,
      onConfidenceUpdate,
      initialSaveState: {},
    });

    this._reassembly = new ReassemblyScreen({
      instrumentationHook,
      playAudio,
      renderVisual,
      autosaveHook: autosaveHook
        ? async (stage) => {
            await this._saveAdapter.checkpoint(stage, {}, this._partModel.toSaveData());
          }
        : null,
    });

    // ── Scene state ───────────────────────────────────────────────────────

    this._sceneState          = SCENE_STATE.LOADING;
    this._sceneLoadTimestampMs = null;
    this._onSceneStateChange  = onSceneStateChange;
    this._completionState     = null;

    // ── Restore from save (AC5) ───────────────────────────────────────────

    if (initialSaveState) {
      const workbenchSave = this._saveAdapter.extractWorkbenchState(initialSaveState);
      if (workbenchSave) {
        this._partModel.fromSaveData(workbenchSave);
      }
    }
  }

  // ── Scene lifecycle ───────────────────────────────────────────────────────

  /**
   * Mark the workbench scene as loaded and ready for player interaction.
   * Records load time for performance validation (AC1: <200ms target).
   *
   * @param {number} [loadDurationMs]  Optional measured load time in ms.
   * @returns {{ sceneState: string, loadDurationMs: number|null, partCount: number }}
   */
  markSceneReady(loadDurationMs = null) {
    this._sceneLoadTimestampMs = loadDurationMs;
    this._setSceneState(SCENE_STATE.READY);
    this._hud.setStep(REPAIR_STEP.INTAKE);

    return {
      sceneState:    this._sceneState,
      loadDurationMs: loadDurationMs,
      partCount:     WatchPartModel.getPartCount(),
    };
  }

  /** @returns {string} Current scene state. */
  getSceneState() {
    return this._sceneState;
  }

  /** @returns {number|null} Recorded scene load time, or null if not measured. */
  getSceneLoadDurationMs() {
    return this._sceneLoadTimestampMs;
  }

  // ── Disassembly phase (AC2) ───────────────────────────────────────────────

  /**
   * Player selects and removes a part from the watch.
   * Delegates removal validation to WatchPartModel and tracking to TeardownScreen.
   *
   * @param {string} partId
   * @returns {{ success: boolean, reason: string|null }}
   */
  removePart(partId) {
    if (this._sceneState === SCENE_STATE.LOADING) {
      return { success: false, reason: 'Scene is not ready yet.' };
    }

    const result = this._partModel.removePart(partId);
    if (result.success) {
      this._teardown.onPartRemoved(partId);
      if (this._sceneState !== SCENE_STATE.IN_REPAIR) {
        this._setSceneState(SCENE_STATE.IN_REPAIR);
        this._hud.setStep(REPAIR_STEP.DISASSEMBLY);
      }
    } else {
      // Scenario 5: wrong order — show hint in HUD
      this._hud.setStepHint(result.reason);
    }
    return result;
  }

  /**
   * Complete the disassembly phase and run the diagnosis engine.
   * Called when all parts are in the tray (or player explicitly completes teardown).
   *
   * Fires TeardownScreen.completeTeardown() → autosave.
   * Runs DiagnosisScreen.enterDiagnosis() for the session fault.
   * Updates HUD with fault display (AC2).
   *
   * @returns {Promise<{ faults: Array, hudSnapshot: Object }>}
   */
  async completeTeardown() {
    await this._teardown.completeTeardown();

    // Transition HUD to DIAGNOSIS step
    this._hud.setStep(REPAIR_STEP.DIAGNOSIS);

    // Get active faults from the part model and populate HUD (AC2)
    const faultParts = this._partModel.getActiveFaultParts();
    const hudFaults  = faultParts.map(p => ({
      partId:    p.id,
      partName:  p.name,
      faultType: p.faultType,
    }));

    this._hud.setActiveFaults(hudFaults);

    // Enter diagnosis screen for the primary fault (existing module integration)
    if (faultParts.length > 0) {
      const primary = faultParts[0];
      this._diagnosis.enterDiagnosis(
        `fault-instance-${primary.id}-${Date.now()}`,
        primary.faultType,
      );
    }

    return {
      faults:      hudFaults,
      hudSnapshot: this._hud.getSnapshot(),
    };
  }

  // ── Repair phase (AC3) ────────────────────────────────────────────────────

  /**
   * Player applies a repair action to a part in the tray.
   *
   * - If part has a fault → clears it, updates HUD (AC3).
   * - If part has no fault → returns "good condition" feedback (Scenario 7).
   *
   * @param {string} partId
   * @returns {{ applied: boolean, message: string, hudSnapshot: Object }}
   */
  applyRepairAction(partId) {
    this._hud.setStep(REPAIR_STEP.REPAIR);

    const result = this._partModel.applyRepairAction(partId);
    if (result.applied) {
      // Clear fault from HUD (AC3: HUD updates to reflect no remaining faults on that part)
      this._hud.clearFaultForPart(partId);
    }

    return {
      ...result,
      hudSnapshot: this._hud.getSnapshot(),
    };
  }

  // ── Reassembly phase (AC4) ────────────────────────────────────────────────

  /**
   * Player attempts to reassemble a part back onto the watch.
   * Delegates order validation to WatchPartModel and snap confirmation to ReassemblyScreen.
   *
   * @param {string} partId
   * @returns {{ success: boolean, reason: string|null }}
   */
  assemblePart(partId) {
    if (this._hud.getStep() !== REPAIR_STEP.REASSEMBLY) {
      this._hud.setStep(REPAIR_STEP.REASSEMBLY);
    }

    const result = this._partModel.assemblePart(partId);
    if (result.success) {
      // Record assembly in the existing ReassemblyScreen for telemetry.
      // Note: confirmSnap checks FSM LOCKED_IN state which is managed by onPartMoved;
      // for workbench integration we call it for side-effects (telemetry) only.
      this._reassembly.confirmSnap(partId);
      this._hud.setStepHint(null);
    } else {
      // Scenario 5: wrong reassembly order — show hint, no crash
      this._hud.setStepHint(result.reason);
    }
    return result;
  }

  /**
   * Complete the reassembly phase.
   * Fires ReassemblyScreen.completeReassembly() → autosave.
   * If all faults are cleared and all parts assembled → triggers completion.
   *
   * @returns {Promise<{ completionState: Object|null, hudSnapshot: Object }>}
   */
  async completeReassembly() {
    await this._reassembly.completeReassembly();
    this._hud.setStep(REPAIR_STEP.COMPLETION);

    let completionState = null;
    if (this._partModel.allFaultsCleared()) {
      completionState = this._buildCompletionState();
    }

    return {
      completionState: completionState ? completionState.getSnapshot() : null,
      hudSnapshot:     this._hud.getSnapshot(),
    };
  }

  // ── Completion screen (AC4) ───────────────────────────────────────────────

  /**
   * Explicitly trigger the completion state (called when player triggers completion action).
   * Sets scene to COMPLETE, builds CompletionScreenState.
   *
   * @returns {{ watchRunning: boolean, restorationCompleteText: boolean, sessionSummary: Object }}
   */
  triggerCompletion() {
    const state = this._buildCompletionState();
    this._setSceneState(SCENE_STATE.COMPLETE);
    return state.getSnapshot();
  }

  /** @returns {Object|null} Completion screen snapshot, or null if not yet complete. */
  getCompletionState() {
    return this._completionState ? this._completionState.getSnapshot() : null;
  }

  // ── Save/restore (AC5) ────────────────────────────────────────────────────

  /**
   * Serialise the full workbench session state for persistence.
   * Includes: part states (in-tray, on-watch, repaired, unrepaired), current repair step,
   * fault state, and repair progress.
   *
   * Structure: spreads WatchPartModel.toSaveData() so that fromSaveData can be called
   * directly with the workbench snapshot (avoids nested parts.parts nesting).
   *
   * @returns {Object} Save data payload ready for JSON serialisation.
   */
  toSaveData() {
    return {
      // Spread the part model save data ({ parts: { ... } }) directly into the snapshot
      ...this._partModel.toSaveData(),
      repairStep: this._hud.getStep(),
      sceneState: this._sceneState,
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {WorkbenchHUD} The HUD state manager. */
  getHUD() { return this._hud; }

  /** @returns {WatchPartModel} The part model. */
  getPartModel() { return this._partModel; }

  /** @returns {TeardownScreen} The teardown screen (existing module). */
  getTeardownScreen() { return this._teardown; }

  /** @returns {DiagnosisScreen} The diagnosis screen (existing module). */
  getDiagnosisScreen() { return this._diagnosis; }

  /** @returns {ReassemblyScreen} The reassembly screen (existing module). */
  getReassemblyScreen() { return this._reassembly; }

  // ── Private ───────────────────────────────────────────────────────────────

  _setSceneState(state) {
    this._sceneState = state;
    if (typeof this._onSceneStateChange === 'function') {
      this._onSceneStateChange(state);
    }
  }

  _buildCompletionState() {
    this._completionState = CompletionScreenState.fromWatchPartModel(this._partModel);
    return this._completionState;
  }
}

module.exports = { WorkbenchScene, SCENE_STATE };
