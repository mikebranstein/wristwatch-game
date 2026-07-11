/**
 * CompletionRevealSequence — top-level orchestrator for the job-completion
 * hero-shot reveal (Issue #141).
 *
 * Wires together:
 *   1. WatchStateCapture          — before-state snapshot at job-start (AC4)
 *   2. CompletionRevealScreen     — reveal payload builder, dismissal gate (AC1/AC2/AC5)
 *   3. CompletionRevealAudioController — completion fanfare audio (AC3)
 *
 * Lifecycle:
 *   1. prepareForJob(jobId, watchSnapshot)   — called at intake / job-start boundary.
 *        Captures the before-state once.  No-op if already captured (AC4 guard).
 *        Persists to saveState if one is provided (existing save/session system).
 *        NOTE (Issue #256): to include cosmetic before-state in the snapshot, the caller
 *        should extend watchSnapshot with a `cosmeticBefore` field:
 *          { strapCondition, crystalCondition, casePolishGrade }
 *        WatchStateCapture stores snapshots opaquely, so the field is captured automatically.
 *   2. triggerReveal(jobId, afterSnapshot, cosmeticSummary?)  — called by the job-completion flow.
 *        Retrieves before-state, builds reveal payload, fires audio, invokes onReveal hook.
 *        Pass a CosmeticRestorationSummary instance as the optional 3rd argument to wire
 *        cosmetic badge state into the hero shot (Issue #256).
 *   3. dismiss(jobId)                        — called by the player dismiss / skip action.
 *        Calls onDismiss hook, clears in-memory capture (AC5 — no stuck state).
 *   4. abandonJob(jobId)                     — called when a job is abandoned.
 *        Discards before-state so it does not bleed to subsequent jobs (Scenario 5).
 *   5. abort()                               — emergency stop (scene nav, error).
 *        Stops audio; invokes onAbort hook.
 *
 * Design decisions (per approved design, Issue #141):
 *   - State keyed by stable jobId — consecutive / abandoned / restarted jobs
 *     cannot share state (Design mitigation: per-job state keying, Scenario 4/5).
 *   - Optional saveState integration: when a saveState is injected, the before-
 *     state is persisted under saveState key 'job_state_captures' for Issue #142
 *     replay access.  All existing save fields remain unchanged (backward-compat).
 *   - DI pattern mirrors FirstTickCinematicController (Issue #113): all external
 *     dependencies are injected at construction time; module has no DOM/canvas deps.
 *   - audioEnabled=false passes through silently — game remains functional (AC5).
 *
 * Acceptance criteria covered:
 *   AC1  — reveal triggers automatically at job-complete (caller calls triggerReveal).
 *   AC2  — payload sets fullScreen=true, fullWatchView=true (CompletionRevealScreen).
 *   AC3  — CompletionRevealAudioController fires completion_reveal_fanfare.
 *   AC4  — before-state captured once at job-start; mid-repair captures rejected.
 *   AC5  — dismiss() unblocks game flow; stop() via abort() never orphans audio.
 *
 * Test scenarios covered:
 *   Scenario 1 — Happy path: prepareForJob → triggerReveal → onReveal fires with
 *                correct before/after payload; audio cue fires.
 *   Scenario 3 — State accuracy: before-state is job-start snapshot; mid-repair
 *                capture attempts are silently rejected.
 *   Scenario 4 — Multiple consecutive jobs: each job uses its own isolated capture.
 *   Scenario 5 — Abandoned job: abandonJob() clears state; no bleed to next job.
 *   Scenario 6 — Reveal is dismissable: dismiss() invokes onDismiss; no stuck state.
 *   Scenario 8 — Minimal-damage job: payload built and reveal fires regardless.
 */

'use strict';

const { WatchStateCapture } = require('./WatchStateCapture');
const { CompletionRevealScreen } = require('./CompletionRevealScreen');
const { CompletionRevealAudioController, COMPLETION_AUDIO_CUES } = require('./CompletionRevealAudioController');

/** Telemetry / instrumentation event names emitted by this orchestrator. */
const REVEAL_EVENTS = {
  JOB_STATE_CAPTURED:  'completion_reveal_job_state_captured',
  REVEAL_TRIGGERED:    'completion_reveal_triggered',
  REVEAL_DISMISSED:    'completion_reveal_dismissed',
  JOB_ABANDONED:       'completion_reveal_job_abandoned',
  REVEAL_ABORTED:      'completion_reveal_aborted',
};

