/**
 * StrapBeforeAfterDisplay — reusable before/after display component.
 *
 * Issue #143 — Strap Swap: Cosmetic Restoration Phase 1 (AC3)
 *
 * Responsibilities:
 *   - Capture the "before" state snapshot at phase entry (worn strap).
 *   - Accept the "after" state when a selection is confirmed.
 *   - Build a display payload in a generic before/after contract so that
 *     Phase 2 (crystal replacement) and Phase 3 (case polishing) can reuse
 *     this same component without modification.
 *
 * Design contract — generic interface:
 *   The component works with any { assetKey, label, description } shape.
 *   Strap-specific data is passed in at call time; the component itself has
 *   no hard-coded knowledge of straps, crystals, or cases.
 *
 * Phase 2 / Phase 3 adoption: pass in crystal or case state snapshots using
 *   the same { assetKey, label, description } interface.
 *
 * Display modes:
 *   'side_by_side'    — both states shown simultaneously in a split panel
 *   'sequential_reveal' — animated transition from before to after
 */

'use strict';

/**
 * @typedef {Object} BeforeAfterSnapshot
 * @property {string} assetKey    — mesh/material asset key rendered in the panel
 * @property {string} label       — human-readable state label (e.g. "Original (Worn)")
 * @property {string} description — short descriptive text for this state
 */

/**
 * @typedef {Object} BeforeAfterDisplayPayload
 * @property {BeforeAfterSnapshot} before        — state before the change
 * @property {BeforeAfterSnapshot} after         — state after the change
 * @property {string}              displayMode   — 'side_by_side' | 'sequential_reveal'
 * @property {boolean}             hasChange     — false when before and after are identical
 * @property {string}              phaseId       — caller-supplied phase identifier (e.g. 'strap')
 */

/** @type {string[]} */
const VALID_DISPLAY_MODES = ['side_by_side', 'sequential_reveal'];
const DEFAULT_DISPLAY_MODE = 'side_by_side';

class StrapBeforeAfterDisplay {
  /**
   * @param {Object}   opts
   * @param {string}   [opts.phaseId='strap']       — phase identifier for multi-phase reuse
   * @param {string}   [opts.displayMode]            — 'side_by_side' | 'sequential_reveal'
   */
  constructor({ phaseId = 'strap', displayMode = DEFAULT_DISPLAY_MODE } = {}) {
    this._phaseId = phaseId;
    this._displayMode = VALID_DISPLAY_MODES.includes(displayMode) ? displayMode : DEFAULT_DISPLAY_MODE;
    /** @type {BeforeAfterSnapshot|null} */
    this._beforeSnapshot = null;
  }

  // ── Snapshot capture ─────────────────────────────────────────────────────

  /**
   * Capture the "before" state snapshot.
   * Should be called when the cosmetic phase step is entered (before any swap).
   *
   * @param {BeforeAfterSnapshot} snapshot
   */
  captureBeforeState(snapshot) {
    this._validateSnapshot(snapshot, 'before');
    this._beforeSnapshot = { ...snapshot };
  }

  // ── Payload builder ──────────────────────────────────────────────────────

  /**
   * Build the display payload given the "after" state snapshot.
   * Returns null if the before state was never captured (defensive — caller
   * should always call captureBeforeState first).
   *
   * AC3: both states are present; hasChange distinguishes real change from no-op.
   *
   * @param {BeforeAfterSnapshot} afterSnapshot
   * @returns {BeforeAfterDisplayPayload|null}
   */
  buildPayload(afterSnapshot) {
    if (!this._beforeSnapshot) {
      return null; // Before state not captured — cannot produce comparison
    }
    this._validateSnapshot(afterSnapshot, 'after');

    const hasChange = afterSnapshot.assetKey !== this._beforeSnapshot.assetKey;

    return {
      before: { ...this._beforeSnapshot },
      after: { ...afterSnapshot },
      displayMode: this._displayMode,
      hasChange,
      phaseId: this._phaseId,
    };
  }

  /**
   * Returns true if the component is ready to produce a payload
   * (i.e. captureBeforeState has been called).
   * @returns {boolean}
   */
  isReady() {
    return this._beforeSnapshot !== null;
  }

  /**
   * Returns the captured before-state snapshot, or null if not yet captured.
   * @returns {BeforeAfterSnapshot|null}
   */
  getBeforeSnapshot() {
    return this._beforeSnapshot ? { ...this._beforeSnapshot } : null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * @private
   */
  _validateSnapshot(snapshot, role) {
    if (!snapshot || typeof snapshot.assetKey !== 'string' || !snapshot.assetKey) {
      throw new Error(`StrapBeforeAfterDisplay: ${role} snapshot must have a non-empty assetKey`);
    }
    if (typeof snapshot.label !== 'string') {
      throw new Error(`StrapBeforeAfterDisplay: ${role} snapshot must have a label string`);
    }
  }
}

module.exports = { StrapBeforeAfterDisplay, VALID_DISPLAY_MODES, DEFAULT_DISPLAY_MODE };
