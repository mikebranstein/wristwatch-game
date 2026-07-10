/**
 * CleaningRevealSequence — orchestrates the full cleaning reveal sequence.
 *
 * Implements: Issue #53 (Core Reveal System) + Issue #54 (Shareability Layer)
 *
 * This top-level orchestrator wires together (following the DiagnosisScreen DI pattern):
 *   1. RevealAnimation           — AC#53-1: dirty→gleaming animation with visual contrast
 *   2. RevealAudioController     — AC#53-2: audio cue in sync with reveal beat (±100ms)
 *   3. BeforeAfterUI             — AC#53-3/#53-4: before/after framing UI
 *   4. CinematicCameraController — AC#54-2/#54-4/#54-5: cinematic pull-back at the beat
 *   5. ClipSequencePacer         — AC#54-1/#54-3: 20–60 s clip-optimized timing
 *   6. TelemetryEmitter          — analytics events for all lifecycle milestones
 *
 * Key design decisions:
 *   - `isRevealing` concurrency guard prevents audio stacking and animation overlap
 *     on rapid back-to-back cleaning completions (AC#53-5).
 *   - Audio and cinematic camera fire in the same reveal beat callback (AC#53-2 sync).
 *   - Camera forced-restore is called at sequence end as a safety fallback (AC#54-5).
 */

const { RevealAnimation } = require('./RevealAnimation');
const { RevealAudioController } = require('./RevealAudioController');
const { BeforeAfterUI } = require('./BeforeAfterUI');
const { CinematicCameraController } = require('./CinematicCameraController');
const { ClipSequencePacer } = require('./ClipSequencePacer');
const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

/** Named telemetry events emitted by this orchestrator. */
const REVEAL_EVENTS = {
  CLEANING_REVEAL_STARTED:   'cleaning_reveal_started',
  CLEANING_REVEAL_BEAT:      'cleaning_reveal_beat',
  CLEANING_REVEAL_COMPLETED: 'cleaning_reveal_completed',
  CLEANING_REVEAL_DISMISSED: 'cleaning_reveal_dismissed',
  CLIP_SEQUENCE_STARTED:     'clip_sequence_started',
  CLIP_SEQUENCE_ENDED:       'clip_sequence_ended',
};

class CleaningRevealSequence {
  /**
   * @param {Object} opts
   * @param {Function} opts.renderReveal        Hook: (preTexture, postTexture, progress) => void
   * @param {Function} opts.clearReveal         Hook: () => void
   * @param {Function} opts.audioHook           Hook: (cueId) => void
   * @param {Function} opts.instrumentationHook Telemetry hook: (eventName, payload) => void
   * @param {Function} opts.cameraOverrideHook  Camera override: (moveType, progress) => void
   * @param {Function} opts.cameraRestoreHook   Camera restore: (recoveryProgress) => void
   * @param {Object}   [opts.phaseDurations]    Optional ClipSequencePacer phase overrides (seconds).
   * @param {Function} [opts.autosaveHook]      Issue #82: async (stage: string) => void
   */
  constructor({
    renderReveal,
    clearReveal,
    audioHook,
    instrumentationHook,
    cameraOverrideHook,
    cameraRestoreHook,
    phaseDurations = {},
    autosaveHook = null,
    audioCohortFn = null,
  }) {
    this._telemetry     = new TelemetryEmitter(instrumentationHook);
    this._animation     = new RevealAnimation(renderReveal, clearReveal);
    this._audio         = new RevealAudioController(audioHook);
    this._beforeAfterUI = new BeforeAfterUI();
    this._camera        = new CinematicCameraController({ cameraOverrideHook, cameraRestoreHook });
    this._pacer         = new ClipSequencePacer(phaseDurations);

    this._isRevealing      = false; // concurrency guard (AC#53-5)
    this._currentSessionId = null;
    this._sequenceStartedAt = null;
    this._autosaveHook     = autosaveHook;  // Issue #82
    this._audioCohortFn = audioCohortFn;
  }

  // ── Sequence lifecycle ────────────────────────────────────────────────────

