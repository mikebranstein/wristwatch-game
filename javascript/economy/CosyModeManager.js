/**
 * CosyModeManager — Workshop Economy MVP (Issue #145)
 *
 * Manages the Cozy Mode toggle: a player preference that controls whether
 * financial cost pressure is applied. When enabled, all financial indicators
 * become display-only — parts cost deductions are suppressed at the delivery
 * boundary. The toggle state persists across sessions via PlayerSaveState.
 *
 * Semantics:
 *   - Toggle applies from the NEXT job forward (not retroactively to in-progress jobs).
 *   - Toggling ON mid-restoration must not alter parts costs already tracked for the
 *     current in-progress job (Design mitigation — Cozy Mode toggle coherence).
 *   - Display-only mode: income is still tracked and shown; no deductions to balance.
 *   - Hidden mode: financial layer hidden entirely (display preference; same data model).
 *
 * Save-state field (additive, backward-compatible — Issue #145):
 *   cozy_mode_enabled  {boolean}  Cozy Mode on/off state (false default)
 *
 * Acceptance criteria covered:
 *   AC4 — Cozy Mode toggle: cost-pressure hidden/suppressed, toggle persists across sessions.
 */

'use strict';

class CosyModeManager {
  /**
   * @param {Object} saveState  PlayerSaveState-compatible object with get/set API.
   */
  constructor(saveState) {
    if (!saveState || typeof saveState.get !== 'function' || typeof saveState.set !== 'function') {
      throw new Error('CosyModeManager: saveState must implement get(key) and set(key, value).');
    }
    this._save = saveState;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * Returns true if Cozy Mode is currently enabled.
   * Null-safe default: returns false for pre-feature saves lacking the field.
   * @returns {boolean}
   */
  get isEnabled() {
    return this._save.get('cozy_mode_enabled') || false;
  }

  // ---------------------------------------------------------------------------
  // Toggle API (AC4)
  // ---------------------------------------------------------------------------

  /**
   * Enable Cozy Mode. Subsequent jobs will not have parts costs deducted from balance.
   * Toggle applies from NEXT job forward (does not affect in-progress jobs).
   * State is persisted immediately into save state.
   * @returns {boolean} New state (true)
   */
  enable() {
    this._save.set('cozy_mode_enabled', true);
    return true;
  }

  /**
   * Disable Cozy Mode. Subsequent jobs will resume normal parts cost deductions.
   * Toggle applies from NEXT job forward.
   * State is persisted immediately into save state.
   * @returns {boolean} New state (false)
   */
  disable() {
    this._save.set('cozy_mode_enabled', false);
    return false;
  }

  /**
   * Toggle Cozy Mode on/off.
   * @returns {boolean} New state after toggle
   */
  toggle() {
    return this.isEnabled ? this.disable() : this.enable();
  }

  // ---------------------------------------------------------------------------
  // View-model
  // ---------------------------------------------------------------------------

  /**
   * Returns the Cozy Mode view-model for UI display.
   * @returns {{ enabled: boolean, label: string, description: string }}
   */
  getViewModel() {
    const enabled = this.isEnabled;
    return {
      enabled,
      label:       enabled ? 'Cozy Mode: ON' : 'Cozy Mode: OFF',
      description: enabled
        ? 'Financial indicators shown for reference only — no cost deductions applied.'
        : 'Standard mode: parts costs are deducted from your balance at job completion.',
    };
  }
}

module.exports = { CosyModeManager };
