/**
 * ToolRationaleCardController — progressive disclosure logic for the
 * in-context tool rationale card.
 *
 * Issue #301 — In-Context Tool Rationale — Core System & Pilot Set (Phase 1 MVP)
 *
 * Design contract (from approved design decision):
 *   - Mirrors ContextualHighlightController.js pattern:
 *       subscribes to ToolPanel.onToolChange() (event-driven, not polling);
 *       exposes dispose() for clean teardown on scene unload.
 *   - Reads the active operationId from an injected provider function
 *     (getActiveOperationId) — same layer as ContextualHighlightController
 *     wiring (OperationGatingSystem / MultiStepOperationTracker).
 *   - Consults ToolRationaleProvider for rationale strings (O(1) static lookup).
 *   - Tracks per-tool view counts in PlayerSaveState.tool_rationale_use_counts.
 *   - Tracks explicit player suppress in PlayerSaveState.tool_rationale_player_suppressed.
 *   - Updates WorkbenchHUD rationale card state via showRationaleCard() / hideRationaleCard().
 *   - Emits telemetry per impression via TelemetryEmitter.
 *   - Frame budget: zero per-frame computation; all work is event-driven.
 *
 * AC1: Card renders on tool selection when a rationale string exists for the
 *      (operationId, toolId) pair.
 * AC2: Card auto-suppressed after N=5 views (configurable via SUPPRESS_AFTER_N).
 * AC3: Player-triggered suppress persists across sessions via PlayerSaveState.
 * AC4: No card rendered outside active operation context; no console error.
 * AC5: Telemetry emitted per impression (shown/suppressed, operationId, toolId, timestamp).
 */

'use strict';

const { getToolRationale } = require('./ToolRationaleProvider');

/** Number of times a player must view a rationale card before auto-suppress kicks in. */
const SUPPRESS_AFTER_N = 5;

/** PlayerSaveState key for per-tool view counts. */
const SAVE_KEY_USE_COUNTS         = 'tool_rationale_use_counts';
/** PlayerSaveState key for per-tool explicit player suppress flags. */
const SAVE_KEY_PLAYER_SUPPRESSED  = 'tool_rationale_player_suppressed';

/** TelemetryEmitter event name for rationale card impressions. */
const TELEMETRY_EVENT = 'tool_rationale_card_impression';

class ToolRationaleCardController {
  /**
   * @param {import('../tools/ToolPanel').ToolPanel} toolPanel
   *   The ToolPanel instance; subscribed via onToolChange().
   * @param {function(): string|null} getActiveOperationId
   *   Injected function that returns the current active operationId, or null
   *   when not in an active repair operation step (AC4 guard).
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   *   Player save state for view-count and suppress-flag persistence.
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   *   Telemetry emitter for impression events (AC5).
   * @param {import('../workbench/WorkbenchHUD').WorkbenchHUD} [workbenchHUD]
   *   Optional HUD state object to update on card show/hide.
   *   When omitted (e.g. in unit tests), card state is tracked internally only.
   */
  constructor(toolPanel, getActiveOperationId, saveState, telemetry, workbenchHUD = null) {
    this._getActiveOperationId = getActiveOperationId || (() => null);
    this._saveState    = saveState;
    this._telemetry    = telemetry;
    this._workbenchHUD = workbenchHUD;

    // Internal card visibility state (mirrors WorkbenchHUD when injected)
    this._currentCard = null; // { operationId, toolId, rationaleText, icon } | null

    // Subscribe to tool-change events (event-driven, not polling — FD-002)
    if (toolPanel) {
      this._unsubscribe = toolPanel.onToolChange((newToolId) => {
        this._onToolChanged(newToolId);
      });
    } else {
      this._unsubscribe = () => {};
    }
  }

  // ── Internal event handler ─────────────────────────────────────────────────

  /**
   * Called whenever the player selects a different tool.
   * Core AC1–AC5 logic lives here.
   *
   * @param {string} toolId
   */
  _onToolChanged(toolId) {
    const operationId = this._getActiveOperationId();

    // AC4: no active operation context → hide card, no error
    if (!operationId) {
      this._hideCard();
      return;
    }

    // Check pilot set
    const entry = getToolRationale(operationId);
    if (!entry) {
      // No rationale defined for this operation (non-pilot or no match) → hide card
      this._hideCard();
      return;
    }

    // Determine suppress state for this tool
    if (this._isPlayerSuppressed(toolId)) {
      // AC3: player explicitly suppressed this tool's card
      this._emitTelemetry(operationId, toolId, false);
      this._hideCard();
      return;
    }

    const useCount = this._getUseCount(toolId);
    if (useCount >= SUPPRESS_AFTER_N) {
      // AC2: progressive disclosure threshold reached — card suppressed by default
      this._emitTelemetry(operationId, toolId, false);
      this._hideCard();
      return;
    }

    // AC1: show the card
    this._incrementUseCount(toolId);
    this._showCard(operationId, toolId, entry.rationale, entry.icon);
    this._emitTelemetry(operationId, toolId, true);
  }

