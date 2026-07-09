'use strict';

class BalanceWheelHighlightEffect {
  constructor({ highlightRenderer } = {}) {
    this._highlightRenderer = typeof highlightRenderer === 'function' ? highlightRenderer : null;
    this._activeWatchIds = new Set();
  }

  activate(watchId) {
    if (!watchId) {
      return false;
    }

    this._activeWatchIds.add(watchId);
    if (this._highlightRenderer) {
      this._highlightRenderer(watchId, true);
    }
    return true;
  }

  deactivate(watchId) {
    if (!watchId || !this._activeWatchIds.has(watchId)) {
      return false;
    }

    this._activeWatchIds.delete(watchId);
    if (this._highlightRenderer) {
      this._highlightRenderer(watchId, false);
    }
    return true;
  }

  isActive(watchId) {
    return this._activeWatchIds.has(watchId);
  }

  deactivateAll() {
    Array.from(this._activeWatchIds).forEach((watchId) => this.deactivate(watchId));
  }
}

module.exports = { BalanceWheelHighlightEffect };
