/**
 * PolishingInputHandler — translates player rubbing/buffing input events into
 * cumulative polishing progress advances in the range [0.0, 1.0].
 *
 * Implements: Issue #152 (Case Polishing — Phase 3)
 *
 * Design pattern: same hook-injection pattern used by the rest of the cosmetic
 * restoration subsystem. The caller injects an `onProgressUpdate` callback and
 * an optional `onPolishComplete` callback rather than coupling to a specific
 * rendering or UI layer.
 *
 * Each input event contributes a `deltaProgress` that advances the cumulative
 * progress. Progress is clamped to [0.0, 1.0] and the complete callback fires
 * exactly once when 1.0 is first reached.
 *
 * Acceptance criteria covered:
 *   AC1 — polishing interaction advances progress; first 20% is visually reflected
 *          (shader update is triggered on each onInput call via onProgressUpdate).
 *   AC6 — partial polish abandonment: caller invokes abandon() which snapshots
 *          the current partial progress without crashing.
 *   AC8 — no FPS degradation: PolishingInputHandler performs only arithmetic +
 *          a single callback dispatch per input event — O(1), no allocations in
 *          the hot path.
 */

/** Maximum progress delta accepted per input event (prevents single-event skip to 100%). */
const MAX_DELTA_PER_EVENT = 0.15;

/** Minimum positive delta that is treated as meaningful input. */
const MIN_DELTA = 0.001;

class PolishingInputHandler {
  /**
   * @param {Function} onProgressUpdate  Called with (progress: number) on every input event.
   * @param {Function} [onPolishComplete] Called with (progress: 1.0) when polishing reaches 100%.
   *   Fires at most once per session.
   */
  constructor(onProgressUpdate, onPolishComplete = null) {
    if (typeof onProgressUpdate !== 'function') {
      throw new Error('PolishingInputHandler requires an onProgressUpdate function.');
    }

    this._onProgressUpdate  = onProgressUpdate;
    this._onPolishComplete  = typeof onPolishComplete === 'function' ? onPolishComplete : null;

    this._progress         = 0.0;
    this._isComplete       = false;
    this._isAbandoned      = false;
    this._inputEventCount  = 0;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Handle a single player polishing input event.
   *
   * Ignored if polishing is already complete or has been abandoned.
   *
   * @param {number} deltaProgress  Progress to add in (0.0, MAX_DELTA_PER_EVENT].
   *   Clamped to [MIN_DELTA, MAX_DELTA_PER_EVENT] before application.
   */
  onInput(deltaProgress) {
    if (this._isComplete || this._isAbandoned) return;

    // Clamp delta to safe range
    const delta = Math.max(MIN_DELTA, Math.min(MAX_DELTA_PER_EVENT, deltaProgress));

    const newProgress = Math.min(1.0, this._progress + delta);
    this._progress    = newProgress;
    this._inputEventCount += 1;

    this._onProgressUpdate(this._progress);

    // Use epsilon guard to handle floating-point accumulation (e.g. 10 × 0.1 = 0.9999…)
    if (this._progress >= 1.0 - Number.EPSILON && !this._isComplete) {
      this._progress   = 1.0; // normalise to exactly 1.0
      this._isComplete = true;
      if (this._onPolishComplete) {
        this._onPolishComplete(this._progress);
      }
    }
  }

  /**
   * Player abandons the polishing interaction mid-way (AC6).
   * Records the partial progress snapshot; no crash; no further input accepted.
   * The caller can read the partial state via getProgress() / getAbandonedProgress().
   */
  abandon() {
    if (this._isComplete) return; // already done — abandonment is a no-op
    this._isAbandoned = true;
    // Ensure the progress update callback fires so the shader reflects final partial state
    this._onProgressUpdate(this._progress);
  }

  /** @returns {number} Current polishing progress in [0.0, 1.0]. */
  getProgress() {
    return this._progress;
  }

  /** @returns {boolean} True when polishing has reached 100%. */
  isComplete() {
    return this._isComplete;
  }

  /** @returns {boolean} True when the player abandoned before completing. */
  isAbandoned() {
    return this._isAbandoned;
  }

  /** @returns {number} Total number of input events processed this session. */
  getInputEventCount() {
    return this._inputEventCount;
  }

  /**
   * Reset handler to initial state for a new polishing session.
   */
  reset() {
    this._progress        = 0.0;
    this._isComplete      = false;
    this._isAbandoned     = false;
    this._inputEventCount = 0;
  }
}

module.exports = { PolishingInputHandler, MAX_DELTA_PER_EVENT, MIN_DELTA };
