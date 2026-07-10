/**
 * WatchStateCapture — one-time before-state snapshot at job-start.
 * Issue #141 — Full-Watch Completion Reveal: Core System
 *
 * Responsibilities:
 *   - Accept a single before-state snapshot at job-start, keyed by jobId.
 *   - Reject duplicate captures for the same job (no mid-repair overwrites).
 *   - Return the stored before-state for use by CompletionRevealSequence at
 *     job-complete time.
 *   - Discard captured state on job abandonment or after reveal completion.
 *
 * Design decisions (per approved design, Issue #141):
 *   - Before-state is captured ONCE at job-start only; no mid-repair snapshots
 *     are stored.  This keeps the storage footprint predictable and the data
 *     model straightforward for Issue #142 replay access (Constraint: state
 *     capture scope).
 *   - State is keyed by a stable jobId so consecutive, abandoned, and restarted
 *     jobs cannot share state (Design mitigation: per-job state keying).
 *   - This module is purely data-management (no DOM / audio / save-I/O
 *     dependencies) and is fully testable in isolation.
 *
 * Acceptance criteria covered:
 *   AC4 — before-state captured once at job-start; no mid-repair overwrites.
 *   AC1 — state is accessible at reveal time (job-complete).
 *   (Scenario 4) — consecutive jobs: each job has its own isolated capture.
 *   (Scenario 5) — abandoned job: clearJob() removes orphaned before-state.
 */

'use strict';

class WatchStateCapture {
  constructor() {
    /** @type {Map<string, Object>} jobId → captured before-state snapshot */
    this._captures = new Map();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Capture the watch before-state at job-start.
   * Called exactly once per job — at intake / job-start boundary.
   *
   * If a capture already exists for jobId, the call is a no-op and returns
   * false (no overwrite — AC4 single-snapshot invariant).
   *
   * @param {string} jobId           Stable job identifier.
   * @param {Object} watchSnapshot   Snapshot of the watch visual state at intake.
   *   Shape is caller-defined; this module stores it opaquely.
   *   Recommended fields: { watchId, watchName, damageState, visualCues, capturedAtMs }
   * @returns {boolean}  true if captured (first call); false if already captured (no-op).
   */
  captureJobStart(jobId, watchSnapshot) {
    if (!jobId) throw new Error('WatchStateCapture.captureJobStart: jobId is required.');
    if (watchSnapshot == null) throw new Error('WatchStateCapture.captureJobStart: watchSnapshot is required.');

    if (this._captures.has(jobId)) {
      // Guard: no mid-repair overwrite (AC4).
      return false;
    }

    this._captures.set(jobId, Object.assign({}, watchSnapshot, { _capturedAtMs: Date.now() }));
    return true;
  }

  /**
   * Retrieve the before-state snapshot for jobId.
   * Returns null if no capture exists (e.g. orphaned session, pre-feature job).
   *
   * @param {string} jobId
   * @returns {Object|null}
   */
  getBeforeState(jobId) {
    return this._captures.has(jobId)
      ? Object.assign({}, this._captures.get(jobId))
      : null;
  }

  /**
   * Returns true if a before-state capture exists for jobId.
   *
   * @param {string} jobId
   * @returns {boolean}
   */
  hasCapture(jobId) {
    return this._captures.has(jobId);
  }

  /**
   * Discard the captured state for jobId.
   * Call on job abandonment (Scenario 5) or after the reveal has been shown.
   *
   * @param {string} jobId
   * @returns {boolean}  true if an entry was removed; false if it was not present.
   */
  clearJob(jobId) {
    return this._captures.delete(jobId);
  }

  /**
   * Returns the number of currently held captures (for testing / diagnostics).
   * @returns {number}
   */
  captureCount() {
    return this._captures.size;
  }
}

module.exports = { WatchStateCapture };
