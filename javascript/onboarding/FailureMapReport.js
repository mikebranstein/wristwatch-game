/**
 * FailureMapReport — Onboarding Telemetry Baseline & Failure Map (Issue #112)
 *
 * Aggregates annotated playtest sessions into a ranked failure-point report.
 * Produces the deliverable required by Acceptance Criteria 1–5 of Issue #112.
 *
 * Zero game code is modified by this module. This is a pure research artifact.
 *
 * Output schema per design decision:
 *   - Baseline completion rate (%)
 *   - Ranked list of top 3–5 failure points ordered by drop-off frequency
 *   - Step-level timing data (average time-before-abandonment)
 *   - Confidence statement (handles sub-minimum cohort per test scenario #7)
 *   - "No critical failure points" result (valid outcome per test scenario #8)
 */

'use strict';

const { EVENT_TYPES } = require('./AnnotationRubric');

// ─── Constants ────────────────────────────────────────────────────────────────

const MINIMUM_COHORT_SIZE = 5;
const PREFERRED_COHORT_SIZE = 8;
const BASELINE_COMPLETION_RATE_HYPOTHESIS = 0.35; // 35% hypothesis from GDC benchmarks

// Root-cause categories for failure-map entries
const ROOT_CAUSE = {
  NAVIGATIONAL_CONFUSION: 'navigational_confusion',
  SKILL_GAP: 'skill_gap',
  UX_FRICTION: 'ux_friction',
  TOOLTIP_FAILURE: 'tooltip_failure',
  UNKNOWN: 'unknown',
};

// ─── FailurePoint ─────────────────────────────────────────────────────────────

/**
 * A single ranked failure point in the failure map report.
 * Aggregated from AnnotationRubric entries across multiple sessions.
 */
class FailurePoint {
  /**
   * @param {Object} params
   * @param {string}   params.stepName                  The decision-point step name
   * @param {number}   params.abandonmentCount           # sessions that abandoned here
   * @param {number}   params.confusionCount             # sessions with confusion-with-recovery
   * @param {number}   params.averageTimeBeforeEventSecs Avg elapsed seconds before abandonment/confusion
   * @param {string[]} params.observableBehaviors        Annotator notes summarised as behavior list
   * @param {string}   params.likelyCause                One of ROOT_CAUSE values
   * @param {number}   params.tooltipIgnoredCount        # sessions where tooltip was ignored here
   */
  constructor({
    stepName,
    abandonmentCount = 0,
    confusionCount = 0,
    averageTimeBeforeEventSecs = 0,
    observableBehaviors = [],
    likelyCause = ROOT_CAUSE.UNKNOWN,
    tooltipIgnoredCount = 0,
  }) {
    if (!stepName || typeof stepName !== 'string') {
      throw new Error('FailurePoint: stepName is required.');
    }
    this.stepName = stepName;
    this.abandonmentCount = abandonmentCount;
    this.confusionCount = confusionCount;
    this.averageTimeBeforeEventSecs = averageTimeBeforeEventSecs;
    this.observableBehaviors = Array.isArray(observableBehaviors) ? observableBehaviors : [];
    this.likelyCause = likelyCause;
    this.tooltipIgnoredCount = tooltipIgnoredCount;
  }

  /**
   * Combined signal score used for ranking:
   * Abandonments weighted 2× over confusion events (per AC #2 — drop-off is primary signal).
   */
  get dropOffScore() {
    return this.abandonmentCount * 2 + this.confusionCount;
  }

  toJSON() {
    return {
      stepName: this.stepName,
      abandonmentCount: this.abandonmentCount,
      confusionCount: this.confusionCount,
      averageTimeBeforeEventSecs: this.averageTimeBeforeEventSecs,
      observableBehaviors: this.observableBehaviors,
      likelyCause: this.likelyCause,
      tooltipIgnoredCount: this.tooltipIgnoredCount,
      dropOffScore: this.dropOffScore,
    };
  }
}

// ─── FailureMapReport ─────────────────────────────────────────────────────────

/**
 * Aggregates a cohort of AnnotationRubric sessions into the failure-map report
 * deliverable for Issue #112.
 *
 * Usage:
 *   const report = new FailureMapReport({ sessions: [rubric1, rubric2, ...] });
 *   report.getTopFailurePoints();       // ranked list, max 5 items
 *   report.getCompletionRate();         // 0.0–1.0 numeric rate
 *   report.getConfidenceStatement();    // per AC #5
 */
