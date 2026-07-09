/**
 * FirstTickSequence — orchestrates the dramatic first-tick audio presentation
 * when a player successfully winds a watch and the balance wheel activates.
 *
 * Implements: Issue #113 — First-Tick Audio Presentation, Phase 1
 *
 * Wires together (following the CleaningRevealSequence DI pattern):
 *   1. WindAudioController — three-phase audio sequence:
 *        tension ramp → silence/tension delay → first-tick one-shot → ticking loop crossfade
 *   2. TelemetryEmitter    — lifecycle event tracking for all sequence milestones
 *
 * Key design decisions:
 *   - Per-watch first-activation Map suppresses the dramatic sequence on re-wind (AC4).
 *     A watch is only eligible for the dramatic sequence on its very first activation.
 *   - Audio-disabled safety (AC5): when audioEnabled=false the sequence proceeds
 *     without errors, emits telemetry normally, and the game remains fully functional.
 *   - Scene/state transition safety (Test Scenario 8): destroy() cancels any
 *     in-flight tension timer so no orphaned audio fires after navigation.
 *   - Balance-wheel failure (Test Scenario 7): onActivationFailed() cancels the ramp;
 *     the watch is NOT marked as activated so the drama can still play on a future
 *     correct assembly attempt.
 *   - Multiple watches per session (Test Scenario 5): each watchId tracks its own
 *     activation state independently.
 */

'use strict';

const { WindAudioController } = require('./WindAudioController');
const { TelemetryEmitter }    = require('../telemetry/TelemetryEmitter');

/** Named telemetry events emitted by this orchestrator. */
const FIRST_TICK_EVENTS = {
  TENSION_RAMP_STARTED: 'first_tick_tension_ramp_started',
  FIRST_TICK_FIRED:     'first_tick_fired',
  TICKING_LOOP_STARTED: 'first_tick_ticking_loop_started',
  REWOUND_NO_DRAMA:     'first_tick_rewound_no_drama',
  ACTIVATION_FAILED:    'first_tick_activation_failed',
  SEQUENCE_DESTROYED:   'first_tick_sequence_destroyed',
};

class FirstTickSequence {
  /**
   * @param {Object}   opts
   * @param {Function} opts.audioHook              - (cueId: string) => void
   * @param {Function} opts.instrumentationHook    - (eventName, payload) => void
   * @param {boolean}  [opts.audioEnabled=true]    - AC5: when false, all audio is no-op
   * @param {number}   [opts.tensionDelayMs]       - AC1: override tension delay for testing
   * @param {Function} [opts.setTimeoutFn]         - injectable timer for testing
   * @param {Function} [opts.clearTimeoutFn]       - injectable timer cancellation for testing
   */
  constructor({
    audioHook,
    instrumentationHook,
    audioEnabled   = true,
    tensionDelayMs,
    setTimeoutFn,
    clearTimeoutFn,
  }) {
    this._telemetry = new TelemetryEmitter(instrumentationHook);

    const audioOpts = { audioEnabled };
    if (tensionDelayMs !== undefined) audioOpts.tensionDelayMs = tensionDelayMs;
    if (setTimeoutFn   !== undefined) audioOpts.setTimeoutFn   = setTimeoutFn;
    if (clearTimeoutFn !== undefined) audioOpts.clearTimeoutFn = clearTimeoutFn;

    this._audioController = new WindAudioController(audioHook, audioOpts);

    // AC4: per-watch first-activation flag — keyed by watchId
    this._activatedWatches = new Map();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Wind / activation events
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called when the player enters the final wind steps before the balance wheel
   * activation threshold.
   *
   * If this is the watch's first activation, starts the tension ramp (AC1).
   * If the watch is already running (re-wind), nothing happens (AC4).
   *
   * @param {string} watchId - unique identifier for the watch being wound
   */
  onFinalWindSteps(watchId) {
    if (this._isAlreadyActivated(watchId)) {
      // AC4: re-wind on running watch — no dramatic tension build-up
      return;
    }

    this._audioController.startTensionRamp();
    this._telemetry.emit(FIRST_TICK_EVENTS.TENSION_RAMP_STARTED, { watchId });
  }

  /**
   * Called when the balance wheel reaches its activation threshold successfully.
   *
   * First activation:
   *   Marks the watch as activated, then schedules the first-tick sequence after
   *   the silence/tension delay (AC1). Once the first tick fires, the ticking loop
   *   crossfades in (AC3) and telemetry events are emitted.
   *
   * Re-wind (watch already running):
   *   No dramatic sequence replays — only the REWOUND_NO_DRAMA event is emitted (AC4).
   *
   * @param {string} watchId
   */
  onBalanceWheelActivated(watchId) {
    if (this._isAlreadyActivated(watchId)) {
      // AC4: already activated watch — suppress re-wind drama entirely
      this._telemetry.emit(FIRST_TICK_EVENTS.REWOUND_NO_DRAMA, { watchId });
      return;
    }

    // Mark as activated BEFORE scheduling the tick (guards against double-calls)
    this._activatedWatches.set(watchId, true);

    this._audioController.scheduleFirstTick(() => {
      // Callback fires after the silence delay; first-tick and ticking-loop have played
      this._telemetry.emit(FIRST_TICK_EVENTS.FIRST_TICK_FIRED, { watchId });
      this._telemetry.emit(FIRST_TICK_EVENTS.TICKING_LOOP_STARTED, { watchId });
    });
  }

  /**
   * Called when the balance wheel fails to activate (e.g. incorrect assembly).
   * Cancels any in-flight tension ramp so no orphaned audio plays (Test Scenario 7).
   * The watch is NOT marked as activated — a future correct assembly can still
   * trigger the full dramatic sequence.
   *
   * @param {string} watchId
   */
  onActivationFailed(watchId) {
    this._audioController.cancelRamp();
    this._telemetry.emit(FIRST_TICK_EVENTS.ACTIVATION_FAILED, { watchId });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State queries
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns true if the watch has already had its dramatic first-tick presentation.
   * Subsequent winds on this watch will not trigger the sequence (AC4).
   *
   * @param {string} watchId
   * @returns {boolean}
   */
  hasWatchActivated(watchId) {
    return this._activatedWatches.get(watchId) === true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cleanup — cancels any in-flight tension timer and releases audio resources.
   * Must be called when navigating away from the wind/winding phase (Test Scenario 8).
   * No orphaned audio will fire after this call.
   */
  destroy() {
    this._audioController.stop();
    this._telemetry.emit(FIRST_TICK_EVENTS.SEQUENCE_DESTROYED, {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {WindAudioController} The internal audio controller. */
  getAudioController() { return this._audioController; }

  /** @returns {TelemetryEmitter} The internal telemetry emitter. */
  getTelemetry() { return this._telemetry; }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {string} watchId
   * @returns {boolean}
   * @private
   */
  _isAlreadyActivated(watchId) {
    return this._activatedWatches.get(watchId) === true;
  }
}

module.exports = { FirstTickSequence, FIRST_TICK_EVENTS };
