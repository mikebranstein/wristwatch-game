/**
 * CompletionRevealAudioController — audio controller for the job-completion
 * hero-shot reveal.
 * Issue #141 — Full-Watch Completion Reveal: Core System
 *
 * Responsibilities:
 *   - Fire the distinct completion-reveal audio cue when the reveal screen
 *     triggers (AC3).
 *   - Ensure the cue is perceptibly distinct from and escalates above the
 *     SO #50 Cleaning Reveal audio cue (validated in QA via side-by-side
 *     audio comparison — AC3).
 *   - Support audio-disabled mode (audioEnabled=false) for accessibility /
 *     user preference without breaking game flow.
 *   - Support stop() for scene/state transitions (no orphaned audio).
 *
 * Design decisions (per approved design, Issue #141):
 *   - Follows the same pattern as FirstTickAudioController (Issue #113) and
 *     RevealAudioController (Issue #53): the audioHook is injected at
 *     construction time; this module is responsible only for timing and state.
 *   - Uses existing audio middleware only; no new frameworks (Constraint:
 *     engine and audio pipeline).
 *   - The completion audio cue ID ('completion_reveal_fanfare') must be
 *     delivered as a standard game audio asset matching the existing audio
 *     asset specification (Constraint: audio asset delivery).
 *   - This module is fully testable in isolation (no DOM / UI dependencies).
 *
 * Acceptance criteria covered:
 *   AC3  — distinct completion audio cue fires during reveal.
 *   AC5  — audio plays but reveal remains dismissable; stop() does not block
 *          game progress.
 */

'use strict';

/** Audio cue identifiers forwarded to the injected audioHook. */
const COMPLETION_AUDIO_CUES = {
  /**
   * Primary completion reveal fanfare.
   * Must be perceptibly more climactic than the SO #50 Cleaning Reveal cue
   * ('cleaning_reveal_sting') — validated via QA side-by-side comparison (AC3).
   */
  FANFARE:  'completion_reveal_fanfare',

  /** Stop-all signal sent to the audio backend on stop(). */
  STOP_ALL: 'completion_reveal_stop_all',
};

/** Internal audio states (for QA / testing assertions). */
const COMPLETION_AUDIO_STATE = {
  IDLE:    'idle',
  PLAYING: 'playing',
  STOPPED: 'stopped',
};

class CompletionRevealAudioController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.audioHook      Injected playback function: (cueId) => void.
   * @param {boolean}  [opts.audioEnabled] Set false to silence output without
   *   breaking game flow (AC5 / accessibility).
   */
  constructor({ audioHook, audioEnabled = true }) {
    if (typeof audioHook !== 'function') {
      throw new Error('CompletionRevealAudioController requires an audioHook function.');
    }

    this._audioHook    = audioHook;
    this._audioEnabled = Boolean(audioEnabled);
    this._audioState   = COMPLETION_AUDIO_STATE.IDLE;
    this._aborted      = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fire the completion reveal fanfare (AC3).
   * Called by CompletionRevealSequence when the reveal screen is triggered.
   *
   * No-op if already playing or aborted.
   */
  fireCompletionCue() {
    if (this._aborted || this._audioState === COMPLETION_AUDIO_STATE.PLAYING) return;

    this._audioState = COMPLETION_AUDIO_STATE.PLAYING;
    this._play(COMPLETION_AUDIO_CUES.FANFARE);
  }

  /**
   * Stop all in-flight audio for this controller.
   * Must be called on scene/state transition to prevent orphaned audio.
   * After stop(), the controller is in STOPPED state.
   */
  stop() {
    this._aborted    = true;
    this._audioState = COMPLETION_AUDIO_STATE.STOPPED;
    this._audioHook(COMPLETION_AUDIO_CUES.STOP_ALL);
  }

  /**
   * Reset the controller for a new reveal session.
   * Clears abort flag and returns to IDLE state; does NOT re-fire audio.
   */
  reset() {
    this._aborted    = false;
    this._audioState = COMPLETION_AUDIO_STATE.IDLE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string}  Current audio state name. */
  getAudioState() { return this._audioState; }

  /** @returns {boolean} True when audio output is enabled. */
  isAudioEnabled() { return this._audioEnabled; }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Internal play: forwards to audioHook only when audio is enabled.
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
  CompletionRevealAudioController,
  COMPLETION_AUDIO_CUES,
  COMPLETION_AUDIO_STATE,
};