  // ── Player-triggered suppress (AC3) ───────────────────────────────────────

  /**
   * Player has explicitly collapsed/suppressed the rationale card for the
   * currently active tool.  Hides the card immediately and persists the
   * suppress preference to PlayerSaveState (AC3).
   *
   * Call this in response to the player's collapse/suppress UI action.
   *
   * @param {string} toolId  The tool whose card is being suppressed.
   */
  suppressCard(toolId) {
    if (!toolId) return;

    // Persist suppress flag
    const suppressed = this._getSuppressedMap();
    suppressed[toolId] = true;
    this._saveState.set(SAVE_KEY_PLAYER_SUPPRESSED, suppressed);

    // Emit telemetry (shown: false = suppressed)
    const operationId = this._getActiveOperationId();
    if (operationId) {
      this._emitTelemetry(operationId, toolId, false);
    }

    this._hideCard();
  }

  /**
   * Player has re-enabled the rationale card for a specific tool.
   * Clears the suppress flag from PlayerSaveState.
   *
   * @param {string} toolId
   */
  unsuppressCard(toolId) {
    if (!toolId) return;
    const suppressed = this._getSuppressedMap();
    delete suppressed[toolId];
    this._saveState.set(SAVE_KEY_PLAYER_SUPPRESSED, suppressed);
  }

  // ── Public accessors ───────────────────────────────────────────────────────

  /**
   * Returns the currently visible card state, or null if the card is hidden.
   *
   * @returns {{ operationId: string, toolId: string, rationaleText: string, icon: string }|null}
   */
  getCurrentCard() {
    return this._currentCard ? { ...this._currentCard } : null;
  }

  /**
   * Returns true if the card is currently visible.
   * @returns {boolean}
   */
  isCardVisible() {
    return this._currentCard !== null;
  }

  /**
   * Returns the view count for a given tool from PlayerSaveState.
   * @param {string} toolId
   * @returns {number}
   */
  getViewCount(toolId) {
    return this._getUseCount(toolId);
  }

  /**
   * Returns whether the player has explicitly suppressed the card for a tool.
   * @param {string} toolId
   * @returns {boolean}
   */
  isPlayerSuppressed(toolId) {
    return this._isPlayerSuppressed(toolId);
  }

  /**
   * Releases the ToolPanel subscription.
   * Call when disposing the controller (e.g. on scene unload) — mirrors
   * ContextualHighlightController.dispose() pattern.
   */
  dispose() {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _showCard(operationId, toolId, rationaleText, icon) {
    this._currentCard = { operationId, toolId, rationaleText, icon };
    if (this._workbenchHUD) {
      this._workbenchHUD.showRationaleCard(operationId, toolId, rationaleText, icon);
    }
  }

  _hideCard() {
    this._currentCard = null;
    if (this._workbenchHUD) {
      this._workbenchHUD.hideRationaleCard();
    }
  }

  _getUseCountMap() {
    return this._saveState.get(SAVE_KEY_USE_COUNTS) || {};
  }

  _getUseCount(toolId) {
    const counts = this._getUseCountMap();
    return typeof counts[toolId] === 'number' ? counts[toolId] : 0;
  }

  _incrementUseCount(toolId) {
    const counts = this._getUseCountMap();
    counts[toolId] = (typeof counts[toolId] === 'number' ? counts[toolId] : 0) + 1;
    this._saveState.set(SAVE_KEY_USE_COUNTS, counts);
  }

  _getSuppressedMap() {
    return this._saveState.get(SAVE_KEY_PLAYER_SUPPRESSED) || {};
  }

  _isPlayerSuppressed(toolId) {
    const suppressed = this._getSuppressedMap();
    return suppressed[toolId] === true;
  }

  _emitTelemetry(operationId, toolId, shown) {
    if (this._telemetry) {
      this._telemetry.emit(TELEMETRY_EVENT, {
        operationId,
        toolId,
        shown,
        timestamp: Date.now(),
      });
    }
  }
}

module.exports = {
  ToolRationaleCardController,
  SUPPRESS_AFTER_N,
  SAVE_KEY_USE_COUNTS,
  SAVE_KEY_PLAYER_SUPPRESSED,
  TELEMETRY_EVENT,
};
