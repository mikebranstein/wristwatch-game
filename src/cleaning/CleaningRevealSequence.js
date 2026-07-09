/**
 * CleaningRevealSequence — top-level orchestrator that wires together the three
 * reveal subsystems (animation, audio, before/after UI) and subscribes to the
 * cleaning phase completion event.
 *
 * Architecture: follows the exact DiagnosisScreen dependency-injection pattern.
 * All hooks and subsystem dependencies are injected at construction time.  No new
 * engine architectural decisions are introduced here.
 *
 * Key design decisions (from Design Decision comment):
 *  - isRevealing guard flag prevents audio stacking and animation overlap on
 *    back-to-back completions (AC5).
 *  - Audio hook is called within the same frame step as the visual transition
 *    so sync tolerance ≤ 100ms is maintained (AC2).
 *  - Pre/post texture states are passed at runtime; no new persistence required.
 *  - The cleaning phase completion event gains one new subscriber (this module).
 *
 * Acceptance criteria covered:
 *   AC1 — high-fidelity reveal animation on cleaning completion.
 *   AC2 — distinct audio cue fires in sync with visual transition beat (±100ms).
 *   AC3 — before/after UI shown after animation, auto-dismissed after ≥3s.
 *   AC4 — early dismiss works cleanly.
 *   AC5 — isRevealing guard prevents stacking; sequence runs correctly on every
 *          completion event.
 */

const { CleaningRevealAnimation } = require('./CleaningRevealAnimation');
const { RevealAudioController } = require('./RevealAudioController');
const { BeforeAfterUI } = require('./BeforeAfterUI');
const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

