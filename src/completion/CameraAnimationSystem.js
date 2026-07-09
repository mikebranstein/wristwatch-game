'use strict';

const MIN_HOLD_DURATION_MS = 1500;
const MAX_HOLD_DURATION_MS = 3000;
const DEFAULT_HOLD_DURATION_MS = 2000;
const DEFAULT_ANIMATION_IN_MS = 90;
const DEFAULT_ANIMATION_OUT_MS = 300;

function cloneView(view) {
  if (!view) {
    return null;
  }

  return JSON.parse(JSON.stringify(view));
}

function clampHoldDuration(holdDurationMs) {
  const normalized = Number(holdDurationMs) || DEFAULT_HOLD_DURATION_MS;
  return Math.max(MIN_HOLD_DURATION_MS, Math.min(MAX_HOLD_DURATION_MS, normalized));
}

class CameraAnimationSystem {
  constructor({
    savedViewProvider,
    onAnimationComplete = null,
    holdDurationMs = DEFAULT_HOLD_DURATION_MS,
    cameraEnabled = true,
  } = {}) {
    this._savedViewProvider = typeof savedViewProvider === 'function' ? savedViewProvider : () => null;
    this._onAnimationComplete = typeof onAnimationComplete === 'function' ? onAnimationComplete : null;
    this._holdDurationMs = clampHoldDuration(holdDurationMs);
    this._cameraEnabled = cameraEnabled !== false;
    this._cameraState = 'idle';
    this._savedView = null;
    this._currentView = null;
    this._targetView = null;
    this._animationTimer = null;
    this._holdTimer = null;
    this._easeBackTimer = null;
  }

  animateTo(targetView, opts = {}) {
    this._clearTimers();
    this._savedView = cloneView(this._savedViewProvider());
    this._targetView = cloneView(targetView);

    if (!this._cameraEnabled) {
      this._currentView = cloneView(this._savedView);
      this._cameraState = 'idle';
      if (typeof opts.onComplete === 'function') {
        opts.onComplete();
      }
      return this._currentView;
    }

    this._cameraState = 'animating_in';
    this._currentView = cloneView(this._targetView);
    const animationDurationMs = Math.max(1, Number(opts.durationMs) || DEFAULT_ANIMATION_IN_MS);
    const onComplete = typeof opts.onComplete === 'function' ? opts.onComplete : null;

    this._animationTimer = setTimeout(() => {
      this._animationTimer = null;
      if (onComplete) {
        onComplete();
      }
    }, animationDurationMs);

    return this._currentView;
  }

  hold() {
    if (!this._cameraEnabled) {
      return;
    }

    this._cameraState = 'hold';
    this._holdTimer = setTimeout(() => {
      this._holdTimer = null;
      this.easeBack();
    }, this._holdDurationMs);
  }

  easeBack() {
    this._clearHoldAndEaseBackTimers();

    if (!this._cameraEnabled) {
      this._cameraState = 'idle';
      if (this._onAnimationComplete) {
        this._onAnimationComplete();
      }
      return;
    }

    this._cameraState = 'animating_out';
    this._currentView = cloneView(this._savedView);
    this._easeBackTimer = setTimeout(() => {
      this._easeBackTimer = null;
      this._cameraState = 'idle';
      if (this._onAnimationComplete) {
        this._onAnimationComplete();
      }
    }, DEFAULT_ANIMATION_OUT_MS);
  }

  abort() {
    this._clearTimers();
    this._currentView = cloneView(this._savedView);
    this._cameraState = 'idle';
  }

  isAnimating() {
    return this._cameraState !== 'idle';
  }

  getCameraState() {
    return this._cameraState;
  }

  getCameraStateSnapshot() {
    return {
      savedView: cloneView(this._savedView),
      currentView: cloneView(this._currentView),
      targetView: cloneView(this._targetView),
    };
  }

  getCurrentView() {
    return cloneView(this._currentView);
  }

  getSavedView() {
    return cloneView(this._savedView);
  }

  getHoldDurationMs() {
    return this._holdDurationMs;
  }

  _clearTimers() {
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
      this._animationTimer = null;
    }
    this._clearHoldAndEaseBackTimers();
  }

  _clearHoldAndEaseBackTimers() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
    if (this._easeBackTimer) {
      clearTimeout(this._easeBackTimer);
      this._easeBackTimer = null;
    }
  }
}

module.exports = {
  CameraAnimationSystem,
  MIN_HOLD_DURATION_MS,
  MAX_HOLD_DURATION_MS,
  DEFAULT_HOLD_DURATION_MS,
  DEFAULT_ANIMATION_IN_MS,
  DEFAULT_ANIMATION_OUT_MS,
};
