/**
 * CompletionScreenState — state model for the completion screen.
 *
 * Issue #164: Minimal Playable Shell — Core Workbench Prototype (AC4)
 *
 * Tracks and exposes the state shown on the completion screen after a
 * successful end-to-end repair loop:
 *   - Running state indicator (balance wheel active)
 *   - "Restoration Complete" text flag
 *   - Session summary: parts serviced, faults fixed, total parts count
 *
 * Design constraint: pure state module — no renderer or DOM imports.
 * The rendering layer reads from CompletionScreenState to drive the
 * hero shot, running-state indicator, and session summary display.
 *
 * AC4 coverage:
 *   - watchRunning: true  → triggers balance wheel animation or equivalent visual
 *   - restorationCompleteText: true → "Restoration Complete" banner
 *   - sessionSummary.partsServiced → count of parts that passed through the tray
 *   - sessionSummary.faultsFixed   → count of faults that were cleared
 *   - sessionSummary.totalParts    → total parts in the watch model
 */

'use strict';

/**
 * CompletionScreenState — immutable snapshot of the end-of-repair summary.
 * Constructed once when the repair loop is complete; read-only thereafter.
 */
class CompletionScreenState {
  /**
   * @param {Object} opts
   * @param {number} opts.partsServiced  Parts that passed through the disassembly tray.
   * @param {number} opts.faultsFixed    Faults that were repaired.
   * @param {number} opts.totalParts     Total parts in the watch model.
   */
  constructor({ partsServiced, faultsFixed, totalParts }) {
    this._watchRunning           = true;   // Watch is running after successful repair
    this._restorationCompleteText = true;  // "Restoration Complete" banner
    this._sessionSummary = {
      partsServiced: partsServiced,
      faultsFixed:   faultsFixed,
      totalParts:    totalParts,
    };
  }

  // ── Accessors (AC4) ───────────────────────────────────────────────────────

  /**
   * Whether the watch is in a running state (triggers balance wheel animation).
   * @returns {boolean}
   */
  isWatchRunning() {
    return this._watchRunning;
  }

  /**
   * Whether to show the "Restoration Complete" text.
   * @returns {boolean}
   */
  showRestorationCompleteText() {
    return this._restorationCompleteText;
  }

  /**
   * Session summary counts for the completion screen display.
   * @returns {{ partsServiced: number, faultsFixed: number, totalParts: number }}
   */
  getSessionSummary() {
    return { ...this._sessionSummary };
  }

  /**
   * Full snapshot for the rendering layer.
   * @returns {Object}
   */
  getSnapshot() {
    return {
      watchRunning:            this._watchRunning,
      restorationCompleteText: this._restorationCompleteText,
      sessionSummary:          this.getSessionSummary(),
    };
  }

  /**
   * Factory: build a CompletionScreenState from a WatchPartModel instance.
   * @param {Object} watchPartModel  WatchPartModel instance after completion.
   * @returns {CompletionScreenState}
   */
  static fromWatchPartModel(watchPartModel) {
    const all   = watchPartModel.getAllParts();
    const total = all.length;

    // Parts serviced = parts that left ON_WATCH at some point (all non-ON_WATCH at session start)
    const partsServiced = all.filter(p => p.state !== 'ON_WATCH').length;

    // Faults fixed = parts whose faultCleared is true
    const faultsFixed = all.filter(p => p.faultCleared).length;

    return new CompletionScreenState({ partsServiced, faultsFixed, totalParts: total });
  }
}

module.exports = { CompletionScreenState };