class CleaningRevealSequence {
  /**
   * @param {Object}   opts
   * @param {Function} opts.instrumentationHook  Existing telemetry hook (injected).
   * @param {Function} opts.renderReveal         Render hook for animation frames.
   * @param {Function} opts.clearReveal          Clear hook for animation layer.
   * @param {Function} opts.renderBeforeAfter    Render hook for before/after panel.
   * @param {Function} opts.clearBeforeAfter     Clear hook for before/after panel.
   * @param {Function} opts.audioHook            Audio playback hook (injected).
   * @param {Object}   [opts.eventBus]           The game event bus used to subscribe
   *                                              to 'cleaning_phase_complete'.
   * @param {string}   [opts.layoutMode]         Aspect-ratio hint: '16:9' or '9:16'.
   * @param {{ setTimeout, clearTimeout }} [opts.timerImpl]  Injected timer (for testing).
   */
  constructor(opts) {
    const {
      instrumentationHook,
      renderReveal,
      clearReveal,
      renderBeforeAfter,
      clearBeforeAfter,
      audioHook,
      eventBus = null,
      layoutMode = '16:9',
      timerImpl = {},
    } = opts;

    this._telemetry = new TelemetryEmitter(instrumentationHook);
    this._animation = new CleaningRevealAnimation(renderReveal, clearReveal);
    this._audio = new RevealAudioController(audioHook);
    this._ui = new BeforeAfterUI(renderBeforeAfter, clearBeforeAfter, timerImpl);

    this._layoutMode = layoutMode;

    // AC5: concurrency guard — while a reveal is active, discard new triggers
    this._isRevealing = false;

    // Subscribe to the cleaning phase completion event if an event bus is provided
    this._eventBus = eventBus;
    if (eventBus && typeof eventBus.on === 'function') {
      this._boundOnCleaningComplete = this._onCleaningPhaseComplete.bind(this);
      eventBus.on('cleaning_phase_complete', this._boundOnCleaningComplete);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Trigger the full reveal sequence programmatically.
   *
   * Typically called by the event-bus subscriber (onCleaningPhaseComplete) but
   * also callable directly (e.g. in tests or if the game loop triggers it).
   *
   * @param {string} preTexture   Texture key for pre-cleaning state.
   * @param {string} postTexture  Texture key for post-cleaning (gleaming) state.
   * @returns {boolean} True if the sequence started; false if already revealing (AC5 guard).
   */
  triggerReveal(preTexture, postTexture) {
    // AC5: if a reveal is already active, discard the new trigger
    if (this._isRevealing) {
      return false;
    }

    this._isRevealing = true;

    // Emit telemetry: sequence started
    this._telemetry.emit('cleaning_reveal_started', { preTexture, postTexture });

    // Start the animation; returns the visual transition beat timestamp (AC2)
    const { visualTransitionBeatMs } = this._animation.play(preTexture, postTexture);

    // Advance to each phase in sequence, firing the audio at the sheen_transition beat
    // In a real engine this would be frame-driven; here we step synchronously so
    // all phases complete in one call (enabling synchronous unit tests).
    this._stepAnimationPhases(preTexture, postTexture, visualTransitionBeatMs);

    return true;
  }

  /**
   * Dismiss the before/after UI early (AC4).
   * No-op if the UI is not currently visible.
   */
  dismissEarly() {
    this._ui.dismissEarly();
  }

  /** @returns {boolean} True while a reveal sequence is in progress. */
  isRevealing() {
    return this._isRevealing;
  }

  /**
   * Cleanup — unsubscribes the event-bus listener.
   * Call when the game loop navigates away from the cleaning phase.
   */
  destroy() {
    if (this._eventBus && typeof this._eventBus.off === 'function' && this._boundOnCleaningComplete) {
      this._eventBus.off('cleaning_phase_complete', this._boundOnCleaningComplete);
    }
  }

  // Accessors (for testing & QA)

  getAnimation() { return this._animation; }
  getAudio()     { return this._audio; }
  getUI()        { return this._ui; }
  getTelemetry() { return this._telemetry; }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Event-bus subscriber.  Called automatically when 'cleaning_phase_complete'
   * is emitted on the event bus.
   *
   * @param {{ preTexture: string, postTexture: string }} eventData
   */
  _onCleaningPhaseComplete(eventData) {
    const { preTexture = 'dirty_movement', postTexture = 'clean_movement' } = eventData || {};
    this.triggerReveal(preTexture, postTexture);
  }

  /**
   * Steps the animation through all its phases.  Fires the audio cue at the
   * sheen_transition phase beat (AC2).  Shows the before/after UI once the
   * animation finishes (AC3).
   *
   * @param {string} preTexture
   * @param {string} postTexture
   * @param {number|null} initialBeatMs  Visual transition beat from animation.play().
   */
  _stepAnimationPhases(preTexture, postTexture, initialBeatMs) {
    // Phase 0 (dirt_fade) is already rendered by animation.play() via _advancePhase().
    // Advance through phases 1–3 while watching for the sheen_transition beat (AC2).
    let latestBeatMs = initialBeatMs;

    // Phase indices: 0=dirt_fade, 1=particle_burst, 2=sheen_transition, 3=gleam_hold
    // After play() calls _advancePhase() for index 0, we advance indices 1-3 here.
    const remainingPhases = 3; // total phases - 1 already triggered in play()
    for (let i = 0; i < remainingPhases; i++) {
      this._animation.nextPhase();

      // After advancing to sheen_transition (index 2), fire the audio cue in the
      // same logical step to maintain sync tolerance (AC2).
      const currentPhase = this._animation.getCurrentState().phase;
      if (currentPhase === 'sheen_transition') {
        const beatMs = this._animation.getVisualTransitionBeatMs() || Date.now();
        latestBeatMs = beatMs;
        this._audio.fireRevealCue('cleaning_reveal_cue', beatMs);
      }
    }

    // Animation is now complete; show the before/after UI (AC3)
    if (this._animation.isComplete()) {
      this._showBeforeAfterUI(preTexture, postTexture);
    }
  }

  /**
   * Displays the before/after UI with an onDismiss callback that resets the
   * isRevealing guard so future completions can trigger again (AC5).
   */
  _showBeforeAfterUI(preTexture, postTexture) {
    this._ui.show(
      preTexture,
      postTexture,
      this._layoutMode,
      () => this._onSequenceComplete()
    );
  }

  /**
   * Called when the before/after UI is dismissed (auto or early).
   * Emits telemetry, resets the guard, and restores normal game flow.
   */
  _onSequenceComplete() {
    const wasEarly = this._ui.getDisplayState().lastDismissWasEarly;
    this._telemetry.emit(
      wasEarly ? 'cleaning_reveal_dismissed' : 'cleaning_reveal_auto_dismissed',
      {}
    );

    // Reset audio stacking guard
    this._audio.onCueComplete();

    // Release the isRevealing lock so the next completion fires correctly (AC5)
    this._isRevealing = false;
  }
}

module.exports = { CleaningRevealSequence };
