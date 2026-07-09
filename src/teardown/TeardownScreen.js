/**
 * TeardownScreen — top-level orchestrator for the watch teardown / disassembly stage.
 *
 * Issue #82 — Save/Load Reliability System:
 *   Provides the teardown-stage completion lifecycle hook required for autosave
 *   checkpoint AC1.  An optional `autosaveHook` is injected at construction via
 *   the established DI pattern (mirrors ReassemblyScreen / CleaningRevealSequence).
 *
 * Responsibilities:
 *   - Track which parts have been successfully removed.
 *   - Emit a `teardown_completed` telemetry event on stage completion.
 *   - Fire the autosave hook (AC1: checkpoint written before next stage begins).
 *
 * Design pattern: same DI constructor hook pattern used by ReassemblyScreen and
 * CleaningRevealSequence.  All domain logic is delegated; this class is the stage
 * lifecycle boundary only.
 */

const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

class TeardownScreen {
  /**
   * @param {Object}   opts
   * @param {Function} opts.instrumentationHook  Telemetry hook: (eventName, payload) => void
   * @param {Function} [opts.autosaveHook]        Issue #82: async (stage: string) => void
   * @param {string}   [opts.sessionId]           Optional session identifier for telemetry.
   */
  constructor({ instrumentationHook, autosaveHook = null, sessionId = null }) {
    this._telemetry      = new TelemetryEmitter(instrumentationHook);
    this._autosaveHook   = autosaveHook;   // Issue #82
    this._sessionId      = sessionId;
    this._removedParts   = new Set();
  }

  // ── Part removal tracking ───────────────────────────────────────────────

  /**
   * Record that a part has been successfully removed from the watch.
   *
   * @param {string} partId
   */
  onPartRemoved(partId) {
    this._removedParts.add(partId);
    this._telemetry.emit('teardown_part_removed', {
      partId,
      sessionId: this._sessionId,
      removedCount: this._removedParts.size,
    });
  }

  /**
   * Undo a previous part removal (player un-removes a part).
   *
   * @param {string} partId
   */
  onPartRestored(partId) {
    this._removedParts.delete(partId);
    this._telemetry.emit('teardown_part_restored', {
      partId,
      sessionId: this._sessionId,
    });
  }

  // ── Stage completion ────────────────────────────────────────────────────

  /**
   * Mark the teardown stage as complete.
   *
   * Emits a `teardown_completed` telemetry event.
   * Issue #82 — AC1, AC5: awaits the autosaveHook so the checkpoint is
   * guaranteed to land on disk before the next stage begins.
   *
   * @returns {Promise<void>}
   */
  async completeTeardown() {
    this._telemetry.emit('teardown_completed', {
      sessionId: this._sessionId,
      removedCount: this._removedParts.size,
    });

    // Issue #82: trigger autosave checkpoint at teardown completion (AC1).
    if (this._autosaveHook) {
      await this._autosaveHook('teardown');
    }
  }

  // ── Accessors (for testing & QA) ────────────────────────────────────────

  /** @returns {Set<string>} Set of removed part IDs. */
  getRemovedParts() { return new Set(this._removedParts); }

  /** @returns {TelemetryEmitter} */
  getTelemetry() { return this._telemetry; }
}

module.exports = { TeardownScreen };
