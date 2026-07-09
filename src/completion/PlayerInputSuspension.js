'use strict';

class PlayerInputSuspension {
  constructor({ inputManager } = {}) {
    this._inputManager = inputManager || null;
    this._suspended = false;
  }

  suspend() {
    if (this._suspended) {
      return false;
    }

    if (this._inputManager && typeof this._inputManager.suspend === 'function') {
      this._inputManager.suspend();
    }
    this._suspended = true;
    return true;
  }

  resume() {
    if (!this._suspended) {
      return false;
    }

    if (this._inputManager && typeof this._inputManager.resume === 'function') {
      this._inputManager.resume();
    }
    this._suspended = false;
    return true;
  }

  isSuspended() {
    return this._suspended;
  }

  forceResume() {
    if (this._inputManager && typeof this._inputManager.resume === 'function') {
      this._inputManager.resume();
    }
    this._suspended = false;
  }
}

module.exports = { PlayerInputSuspension };
