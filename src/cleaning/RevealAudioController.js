/**
 * RevealAudioController — fires the reveal audio cue in sync with the visual beat.
 *
 * Design constraint (AC #53-2): audio must fire within ±100ms of the visual
 * reveal beat. The audio hook is called synchronously within the same event loop
 * tick as the visual beat callback to ensure zero artificial latency.
 */

const AUDIO_CUE_ID = 'cleaning_reveal_cue';
const AUDIO_CUE_DURATION_MS = 2000; // approximate cue playback duration

class RevealAudioController {
  /**
   * @param {Function} audioHook  Injected audio playback function: (cueId) => void
   *   Matches the existing audio injection pattern from DiagnosisScreen.
   */
  constructor(audioHook) {
    if (typeof audioHook !== 'function') {
      throw new Error('RevealAudioController: audioHook must be a function.');
    }
    this._audioHook = audioHook;
    this._isPlaying = false;
    this._lastCueFiredAt = null;
    this._timer = null;
  }

  /**
   * Fires the reveal audio cue.
   * AC#53-2: must be called in the same event loop tick as the visual reveal beat
   * to ensure sync within ±100ms tolerance.
   */
  playRevealCue() {
    this._isPlaying = true;
    this._lastCueFiredAt = Date.now();
    // Synchronous call — no setTimeout, no async gap (AC#53-2)
    this._audioHook(AUDIO_CUE_ID);

    // Mark playing = false after approximate cue duration
    this._timer = setTimeout(() => {
      this._isPlaying = false;
    }, AUDIO_CUE_DURATION_MS);
  }

  /** @returns {boolean} True while the audio cue is playing. */
  isPlaying() {
    return this._isPlaying;
  }

  /** @returns {number|null} Timestamp the cue last fired, or null if never fired. */
  getLastCueFiredAt() {
    return this._lastCueFiredAt;
  }

  /** @returns {string} The audio cue ID fired by this controller. */
  static getCueId() {
    return AUDIO_CUE_ID;
  }

  /** Cleanup — cancels any pending timers. */
  destroy() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

module.exports = { RevealAudioController, AUDIO_CUE_ID, AUDIO_CUE_DURATION_MS };
