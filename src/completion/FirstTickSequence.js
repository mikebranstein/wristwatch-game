/**
 * FirstTickSequence — top-level orchestrator for the first-tick audio
 * presentation (Issue #113, Phase 1).
 *
 * Wires together:
 *   1. WindMechanic             — tension-ramp hook on final wind steps (AC1)
 *   2. BalanceWheelActivation   — hookable trigger on balance-wheel onset (AC1)
 *   3. FirstTickAudioController — three-state audio sequence: tension ramp →
 *                                 silence hold → first-tick one-shot →
 *                                 ticking-loop crossfade (AC1–AC3)
 *   4. TelemetryEmitter         — lifecycle events for analytics
 *
 * Per-watch first-activation state:
 *   The orchestrator tracks which watchIds have already fired the full
 *   dramatic sequence.  On re-wind, only the ticking loop is presented;
 *   the tension ramp and silence-hold do NOT replay (AC4).
 *
 * Design pattern mirrors CleaningRevealSequence (Issue #53): DI at
 * construction time; the caller injects audioHook, instrumentationHook,
 * and optional config overrides.  This module is responsible only for
 * wiring and per-watch state.
 *
 * Acceptance criteria covered:
 *   AC1  — tension ramp fires before first tick; silence gate enforced by
 *           FirstTickAudioController.
 *   AC2  — first-tick cue ID ('first_tick_one_shot') is distinct from loop
 *           ('first_tick_ticking_loop') — audio review gate in AC2 confirms
 *           asset quality; this module routes the correct cue IDs.
 *   AC3  — seamless crossfade handled by FirstTickAudioController.fireFirstTick().
 *   AC4  — _activatedWatches Set suppresses drama on re-wind.
 *   AC5  — audioEnabled=false: FirstTickAudioController silences all hooks;
 *           no errors, game functional.
 *   AC7  — incorrect assembly: WindMechanic.setAssembledCorrectly(false)
 *           suppresses onActivationThreshold; no first-tick fires.
 *   AC8  — abort() cancels in-flight audio/timers; no orphaned audio.
 *   AC9  — ticking-loop asset designed for seamless loop (audio asset concern;
 *           this orchestrator routes to the correct ticking-loop cue).
 *  AC10  — existing audio events are additive; no prior event IDs or hooks
 *           are modified.
 */

const { WindMechanic } = require('./WindMechanic');
const { BalanceWheelActivation } = require('./BalanceWheelActivation');
const { FirstTickAudioController } = require('./FirstTickAudioController');
const { TelemetryEmitter, EVENTS } = require('../telemetry/TelemetryEmitter');

/** Telemetry event names emitted by this orchestrator. */
const FIRST_TICK_EVENTS = {
  TENSION_RAMP_STARTED:       'first_tick_tension_ramp_started',
  FIRST_TICK_FIRED:           'first_tick_fired',
  TICKING_LOOP_STARTED:       'first_tick_ticking_loop_started',
  REWOUND_NO_DRAMA:           'first_tick_rewound_no_drama',
  SEQUENCE_ABORTED:           'first_tick_sequence_aborted',
  INCORRECT_ASSEMBLY_ABORTED: 'first_tick_incorrect_assembly_no_tick',
};

