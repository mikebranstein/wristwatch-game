'use strict';

const DELIVERY_CUE = 'delivery_confirmation';

class DeliveryAudioController {
  constructor(audioHook, audioEnabled = true, audioDesignSystem = null) {
    if (typeof audioHook !== 'function' && (!audioDesignSystem || typeof audioDesignSystem.enqueue !== 'function')) {
      throw new Error('DeliveryAudioController requires an audioHook function.');
    }

    this._audioHook = audioHook;
    this._audioEnabled = Boolean(audioEnabled);
    this._audioDesignSystem = audioDesignSystem;
    this._firedDeliveries = new Set();
  }

  fireDeliveryCue(deliveryId) {
    if (this._firedDeliveries.has(deliveryId)) {
      return { fired: false };
    }

    this._firedDeliveries.add(deliveryId);
    if (this._audioEnabled) {
      this._emitCue(DELIVERY_CUE);
    }

    return { fired: true };
  }

  reset() {
    this._firedDeliveries.clear();
    this._releaseCue(DELIVERY_CUE);
  }

  hasFired(deliveryId) {
    return this._firedDeliveries.has(deliveryId);
  }

  isAudioEnabled() {
    return this._audioEnabled;
  }

  _emitCue(cueId) {
    if (this._audioDesignSystem && typeof this._audioDesignSystem.enqueue === 'function') {
      this._audioDesignSystem.enqueue(cueId);
      return;
    }

    this._audioHook(cueId);
  }

  _releaseCue(cueId) {
    if (this._audioDesignSystem && typeof this._audioDesignSystem.releaseCue === 'function') {
      this._audioDesignSystem.releaseCue(cueId);
    }
  }
}

module.exports = { DeliveryAudioController, DELIVERY_CUE };