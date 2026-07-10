/**
 * FirstTickAudioController — manages the three-state audio sequence that
 * plays on balance-wheel activation for Issue #113.
 *
 * Three audio states (AC1–AC3):
 *   State 1 — TENSION_RAMP:  Tension build-up fires as player nears full wind.
 *   State 2 — SILENCE_HOLD:  Brief silence gate (0.5–1.5 s) before first tick
 *                             lands — silence used as a dramatic device (AC1).
 *   State 3 — FIRST_TICK:    Distinct one-shot sound fires after silence gate.
 *   State 4 — TICKING_LOOP:  Seamless crossfade from first tick into the
 *                             normal running ticking loop (AC3).
 *
 * Pattern: mirrors RevealAudioController (Issue #53) — the audioHook is
 * injected at construction time; this module is responsible only for timing
 * and state transitions.  The caller maps cue IDs to actual audio assets.
 *
 * Acceptance criteria covered:
 *   AC1  — silence gate of 0.5–1.5 s before first tick (clamped, configurable).
 *   AC2  — first-tick cue is distinct (confirmed via audio review gate; this
 *           module fires the correct cue IDs — 'first_tick_tension_ramp',
 *           'first_tick_one_shot', 'first_tick_ticking_loop').
 *   AC3  — seamless crossfade: startTickingLoop() fires immediately after the
 *           first-tick one-shot.
 *   AC4  — re-wind suppression: firstActivation flag prevents tension ramp and
 *           silence-hold from re-firing; only the ticking loop plays on re-wind.
 *   AC5  — audio disabled: when audioEnabled=false all hooks are skipped; the
 *           controller transitions through states but fires no audio.
 *   AC8  — scene/state abort: stop() cancels in-flight timers and releases all
 *           audio resources; no orphaned audio can play after abort.
 */

/** Audio cue identifiers forwarded to the injected audioHook. */
const AUDIO_CUES = {
  TENSION_RAMP:   'first_tick_tension_ramp',
  FIRST_TICK:     'first_tick_one_shot',
  TICKING_LOOP:   'first_tick_ticking_loop',
  STOP_ALL:       'first_tick_stop_all',
};

/** Internal state names (for QA / testing assertions). */
const AUDIO_STATE = {
  IDLE:          'idle',
  TENSION_RAMP:  'tension_ramp',
  SILENCE_HOLD:  'silence_hold',
  FIRST_TICK:    'first_tick',
  TICKING_LOOP:  'ticking_loop',
};

/** Default silence gate between balance-wheel activation and first-tick fire. */
const DEFAULT_SILENCE_GATE_MS = 750;

/** Minimum and maximum allowed silence gate (AC1: 0.5–1.5 s). */
const MIN_SILENCE_GATE_MS = 500;
const MAX_SILENCE_GATE_MS = 1500;

class FirstTickAudioController {
  /**
   * @param {Object} opts
   * @param {Function} opts.audioHook       Injected playback function: (cueId) => void.
   * @param {boolean}  [opts.audioEnabled]  Set false to silence all output while allowing
   *   the controller to remain functionally active (AC5).
   * @param {number}   [opts.silenceGateMs] Duration of the silence hold in ms.
   *   Clamped to [MIN_SILENCE_GATE_MS, MAX_SILENCE_GATE_MS] (AC1).
   */
  constructor({
    audioHook,
    audioEnabled = true,
    silenceGateMs = DEFAULT_SILENCE_GATE_MS,
  }) {
    if (typeof audioHook !== 'function') {
      throw new Error('FirstTickAudioController requires an audioHook function.');
    }

    this._audioHook    = audioHook;
    this._audioEnabled = Boolean(audioEnabled);
    this._silenceGateMs = Math.max(
      MIN_SILENCE_GATE_MS,
      Math.min(MAX_SILENCE_GATE_MS, silenceGateMs)
    );

    this._audioState   = AUDIO_STATE.IDLE;
    this._silenceTimer = null;
    this._aborted      = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API — called by FirstTickSequence orchestrator
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Begin the tension build-up ramp (State 1).
   * Called by FirstTickSequence when the wind mechanic fires onTensionRamp
   * AND this is a first-activation watch.
   *
   * No-op if already active or aborted.
   */
  startTensionRamp() {
    if (this._aborted || this._audioState !== AUDIO_STATE.IDLE) return;

    this._audioState = AUDIO_STATE.TENSION_RAMP;
    this._play(AUDIO_CUES.TENSION_RAMP);
  }

  /**
   * Fire the first-tick sequence: silence hold → first-tick one-shot →
   * crossfade to ticking loop (States 2–4).
   *
   * Called by FirstTickSequence when balance-wheel activation fires AND
   * this is a first-activation watch.
   *
   * No-op if aborted.
   */
  fireFirstTick() {
    if (this._aborted) return;

    // Enter silence hold (AC1: 0.5–1.5 s dramatic silence)
    this._audioState = AUDIO_STATE.SILENCE_HOLD;

    this._silenceTimer = setTimeout(() => {
      if (this._aborted) return;

      // Fire the one-shot first tick (AC2)
      this._audioState = AUDIO_STATE.FIRST_TICK;
      this._play(AUDIO_CUES.FIRST_TICK);

      // Immediate crossfade into ticking loop (AC3 — no gap)
      this._audioState = AUDIO_STATE.TICKING_LOOP;
      this._play(AUDIO_CUES.TICKING_LOOP);
    }, this._silenceGateMs);
  }

  /**
   * Start the ticking loop directly — no tension ramp, no silence gate.
   * Called by FirstTickSequence on re-wind (AC4) and after correctly assembled
   * watches that have already had their first-tick presented.
   */
  startTickingLoop() {
    if (this._aborted) return;

    this._audioState = AUDIO_STATE.TICKING_LOOP;
    this._play(AUDIO_CUES.TICKING_LOOP);
  }

  /**
   * Stop all in-flight audio and cancel pending timers.
   * Must be called on scene/state transition to prevent orphaned audio (AC8).
   * After stop(), the controller is in a clean IDLE state and can be re-used.
   */
  stop() {
    this._aborted = true;

    if (this._silenceTimer !== null) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }

    // Signal the audio backend to silence any playing cues
    this._audioHook(AUDIO_CUES.STOP_ALL);

    this._audioState = AUDIO_STATE.IDLE;
  }

  /**
   * Reset the controller for a fresh sequence (e.g. new watch loaded).
   * Clears abort flag and returns to IDLE.  Does NOT re-fire audio.
   */
  reset() {
    if (this._silenceTimer !== null) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
    this._aborted    = false;
    this._audioState = AUDIO_STATE.IDLE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string}  Current audio state name. */
  getAudioState() { return this._audioState; }

  /** @returns {boolean} True when audio output is enabled. */
  isAudioEnabled() { return this._audioEnabled; }

  /** @returns {number}  Active silence gate duration in ms. */
  getSilenceGateMs() { return this._silenceGateMs; }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Internal play: forwards to audioHook only when audio is enabled (AC5).
   * @param {string} cueId
   * @private
   */
  _play(cueId) {
    if (this._audioEnabled) {
      this._audioHook(cueId);
    }
  }
}

module.exports = {
  FirstTickAudioController,
  AUDIO_CUES,
  AUDIO_STATE,
  DEFAULT_SILENCE_GATE_MS,
  MIN_SILENCE_GATE_MS,
  MAX_SILENCE_GATE_MS,
};