class FirstTickSequence {
  /**
   * @param {Object} opts
   * @param {Function} opts.audioHook           Injected audio hook: (cueId) => void.
   * @param {Function} opts.instrumentationHook Telemetry hook: (eventName, payload) => void.
   * @param {boolean}  [opts.audioEnabled]      false to silence output (AC5).
   * @param {number}   [opts.silenceGateMs]     Silence hold before first tick (AC1, default 750 ms).
   * @param {number}   [opts.totalWindSteps]    Override wind step count (useful in tests).
   * @param {number}   [opts.tensionWindowSteps] Override tension window (useful in tests).
   */
  constructor({
    audioHook,
    instrumentationHook,
    audioEnabled = true,
    silenceGateMs,
    totalWindSteps,
    tensionWindowSteps,
  }) {
    this._telemetry = new TelemetryEmitter(instrumentationHook);
    this._audio = new FirstTickAudioController({
      audioHook,
      audioEnabled,
      ...(silenceGateMs !== undefined ? { silenceGateMs } : {}),
    });

    // Per-watch state: Set of watchIds that have already fired the full
    // dramatic first-tick sequence (AC4 — re-wind suppression).
    this._activatedWatches = new Set();

    // Current watch context
    this._currentWatchId = null;

    // Wind mechanic — wired with hooks
    const windMechanicOpts = {};
    if (totalWindSteps !== undefined)    windMechanicOpts.totalWindSteps = totalWindSteps;
    if (tensionWindowSteps !== undefined) windMechanicOpts.tensionWindowSteps = tensionWindowSteps;

    this._wind = new WindMechanic({
      ...windMechanicOpts,
      onTensionRamp: () => this._handleTensionRamp(),
      onActivationThreshold: () => this._handleActivationThreshold(),
    });

    // Balance wheel activation — wired to orchestrator handler
    this._balanceWheel = new BalanceWheelActivation({
      onActivate: (watchId) => this._handleBalanceWheelActivate(watchId),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle — called by the game layer
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Prepare the sequence for a specific watch instance.
   * Must be called before the player begins winding.
   *
   * @param {string}  watchId          Unique watch identifier.
   * @param {boolean} assembledCorrectly  Whether the watch is correctly assembled.
   */
  prepareForWatch(watchId, assembledCorrectly) {
    // Reset wind and balance-wheel state for this watch
    this._currentWatchId = watchId;
    this._audio.reset();
    this._wind.reset();
    this._wind.setAssembledCorrectly(assembledCorrectly);
    this._balanceWheel.reset();
  }

  /**
   * Advance the wind interaction by `steps` (default 1).
   * Delegates to WindMechanic; hooks fire automatically when thresholds are reached.
   *
   * @param {number} [steps]
   * @returns {number}  New wind step count.
   */
  onWindStep(steps = 1) {
    return this._wind.wind(steps);
  }

  /**
   * Abort all in-flight audio and cancel pending timers.
   * Call on scene navigation or any mid-sequence state transition (AC8).
   */
  abort() {
    this._audio.stop();
    this._telemetry.emit(FIRST_TICK_EVENTS.SEQUENCE_ABORTED, {
      watchId: this._currentWatchId,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private handlers — wired to WindMechanic and BalanceWheelActivation hooks
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called by WindMechanic.onTensionRamp when the player reaches the tension window.
   * Starts the tension build-up audio only on first-activation watches (AC4).
   * @private
   */
  _handleTensionRamp() {
    const isFirstActivation = !this._activatedWatches.has(this._currentWatchId);

    if (isFirstActivation) {
      this._audio.startTensionRamp();
      this._telemetry.emit(FIRST_TICK_EVENTS.TENSION_RAMP_STARTED, {
        watchId: this._currentWatchId,
        isFirstActivation: true,
      });
    }
    // Re-wind: tension ramp is silently suppressed (no telemetry noise needed)
  }

  /**
   * Called by WindMechanic.onActivationThreshold when watch is fully wound
   * and correctly assembled.  Delegates to BalanceWheelActivation.
   * @private
   */
  _handleActivationThreshold() {
    this._balanceWheel.activate(this._currentWatchId);
  }

  /**
   * Called by BalanceWheelActivation.onActivate — the hookable trigger.
   * Routes to first-tick sequence or re-wind ticking loop based on prior state (AC4).
   *
   * @param {string} watchId
   * @private
   */
  _handleBalanceWheelActivate(watchId) {
    const isFirstActivation = !this._activatedWatches.has(watchId);

    if (isFirstActivation) {
      // Mark as activated BEFORE firing audio so concurrent re-entry is safe
      this._activatedWatches.add(watchId);

      // Fire the three-state sequence: silence hold → first tick → ticking loop (AC1–AC3)
      this._audio.fireFirstTick();

      this._telemetry.emit(FIRST_TICK_EVENTS.FIRST_TICK_FIRED, {
        watchId,
        isFirstActivation: true,
      });
    } else {
      // Re-wind: skip drama, start ticking loop only (AC4)
      this._audio.startTickingLoop();

      this._telemetry.emit(FIRST_TICK_EVENTS.REWOUND_NO_DRAMA, {
        watchId,
        isFirstActivation: false,
      });
    }

    this._telemetry.emit(FIRST_TICK_EVENTS.TICKING_LOOP_STARTED, { watchId });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {boolean} True if watchId has had its first-tick sequence fire. */
  hasActivated(watchId) { return this._activatedWatches.has(watchId); }

  /** @returns {string} Current audio state (for QA assertions). */
  getAudioState() { return this._audio.getAudioState(); }

  /** @returns {WindMechanic} Internal wind mechanic (for testing). */
  getWindMechanic() { return this._wind; }

  /** @returns {BalanceWheelActivation} Internal balance wheel (for testing). */
  getBalanceWheel() { return this._balanceWheel; }

  /** @returns {TelemetryEmitter} Internal telemetry emitter (for testing). */
  getTelemetry() { return this._telemetry; }

  /** @returns {FirstTickAudioController} Internal audio controller (for testing). */
  getAudioController() { return this._audio; }
}

module.exports = { FirstTickSequence, FIRST_TICK_EVENTS };
