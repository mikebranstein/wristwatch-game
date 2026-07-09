/**
 * CleaningRevealAnimation — manages the high-fidelity reveal animation that
 * transitions the movement from dirty/corroded state to gleaming cleaned state.
 *
 * Design pattern: follows the DiagnosisScreen subsystem injection pattern.
 * renderReveal and clearReveal hooks are injected at construction time so the
 * caller controls the actual rendering pipeline.
 *
 * Acceptance criteria covered:
 *   AC1 — plays high-fidelity animation showing movement transitioning from
 *          dirty/corroded to gleaming with clearly visible visual contrast.
 *   AC5 — animation triggers correctly on every completion event with no
 *          degradation (isRevealing guard is enforced at the orchestrator level).
 */

class CleaningRevealAnimation {
  /**
   * @param {Function} renderReveal  Injected renderer: receives (animationState) and
   *                                  renders the reveal frame. Called per-step.
   * @param {Function} clearReveal   Injected clear function: resets the render layer
   *                                  after animation completes or is aborted.
   */
  constructor(renderReveal, clearReveal) {
    if (typeof renderReveal !== 'function') {
      throw new Error('CleaningRevealAnimation requires a renderReveal function.');
    }
    if (typeof clearReveal !== 'function') {
      throw new Error('CleaningRevealAnimation requires a clearReveal function.');
    }

    this._renderReveal = renderReveal;
    this._clearReveal = clearReveal;

    // Animation state
    this._isPlaying = false;
    this._isComplete = false;

    // Texture references for dirty/clean states (set at play time)
    this._preTexture = null;
    this._postTexture = null;

    // Timing: animation progresses through PHASES in sequence
    this._phases = ['dirt_fade', 'particle_burst', 'sheen_transition', 'gleam_hold'];
    this._currentPhaseIndex = 0;

    // Record the frame timestamp when each phase begins (for sync / QA)
    this._phaseTimestamps = {};

    // Visual-transition beat: the timestamp when the sheen_transition phase starts
    // (the audio cue must fire within ±100ms of this beat — AC2)
    this._visualTransitionBeatMs = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the reveal animation.
   *
   * @param {string} preTexture   Texture key / reference for the dirty/corroded state.
   * @param {string} postTexture  Texture key / reference for the gleaming clean state.
   * @returns {{ visualTransitionBeatMs: number }}  Timing information for audio sync.
   */
  play(preTexture, postTexture) {
    if (this._isPlaying) {
      throw new Error('CleaningRevealAnimation.play() called while animation is already playing.');
    }

    this._preTexture = preTexture;
    this._postTexture = postTexture;
    this._isPlaying = true;
    this._isComplete = false;
    this._currentPhaseIndex = 0;
    this._phaseTimestamps = {};
    this._visualTransitionBeatMs = null;

    this._advancePhase();

    return {
      visualTransitionBeatMs: this._visualTransitionBeatMs,
    };
  }

  /**
   * Abort the animation (e.g. early dismiss). Clears the render layer.
   */
  abort() {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    this._clearReveal();
  }

  /** @returns {boolean} True while the animation is still in progress. */
  isPlaying() {
    return this._isPlaying;
  }

  /** @returns {boolean} True once the full animation has finished. */
  isComplete() {
    return this._isComplete;
  }

  /**
   * Returns the timestamp (ms since epoch) at which the visual-transition beat
   * fired — i.e. when the sheen_transition phase started.  Audio must fire
   * within ±100ms of this value (AC2).
   *
   * @returns {number|null}
   */
  getVisualTransitionBeatMs() {
    return this._visualTransitionBeatMs;
  }

  /**
   * Returns the current animation state object passed to the renderReveal hook.
   * Useful for assertions in tests.
   *
   * @returns {{ phase: string, preTexture: string, postTexture: string, phaseIndex: number }}
   */
  getCurrentState() {
    return {
      phase: this._phases[this._currentPhaseIndex] || null,
      preTexture: this._preTexture,
      postTexture: this._postTexture,
      phaseIndex: this._currentPhaseIndex,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Advances to the current phase and renders it.  In a real engine this would
   * be driven by a frame-loop callback; here each phase is rendered synchronously
   * so the module can be fully unit-tested without a real animation runtime.
   */
  _advancePhase() {
    if (this._currentPhaseIndex >= this._phases.length) {
      this._finish();
      return;
    }

    const phase = this._phases[this._currentPhaseIndex];
    const now = Date.now();
    this._phaseTimestamps[phase] = now;

    // Mark visual transition beat when the sheen phase begins (AC2 sync anchor)
    if (phase === 'sheen_transition') {
      this._visualTransitionBeatMs = now;
    }

    const state = {
      phase,
      preTexture: this._preTexture,
      postTexture: this._postTexture,
      phaseIndex: this._currentPhaseIndex,
      totalPhases: this._phases.length,
    };

    this._renderReveal(state);
  }

  /**
   * Advance to the next animation phase.  Called by the engine / orchestrator
   * after each phase's duration has elapsed.
   */
  nextPhase() {
    if (!this._isPlaying) return;
    this._currentPhaseIndex += 1;
    this._advancePhase();
  }

  _finish() {
    this._isPlaying = false;
    this._isComplete = true;
    this._clearReveal();
  }
}

module.exports = { CleaningRevealAnimation };
