/**
 * RevealAudioController — manages the distinct satisfying audio cue that fires
 * in precise sync with the visual reveal beat.
 *
 * Design pattern: the audioHook is injected at construction time so the caller
 * controls the actual audio playback implementation.  This module is responsible
 * only for timing enforcement and stacking prevention.
 *
 * Acceptance criteria covered:
 *   AC2 — fires a distinct audio cue within ±100ms of the visual transition beat.
 *   AC5 — no audio stacking on back-to-back completions; playing flag prevents
 *          a second cue from firing while one is active.
 */

/** Default maximum allowed drift between visual beat and audio fire (ms). */
const MAX_SYNC_TOLERANCE_MS = 100;

class RevealAudioController {
  /**
   * @param {Function} audioHook  Injected audio playback function.
   *   Called with (cueId) — the caller maps the cue ID to the actual audio asset.
   * @param {number}   [syncToleranceMs]  Override the ±100ms sync tolerance (useful
   *   in tests that assert on tight timing).
   */
  constructor(audioHook, syncToleranceMs = MAX_SYNC_TOLERANCE_MS) {
    if (typeof audioHook !== 'function') {
      throw new Error('RevealAudioController requires an audioHook function.');
    }

    this._audioHook = audioHook;
    this._syncToleranceMs = syncToleranceMs;

    // Guard: prevent a second cue from firing while one is already playing (AC5)
    this._isPlaying = false;

    // Timestamps for QA assertions on sync tolerance
    this._lastVisualBeatMs = null;
    this._lastAudioFireMs = null;
    this._lastSyncDeltaMs = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fire the reveal audio cue.  Must be called within ±syncToleranceMs of
   * visualTransitionBeatMs to satisfy AC2.
   *
   * @param {string} cueId               Identifier for the audio asset to play.
   * @param {number} visualTransitionBeatMs  The timestamp when the visual beat fired.
   * @returns {{ fired: boolean, syncDeltaMs: number|null }}
   *   `fired`      — whether the hook was actually invoked.
   *   `syncDeltaMs`— milliseconds between visual beat and this call (null if not checked).
   */
  fireRevealCue(cueId, visualTransitionBeatMs) {
    // AC5: no stacking — silently discard if a cue is already active
    if (this._isPlaying) {
      return { fired: false, syncDeltaMs: null };
    }

    const now = Date.now();
    this._lastVisualBeatMs = visualTransitionBeatMs;
    this._lastAudioFireMs = now;

    const syncDeltaMs = Math.abs(now - visualTransitionBeatMs);
    this._lastSyncDeltaMs = syncDeltaMs;

    if (syncDeltaMs > this._syncToleranceMs) {
      // Emit out-of-tolerance warning but still fire the cue — the orchestrator
      // is responsible for calling us on time; we do not silently drop the cue.
      // The sync violation is recorded for QA assertion.
      this._isPlaying = true;
      this._audioHook(cueId);
      return { fired: true, syncDeltaMs, withinTolerance: false };
    }

    this._isPlaying = true;
    this._audioHook(cueId);

    return { fired: true, syncDeltaMs, withinTolerance: true };
  }

  /**
   * Play the reveal audio cue immediately, without timing validation.
   * Convenience method for the CleaningRevealSequence orchestrator — fires the
   * cue synchronously at the reveal beat callback (AC#53-2).
   */
  playRevealCue() {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this._lastAudioFireMs = Date.now();
    this._audioHook('reveal_cue');
  }

  /**
   * Signal that the audio cue has finished playing.  Resets the stacking guard
   * so future completions can fire correctly.
   */
  onCueComplete() {
    this._isPlaying = false;
  }

  /**
   * Stop the cue immediately (e.g. on early dismiss / sequence abort).
   * Resets state so the next reveal can fire cleanly.
   */
  stop() {
    this._isPlaying = false;
    this._lastVisualBeatMs = null;
    this._lastAudioFireMs = null;
    this._lastSyncDeltaMs = null;
  }

  /** @returns {boolean} True while an audio cue is actively playing. */
  isPlaying() {
    return this._isPlaying;
  }

  /**
   * Returns timing data for the last fire attempt (for QA assertions).
   * @returns {{ lastVisualBeatMs: number|null, lastAudioFireMs: number|null, lastSyncDeltaMs: number|null }}
   */
  getLastSyncData() {
    return {
      lastVisualBeatMs: this._lastVisualBeatMs,
      lastAudioFireMs: this._lastAudioFireMs,
      lastSyncDeltaMs: this._lastSyncDeltaMs,
    };
  }
}

module.exports = { RevealAudioController, MAX_SYNC_TOLERANCE_MS };