  /**
   * Triggers the full clip-optimized reveal sequence on cleaning completion.
   *
   * Full sequence: clip-in → [core reveal + cinematic move at beat] → before/after UI → clip-out
   * AC#54: sequence is 20–60 s, opens on a distinct clip-in frame, closes on a neutral clip-out.
   *
   * Issue #82 — AC1, AC5: if an autosaveHook was injected it is called here (async,
   * fire-and-forget is acceptable for the reveal sequence since the save must only complete
   * before the *next stage* begins, not before the reveal animation).
   *
   * @param {string} sessionId    Unique session/run identifier (for telemetry).
   * @param {string} preTexture   Pre-cleaning texture identifier.
   * @param {string} postTexture  Post-cleaning texture identifier.
   */
  onCleaningComplete(sessionId, preTexture, postTexture) {
    // Concurrency guard: if a reveal is already active, discard new trigger (AC#53-5)
    if (this._isRevealing) return;

    this._isRevealing       = true;
    this._currentSessionId  = sessionId;
    this._sequenceStartedAt = Date.now();

    // Issue #82: trigger autosave checkpoint at cleaning completion (AC1).
    if (this._autosaveHook) {
      this._autosaveHook('cleaning');
    }

    // Telemetry: sequence started
    this._telemetry.emit(REVEAL_EVENTS.CLEANING_REVEAL_STARTED, { sessionId });
    this._telemetry.emit(REVEAL_EVENTS.CLIP_SEQUENCE_STARTED, {
      sessionId,
      timing: this._pacer.computeSequenceTiming(),
    });

    // Phase 1 (clip-in): the animation's initial render at progress=0 shows the
    // pre-cleaning (dirty/corroded) texture — visually distinct from gameplay (AC#54-3).

    // Phase 2 + 3: core reveal animation; cinematic camera fires at the reveal beat
    this._animation.play(
      preTexture,
      postTexture,
      () => this._onRevealBeat(sessionId),
      () => this._onAnimationComplete(sessionId, preTexture, postTexture)
    );
  }

  /**
   * Called at the visual reveal beat (~50% animation progress).
   * AC#53-2: audio fires synchronously with the visual beat.
   * AC#54-2: cinematic camera fires at the same beat.
   *
   * @private
   */
  _onRevealBeat(sessionId) {
    // Fire audio synchronously — same call stack as the visual beat (AC#53-2: ±100ms)
    const cohort = typeof this._audioCohortFn === 'function' ? this._audioCohortFn() : 'audio-on';
    if (cohort === 'audio-on') {
      this._audio.playRevealCue();
    }

    // Fire cinematic camera pull-back (AC#54-2: 2–5 s, smooth recovery)
    this._camera.playRevealMove(() => {
      // Camera recovery complete — no snap, no overshoot (AC#54-5)
    });

    this._telemetry.emit(REVEAL_EVENTS.CLEANING_REVEAL_BEAT, { sessionId });
  }

  /**
   * Called when the reveal animation completes — shows before/after UI.
   * @private
   */
  _onAnimationComplete(sessionId, preTexture, postTexture) {
    this._beforeAfterUI.show(preTexture, postTexture, () => {
      this._onSequenceEnd(sessionId);
    });

    this._telemetry.emit(REVEAL_EVENTS.CLEANING_REVEAL_COMPLETED, { sessionId });
  }

  /**
   * Called when the before/after UI is dismissed (auto or manual) — end of sequence.
   * Phase 5 (clip-out): camera is restored to normal/neutral state (AC#54-3, AC#54-5).
   * @private
   */
  _onSequenceEnd(sessionId) {
    // Safety fallback: ensure camera is fully restored to normal gameplay position (AC#54-5)
    if (!this._camera.isAtRest()) {
      this._camera.restore();
    }

    const totalDurationS = (Date.now() - this._sequenceStartedAt) / 1000;
    this._isRevealing = false;

    this._telemetry.emit(REVEAL_EVENTS.CLEANING_REVEAL_DISMISSED, { sessionId });
    this._telemetry.emit(REVEAL_EVENTS.CLIP_SEQUENCE_ENDED, {
      sessionId,
      totalDurationS,
      withinClipWindow: this._pacer.isWithinClipWindow(totalDurationS),
    });
  }

  // ── Player interactions ───────────────────────────────────────────────────

  /**
   * Player-initiated early dismiss of the before/after UI.
   * AC#53-4: dismisses cleanly — no errors, freezes, or visual artifacts.
   */
  dismiss() {
    if (this._beforeAfterUI.isVisible()) {
      this._beforeAfterUI.dismiss();
    }
  }

  // ── Accessors (for testing & QA) ─────────────────────────────────────────

  /** @returns {boolean} True while a reveal sequence is active. */
  isRevealing() {
    return this._isRevealing;
  }

  /** @returns {TelemetryEmitter} The internal telemetry emitter. */
  getTelemetry() {
    return this._telemetry;
  }

  /** @returns {ClipSequencePacer} The pacer — exposes timing config and markers. */
  getPacer() {
    return this._pacer;
  }

  /** @returns {CinematicCameraController} The cinematic camera controller. */
  getCamera() {
    return this._camera;
  }

  /** @returns {RevealAnimation} The reveal animation controller. */
  getAnimation() {
    return this._animation;
  }

  /** @returns {BeforeAfterUI} The before/after UI controller. */
  getBeforeAfterUI() {
    return this._beforeAfterUI;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Cleanup — cancels all pending timers, restores camera, hides UI, resets state.
   * Must be called when navigating away from the cleaning phase.
   */
  destroy() {
    this._animation.clear();
    this._beforeAfterUI.destroy();
    this._camera.destroy();
    this._isRevealing = false;
  }
}

module.exports = { CleaningRevealSequence, REVEAL_EVENTS };
