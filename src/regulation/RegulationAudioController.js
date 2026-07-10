/**
 * RegulationAudioController — audio tick feedback for the Regulation Phase.
 *
 * Issue #294 — Movement Regulation Phase 1
 *
 * Provides audio feedback that changes character as the regulator is adjusted:
 *   irregular  — deviation > 2× Acceptable threshold (far from target)
 *   converging — deviation within 2× Acceptable threshold (approaching target)
 *   stable     — deviation within Acceptable threshold (in target zone)
 *
 * Pattern: mirrors FirstTickAudioController (Issue #113) — audioHook injected
 * at construction; this module is responsible only for feedback state mapping.
 * Extends the existing audio module additively per design mitigation
 * (no new external dependency needed).
 *
 * Audio cue IDs forwarded to audioHook:
 *   regulation_tick_irregular  — far from target
 *   regulation_tick_converging — approaching target
 *   regulation_tick_stable     — in Acceptable zone
 *   regulation_tick_stop       — stop all regulation audio (phase exit)
 */
'use strict';

const { GRADES, GRADE_THRESHOLDS } = require('./RegulationConfig');

/** Audio cue identifiers forwarded to the injected audioHook. */
const REGULATION_AUDIO_CUES = Object.freeze({
  TICK_IRREGULAR:  'regulation_tick_irregular',
  TICK_CONVERGING: 'regulation_tick_converging',
  TICK_STABLE:     'regulation_tick_stable',
  STOP_ALL:        'regulation_tick_stop',
});

/** Audio state names (for QA / testing assertions). */
const REGULATION_AUDIO_STATE = Object.freeze({
  IDLE:       'idle',
  IRREGULAR:  'irregular',
  CONVERGING: 'converging',
  STABLE:     'stable',
});

/** Multiplier for converging threshold relative to Acceptable (2× = 60 s/day). */
const CONVERGING_THRESHOLD_MULTIPLIER = 2;

class RegulationAudioController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.audioHook     (cueId) => void — injected playback function
   * @param {boolean}  [opts.audioEnabled]  Default: true
   */
  constructor({ audioHook, audioEnabled = true }) {
    if (typeof audioHook !== 'function') {
      throw new Error('RegulationAudioController requires an audioHook function.');
    }
    this._audioHook  = audioHook;
    this._audioEnabled = Boolean(audioEnabled);
    this._audioState = REGULATION_AUDIO_STATE.IDLE;
    this._aborted    = false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Update audio feedback based on current deviation.
   * Transitions between audio states as the player adjusts the regulator.
   * Only fires a cue when the state actually changes (prevents cue spam).
   *
   * @param {number} deviation  Current deviation in s/day
   */
  updateForDeviation(deviation) {
    if (this._aborted) return;

    const absDeviation        = Math.abs(deviation);
    const acceptableThreshold = GRADE_THRESHOLDS[GRADES.ACCEPTABLE];
    const convergingThreshold = acceptableThreshold * CONVERGING_THRESHOLD_MULTIPLIER;

    let newState;
    if (absDeviation <= acceptableThreshold) {
      newState = REGULATION_AUDIO_STATE.STABLE;
    } else if (absDeviation <= convergingThreshold) {
      newState = REGULATION_AUDIO_STATE.CONVERGING;
    } else {
      newState = REGULATION_AUDIO_STATE.IRREGULAR;
    }

    if (newState !== this._audioState) {
      this._audioState = newState;
      this._playCueForState(newState);
    }
  }

  /**
   * Stop all in-flight regulation audio. Call on phase exit (AC8-style).
   */
  stop() {
    this._aborted    = true;
    this._play(REGULATION_AUDIO_CUES.STOP_ALL);
    this._audioState = REGULATION_AUDIO_STATE.IDLE;
  }

  /**
   * Reset for re-use (e.g. player starts second regulation attempt).
   */
  reset() {
    this._aborted    = false;
    this._audioState = REGULATION_AUDIO_STATE.IDLE;
  }

  // ---------------------------------------------------------------------------
  // Accessors (for testing & QA)
  // ---------------------------------------------------------------------------

  /** @returns {string} Current audio state name. */
  getAudioState() { return this._audioState; }

  /** @returns {boolean} True when audio output is enabled. */
  isAudioEnabled() { return this._audioEnabled; }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _playCueForState(state) {
    const cueMap = {
      [REGULATION_AUDIO_STATE.IRREGULAR]:  REGULATION_AUDIO_CUES.TICK_IRREGULAR,
      [REGULATION_AUDIO_STATE.CONVERGING]: REGULATION_AUDIO_CUES.TICK_CONVERGING,
      [REGULATION_AUDIO_STATE.STABLE]:     REGULATION_AUDIO_CUES.TICK_STABLE,
    };
    const cue = cueMap[state];
    if (cue) this._play(cue);
  }

  _play(cueId) {
    if (this._audioEnabled) {
      this._audioHook(cueId);
    }
  }
}

module.exports = { RegulationAudioController, REGULATION_AUDIO_CUES, REGULATION_AUDIO_STATE };
