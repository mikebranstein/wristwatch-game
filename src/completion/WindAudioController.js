/**
 * WindAudioController — manages the three-phase dramatic audio sequence for
 * first-tick presentation on successful watch activation.
 *
 * Phase 1 — TENSION_RAMP:  plays tension/silence audio during final wind steps
 * Phase 2 — AWAITING_TICK: enforces the 0.5–1.5 s silence period (AC1) then fires first tick
 * Phase 3 — FIRST_TICK:    fires the distinct first-tick one-shot sound
 * Phase 4 — TICKING_LOOP:  crossfades seamlessly into the normal ticking loop (AC3)
 *
 * Design pattern matches RevealAudioController from Issue #53: audioHook is
 * injected at construction so the caller controls actual audio playback;
 * this module is responsible only for timing enforcement and phase transitions.
 *
 * Acceptance criteria covered:
 *   AC1 — silence/tension period (0.5–1.5 s) enforced before first tick fires via setTimeout
 *   AC2 — first_tick cue ID is distinct from tension_ramp and ticking_loop
 *   AC3 — ticking_loop fires immediately after first_tick (seamless crossfade)
 *   AC5 — audioEnabled flag: when false all audio methods are no-ops; no errors thrown
 */

'use strict';

/** Phase identifiers for the audio state machine. */
const PHASES = {
  IDLE:          'idle',
  TENSION_RAMP:  'tension_ramp',
  AWAITING_TICK: 'awaiting_tick',
  FIRST_TICK:    'first_tick',
  TICKING_LOOP:  'ticking_loop',
};

/** Audio cue IDs — intentionally distinct from each other and from UI feedback cues (AC2). */
const CUE_IDS = {
  TENSION_RAMP: 'tension_ramp',
  FIRST_TICK:   'first_tick',
  TICKING_LOOP: 'ticking_loop',
};

/**
 * Default silence/tension delay before first tick fires (ms).
 * AC1: the delay must be between 0.5 s and 1.5 s (500–1500 ms).
 */
const DEFAULT_TENSION_DELAY_MS = 1000;

/** AC constraint: tension build-up must not exceed 2 seconds to avoid feeling like a freeze. */
const MAX_TENSION_DELAY_MS = 2000;

/** Minimum allowed tension delay (AC1: ≥ 500 ms). */
const MIN_TENSION_DELAY_MS = 500;

class WindAudioController {
  /**
   * @param {Function} audioHook            - (cueId: string) => void
   * @param {Object}   [opts]
   * @param {boolean}  [opts.audioEnabled=true]    - AC5: when false all methods are no-ops
   * @param {number}   [opts.tensionDelayMs=1000]  - AC1: delay in ms between activation and first tick
   * @param {Function} [opts.setTimeoutFn]         - injectable timer for testing
   * @param {Function} [opts.clearTimeoutFn]       - injectable timer cancellation for testing
   */
  constructor(audioHook, opts = {}) {
    if (typeof audioHook !== 'function') {
      throw new Error('WindAudioController requires an audioHook function.');
    }

    const {
      audioEnabled    = true,
      tensionDelayMs  = DEFAULT_TENSION_DELAY_MS,
      setTimeoutFn    = setTimeout,
      clearTimeoutFn  = clearTimeout,
    } = opts;

    this._audioHook    = audioHook;
    this._audioEnabled = audioEnabled;

    // Clamp delay within the AC1-specified window
    this._tensionDelayMs = Math.max(
      MIN_TENSION_DELAY_MS,
      Math.min(tensionDelayMs, MAX_TENSION_DELAY_MS)
    );

    this._setTimeout   = setTimeoutFn;
    this._clearTimeout = clearTimeoutFn;

    this._phase              = PHASES.IDLE;
    this._tensionTimer       = null;
    this._onFirstTickFired   = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Phase 1: play the tension/silence ramp audio cue.
   * Called when the player enters the final wind steps before activation threshold.
   * No-op if audio is disabled (AC5) or if a sequence is already in progress.
   */
  startTensionRamp() {
    if (!this._audioEnabled) return;
    if (this._phase !== PHASES.IDLE) return; // already in sequence

    this._phase = PHASES.TENSION_RAMP;
    this._audioHook(CUE_IDS.TENSION_RAMP);
  }

  /**
   * Phase 2: schedule the first-tick after the silence/tension delay (AC1).
   * Called when the balance wheel reaches its activation threshold.
   *
   * When audio is disabled (AC5), invokes the callback immediately without
   * playing any audio — game state must still advance normally.
   *
   * @param {Function} [onFirstTickFired] - optional callback invoked after first-tick fires
   */
  scheduleFirstTick(onFirstTickFired = null) {
    // AC5: audio disabled — advance state without playing audio
    if (!this._audioEnabled) {
      if (typeof onFirstTickFired === 'function') onFirstTickFired();
      return;
    }

    // Cancel any stale timer (idempotent)
    if (this._tensionTimer !== null) {
      this._clearTimeout(this._tensionTimer);
      this._tensionTimer = null;
    }

    this._onFirstTickFired = onFirstTickFired;
    this._phase            = PHASES.AWAITING_TICK;

    // AC1: silence delay of tensionDelayMs before first tick fires
    this._tensionTimer = this._setTimeout(() => {
      this._tensionTimer = null;
      this._fireFirstTick();
    }, this._tensionDelayMs);
  }

  /**
   * Cancel any pending tension timer and return to IDLE.
   * Called when the balance wheel fails to activate (incorrect assembly) or
   * when navigating away during the tension ramp (scene/state transitions).
   */
  cancelRamp() {
    if (this._tensionTimer !== null) {
      this._clearTimeout(this._tensionTimer);
      this._tensionTimer = null;
    }
    this._phase          = PHASES.IDLE;
    this._onFirstTickFired = null;
  }

  /**
   * Full stop and reset — cancels any pending timer and returns to IDLE.
   * Called by FirstTickSequence.destroy() on scene/state transitions.
   */
  stop() {
    this.cancelRamp();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string} Current phase identifier. */
  getPhase() { return this._phase; }

  /** @returns {boolean} True when a tension/silence timer is scheduled. */
  isFirstTickPending() { return this._tensionTimer !== null; }

  /** @returns {boolean} Whether audio is enabled. */
  isAudioEnabled() { return this._audioEnabled; }

  /** @returns {number} The configured tension delay in milliseconds. */
  getTensionDelayMs() { return this._tensionDelayMs; }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fire the first-tick cue then immediately start the ticking loop (AC3: seamless crossfade).
   * @private
   */
  _fireFirstTick() {
    // AC2: distinct first_tick cue (not 'tension_ramp', not 'ticking_loop', not UI sound)
    this._phase = PHASES.FIRST_TICK;
    this._audioHook(CUE_IDS.FIRST_TICK);

    // AC3: ticking loop starts immediately after first tick — seamless crossfade, no gap
    this._phase = PHASES.TICKING_LOOP;
    this._audioHook(CUE_IDS.TICKING_LOOP);

    const cb = this._onFirstTickFired;
    this._onFirstTickFired = null;
    if (typeof cb === 'function') cb();
  }
}

module.exports = {
  WindAudioController,
  PHASES,
  CUE_IDS,
  DEFAULT_TENSION_DELAY_MS,
  MAX_TENSION_DELAY_MS,
  MIN_TENSION_DELAY_MS,
};
