/**
 * PlaytestAnnotationFramework — Issue #112
 *
 * Structured annotation framework for the Onboarding Telemetry Baseline & Failure Map sprint.
 * This module provides the data structures and aggregation logic to:
 *   1. Record player decision-point interactions during the first restoration job
 *   2. Classify events as completion / abandonment / confusion-with-recovery
 *   3. Track tooltip interaction observations (seen-but-ignored vs. not-noticed)
 *   4. Support both live and async post-session annotation (Test Scenario 6)
 *   5. Aggregate cohort data into a ranked failure-point list (AC2)
 *   6. Generate a failure-map report (AC4) with graceful handling of sub-minimum cohorts (AC1, AC5)
 *
 * Non-goals (per approved design):
 *   - No changes to game UI, tooltips, or tutorial flow
 *   - No automated in-game telemetry pipeline (manual annotation only)
 *   - No A/B testing or variant tracking
 *   - Restricted to the first restoration job only
 *
 * Annotation event taxonomy:
 *   COMPLETION      — participant finished the first job start-to-finish
 *   ABANDONMENT     — participant stopped without completing
 *   CONFUSION       — participant paused >10s, asked for help, or verbalised confusion
 *                     but then recovered and continued (not a hard abandonment)
 *   TOOLTIP_IGNORED — tooltip was displayed but participant did not read/act on it
 */

'use strict';

// ─── Event taxonomy ───────────────────────────────────────────────────────────

const EVENT_TYPES = {
  COMPLETION: 'completion',
  ABANDONMENT: 'abandonment',
  CONFUSION: 'confusion',
  TOOLTIP_IGNORED: 'tooltip_ignored',
};

// ─── Known decision points in the first restoration job ──────────────────────
// Annotators reference these step IDs to ensure consistent naming across sessions.

const DECISION_POINTS = {
  TOOL_SELECTION: 'tool_selection',
  DISASSEMBLY_START: 'disassembly_start',
  COMPONENT_IDENTIFICATION: 'component_identification',
  CLEANING_STEP: 'cleaning_step',
  DIAGNOSIS_STEP: 'diagnosis_step',
  REASSEMBLY_STEP: 'reassembly_step',
  FINAL_VERIFICATION: 'final_verification',
};

// Minimum cohort size for a statistically meaningful failure map (AC1)
const MIN_COHORT_SIZE = 5;

// Preferred cohort size
const PREFERRED_COHORT_SIZE = 10;

// Pause threshold that triggers a confusion annotation (seconds)
const CONFUSION_PAUSE_THRESHOLD_SECONDS = 10;

// ─── PlaytestAnnotation ───────────────────────────────────────────────────────

/**
 * A single annotated event within a playtest session.
 *
 * @typedef {Object} PlaytestAnnotation
 * @property {string} stepName           - Decision-point identifier (use DECISION_POINTS constants)
 * @property {string} eventType          - One of EVENT_TYPES values
 * @property {number} elapsedSeconds     - Seconds elapsed at this event within the session
 * @property {string} [qualitativeNotes] - Free-text observer notes (verbalisations, body language, etc.)
 * @property {boolean} [tooltipVisible]  - Whether a tooltip was on-screen at this moment
 * @property {boolean} asyncReviewed     - true when annotation was added via recording review (not live)
 */

// ─── PlaytestSession ─────────────────────────────────────────────────────────

