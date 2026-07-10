'use strict';

const { FirstTickSequence } = require('./FirstTickSequence');
const { CameraAnimationSystem } = require('./CameraAnimationSystem');
const { BalanceWheelHighlightEffect } = require('./BalanceWheelHighlightEffect');
const { BalanceWheelOscillationController } = require('./BalanceWheelOscillationController');
const { PlayerInputSuspension } = require('./PlayerInputSuspension');
const { AUDIO_CUES } = require('./FirstTickAudioController');

function cloneValue(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function addOffset(baseValue, deltaMap) {
  const result = cloneValue(baseValue) || {};
  Object.keys(deltaMap).forEach((key) => {
    if (typeof result[key] === 'number') {
      result[key] += deltaMap[key];
    } else if (result[key] === undefined) {
      result[key] = deltaMap[key];
    }
  });
  return result;
}

class FirstTickCinematicController {
  constructor({
    audioHook,
    instrumentationHook = null,
    savedViewProvider = () => ({ position: {}, angle: {} }),
    highlightRenderer,
    inputManager,
    audioEnabled = true,
    silenceGateMs = 0,
    holdDurationMs = 2000,
    totalWindSteps,
    tensionWindowSteps,
    bphProvider = null,
    oscillationController = null,
  } = {}) {
    this._savedViewProvider = typeof savedViewProvider === 'function' ? savedViewProvider : () => ({ position: {}, angle: {} });
    this._instrumentationHook = typeof instrumentationHook === 'function' ? instrumentationHook : null;
    this._highlight = new BalanceWheelHighlightEffect({ highlightRenderer });
    this._inputSuspension = new PlayerInputSuspension({ inputManager });
    this._activeWatchId = null;
    // Tracks the watchId passed to prepareForWatch so _startCinematic can resolve
    // it even when the audio hook does not forward a payload (main API compat).
    this._currentWatchId = null;

    // Issue #147: bph provider — injected at construction time (DI pattern).
    // Called with watchId at prepareForWatch(); resolved bph is used to start
    // the oscillation animation in _startCinematic().
    // Defaults to null provider (no animation); the game integration layer injects
    // (watchId) => movementData.getBph(watchId) at boot time.
    this._bphProvider = typeof bphProvider === 'function' ? bphProvider : null;

    // Issue #147: balance-wheel oscillation controller — injected for testability.
    // Defaults to a real BalanceWheelOscillationController instance.
    this._oscillation = (oscillationController instanceof BalanceWheelOscillationController)
      ? oscillationController
      : new BalanceWheelOscillationController();

    // bph resolved for the current watch at prepareForWatch() time (Issue #147).
    this._currentBph = null;

    this._camera = new CameraAnimationSystem({
      savedViewProvider: this._savedViewProvider,
      holdDurationMs,
      onAnimationComplete: () => this._completeCinematic(),
    });

    this._phase1 = new FirstTickSequence({
      audioEnabled,
      silenceGateMs,
      totalWindSteps,
      tensionWindowSteps,
      instrumentationHook: (eventName, payload) => this._emitInstrumentation(eventName, payload),
      audioHook: (cueId, payload) => {
        // Enrich payload with watchId when missing (main-style controller compat:
        // main's FirstTickAudioController calls audioHook(cueId) with no second arg).
        const enrichedPayload = payload && payload.watchId != null
          ? payload
          : Object.assign({ watchId: this._currentWatchId, cueId, firedAtMs: Date.now() }, payload || {});

        if (typeof audioHook === 'function') {
          audioHook(cueId, enrichedPayload);
        }

        if (cueId === AUDIO_CUES.FIRST_TICK) {
          this._startCinematic(enrichedPayload.watchId || this._currentWatchId);
        }
      },
    });
  }

  prepareForWatch(watchId, assembledCorrectly) {
    this._currentWatchId = watchId;  // cache for _startCinematic fallback (main API compat)
    this._activeWatchId = null;

    // Issue #147: resolve bph at prepareForWatch time so _startCinematic has it
    // synchronously when AUDIO_CUES.FIRST_TICK fires (Constraint #4 / Design Decision).
    this._currentBph = (this._bphProvider && watchId)
      ? (this._bphProvider(watchId) || null)
      : null;

    return this._phase1.prepareForWatch(watchId, assembledCorrectly);
  }

  onWindStep(steps) {
    // Detect re-wind suppression: if this watchId was already activated, the
    // dramatic first-tick sequence will not re-fire (AC4 gate in FirstTickSequence).
    const alreadyActivated = this._currentWatchId != null
      && this._phase1.hasActivated(this._currentWatchId);
    const result = this._phase1.onWindStep(steps);
    if (alreadyActivated) {
      return { suppressed: true };
    }
    return result;
  }

  abort() {
    this._phase1.abort();
    this._camera.abort();
    this._highlight.deactivateAll();
    this._inputSuspension.forceResume();
    this._oscillation.stop();   // Issue #147: clean scene-boundary teardown (Constraint #8)
    this._activeWatchId = null;
    this._emitInstrumentation('first_tick_cinematic_aborted', {});
  }

  hasActivated(watchId) {
    return this._phase1.hasActivated(watchId);
  }

  getCinematicState() {
    return this._camera.getCameraState();
  }

  getAudioController() {
    return this._phase1.getAudioController();
  }

  getCameraSystem() {
    return this._camera;
  }

  getHighlightEffect() {
    return this._highlight;
  }

  getInputSuspension() {
    return this._inputSuspension;
  }

  /** @returns {BalanceWheelOscillationController} The oscillation controller (Issue #147). */
  getOscillationController() {
    return this._oscillation;
  }

  _startCinematic(watchId) {
    if (!watchId || this._camera.isAnimating()) {
      return;
    }

    this._activeWatchId = watchId;
    this._inputSuspension.suspend();
    this._highlight.activate(watchId);

    // Issue #147: start balance-wheel oscillation at the frequency resolved for
    // this watch (Constraint #4 — bph from movement data, never hardcoded).
    // Fail-safe: if bph is null/zero, start() is a no-op (no wrong animation).
    this._oscillation.start(this._currentBph);

    const targetView = this._buildCloseUpTarget();
    this._camera.animateTo(targetView, {
      onComplete: () => this._camera.hold(),
    });

    this._emitInstrumentation('first_tick_cinematic_started', {
      watchId,
      startedAtMs: Date.now(),
    });
  }

  _buildCloseUpTarget() {
    const savedView = this._savedViewProvider() || {};
    const position = addOffset(savedView.position, { z: -0.35, y: 0.05 });
    const angle = addOffset(savedView.angle, { pitch: 12 });

    return {
      position,
      angle,
      focus: 'balance_wheel',
    };
  }

  _completeCinematic() {
    const watchId = this._activeWatchId;
    this._inputSuspension.resume();
    if (watchId) {
      this._highlight.deactivate(watchId);
    }
    this._oscillation.stop();   // Issue #147: stop oscillation when scene completes (Constraint #8)
    this._activeWatchId = null;
    this._emitInstrumentation('first_tick_cinematic_completed', {
      watchId,
      completedAtMs: Date.now(),
    });
  }

  _emitInstrumentation(eventName, payload) {
    if (this._instrumentationHook) {
      this._instrumentationHook(eventName, payload);
    }
  }
}

module.exports = { FirstTickCinematicController };
