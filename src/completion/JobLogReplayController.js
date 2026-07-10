/**
 * JobLogReplayController — surfaces "Replay Reveal" access through the existing
 * job log/history UI for the Completion Reveal Shareability Layer (Issue #142).
 *
 * Responsibilities:
 *   - Read completed watch entries from PlayerSaveState and determine which
 *     jobs have stored reveal states (from Issue #141 Core System) (AC3).
 *   - Expose a per-job `canReplay(entry)` check that returns true only for
 *     jobs that have stored before/after states (AC3).
 *   - For jobs without stored states (completed before this feature shipped),
 *     return a graceful response: { available: false, message: UNAVAILABLE_MSG }
 *     (AC6 — no crashes, blank screens, or broken UI) (Constraint).
 *   - Trigger the reveal replay by delegating to an injected
 *     RevealSequenceController with `triggerSource: 'job_log_replay'` (AC3, AC8).
 *   - Surface replay entries through the existing job log structure — no new
 *     navigation infrastructure is created here (Constraint).
 *   - Emit telemetry via instrumentationHook when replay is triggered.
 *
 * Stored state detection:
 *   An entry has stored reveal states if `entry.before_portrait_url` is a
 *   non-null, non-empty string (set by DeliveryHandler from Issue #141 / #129).
 *   Entries without this field (or with a null/empty value) are treated as
 *   pre-feature jobs and receive the graceful fallback.
 *
 * Acceptance criteria covered:
 *   AC3 — getReplayEntries() returns each completed job with `replayAvailable`
 *          flag; triggerReplay() starts the full reveal sequence from job log.
 *   AC5 — triggerReplay() passes the stored before/after states verbatim to
 *          RevealSequenceController so the same states as the original reveal
 *          are used (no data drift or state mismatch).
 *   AC6 — triggerReplay() for a job without stored states returns
 *          { success: false, message: UNAVAILABLE_MSG } without throwing.
 *
 * Test scenarios covered:
 *   Scenario 4  — Replay from job log (single job): correct states used.
 *   Scenario 5  — Replay from job log (multiple jobs): no cross-contamination.
 *   Scenario 6  — No stored states: graceful hide/message, no crash.
 */

'use strict';

const { TRIGGER_SOURCES } = require('./RevealSequenceController');

/** Message shown when a job has no stored reveal states (AC6, Constraint). */
const UNAVAILABLE_MSG = 'Reveal not available for this job.';

class JobLogReplayController {
  /**
   * @param {Object}   [opts]
   * @param {Function} [opts.instrumentationHook]  — (eventName, payload) => void
   */
  constructor({ instrumentationHook = null } = {}) {
    this._instrumentationHook = instrumentationHook;
  }

  // ── Query API ──────────────────────────────────────────────────────────────

  /**
   * Returns an array of replay entry descriptors, one per completed watch in
   * the save state, with a `replayAvailable` flag indicating whether stored
   * states exist (AC3).
   *
   * This is the data the job-log/history UI consumes to decide whether to
   * render a "Replay Reveal" option or the unavailable fallback message for
   * each job entry.
   *
   * @param {Object} saveState — PlayerSaveState instance
   * @returns {Array<{
   *   watchId: string,
   *   watchName: string,
   *   clientName: string,
   *   completionDate: string|null,
   *   replayAvailable: boolean,
   *   unavailableMessage: string|null,
   * }>}
   */
  getReplayEntries(saveState) {
    const watches = saveState.getCompletedWatches();
    return watches.map(entry => {
      const replayAvailable = this._hasStoredStates(entry);
      return {
        watchId:            entry.watchId          ?? entry.watch_id            ?? null,
        watchName:          entry.watchName         ?? entry.watch_name          ?? 'Unknown Watch',
        clientName:         entry.clientName        ?? entry.client_name         ?? 'Unknown Client',
        completionDate:     entry.completionDate    ?? entry.completion_date     ?? null,
        replayAvailable,
        unavailableMessage: replayAvailable ? null : UNAVAILABLE_MSG,
      };
    });
  }

  /**
   * Returns true if the given completed-watch entry has stored reveal states
   * from Issue #141 (before_portrait_url is a non-null, non-empty string).
   *
   * @param {Object} entry — raw completed-watch entry from save state
   * @returns {boolean}
   */
  canReplay(entry) {
    return this._hasStoredStates(entry);
  }

  // ── Replay trigger ─────────────────────────────────────────────────────────

  /**
   * Trigger a "Replay Reveal" for the given watchId using stored states.
   *
   * Looks up the completed-watch entry in save state, verifies stored states
   * exist, then delegates to RevealSequenceController with
   * `triggerSource: 'job_log_replay'` (AC3, AC8).
   *
   * If no stored states are found for the job, returns a graceful failure
   * result (AC6 — no crash, no blank screen, no broken UI).
   *
   * @param {Object} opts
   * @param {string} opts.watchId                    — watch to replay
   * @param {Object} opts.saveState                  — PlayerSaveState instance
   * @param {Object} opts.revealSequenceController   — RevealSequenceController instance
   *
   * @returns {{
   *   success: boolean,
   *   message: string|null,
   *   watchId: string,
   * }}
   */
  triggerReplay({ watchId, saveState, revealSequenceController }) {
    const watches = saveState.getCompletedWatches();
    const entry   = watches.find(e =>
      (e.watchId ?? e.watch_id) === watchId
    );

    if (!entry) {
      return {
        success: false,
        message: UNAVAILABLE_MSG,
        watchId,
      };
    }

    if (!this._hasStoredStates(entry)) {
      // Graceful degradation for jobs completed before this feature shipped (AC6)
      if (this._instrumentationHook) {
        this._instrumentationHook('replay_unavailable', { watchId });
      }
      return {
        success: false,
        message: UNAVAILABLE_MSG,
        watchId,
      };
    }

    // Stored states are available — trigger the reveal replay (AC3, AC5)
    const beforeState = entry.before_portrait_url ?? entry.beforeState ?? null;
    const afterState  = entry.portraitAssetKey    ?? entry.portrait_asset_key ?? null;

    if (this._instrumentationHook) {
      this._instrumentationHook('replay_triggered', {
        watchId,
        triggerSource: TRIGGER_SOURCES.JOB_LOG_REPLAY,
      });
    }

    revealSequenceController.trigger({
      watchId,
      beforeState,
      afterState,
      triggerSource: TRIGGER_SOURCES.JOB_LOG_REPLAY,
    });

    return {
      success: true,
      message: null,
      watchId,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Returns true if the entry has a non-null, non-empty `before_portrait_url`
   * (the stored before-state from Issue #141 / #129).
   *
   * @param {Object} entry
   * @returns {boolean}
   * @private
   */
  _hasStoredStates(entry) {
    const url = entry.before_portrait_url ?? entry.beforeState ?? null;
    return typeof url === 'string' && url.length > 0;
  }
}

module.exports = {
  JobLogReplayController,
  UNAVAILABLE_MSG,
};