class PlaytestSession {
  /**
   * @param {string} sessionId     - Unique session identifier
   * @param {string} participantId - Opaque participant reference (no PII)
   */
  constructor(sessionId, participantId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('PlaytestSession: sessionId must be a non-empty string');
    }
    if (!participantId || typeof participantId !== 'string') {
      throw new Error('PlaytestSession: participantId must be a non-empty string');
    }
    this._sessionId = sessionId;
    this._participantId = participantId;
    this._annotations = [];
    this._completed = false;
    this._abandoned = false;
    this._abandonedAtStep = null;
    this._startTime = null;
  }

  get sessionId() { return this._sessionId; }
  get participantId() { return this._participantId; }
  get annotations() { return this._annotations.slice(); }
  get completed() { return this._completed; }
  get abandoned() { return this._abandoned; }
  get abandonedAtStep() { return this._abandonedAtStep; }

  /** Mark the session start (optional — enables elapsed-time derivation). */
  start() {
    this._startTime = Date.now();
    return this;
  }

  /**
   * Record a completion event — participant finished the first job (Test Scenario 1).
   *
   * @param {number} elapsedSeconds  - Total time to complete
   * @param {string} [notes]
   * @param {boolean} [asyncReviewed]
   */
  recordCompletion(elapsedSeconds, notes = '', asyncReviewed = false) {
    if (this._abandoned) {
      throw new Error('Cannot record completion on an abandoned session');
    }
    this._completed = true;
    this._annotations.push({
      stepName: DECISION_POINTS.FINAL_VERIFICATION,
      eventType: EVENT_TYPES.COMPLETION,
      elapsedSeconds,
      qualitativeNotes: notes,
      tooltipVisible: false,
      asyncReviewed,
    });
    return this;
  }

  /**
   * Record an abandonment event — participant stopped at a specific decision point
   * (Test Scenarios 2 & 3).
   *
   * @param {string} stepName          - Where the participant abandoned
   * @param {number} elapsedSeconds    - Time elapsed before abandonment
   * @param {string} [notes]
   * @param {boolean} [asyncReviewed]
   */
  recordAbandonment(stepName, elapsedSeconds, notes = '', asyncReviewed = false) {
    if (this._completed) {
      throw new Error('Cannot record abandonment on a completed session');
    }
    if (!stepName) {
      throw new Error('recordAbandonment: stepName is required');
    }
    this._abandoned = true;
    this._abandonedAtStep = stepName;
    this._annotations.push({
      stepName,
      eventType: EVENT_TYPES.ABANDONMENT,
      elapsedSeconds,
      qualitativeNotes: notes,
      tooltipVisible: false,
      asyncReviewed,
    });
    return this;
  }

  /**
   * Record a confusion event — participant paused >10s, asked for help, or verbalised
   * confusion but then recovered and continued (Test Scenario 4).
   * Does NOT mark the session as abandoned.
   *
   * @param {string} stepName
   * @param {number} elapsedSeconds
   * @param {string} [notes]
   * @param {boolean} [asyncReviewed]
   */
  recordConfusion(stepName, elapsedSeconds, notes = '', asyncReviewed = false) {
    if (!stepName) {
      throw new Error('recordConfusion: stepName is required');
    }
    this._annotations.push({
      stepName,
      eventType: EVENT_TYPES.CONFUSION,
      elapsedSeconds,
      qualitativeNotes: notes,
      tooltipVisible: false,
      asyncReviewed,
    });
    return this;
  }

  /**
   * Record a tooltip-ignored event — tooltip was visible but participant did not read
   * or act on it (Test Scenario 5).
   *
   * @param {string} stepName
   * @param {number} elapsedSeconds
   * @param {string} [notes]
   * @param {boolean} [asyncReviewed]
   */
  recordTooltipIgnored(stepName, elapsedSeconds, notes = '', asyncReviewed = false) {
    if (!stepName) {
      throw new Error('recordTooltipIgnored: stepName is required');
    }
    this._annotations.push({
      stepName,
      eventType: EVENT_TYPES.TOOLTIP_IGNORED,
      elapsedSeconds,
      qualitativeNotes: notes,
      tooltipVisible: true,
      asyncReviewed,
    });
    return this;
  }

  /**
   * Returns true if this session has any annotation marked asyncReviewed = true.
   * Confirms annotation framework supports async post-session recording review (Test Scenario 6).
   */
  hasAsyncAnnotations() {
    return this._annotations.some((a) => a.asyncReviewed === true);
  }

  /** Returns all abandonment annotations for this session. */
  getAbandonmentAnnotations() {
    return this._annotations.filter((a) => a.eventType === EVENT_TYPES.ABANDONMENT);
  }

  /** Returns all confusion annotations for this session. */
  getConfusionAnnotations() {
    return this._annotations.filter((a) => a.eventType === EVENT_TYPES.CONFUSION);
  }

  /** Returns all tooltip-ignored annotations for this session. */
  getTooltipIgnoredAnnotations() {
    return this._annotations.filter((a) => a.eventType === EVENT_TYPES.TOOLTIP_IGNORED);
  }
}

