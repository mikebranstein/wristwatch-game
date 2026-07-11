/**
 * DeliveryHandler — appends a completed watch entry to the collection at delivery.
 *
 * Issue #127 — Workshop Collection Gallery MVP:
 *
 * Responsibilities:
 *   - Accept the delivery payload (watch name, client name, completion date,
 *     portrait asset key) at the delivery-completion boundary.
 *   - Append a normalised entry to PlayerSaveState.completed_watches[] in memory
 *     so the gallery reflects the new delivery immediately (AC1, Test Scenario 8).
 *   - Call the injected saveAsync hook to persist the updated save state to disk
 *     without blocking the game loop (mirrors the save-on-state-change rule from
 *     the orders subsystem).
 *   - Emit a `watch_delivered` telemetry event for analytics.
 *
 * Design notes:
 *   - Portrait asset key / path must be captured HERE (at delivery time), not at
 *     gallery render time, to guarantee assets remain locatable across sessions
 *     (design decision requirement — portrait_asset_key stored in save entry).
 *   - No changes to the delivery or restoration workflows; this handler sits at
 *     the completion boundary only.
 *
 * DI pattern mirrors SourcingScreen / ReassemblyScreen.
 */

'use strict';

class DeliveryHandler {
  /**
   * @param {Object}   opts
   * @param {Object}   opts.saveState          — PlayerSaveState instance
   * @param {Function} [opts.saveAsync]         — (snapshot: Object) => void  (non-blocking persistence)
   * @param {Function} [opts.instrumentationHook] — (eventName: string, payload: Object) => void
   */
  constructor({ saveState, saveAsync = null, instrumentationHook = null }) {
    this._saveState           = saveState;
    this._saveAsync           = saveAsync;
    this._instrumentationHook = instrumentationHook;
  }

  // ── Delivery completion ───────────────────────────────────────────────────

  /**
   * Complete delivery of a restored watch.
   *
   * Appends the entry to completed_watches in memory and fires save_async so
   * persistence is non-blocking.  The gallery reflects the new entry immediately
   * without requiring a session reload (AC1, Test Scenario 8).
   *
   * @param {Object} opts
   * @param {string}      opts.watchId          — unique watch identifier
   * @param {string}      opts.watchName         — watch model/name to display
   * @param {string}      opts.clientName        — client name to display
   * @param {string}      opts.completionDate    — ISO 8601 date string (e.g. '2026-07-10')
   * @param {string|null} [opts.portraitAssetKey] — resolved asset key/path captured NOW
   *                                                (not deferred to gallery render time)
   *
   * @returns {{ watchId, watchName, clientName, completionDate, portraitAssetKey }}
   *   The normalised entry that was appended to the collection.
   */
  completeDelivery({ watchId, watchName, clientName, completionDate, portraitAssetKey = null }) {
    const entry = {
      watchId,
      watchName,
      clientName,
      completionDate,
      portraitAssetKey,   // captured at delivery time for gallery robustness
    };

    // 1. Update in-memory state immediately (gallery reads this without reload).
    this._saveState.recordWatchDelivery(entry);

    // 2. Persist asynchronously — non-blocking (mirrors orders save-on-state-change).
    if (this._saveAsync) {
      this._saveAsync(this._saveState.snapshot());
    }

    // 3. Telemetry event.
    if (this._instrumentationHook) {
      this._instrumentationHook('watch_delivered', {
        watchId,
        watchName,
        clientName,
        completionDate,
        hasPortrait: portraitAssetKey !== null,
      });
    }

    return entry;
  }

  // ── Accessors (for testing & QA) ─────────────────────────────────────────

  /** @returns {Object} The injected PlayerSaveState instance. */
  getSaveState() { return this._saveState; }
}

module.exports = { DeliveryHandler };
