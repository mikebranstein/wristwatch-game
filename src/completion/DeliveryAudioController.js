const DELIVERY_CUE = 'delivery_confirmation';
class DeliveryAudioController {
  constructor({ audioHook, audioEnabled = true } = {}) {
    this._audioHook = typeof audioHook === 'function' ? audioHook : null;
    this._audioEnabled = audioEnabled;
    this._firedIds = new Set();
  }
  playDeliveryCue(deliveryId) {
    if (!this._audioEnabled || !this._audioHook) return;
    if (this._firedIds.has(deliveryId)) return;
    this._firedIds.add(deliveryId);
    this._audioHook(DELIVERY_CUE);
  }
  hasFired(deliveryId) { return this._firedIds.has(deliveryId); }
  reset() { this._firedIds.clear(); }
}
module.exports = { DeliveryAudioController, DELIVERY_CUE };