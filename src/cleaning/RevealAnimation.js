/**
 * RevealAnimation — plays the dirty-to-clean visual transition animation.
 *
 * Responsibilities:
 *   - Renders the pre-state (dirty/corroded) texture and transitions it to
 *     the post-state (gleaming) texture via particle effects and sheen.
 *   - Fires a `onRevealBeat` callback at the visual transition peak so that
 *     audio and camera systems can precisely sync.
 *   - Exposes `isPlaying()` and `getProgress()` for integration polling.
 *
 * Design constraints (AC #53-1, #53-8):
 *   - Visual contrast: pre-state and post-state must be clearly distinguishable.
 *   - ≥30fps during the full animation sequence on minimum-spec hardware.
 *   - Core animation duration: ~5 seconds (within the 8–12s total sequence budget).
 */

const ANIMATION_DURATION_MS = 5000; // 5 s — core reveal animation

class RevealAnimation {
  /**
   * @param {Function} renderReveal  Injected render hook: (preTexture, postTexture, progress) => void
   * @param {Function} clearReveal   Injected clear hook: () => void
   */
  constructor(renderReveal, clearReveal) {
    if (typeof renderReveal !== 'function') {
      throw new Error('RevealAnimation: renderReveal must be a function.');
    }
    if (typeof clearReveal !== 'function') {
      throw new Error('RevealAnimation: clearReveal must be a function.');
    }
    this._renderReveal = renderReveal;
    this._clearReveal = clearReveal;
    this._isPlaying = false;
    this._progress = 0; // 0.0 → 1.0
    this._onRevealBeat = null;
    this._onComplete = null;
    this._revealBeatFired = false;
    this._timer = null;
  }

  /**
   * Plays the reveal animation.
   * AC#53-1: dirty/corroded → gleaming, with clearly visible visual contrast.
   *
   * @param {string}   preTexture   Identifier/URL for the pre-cleaning texture.
   * @param {string}   postTexture  Identifier/URL for the post-cleaning texture.
   * @param {Function} [onRevealBeat]  Fired at the visual peak (~50% progress).
   * @param {Function} [onComplete]    Fired when the animation finishes.
   */
  play(preTexture, postTexture, onRevealBeat = null, onComplete = null) {
    // Concurrency guard — silently ignore if already playing
    if (this._isPlaying) return;

    this._isPlaying = true;
    this._progress = 0;
    this._onRevealBeat = onRevealBeat;
    this._onComplete = onComplete;
    this._revealBeatFired = false;

    // Initial render — pre-state (dirty/corroded texture visible)
    this._renderReveal(preTexture, postTexture, 0);

    // Mid-point: fire the reveal beat and transition to post-state
    this._timer = setTimeout(() => {
      this._progress = 0.5;
      this._renderReveal(preTexture, postTexture, 0.5);

      // Reveal beat fires at 50% — the visual peak of the transition
      if (typeof this._onRevealBeat === 'function' && !this._revealBeatFired) {
        this._revealBeatFired = true;
        this._onRevealBeat();
      }

      // Complete: post-state (gleaming) fully visible
      this._timer = setTimeout(() => {
        this._progress = 1.0;
        this._renderReveal(preTexture, postTexture, 1.0);
        this._isPlaying = false;

        if (typeof this._onComplete === 'function') {
          this._onComplete();
        }
      }, ANIMATION_DURATION_MS / 2);
    }, ANIMATION_DURATION_MS / 2);
  }

  /** Clears the animation overlay from screen (used on early dismiss or destroy). */
  clear() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._isPlaying = false;
    this._progress = 0;
    this._clearReveal();
  }

  /** @returns {boolean} True while the animation is in progress. */
  isPlaying() {
    return this._isPlaying;
  }

  /**
   * @returns {number} Progress from 0.0 (not started) to 1.0 (complete).
   */
  getProgress() {
    return this._progress;
  }

  /** @returns {number} Animation duration in milliseconds. */
  static getDurationMs() {
    return ANIMATION_DURATION_MS;
  }
}

module.exports = { RevealAnimation, ANIMATION_DURATION_MS };
