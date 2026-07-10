/**
 * CompletionRevealScreen — hero-shot reveal screen payload builder.
 * Issue #141 — Full-Watch Completion Reveal: Core System
 *
 * Responsibilities:
 *   - Construct a structured reveal payload combining the before-state (captured
 *     at job-start) and the after-state (captured at job-complete).
 *   - Expose a dismissability check so the UI layer can enforce the 5-second
 *     dismissal window (Constraint: dismissal requirement, AC5).
 *   - This module is purely data-construction (no DOM / canvas / audio
 *     dependencies) and is fully testable in isolation.
 *
 * Design decisions (per approved design, Issue #141):
 *   - Reveal is full-screen (or near-full-screen) — payload carries
 *     `fullScreen: true` by default; the UI render layer may override.
 *   - Both states display the FULL assembled watch, not individual parts
 *     (Non-goal: before/after for individual parts is SO #50 Cleaning Reveal scope).
 *   - displayMode defaults to 'side_by_side'; callers may request 'animated_reveal'
 *     for the format validated by Issue #140.
 *   - No share button, social integration, or clip controls — those are Issue #3.
 *   - Backward-compatible: if beforeState is null (pre-feature job, crash recovery),
 *     the payload carries `beforeAvailable: false` and the reveal degrades gracefully.
 *
 * Acceptance criteria covered:
 *   AC1  — payload produced automatically when triggered at job-complete.
 *   AC2  — both states reference the full assembled watch (fullWatchView: true).
 *   AC4  — beforeState is the job-start snapshot (caller is responsible for the correct
 *          snapshot; this module validates its presence).
 *   AC5  — isDismissable() enforces the 5-second (configurable) dismissal gate.
 *   (Scenario 8) — minimal-damage job: payload produced even when contrast is subtle.
 */

'use strict';

/** Default dismissable-after threshold: 5 000 ms (Constraint: dismissal ≤ 5 s). */
const DEFAULT_DISMISSABLE_AFTER_MS = 5000;

/**
 * @typedef {Object} RevealPayload
 * @property {string}   jobId
 * @property {boolean}  fullScreen           Always true (full-screen reveal, AC2)
 * @property {boolean}  fullWatchView        Always true (whole watch, not parts, AC2)
 * @property {string}   displayMode          'side_by_side' | 'animated_reveal'
 * @property {boolean}  beforeAvailable      false when no before-state exists (crash/pre-feature)
 * @property {Object|null} beforeState       Watch snapshot at job-start (AC4)
 * @property {Object}   afterState           Watch snapshot at job-complete
 * @property {number}   dismissableAfterMs   Reveal is dismissable after this many ms (AC5)
 * @property {number}   builtAtMs            Timestamp when payload was built
 */

class CompletionRevealScreen {
  /**
   * @param {Object} [opts]
   * @param {string}  [opts.displayMode='side_by_side']        Display format.
   * @param {number}  [opts.dismissableAfterMs]                Dismissal gate in ms (default 5000).
   */
  constructor({
    displayMode = 'side_by_side',
    dismissableAfterMs = DEFAULT_DISMISSABLE_AFTER_MS,
  } = {}) {
    this._displayMode = displayMode === 'animated_reveal' ? 'animated_reveal' : 'side_by_side';
    this._dismissableAfterMs = (typeof dismissableAfterMs === 'number' && dismissableAfterMs >= 0)
      ? dismissableAfterMs
      : DEFAULT_DISMISSABLE_AFTER_MS;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build the full-screen reveal payload for the completed job.
   *
   * @param {string}      jobId       Stable job identifier.
   * @param {Object|null} beforeState Before-state snapshot (null → pre-feature / crash).
   * @param {Object}      afterState  After-state snapshot at job-complete.
   * @returns {RevealPayload}
   * @throws {Error} if jobId or afterState is missing.
   */
  buildRevealPayload(jobId, beforeState, afterState) {
    if (!jobId)      throw new Error('CompletionRevealScreen.buildRevealPayload: jobId is required.');
    if (!afterState) throw new Error('CompletionRevealScreen.buildRevealPayload: afterState is required.');

    return {
      jobId,
      fullScreen:          true,
      fullWatchView:       true,
      displayMode:         this._displayMode,
      beforeAvailable:     beforeState != null,
      beforeState:         beforeState ? Object.assign({}, beforeState) : null,
      afterState:          Object.assign({}, afterState),
      dismissableAfterMs:  this._dismissableAfterMs,
      builtAtMs:           Date.now(),
    };
  }

  /**
   * Returns true when the reveal is dismissable (elapsed time ≥ dismissableAfterMs).
   * Callers must pass the elapsed time since the reveal started.
   *
   * AC5: reveal must be skippable/dismissable within 5 seconds.
   *
   * @param {number} elapsedMs  Milliseconds since reveal started playing.
   * @returns {boolean}
   */
  isDismissable(elapsedMs) {
    return (typeof elapsedMs === 'number') && elapsedMs >= this._dismissableAfterMs;
  }

  /**
   * Returns true if a given reveal payload has a usable before-state for
   * high-contrast comparison display.
   *
   * Scenario 8 — minimal-damage: always returns true; the reveal still plays
   * even when the contrast is subtle.  Returns false only when no before-state
   * was available (pre-feature or crash recovery).
   *
   * @param {RevealPayload} payload
   * @returns {boolean}
   */
  hasBeforeState(payload) {
    return !!(payload && payload.beforeAvailable && payload.beforeState);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string}  Active display mode. */
  getDisplayMode() { return this._displayMode; }

  /** @returns {number}  Active dismissable-after threshold in ms. */
  getDismissableAfterMs() { return this._dismissableAfterMs; }
}

module.exports = {
  CompletionRevealScreen,
  DEFAULT_DISMISSABLE_AFTER_MS,
};