class FailureMapReport {
  /**
   * @param {Object}            params
   * @param {AnnotationRubric[]} params.sessions        All annotated session rubrics
   * @param {number}            [params.minimumCohortSize] Override minimum (default: 5)
   */
  constructor({ sessions = [], minimumCohortSize = MINIMUM_COHORT_SIZE } = {}) {
    if (!Array.isArray(sessions)) {
      throw new Error('FailureMapReport: sessions must be an array of AnnotationRubric instances.');
    }
    this._sessions = sessions;
    this._minimumCohortSize = minimumCohortSize;
    this._failurePoints = null; // lazy-computed on first access
  }

  // ─── AC #1: Cohort & completion rate ────────────────────────────────────────

  /** Number of sessions in the cohort. */
  get cohortSize() {
    return this._sessions.length;
  }

  /** True if cohort meets the minimum threshold for meaningful pattern detection. */
  hasSufficientCohort() {
    return this._sessions.length >= this._minimumCohortSize;
  }

  /**
   * Completion rate as a value 0.0–1.0 (fraction of sessions that completed the first job).
   * Returns null if cohort is empty (avoids division-by-zero).
   */
  getCompletionRate() {
    if (this._sessions.length === 0) return null;
    const completed = this._sessions.filter((s) => s.isSessionComplete()).length;
    return completed / this._sessions.length;
  }

  /** Returns the number of sessions that completed the first job. */
  getCompletedSessionCount() {
    return this._sessions.filter((s) => s.isSessionComplete()).length;
  }

  // ─── AC #2: Failure-point computation ───────────────────────────────────────

  /**
   * Aggregate all annotation entries across sessions into per-step FailurePoint objects,
   * then return sorted by drop-off score descending.
   *
   * @param {number} [maxPoints=5]  Maximum failure points to return (3–5 per design)
   * @returns {FailurePoint[]}
   */
  getTopFailurePoints(maxPoints = 5) {
    if (this._failurePoints === null) {
      this._failurePoints = this._aggregateFailurePoints();
    }
    return this._failurePoints
      .filter((fp) => fp.dropOffScore > 0 || fp.tooltipIgnoredCount > 0)
      .sort((a, b) => b.dropOffScore - a.dropOffScore || b.tooltipIgnoredCount - a.tooltipIgnoredCount)
      .slice(0, maxPoints);
  }

  /**
   * True if no sessions recorded any abandonment or confusion — a valid and
   * useful outcome per test scenario #8.
   */
  hasNoFailurePoints() {
    return this.getTopFailurePoints().length === 0;
  }

  // ─── AC #3: Step-level timing ────────────────────────────────────────────────

