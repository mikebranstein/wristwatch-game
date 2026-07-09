/**
 * SourcingScreen — top-level orchestrator for the parts sourcing / placement stage.
 *
 * Issue #82 — Save/Load Reliability System:
 *   Provides the sourcing-stage completion lifecycle hook required for autosave
 *   checkpoint AC1.  An optional `autosaveHook` is injected at construction via
 *   the established DI pattern (mirrors ReassemblyScreen / CleaningRevealSequence).
 *
 * Responsibilities:
 *   - Track which parts have been sourced / placed.
 *   - Emit a `sourcing_completed` telemetry event on stage completion.
 *   - Fire the autosave hook (AC1: checkpoint written before next stage begins).
 *
 * Design pattern: same DI constructor hook pattern used by ReassemblyScreen and
 * CleaningRevealSequence.  All domain logic is delegated; this class is the stage
 * lifecycle boundary only.
 */

const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

class SourcingScreen {
  /**
   * @param {Object}   opts
   * @param {Function} opts.instrumentationHook  Telemetry hook: (eventName, payload) => void
   * @param {Function} [opts.autosaveHook]        Issue #82: async (stage: string) => void
   * @param {string}   [opts.sessionId]           Optional session identifier for telemetry.
   */
  constructor({ instrumentationHook, autosaveHook = null, sessionId = null }) {
    this._telemetry    = new TelemetryEmitter(instrumentationHook);
    this._autosaveHook = autosaveHook;  // Issue #82
    this._sessionId    = sessionId;
    this._sourcedParts = new Set();
  }

  // ── Parts sourcing tracking ─────────────────────────────────────────────

  /**
   * Record that a replacement part has been sourced / placed.
   *
   * @param {string} partId
   */
  onPartSourced(partId) {
    this._sourcedParts.add(partId);
    this._telemetry.emit('sourcing_part_placed', {
      partId,
      sessionId: this._sessionId,
      sourcedCount: this._sourcedParts.size,
    });
  }

  /**
   * Remove a previously sourced part (player un-sources a part).
   *
   * @param {string} partId
   */
  onPartUnSourced(partId) {
    this._sourcedParts.delete(partId);
    this._telemetry.emit('sourcing_part_removed', {
      partId,
      sessionId: this._sessionId,
    });
  }

  // ── Stage completion ────────────────────────────────────────────────────

  /**
   * Mark the sourcing stage as complete (all required parts placed).
   *
   * Emits a `sourcing_completed` telemetry event.
   * Issue #82 — AC1, AC5: awaits the autosaveHook so the checkpoint is
   * guaranteed to land on disk before the next stage begins.
   *
   * @returns {Promise<void>}
   */
  async completeSourcing() {
    this._telemetry.emit('sourcing_completed', {
      sessionId: this._sessionId,
      sourcedCount: this._sourcedParts.size,
    });

    // Issue #82: trigger autosave checkpoint at sourcing completion (AC1).
    if (this._autosaveHook) {
      await this._autosaveHook('sourcing');
    }
  }

  // ── Accessors (for testing & QA) ────────────────────────────────────────

  /** @returns {Set<string>} Set of sourced part IDs. */
  getSourcedParts() { return new Set(this._sourcedParts); }

  /** @returns {TelemetryEmitter} */
  getTelemetry() { return this._telemetry; }
}

module.exports = { SourcingScreen };
