/**
 * FirstTickCinematicSequence — top-level orchestrator for the first-tick
 * visual and cinematic treatment (Issue #114, Phase 2).
 *
 * Wires together:
 *   1. CameraAnimationController — smooth dolly/zoom to balance-wheel close-up,
 *                                   configurable hold, and smooth ease-back (AC1, AC3).
 *   2. BalanceWheelHighlight     — glow / rim-light applied to the balance wheel
 *                                   component during the close-up (AC2).
 *   3. PlayerInputController     — input suspension during hold, clean resume
 *                                   after camera returns (AC5).
 *
 * Phase 1 sync hook:
 *   Phase 1 (FirstTickSequence, Issue #113) calls onFirstTickFired(watchId,
 *   playerView) at the exact moment the first-tick audio one-shot fires.
 *   Phase 2 begins the visual beat synchronously — within the calling frame —
 *   satisfying the ≤ 100 ms trigger window (AC1).
 *
 * Per-watch first-activation state:
 *   Mirrors FirstTickSequence._activatedWatches (Issue #113): a Set of watchIds
 *   whose cinematic sequence has already fired.  On re-wind, neither camera
 *   animation nor highlight triggers (AC4).
 *
 * Visual sequence timeline:
 *   t=0          → onFirstTickFired() called (simultaneously with first-tick audio)
 *   t=0          → input suspended; highlight activated; camera animate-in starts
 *   t=animateIn  → camera holds at close-up (hold duration: 1500–3000 ms)
 *   t=animateIn+hold → camera animate-out starts; highlight deactivated
 *   t=animateIn+hold+animateOut → exact player view restored; input resumed
 *
 * Acceptance criteria covered:
 *   AC1 — onFirstTickFired() triggers camera animation synchronously (≤ 100 ms).
 *   AC2 — highlight activates when camera begins the close-up animation.
 *   AC3 — hold duration configurable (1500–3000 ms); camera eases out smoothly;
 *          saved player view restored exactly.
 *   AC4 — re-wind suppression: _activatedWatches Set gates entire Phase 2 sequence.
 *   AC5 — input suspended at animation start; resumed after camera returns.
 */

const { CameraAnimationController } = require('./CameraAnimationController');
const { BalanceWheelHighlight }      = require('./BalanceWheelHighlight');
const { PlayerInputController }      = require('./PlayerInputController');

class FirstTickCinematicSequence {
  /**
   * @param {Object}   opts
   * @param {Function} opts.cameraHook              Camera command hook:
   *   (command, payload) => void.
   * @param {Function} opts.highlightHook           Highlight command hook:
   *   (command) => void.
   * @param {Function} opts.inputHook               Input command hook:
   *   (command) => void.
   * @param {number}   [opts.holdDurationMs]        Hold at close-up (1500–3000 ms).
   * @param {number}   [opts.animateInDurationMs]   Duration of animate-in phase.
   * @param {number}   [opts.animateOutDurationMs]  Duration of animate-out phase.
   */
  constructor({
    cameraHook,
    highlightHook,
    inputHook,
    holdDurationMs,
    animateInDurationMs,
    animateOutDurationMs,
  }) {
    // Per-watch first-activation state (AC4 — re-wind suppression)
    this._activatedWatches = new Set();

    // Build camera options, passing only defined overrides
    const cameraOpts = { cameraHook };
    if (holdDurationMs      !== undefined) cameraOpts.holdDurationMs      = holdDurationMs;
    if (animateInDurationMs  !== undefined) cameraOpts.animateInDurationMs  = animateInDurationMs;
    if (animateOutDurationMs !== undefined) cameraOpts.animateOutDurationMs = animateOutDurationMs;

    this._camera    = new CameraAnimationController({
      ...cameraOpts,
      onAnimationComplete: () => this._handleAnimationComplete(),
    });

    this._highlight = new BalanceWheelHighlight({ highlightHook });
    this._input     = new PlayerInputController({ inputHook });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1 sync hook — called by FirstTickSequence when first tick fires
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Phase 1 sync hook — the primary entry point for Phase 2.
   *
   * Called by Phase 1 (FirstTickSequence) at the exact moment the first-tick
   * one-shot audio fires, so the visual beat is coordinated with the audio
   * beat within the same calling frame (AC1 — ≤ 100 ms).
   *
   * On re-wind (watchId already in _activatedWatches) this method is a no-op,
   * matching Phase 1 re-wind suppression behaviour (AC4).
   *
   * @param {string}      watchId     The watch identifier from Phase 1.
   * @param {Object|null} [playerView] Opaque current camera view descriptor.
   *   Saved and restored exactly at end of animation (AC3).
   */
  onFirstTickFired(watchId, playerView = null) {
    // Re-wind suppression (AC4)
    if (this._activatedWatches.has(watchId)) return;
    this._activatedWatches.add(watchId);

    // Save player view for restoration (AC3 — no camera drift)
    this._camera.savePlayerView(playerView);

    // Suspend player input immediately (AC5)
    this._input.suspend();

    // Activate balance-wheel highlight (AC2)
    this._highlight.activate();

    // Start camera animation synchronously (AC1 — within calling frame)
    this._camera.animateToCloseUp();
  }

  /**
   * Abort all in-flight visual effects and restore player input immediately.
   * Call on scene/state transition (mirrors Phase 1 abort — Test Scenario #9).
   */
  abort() {
    this._camera.abort();
    this._highlight.deactivate();
    this._input.resume();
  }

  /**
   * Reset all sub-controllers for a new watch.
   * Does NOT clear the _activatedWatches Set — that persists across the session.
   */
  reset() {
    this._camera.reset();
    this._highlight.reset();
    this._input.reset();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private handlers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called by CameraAnimationController.onAnimationComplete when the full
   * sequence (animate-in + hold + animate-out + restore) finishes.
   *
   * Deactivates balance-wheel highlight and resumes player input (AC5 —
   * clean resume after camera returns).
   *
   * @private
   */
  _handleAnimationComplete() {
    this._highlight.deactivate();
    this._input.resume();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {boolean} True if watchId has had its cinematic sequence fire. */
  hasActivated(watchId) { return this._activatedWatches.has(watchId); }

  /** @returns {CameraAnimationController} Internal camera controller. */
  getCameraController() { return this._camera; }

  /** @returns {BalanceWheelHighlight} Internal highlight controller. */
  getHighlightController() { return this._highlight; }

  /** @returns {PlayerInputController} Internal input controller. */
  getInputController() { return this._input; }
}

module.exports = { FirstTickCinematicSequence };
