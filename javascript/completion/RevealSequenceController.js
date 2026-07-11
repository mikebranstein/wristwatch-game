/**
 * RevealSequenceController — top-level orchestrator for the Completion Reveal
 * Shareability Layer (Issue #142).
 *
 * Responsibilities:
 *   - Accept a RevealPacingConfig and a SharePromptOverlay at construction time.
 *   - Validate the pacing config before allowing any reveal to fire; reject
 *     invalid configs (AC2 hard-bound enforcement).
 *   - Drive the reveal sequence timeline:
 *       t=0                         → trigger() called; sequence starts
 *       t=peakMomentOffsetMs        → onPeakMoment callback fires; share prompt shown
 *       t=peakMomentOffsetMs+peak   → peak window ends; outro begins
 *       t=totalMs                   → reveal complete; onComplete callback fires
 *   - Support two trigger sources: 'job_completion' and 'job_log_replay' (AC8 —
 *     pacing is identical across both paths because a single RevealPacingConfig
 *     is used for both; no per-trigger timing fork exists here).
 *   - Emit instrumentation events via the injected hook.
 *   - Allow abort() for clean scene/state transitions.
 *
 * Acceptance criteria covered:
 *   AC1 — share prompt is shown exactly at the peak-moment callback (both
 *          before/after states fully visible, after comparison_hold elapses).
 *   AC2 — pacing config is validated; total duration within 20–60 s inclusive.
 *   AC4 — overlay.dismiss() is forwarded here; the sequence continues normally;
 *          no stuck state, visual interruption, or audio glitch.
 *   AC5 — watchId + before/after states passed through to onPeakMoment so the
 *          caller can verify correct states are used (no data drift).
 *   AC8 — pacing timing is identical for 'job_completion' and 'job_log_replay'
 *          trigger sources (same RevealPacingConfig applies to both).
 *
 * Test scenarios covered:
 *   Scenario 1  — Happy path: trigger → peak → share prompt shown → complete.
 *   Scenario 2  — Dismiss: dismiss() mid-peak; sequence completes normally.
 *   Scenario 3  — Clip pacing: total duration within 20–60 s.
 *   Scenario 7  — Share prompt timing: only shown after both states visible.
 *   Scenario 8  — Pacing consistency: timing identical for both trigger paths.
 */

'use strict';

const { RevealPacingConfig } = require('./RevealPacingConfig');
const { SharePromptOverlay } = require('./SharePromptOverlay');

/** Reveal sequence states. */
const REVEAL_STATE = {
  IDLE:       'idle',
  INTRO:      'intro',
  COMPARISON: 'comparison',
  PEAK:       'peak',
  OUTRO:      'outro',
  COMPLETE:   'complete',
  ABORTED:    'aborted',
};

/** Valid trigger sources (AC8 — both share the same pacing). */
const TRIGGER_SOURCES = {
  JOB_COMPLETION: 'job_completion',
  JOB_LOG_REPLAY: 'job_log_replay',
};

class RevealSequenceController {
  /**
   * @param {Object}              opts
   * @param {RevealPacingConfig}  opts.pacingConfig         — validated timing parameters
   * @param {SharePromptOverlay}  opts.sharePromptOverlay   — overlay instance
   * @param {Function}            [opts.onPeakMoment]       — (watchId, beforeState, afterState) => void
   *                                                          Fires when both states fully visible.
   * @param {Function}            [opts.onComplete]         — (watchId, triggerSource) => void
   *                                                          Fires when full sequence ends.
   * @param {Function}            [opts.onAbort]            — (watchId) => void
   * @param {Function}            [opts.instrumentationHook] — (eventName, payload) => void
   */
  constructor({
    pacingConfig,
    sharePromptOverlay,
    onPeakMoment       = null,
    onComplete         = null,
    onAbort            = null,
    instrumentationHook = null,
  }) {
    if (!(pacingConfig instanceof RevealPacingConfig)) {
      throw new TypeError('RevealSequenceController requires a RevealPacingConfig instance.');
    }
    if (!(sharePromptOverlay instanceof SharePromptOverlay)) {
      throw new TypeError('RevealSequenceController requires a SharePromptOverlay instance.');
    }

    // Validate pacing config at construction time (AC2)
    const validation = pacingConfig.validate();
    if (!validation.valid) {
      throw new Error(
        'RevealSequenceController: invalid RevealPacingConfig — ' +
        validation.errors.join('; ')
      );
    }

    this._pacing              = pacingConfig;
    this._overlay             = sharePromptOverlay;
    this._onPeakMoment        = onPeakMoment;
    this._onComplete          = onComplete;
    this._onAbort             = onAbort;
    this._instrumentationHook = instrumentationHook;

    this._state         = REVEAL_STATE.IDLE;
    this._activeWatchId = null;
    this._triggerSource = null;
    this._beforeState   = null;
    this._afterState    = null;

    // Timers
    this._peakTimer     = null;
    this._outroTimer    = null;
    this._completeTimer = null;
    this._aborted       = false;
  }

  // ── Primary API ────────────────────────────────────────────────────────────