  /**
   * Returns average time-before-abandonment for a given step, in seconds.
   * Returns null if no abandonment entries exist for that step.
   *
   * @param {string} stepName
   * @returns {number|null}
   */
  getAverageTimeBeforeAbandonmentForStep(stepName) {
    const times = [];
    for (const session of this._sessions) {
      for (const entry of session.getEntriesForStep(stepName)) {
        if (entry.isAbandonment()) {
          times.push(entry.elapsedTimeSeconds);
        }
      }
    }
    if (times.length === 0) return null;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  // ─── AC #5: Confidence & baseline confirmation ───────────────────────────────

  /**
   * Returns a structured confidence statement for the failure-map report.
   * Handles: sufficient cohort, insufficient cohort, confirmed/revised hypothesis.
   *
   * @returns {{ status: string, message: string, completionRate: number|null, cohortSize: number }}
   */
  getConfidenceStatement() {
    const rate = this.getCompletionRate();
    const size = this.cohortSize;

    if (size === 0) {
      return {
        status: 'NO_DATA',
        message: 'No playtest sessions have been recorded yet.',
        completionRate: null,
        cohortSize: 0,
      };
    }

    if (!this.hasSufficientCohort()) {
      return {
        status: 'INSUFFICIENT_COHORT',
        message: `Only ${size} of ${this._minimumCohortSize} required sessions completed. ` +
          'Pattern confidence is low; findings are directional only. ' +
          'Recruit additional participants before finalising Phase 2 scope.',
        completionRate: rate,
        cohortSize: size,
      };
    }

    // Sufficient cohort — assess hypothesis
    const hypothesisRange = { low: 0.25, high: 0.45 }; // ±10pp around 35%
    let status;
    let message;

    if (rate >= hypothesisRange.low && rate <= hypothesisRange.high) {
      status = 'BASELINE_CONFIRMED';
      message =
        `Baseline completion rate ${(rate * 100).toFixed(1)}% is consistent with the ` +
        `~35% GDC benchmark hypothesis. Phase 2 target of ≥60% is correctly calibrated.`;
    } else if (rate < hypothesisRange.low) {
      status = 'BASELINE_REVISED_LOWER';
      message =
        `Baseline completion rate ${(rate * 100).toFixed(1)}% is below the ~35% hypothesis. ` +
        'Phase 2 target may need to be recalibrated — problem is more severe than expected.';
    } else {
      status = 'BASELINE_REVISED_HIGHER';
      message =
        `Baseline completion rate ${(rate * 100).toFixed(1)}% is above the ~35% hypothesis. ` +
        'Phase 2 target of ≥60% is still valid but may be achievable with smaller intervention.';
    }

    return { status, message, completionRate: rate, cohortSize: size };
  }

  // ─── Serialisation ───────────────────────────────────────────────────────────

  toJSON() {
    const confidence = this.getConfidenceStatement();
    const topFailures = this.getTopFailurePoints();
    return {
      cohortSize: this.cohortSize,
      completedSessionCount: this.getCompletedSessionCount(),
      completionRate: this.getCompletionRate(),
      hasSufficientCohort: this.hasSufficientCohort(),
      hasNoFailurePoints: this.hasNoFailurePoints(),
      confidenceStatement: confidence,
      topFailurePoints: topFailures.map((fp) => fp.toJSON()),
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Walk all entries across all sessions and aggregate into per-step FailurePoint objects.
   * @returns {FailurePoint[]}
   */
  _aggregateFailurePoints() {
    const stepMap = new Map(); // stepName → { abandonmentTimes[], confusionCount, tooltipIgnored, behaviors[] }

    for (const session of this._sessions) {
      for (const entry of session.getEntries()) {
        if (!stepMap.has(entry.stepName)) {
          stepMap.set(entry.stepName, {
            abandonmentTimes: [],
            confusionCount: 0,
            tooltipIgnoredCount: 0,
            behaviors: [],
          });
        }
        const acc = stepMap.get(entry.stepName);
        if (entry.isAbandonment()) {
          acc.abandonmentTimes.push(entry.elapsedTimeSeconds);
        }
        if (entry.isConfusionWithRecovery()) {
          acc.confusionCount += 1;
        }
        if (entry.isTooltipIgnored()) {
          acc.tooltipIgnoredCount += 1;
        }
        if (entry.notes) {
          acc.behaviors.push(entry.notes);
        }
      }
    }

    const failurePoints = [];
    for (const [stepName, acc] of stepMap.entries()) {
      const avgTime =
        acc.abandonmentTimes.length > 0
          ? acc.abandonmentTimes.reduce((a, b) => a + b, 0) / acc.abandonmentTimes.length
          : 0;

      // Infer likely cause from aggregated signals
      let likelyCause = ROOT_CAUSE.UNKNOWN;
      if (acc.tooltipIgnoredCount >= acc.abandonmentTimes.length && acc.tooltipIgnoredCount > 0) {
        likelyCause = ROOT_CAUSE.TOOLTIP_FAILURE;
      } else if (avgTime > 0 && avgTime < 30) {
        likelyCause = ROOT_CAUSE.UX_FRICTION;
      } else if (avgTime >= 30) {
        likelyCause = ROOT_CAUSE.NAVIGATIONAL_CONFUSION;
      } else if (acc.confusionCount > 0) {
        likelyCause = ROOT_CAUSE.SKILL_GAP;
      }

      failurePoints.push(
        new FailurePoint({
          stepName,
          abandonmentCount: acc.abandonmentTimes.length,
          confusionCount: acc.confusionCount,
          averageTimeBeforeEventSecs: avgTime,
          observableBehaviors: acc.behaviors,
          likelyCause,
          tooltipIgnoredCount: acc.tooltipIgnoredCount,
        })
      );
    }
    return failurePoints;
  }
}

module.exports = {
  FailureMapReport,
  FailurePoint,
  ROOT_CAUSE,
  MINIMUM_COHORT_SIZE,
  PREFERRED_COHORT_SIZE,
  BASELINE_COMPLETION_RATE_HYPOTHESIS,
};
