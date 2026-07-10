/**
 * DeliveryHandler — delivery-completion boundary for the Collection Gallery.
 * Issue #127 — Workshop Collection Gallery MVP
 */
'use strict';

class DeliveryHandler {
  constructor({ saveState, saveAsyncFn = null, onDelivered = null }) {
    this._saveState = saveState;
    this._saveAsyncFn = saveAsyncFn;
    this._onDelivered = onDelivered;
  }

  handleDelivery({ watch_name, client_name, completion_date, portrait_asset_key, before_portrait_url = null }) {
    const entry = { watch_name, client_name, completion_date, portrait_asset_key, before_portrait_url };
    this._saveState.appendCompletedWatch(entry);
    if (this._saveAsyncFn) this._saveAsyncFn(this._saveState.snapshot());
    if (this._onDelivered) this._onDelivered(entry);
    return entry;
  }

  getSaveState() { return this._saveState; }
}

module.exports = { DeliveryHandler };
