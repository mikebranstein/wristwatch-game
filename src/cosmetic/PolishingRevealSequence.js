/**
 * PolishingRevealSequence — orchestrates the Phase 3 case polishing before/after
 * reveal beat, reusing the Issue #53 BeforeAfterUI and ClipSequencePacer components.
 *
 * Implements: Issue #152 (Case Polishing — Phase 3)
 *
 * Design constraint (AC4): the Phase 3 reveal MUST reuse or extend the #53 reveal
 * component — no duplicate UI implementation. This module directly uses BeforeAfterUI
 * from src/cleaning/ and ClipSequencePacer from src/cleaning/ for timing consistency.
 *
 * The reveal is triggered after the polishing interaction reaches 100%. It shows:
 *   1. A deliberately paced worn → polished transition animation (not an instant cut).
 *   2. The BeforeAfterUI panel showing both worn and polished states side-by-side.
 *   3. Telemetry events for reveal lifecycle.
 *
 * The `renderRevealTransition` hook receives (wornTexture, polishedTexture, progress)
 * where progress is animated from 0 → 1 over TRANSITION_DURATION_MS. This ensures
 * the reveal is "deliberately paced" (AC3) rather than a single-frame cut.
 *
 * Acceptance criteria covered:
 *   AC3 — before/after reveal is first-class and deliberately paced: the transition
 *          animation plays over TRANSITION_DURATION_MS before the panel appears.
 *   AC4 — reuses #53 BeforeAfterUI and ClipSequencePacer; no duplicate component.
 */

const { BeforeAfterUI }    = require('../cleaning/BeforeAfterUI');
const { ClipSequencePacer } = require('../cleaning/ClipSequencePacer');
const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

/** Duration of the animated worn → polished reveal transition in milliseconds. */
const TRANSITION_DURATION_MS = 1200;

/** Number of animation frame steps for the transition. */
const TRANSITION_STEPS = 20;

/** Named telemetry events emitted by this module. */
const POLISHING_REVEAL_EVENTS = {
  POLISHING_REVEAL_STARTED:   'polishing_reveal_started',
  POLISHING_REVEAL_BEAT:      'polishing_reveal_beat',
  POLISHING_REVEAL_COMPLETED: 'polishing_reveal_completed',
  POLISHING_REVEAL_DISMISSED: 'polishing_reveal_dismissed',
};

class PolishingRevealSequence {
  /**
   * @param {Object}   opts
   * @param {Function} opts.renderRevealTransition   Hook: (wornTexture, polishedTexture, progress:0-1) => void
   * @param {Function} opts.clearRevealTransition    Hook: () => void
   * @param {Function} opts.renderBeforeAfter        Hook: ({ preTexture, postTexture, layoutMode }) => void
   * @param {Function} opts.clearBeforeAfter         Hook: () => void
   * @param {Function} opts.instrumentationHook      Telemetry hook: (eventName, payload) => void
   * @param {Object}   [opts.phaseDurations]         Optional ClipSequencePacer phase overrides.
   * @param {{ setTimeout: Function, clearTimeout: Function }} [opts.timerImpl]
   *   Optional timer injection for deterministic testing.
   */
  constructor({
    renderRevealTransition,
    clearRevealTransition,
    renderBeforeAfter,
    clearBeforeAfter,
    instrumentationHook,
    phaseDurations = {},
    timerImpl = {},
  }) {
    // Reuse #53 BeforeAfterUI directly (AC4 — no duplicate implementation)
    this._beforeAfterUI = new BeforeAfterUI(renderBeforeAfter, clearBeforeAfter, timerImpl);

    // Reuse #53 ClipSequencePacer for timing consistency (AC4)
    this._pacer = new ClipSequencePacer(phaseDurations);

    this._telemetry = new TelemetryEmitter(instrumentationHook);

    this._renderTransition = renderRevealTransition;
    this._clearTransition  = clearRevealTransition;

    this._setTimeout   = timerImpl.setTimeout   || setTimeout;
    this._clearTimeout = timerImpl.clearTimeout || clearTimeout;

    this._isRevealing        = false;
    this._transitionTimers   = [];
    this._wornTexture        = null;
    this._polishedTexture    = null;
  }

  // ── Sequence lifecycle ────────────────────────────────────────────────────