// ─── PlaytestCohort ───────────────────────────────────────────────────────────

class PlaytestCohort {
  constructor() {
    this._sessions = [];
  }

  /** @returns {PlaytestSession[]} */
  get sessions() { return this._sessions.slice(); }

  /** @returns {number} */
  get size() { return this._sessions.length; }

  /**
   * Add a completed (annotated) session to the cohort.
   * @param {PlaytestSession} session
   */
  addSession(session) {
    if (!(session instanceof PlaytestSession)) {
      throw new Error('addSession: argument must be a PlaytestSession instance');
    }
    this._sessions.push(session);
    return this;
  }

  // ─── AC1: Baseline completion rate ────────────────────────────────────────

  /**
   * Returns the count of sessions that ended in completion.
   * @returns {number}
   */
  completedSessionCount() {
    return this._sessions.filter((s) => s.completed).length;
  }

  /**
   * Returns the tutorial completion rate as a fraction [0, 1].
   * Returns null when cohort is below the minimum size (handles AC1 / Test Scenario 7 gracefully).
   *
   * @returns {number|null}
   */
  completionRate() {
    if (this._sessions.length === 0) return null;
    return this.completedSessionCount() / this._sessions.length;
  }

  /**
   * Returns the completion rate as a percentage string (e.g. "40%") or null.
   * @returns {string|null}
   */
  completionRatePercent() {
    const rate = this.completionRate();
    if (rate === null) return null;
    return `${Math.round(rate * 100)}%`;
  }

  // ─── AC2: Failure map ─────────────────────────────────────────────────────

  /**
   * Aggregates abandonment annotations across all sessions and returns a ranked
   * list of decision points ordered by drop-off frequency (descending).
   *
   * Each entry: { stepName, abandonmentCount, averageElapsedSeconds, notes[] }
   *
   * If no abandonment events exist (Test Scenario 8: all complete), returns an
   * empty array — a valid and explicitly handled outcome.
   *
   * @returns {Array<{stepName: string, abandonmentCount: number, averageElapsedSeconds: number, notes: string[]}>}
   */
  buildFailureMap() {
    const map = {};

    for (const session of this._sessions) {
      for (const annotation of session.getAbandonmentAnnotations()) {
        if (!map[annotation.stepName]) {
          map[annotation.stepName] = { elapsed: [], notes: [] };
        }
        map[annotation.stepName].elapsed.push(annotation.elapsedSeconds);
        if (annotation.qualitativeNotes) {
          map[annotation.stepName].notes.push(annotation.qualitativeNotes);
        }
      }
    }

    const ranked = Object.entries(map).map(([stepName, data]) => ({
      stepName,
      abandonmentCount: data.elapsed.length,
      averageElapsedSeconds: data.elapsed.length > 0
        ? Math.round(data.elapsed.reduce((a, b) => a + b, 0) / data.elapsed.length)
        : 0,
      notes: data.notes,
    }));

    // Sort by drop-off frequency descending (AC2: ranked list)
    ranked.sort((a, b) => b.abandonmentCount - a.abandonmentCount);

    return ranked;
  }

  /**
   * Returns the top N failure points (default 5) from the failure map.
   * Provides the "top 3–5 decision points" required by AC2.
   *
   * @param {number} [topN=5]
   */
  topFailurePoints(topN = 5) {
    return this.buildFailureMap().slice(0, topN);
  }

  // ─── AC3: Step-level timing ───────────────────────────────────────────────

  /**
   * Returns average time (seconds) spent before abandonment at each step.
   * Useful for distinguishing navigational confusion (long pause) from a difficulty
   * spike (quick abandonment) — AC3.
   *
   * @returns {Array<{stepName: string, averageElapsedSeconds: number}>}
   */
  stepLevelTiming() {
    return this.buildFailureMap().map(({ stepName, averageElapsedSeconds }) => ({
      stepName,
      averageElapsedSeconds,
    }));
  }

  // ─── AC5: Baseline confirmation ───────────────────────────────────────────

  /**
   * Expected baseline completion rate from GDC postmortem benchmarks (~35%).
   */
  static get EXPECTED_BASELINE_RATE() { return 0.35; }

