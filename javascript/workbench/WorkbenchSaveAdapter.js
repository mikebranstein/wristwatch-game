/**
 * WorkbenchSaveAdapter — bridges workbench state to the existing SaveSystem.
 *
 * Issue #164: Minimal Playable Shell — Core Workbench Prototype (AC5)
 *
 * Extends the existing save state persistence to include renderer-specific
 * workbench state: part positions/states, diagnosed faults, and repair progress.
 *
 * Integrates with the existing SaveSystem autosave_checkpoint API (Python, Issue #82)
 * by operating as a JS-side save adapter that:
 *   1. Serialises workbench state into the game_state dict before each autosave.
 *   2. Deserialises workbench state from a loaded save file on session start.
 *   3. Handles null-safe defaults for pre-feature saves that lack workbench data.
 *
 * Design constraint: does NOT duplicate SaveSystem's I/O logic — delegates
 * disk writes to the existing autosaveHook (injected via DI pattern).
 *
 * AC5 coverage:
 *   - All part states (in-tray, on-watch, repaired, unrepaired) are persisted.
 *   - Diagnosed fault state is persisted.
 *   - Repair progress (cleared faults) is persisted.
 *   - State is fully restorable on app reopen without corruption.
 */

'use strict';

const WORKBENCH_SAVE_KEY = 'workbench_state';

/**
 * WorkbenchSaveAdapter — serialises and deserialises workbench state.
 */
class WorkbenchSaveAdapter {
  /**
   * @param {Object}   [opts]
   * @param {Function} [opts.autosaveHook]  async (stage: string, gameState: Object) => void
   *                                         Called when a checkpoint should be written.
   */
  constructor({ autosaveHook = null } = {}) {
    this._autosaveHook = autosaveHook;
  }

  // ── Serialise ─────────────────────────────────────────────────────────────

  /**
   * Build the full game state dict with workbench state embedded, ready for
   * persistence by the existing SaveSystem.
   *
   * @param {Object} existingGameState  Current full game state dict.
   * @param {Object} workbenchSnapshot  Output of WorkbenchScene.toSaveData().
   * @returns {Object} Updated game state safe for JSON serialisation.
   */
  buildSavePayload(existingGameState, workbenchSnapshot) {
    return {
      ...(existingGameState || {}),
      [WORKBENCH_SAVE_KEY]: workbenchSnapshot,
    };
  }

  // ── Deserialise ───────────────────────────────────────────────────────────

  /**
   * Extract workbench state from a loaded save file.
   * Returns null for saves that pre-date this feature (null-safe).
   *
   * @param {Object|null} gameState  Loaded save data dict.
   * @returns {Object|null} Workbench state snapshot, or null if absent.
   */
  extractWorkbenchState(gameState) {
    if (!gameState) return null;
    return gameState[WORKBENCH_SAVE_KEY] || null;
  }

  // ── Autosave checkpoint ───────────────────────────────────────────────────

  /**
   * Write an autosave checkpoint with the current workbench state embedded.
   * Delegates the actual disk write to the injected autosaveHook (DI pattern,
   * mirrors TeardownScreen and ReassemblyScreen).
   *
   * @param {string} stage            CHECKPOINT_STAGES value (e.g. 'teardown', 'reassembly').
   * @param {Object} existingGameState
   * @param {Object} workbenchSnapshot  Output of WorkbenchScene.toSaveData().
   * @returns {Promise<void>}
   */
  async checkpoint(stage, existingGameState, workbenchSnapshot) {
    if (!this._autosaveHook) return;
    const payload = this.buildSavePayload(existingGameState, workbenchSnapshot);
    await this._autosaveHook(stage, payload);
  }
}

module.exports = { WorkbenchSaveAdapter, WORKBENCH_SAVE_KEY };