  /**
   * Trigger the reveal sequence for a watch.
   *
   * Works for both 'job_completion' and 'job_log_replay' trigger sources —
   * the same RevealPacingConfig applies to both (AC8).
   *
   * @param {Object} opts
   * @param {string} opts.watchId       — unique watch identifier
   * @param {*}      opts.beforeState   — before-restoration watch state (from Issue #141)
   * @param {*}      opts.afterState    — after-restoration watch state
   * @param {string} [opts.triggerSource] — 'job_completion' | 'job_log_replay'
   *
   * @throws {Error} If a reveal is already in progress, or config is invalid.
   */
  trigger({ watchId, beforeState, afterState, triggerSource = TRIGGER_SOURCES.JOB_COMPLETION }) {
    if (this._state !== REVEAL_STATE.IDLE) {
      throw new Error(
        `RevealSequenceController: cannot trigger — sequence is already in state "${this._state}".`
      );
    }
    if (this._aborted) {
      throw new Error('RevealSequenceController: cannot trigger — controller has been aborted.');
    }

    this._activeWatchId = watchId;
    this._triggerSource = triggerSource;
    this._beforeState   = beforeState;
    this._afterState    = afterState;
    this._overlay.reset();

    this._state = REVEAL_STATE.INTRO;

    if (this._instrumentationHook) {
      this._instrumentationHook('reveal_sequence_started', {
        watchId,
        triggerSource,
        totalMs: this._pacing.getTotalMs(),
      });
    }

    // Schedule peak moment (both states fully visible: after intro + comparison_hold)
    const peakOffset = this._pacing.getPeakMomentOffsetMs();
    this._peakTimer = setTimeout(() => {
      if (this._aborted) return;
      this._handlePeakMoment();
    }, peakOffset);

    // Schedule outro start (after peak window ends)
    const outroOffset = peakOffset + this._pacing.getPeakHoldMs();
    this._outroTimer = setTimeout(() => {
      if (this._aborted) return;
      this._state = REVEAL_STATE.OUTRO;
    }, outroOffset);

    // Schedule sequence complete
    const totalMs = this._pacing.getTotalMs();
    this._completeTimer = setTimeout(() => {
      if (this._aborted) return;
      this._handleComplete();
    }, totalMs);
  }

  /**
   * Forward a player dismiss-input to the share prompt overlay (AC4).
   * The reveal sequence continues uninterrupted — this method only transitions
   * the overlay's state; no sequence timers are affected.
   *
   * @returns {boolean} True if the overlay was dismissed as a result of this call.
   */
  dismissSharePrompt() {
    return this._overlay.dismiss();
  }

  /**
   * Abort the in-progress reveal sequence cleanly.
   * Clears all timers; fires onAbort callback; leaves no orphaned state.
   */
  abort() {
    if (this._aborted) return;
    this._aborted = true;

    this._clearTimers();
    this._state = REVEAL_STATE.ABORTED;

    if (this._instrumentationHook) {
      this._instrumentationHook('reveal_sequence_aborted', {
        watchId: this._activeWatchId,
      });
    }

    if (this._onAbort) {
      this._onAbort(this._activeWatchId);
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** @returns {string} Current sequence state (REVEAL_STATE constant). */
  getState() { return this._state; }

  /** @returns {boolean} True while a reveal sequence is in progress. */
  isPlaying() {
    return (
      this._state === REVEAL_STATE.INTRO ||
      this._state === REVEAL_STATE.COMPARISON ||
      this._state === REVEAL_STATE.PEAK ||
      this._state === REVEAL_STATE.OUTRO
    );
  }

  /** @returns {string|null} The watchId of the currently active (or last) reveal. */
  getActiveWatchId() { return this._activeWatchId; }

  /** @returns {string|null} The trigger source of the current reveal. */
  getTriggerSource() { return this._triggerSource; }

  /** @returns {RevealPacingConfig} The pacing configuration used by this controller. */
  getPacingConfig() { return this._pacing; }

  /** @returns {SharePromptOverlay} The share prompt overlay instance. */
  getSharePromptOverlay() { return this._overlay; }

  // ── Private handlers ───────────────────────────────────────────────────────

  /**
   * Fire the peak-moment callback and show the share prompt (AC1).
   * This is the moment both before/after states are fully visible.
   * @private
   */
  _handlePeakMoment() {
    this._state = REVEAL_STATE.PEAK;

    // Show the share prompt at the peak moment (AC1)
    this._overlay.show();

    // Notify caller with watch states for verification (AC5)
    if (this._onPeakMoment) {
      this._onPeakMoment(this._activeWatchId, this._beforeState, this._afterState);
    }
  }

  /**
   * Mark the sequence complete and fire onComplete callback.
   * @private
   */
  _handleComplete() {
    this._state = REVEAL_STATE.COMPLETE;
    this._clearTimers();

    if (this._instrumentationHook) {
      this._instrumentationHook('reveal_sequence_complete', {
        watchId:       this._activeWatchId,
        triggerSource: this._triggerSource,
        totalMs:       this._pacing.getTotalMs(),
      });
    }

    if (this._onComplete) {
      this._onComplete(this._activeWatchId, this._triggerSource);
    }
  }

  /**
   * Clear all scheduled timers (used on abort and complete).
   * @private
   */
  _clearTimers() {
    if (this._peakTimer     !== null) { clearTimeout(this._peakTimer);     this._peakTimer     = null; }
    if (this._outroTimer    !== null) { clearTimeout(this._outroTimer);    this._outroTimer    = null; }
    if (this._completeTimer !== null) { clearTimeout(this._completeTimer); this._completeTimer = null; }
  }
}

module.exports = {
  RevealSequenceController,
  REVEAL_STATE,
  TRIGGER_SOURCES,
};