  /**
   * Trigger the full polishing reveal sequence.
   *
   * Sequence: animated worn→polished transition → before/after UI → dismiss.
   *
   * @param {string}   sessionId        Unique session/run identifier.
   * @param {string}   wornTexture      Worn/scratched case texture key.
   * @param {string}   polishedTexture  Fully polished case texture key.
   * @param {Function} [onDismissed]    Called when the reveal sequence ends.
   */
  onPolishComplete(sessionId, wornTexture, polishedTexture, onDismissed = null) {
    if (this._isRevealing) return; // guard against double-trigger

    this._isRevealing     = true;
    this._wornTexture     = wornTexture;
    this._polishedTexture = polishedTexture;

    this._telemetry.emit(POLISHING_REVEAL_EVENTS.POLISHING_REVEAL_STARTED, {
      sessionId,
      timing: this._pacer.computeSequenceTiming(),
    });

    // Animate the worn → polished transition over TRANSITION_DURATION_MS
    // before showing the before/after panel (AC3: deliberately paced, not instant cut)
    this._playTransitionAnimation(
      wornTexture,
      polishedTexture,
      () => this._onTransitionComplete(sessionId, wornTexture, polishedTexture, onDismissed)
    );
  }

  /**
   * Player-initiated early dismiss of the before/after panel.
   */
  dismiss() {
    if (this._beforeAfterUI.isVisible()) {
      this._beforeAfterUI.dismiss();
    }
  }

  // ── Sequence internals ────────────────────────────────────────────────────

  /**
   * Plays the animated transition from worn → polished over TRANSITION_DURATION_MS.
   * Uses stepped timer calls to animate progress 0 → 1 without blocking the event loop.
   *
   * @private
   */
  _playTransitionAnimation(wornTexture, polishedTexture, onComplete) {
    const stepDurationMs = TRANSITION_DURATION_MS / TRANSITION_STEPS;

    for (let step = 0; step <= TRANSITION_STEPS; step++) {
      const progress = step / TRANSITION_STEPS;
      const delay    = step * stepDurationMs;

      const handle = this._setTimeout(() => {
        this._renderTransition(wornTexture, polishedTexture, progress);

        // At the midpoint of the transition — the visual "reveal beat"
        if (step === Math.floor(TRANSITION_STEPS / 2)) {
          // Reveal beat: the moment the polish is most dramatically visible
          // (intentionally left as a hook point for audio/camera in future phases)
        }
      }, delay);

      this._transitionTimers.push(handle);
    }

    // Schedule completion callback after transition finishes
    const completionHandle = this._setTimeout(onComplete, TRANSITION_DURATION_MS);
    this._transitionTimers.push(completionHandle);
  }

  /**
   * Called when the animated transition completes — show the before/after panel.
   * @private
   */
  _onTransitionComplete(sessionId, wornTexture, polishedTexture, onDismissed) {
    this._telemetry.emit(POLISHING_REVEAL_EVENTS.POLISHING_REVEAL_BEAT, { sessionId });

    // Show before/after panel using the #53 BeforeAfterUI (AC4)
    this._beforeAfterUI.show(
      wornTexture,
      polishedTexture,
      '16:9',
      () => this._onSequenceEnd(sessionId, onDismissed)
    );
  }

  /**
   * Called when the before/after panel is dismissed — end of sequence.
   * @private
   */
  _onSequenceEnd(sessionId, onDismissed) {
    this._isRevealing = false;
    this._clearTransition();

    this._telemetry.emit(POLISHING_REVEAL_EVENTS.POLISHING_REVEAL_COMPLETED, { sessionId });
    this._telemetry.emit(POLISHING_REVEAL_EVENTS.POLISHING_REVEAL_DISMISSED, { sessionId });

    if (typeof onDismissed === 'function') {
      onDismissed();
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {boolean} True while a reveal sequence is active. */
  isRevealing() {
    return this._isRevealing;
  }

  /** @returns {BeforeAfterUI} The #53 before/after UI component (AC4 reuse). */
  getBeforeAfterUI() {
    return this._beforeAfterUI;
  }

  /** @returns {ClipSequencePacer} The #53 clip pacer component (AC4 reuse). */
  getPacer() {
    return this._pacer;
  }

  /** @returns {TelemetryEmitter} The telemetry emitter. */
  getTelemetry() {
    return this._telemetry;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Cancel all pending timers and reset state.
   */
  destroy() {
    for (const handle of this._transitionTimers) {
      this._clearTimeout(handle);
    }
    this._transitionTimers = [];
    this._beforeAfterUI.destroy();
    this._isRevealing = false;
  }
}

module.exports = { PolishingRevealSequence, POLISHING_REVEAL_EVENTS, TRANSITION_DURATION_MS };
