'use strict';
class DeliveryHandler {
  constructor({ saveState, saveAsyncFn = null, onDelivered = null }) {
    this._saveState = saveState;
    this._saveAsyncFn = saveAsyncFn;
    this._onDelivered = onDelivered;
  }
  handleDelivery({ watch_name, client_name, completion_date, portrait_asset_key }) {
    const entry = { watch_name, client_name, completion_date, portrait_asset_key };
    this._saveState.recordWatchDelivery(entry);
    if (this._saveAsyncFn) this._saveAsyncFn(this._saveState.snapshot());
    if (this._onDelivered) this._onDelivered(entry);
    return entry;
  }
  getSaveState() { return this._saveState; }
}
module.exports = { DeliveryHandler };