class CompletionRevealSequence {
  /**
   * @param {Object}    opts
   * @param {Function}  opts.audioHook             Injected audio: (cueId) => void.
   * @param {Function}  [opts.instrumentationHook] Telemetry: (eventName, payload) => void.
   * @param {Function}  [opts.onReveal]            Called with RevealPayload when reveal fires.
   * @param {Function}  [opts.onDismiss]           Called with { jobId } when player dismisses.
   * @param {Function}  [opts.onAbort]             Called with { jobId } on abort().
   * @param {Object}    [opts.saveState]           Optional PlayerSaveState instance for persistence.
   * @param {boolean}   [opts.audioEnabled]        false to disable audio (AC5).
   * @param {string}    [opts.displayMode]         'side_by_side' | 'animated_reveal'.
   * @param {number}    [opts.dismissableAfterMs]  Reveal dismissal gate in ms (default 5000).
   */
  constructor({
    audioHook,
    instrumentationHook = null,
    onReveal    = null,
    onDismiss   = null,
    onAbort     = null,
    saveState   = null,
    audioEnabled      = true,
    displayMode       = 'side_by_side',
    dismissableAfterMs,
  }) {
    this._instrumentationHook = typeof instrumentationHook === 'function' ? instrumentationHook : null;
    this._onReveal    = typeof onReveal  === 'function' ? onReveal  : null;
    this._onDismiss   = typeof onDismiss === 'function' ? onDismiss : null;
    this._onAbort     = typeof onAbort   === 'function' ? onAbort   : null;
    this._saveState   = saveState || null;

    this._stateCapture = new WatchStateCapture();

    const screenOpts = { displayMode };
    if (dismissableAfterMs !== undefined) screenOpts.dismissableAfterMs = dismissableAfterMs;
    this._screen = new CompletionRevealScreen(screenOpts);

    this._audio = new CompletionRevealAudioController({ audioHook, audioEnabled });

    /** Set of jobIds for which a reveal is currently active (not yet dismissed). */
    this._activeReveals = new Set();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle — called by the game layer
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Capture watch before-state at job-start.
   * Must be called once at intake / job-start boundary before any repair steps.
   *
   * Subsequent calls with the same jobId are silently ignored (AC4: no mid-repair overwrite).
   * Persists before-state to saveState if one is injected.
   *
   * @param {string} jobId          Stable job identifier.
   * @param {Object} watchSnapshot  Watch appearance at intake.
   * @returns {boolean}  true if captured (first call for this jobId); false if already captured.
   */
  prepareForJob(jobId, watchSnapshot) {
    const captured = this._stateCapture.captureJobStart(jobId, watchSnapshot);

    if (captured) {
      // Persist to save/session data system (AC4, Constraint: state data storage).
      this._persistBeforeState(jobId, watchSnapshot);

      this._emit(REVEAL_EVENTS.JOB_STATE_CAPTURED, { jobId, capturedAtMs: Date.now() });
    }

    return captured;
  }

  /**
   * Trigger the full-screen reveal sequence at job-complete.
   * Called automatically by the job-completion flow (AC1).
   *
   * Retrieves the before-state captured at job-start, builds the reveal payload,
   * fires the audio cue, and invokes the onReveal hook.
   *
   * If no before-state exists (pre-feature job / crash), the reveal still fires
   * with beforeAvailable=false (graceful degradation — Design: backward-compat).
   *
   * Issue #256 — Unified Completion Reveal:
   * Pass a CosmeticRestorationSummary instance as `cosmeticSummary` to wire
   * cosmetic badge state into the hero shot.  When omitted (or null), the reveal
   * behaves identically to the pre-#256 implementation — all existing callers are
   * backward-compatible (AC5 confirmed).
   *
   * @param {string} jobId               Stable job identifier.
   * @param {Object} afterSnapshot       Watch appearance at job-complete.
   * @param {Object|null} [cosmeticSummary] Optional CosmeticRestorationSummary instance.
   *   When provided, getSummaryState() is called (guarded: returns null on any error).
   *   When omitted/null, no cosmetic badges are shown in the hero shot.
   * @returns {Object}  The RevealPayload that was passed to onReveal.
   * @throws {Error}    if jobId or afterSnapshot is missing.
   */
  triggerReveal(jobId, afterSnapshot, cosmeticSummary = null) {
    if (!jobId)         throw new Error('CompletionRevealSequence.triggerReveal: jobId is required.');
    if (!afterSnapshot) throw new Error('CompletionRevealSequence.triggerReveal: afterSnapshot is required.');

    const beforeState  = this._stateCapture.getBeforeState(jobId);
    // Issue #256: safeguarded getSummaryState() — returns null on any error (graceful degradation).
    const summaryState = cosmeticSummary ? _safeguardedGetSummaryState(cosmeticSummary) : null;
    const payload      = this._screen.buildRevealPayload(jobId, beforeState, afterSnapshot, summaryState);

    // Mark reveal as active before firing hooks (AC5: dismiss gate tracks this).
    this._activeReveals.add(jobId);

    // Fire audio (AC3)
    this._audio.reset();
    this._audio.fireCompletionCue();

    // Persist after-state alongside before-state for replay (Issue #142 prep).
    this._persistAfterState(jobId, afterSnapshot);

    // Invoke reveal hook (UI layer renders the payload)
    if (this._onReveal) this._onReveal(payload);

    this._emit(REVEAL_EVENTS.REVEAL_TRIGGERED, { jobId, beforeAvailable: payload.beforeAvailable });

    return payload;
  }

  /**
   * Dismiss the reveal screen for jobId.
   * Called by player skip / dismiss input (AC5: no stuck state).
   *
   * Stops audio, clears reveal active state, invokes onDismiss hook.
   *
   * @param {string} jobId
   */
  dismiss(jobId) {
    this._audio.stop();
    this._activeReveals.delete(jobId);
    // Clear in-memory capture after reveal shown (keep persisted record for #142).
    this._stateCapture.clearJob(jobId);

    if (this._onDismiss) this._onDismiss({ jobId });

    this._emit(REVEAL_EVENTS.REVEAL_DISMISSED, { jobId, dismissedAtMs: Date.now() });
  }

  /**
   * Discard the before-state for an abandoned job.
   * Prevents state bleed to subsequent jobs (Scenario 5).
   *
   * @param {string} jobId
   */
  abandonJob(jobId) {
    this._stateCapture.clearJob(jobId);
    this._activeReveals.delete(jobId);

    this._emit(REVEAL_EVENTS.JOB_ABANDONED, { jobId, abandonedAtMs: Date.now() });
  }

  /**
   * Emergency abort — stops audio, clears active reveals, invokes onAbort.
   * Call on scene navigation or unrecoverable error.
   */
  abort() {
    this._audio.stop();
    const activeJobIds = [...this._activeReveals];
    this._activeReveals.clear();

    if (this._onAbort) this._onAbort({ activeJobIds });

    this._emit(REVEAL_EVENTS.REVEAL_ABORTED, { activeJobIds, abortedAtMs: Date.now() });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {boolean} True if a reveal is currently active for jobId. */
  isRevealActive(jobId) { return this._activeReveals.has(jobId); }

  /** @returns {boolean} True if a before-state has been captured for jobId. */
  hasBeforeState(jobId) { return this._stateCapture.hasCapture(jobId); }

  /** @returns {string}  Current audio state. */
  getAudioState() { return this._audio.getAudioState(); }

  /** @returns {WatchStateCapture} Internal state capture (for testing). */
  getStateCapture() { return this._stateCapture; }

  /** @returns {CompletionRevealScreen} Internal reveal screen (for testing). */
  getRevealScreen() { return this._screen; }

  /** @returns {CompletionRevealAudioController} Internal audio controller (for testing). */
  getAudioController() { return this._audio; }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Persist before-state to the injected saveState (Constraint: existing save system).
   * Keyed under 'job_state_captures' as { [jobId]: { before: snapshot } }.
   * Additive and backward-compatible — does not overwrite unrelated save fields.
   *
   * @private
   */
  _persistBeforeState(jobId, snapshot) {
    if (!this._saveState) return;

    const existing = this._saveState.get('job_state_captures') || {};
    const entry    = Object.assign({}, existing[jobId] || {});
    entry.before   = Object.assign({}, snapshot);

    this._saveState.set('job_state_captures', Object.assign({}, existing, { [jobId]: entry }));
  }

  /**
   * Persist after-state to the injected saveState for Issue #142 replay access.
   *
   * @private
   */
  _persistAfterState(jobId, snapshot) {
    if (!this._saveState) return;

    const existing = this._saveState.get('job_state_captures') || {};
    const entry    = Object.assign({}, existing[jobId] || {});
    entry.after    = Object.assign({}, snapshot);

    this._saveState.set('job_state_captures', Object.assign({}, existing, { [jobId]: entry }));
  }

  /**
   * Forward instrumentation event to the injected hook (if any).
   * @private
   */
  _emit(eventName, payload) {
    if (this._instrumentationHook) {
      this._instrumentationHook(eventName, payload);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely call cosmeticSummary.getSummaryState(), guarding against null/undefined
 * return values and any exception thrown by the method.
 *
 * Returns null on any failure so the hero shot degrades gracefully — no crash,
 * no cosmetic badges displayed, base reveal still renders correctly (Issue #256 edge case).
 *
 * @param {Object} cosmeticSummary  CosmeticRestorationSummary instance.
 * @returns {Object|null}  The summary state, or null on any failure.
 * @private
 */
function _safeguardedGetSummaryState(cosmeticSummary) {
  try {
    const state = cosmeticSummary.getSummaryState();
    return state || null;
  } catch (_err) {
    return null;
  }
}

module.exports = { CompletionRevealSequence, REVEAL_EVENTS, COMPLETION_AUDIO_CUES };