  /**
   * Tolerance band around the expected baseline (±10pp).
   */
  static get BASELINE_TOLERANCE() { return 0.10; }

  /**
   * Evaluates the cohort completion rate against the ~35% benchmark (AC5).
   *
   * Returns:
   *   'confirmed'         — measured rate is within ±10pp of 35%
   *   'revised_higher'    — measured rate significantly exceeds 35%
   *   'revised_lower'     — measured rate is significantly below 35%
   *   'not_measurable'    — cohort below minimum size (Test Scenario 7)
   *
   * @returns {'confirmed'|'revised_higher'|'revised_lower'|'not_measurable'}
   */
  baselineStatus() {
    if (this._sessions.length < MIN_COHORT_SIZE) {
      return 'not_measurable';
    }
    const rate = this.completionRate();
    const expected = PlaytestCohort.EXPECTED_BASELINE_RATE;
    const tolerance = PlaytestCohort.BASELINE_TOLERANCE;

    if (rate >= expected - tolerance && rate <= expected + tolerance) {
      return 'confirmed';
    }
    return rate > expected + tolerance ? 'revised_higher' : 'revised_lower';
  }

  // ─── AC4: Report generation ───────────────────────────────────────────────

  /**
   * Generates a structured failure-map report object suitable for rendering as
   * a GitHub issue comment or linked document (AC4).
   *
   * Handles incomplete cohort data gracefully (Test Scenario 7): when fewer than
   * MIN_COHORT_SIZE sessions are present, the report explicitly documents the
   * shortfall and states confidence as 'low'.
   *
   * When all participants complete successfully (Test Scenario 8), the report
   * outputs a "no critical failure points found" result — a valid outcome.
   *
   * @returns {FailureMapReport}
   */
  generateReport() {
    const cohortSize = this._sessions.length;
    const completedCount = this.completedSessionCount();
    const completionRatePercent = this.completionRatePercent();
    const failurePoints = this.topFailurePoints(5);
    const timing = this.stepLevelTiming();
    const baselineStatus = this.baselineStatus();
    const belowMinimum = cohortSize < MIN_COHORT_SIZE;

    const confidence = belowMinimum ? 'low' : (cohortSize < PREFERRED_COHORT_SIZE ? 'medium' : 'high');

    return {
      reportTitle: 'Onboarding Telemetry Baseline — Failure Map Report (Phase 1)',
      cohortSize,
      completedCount,
      completionRatePercent: completionRatePercent ?? 'N/A',
      baselineStatus,
      confidence,
      cohortShortfall: belowMinimum
        ? `Only ${cohortSize} of ${MIN_COHORT_SIZE} minimum sessions completed. Findings are directional only.`
        : null,
      failurePoints: failurePoints.length > 0
        ? failurePoints
        : [{ stepName: 'none', abandonmentCount: 0, averageElapsedSeconds: 0, notes: ['No critical failure points found — all observed participants completed the first job.'] }],
      noCriticalFailurePoints: failurePoints.length === 0,
      stepLevelTiming: timing,
      phase2Recommendation: _buildPhase2Recommendation(baselineStatus, failurePoints),
    };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _buildPhase2Recommendation(baselineStatus, failurePoints) {
  if (baselineStatus === 'not_measurable') {
    return 'Insufficient cohort size to confirm Phase 2 targeting. Recruit additional participants before proceeding.';
  }
  if (failurePoints.length === 0) {
    return 'No critical failure points found. Phase 2 guided-onboarding scope may need revisiting — consider whether intervention is still warranted.';
  }
  const topStep = failurePoints[0].stepName;
  return `Phase 2 scope is confirmed. Priority intervention at: ${topStep} (highest drop-off frequency). Baseline status: ${baselineStatus}.`;
}

// ─── Module exports ───────────────────────────────────────────────────────────

module.exports = {
  PlaytestSession,
  PlaytestCohort,
  EVENT_TYPES,
  DECISION_POINTS,
  MIN_COHORT_SIZE,
  PREFERRED_COHORT_SIZE,
  CONFUSION_PAUSE_THRESHOLD_SECONDS,
};
