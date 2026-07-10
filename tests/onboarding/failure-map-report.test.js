/**
 * Tests for FailureMapReport — Issue #112: Onboarding Telemetry Baseline & Failure Map
 *
 * Covers acceptance criteria 1–5 and test scenarios 7 & 8:
 *
 * AC1: Baseline completion rate captured across ≥5 sessions.
 * AC2: Ranked list of top 3–5 failure points with observable behavior notes.
 * AC3: Step-level timing (average time-before-abandonment per step).
 * AC4: Report delivered with all required fields (serialisation).
 * AC5: Confidence statement — confirms, revises, or flags insufficient cohort.
 *
 * Scenario 7: Fewer than 5 sessions — report handles incomplete cohort gracefully.
 * Scenario 8: All participants complete — "no critical failure points" is a valid result.
 */

'use strict';

const {
  AnnotationRubric,
  EVENT_TYPES,
  TOOLTIP_INTERACTIONS,
} = require('../../src/onboarding/AnnotationRubric');

const {
  FailureMapReport,
  FailurePoint,
  ROOT_CAUSE,
  MINIMUM_COHORT_SIZE,
  PREFERRED_COHORT_SIZE,
  BASELINE_COMPLETION_RATE_HYPOTHESIS,
} = require('../../src/onboarding/FailureMapReport');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a simple completed session rubric.
 * @param {string} sessionId
 * @returns {AnnotationRubric}
 */
function makeCompletedSession(sessionId) {
  const r = new AnnotationRubric({ sessionId });
  r.addEntry({ stepName: 'job-completion', elapsedTimeSeconds: 1100, eventType: EVENT_TYPES.COMPLETION });
  r.markComplete();
  return r;
}

/**
 * Build a session that abandons at the given step after the given elapsed time.
 */
function makeAbandonedSession(sessionId, stepName, elapsedTimeSeconds, notes = '') {
  const r = new AnnotationRubric({ sessionId });
  r.addEntry({ stepName, elapsedTimeSeconds, eventType: EVENT_TYPES.ABANDONMENT, notes });
  return r;
}

/**
 * Build a cohort with the given number of completions and abandonments at tool-selection.
 */
function makeMixedCohort({ completions = 0, toolSelectAbandons = 0, disassemblyAbandons = 0 } = {}) {
  const sessions = [];
  for (let i = 0; i < completions; i++) {
    sessions.push(makeCompletedSession(`session-complete-${i}`));
  }
  for (let i = 0; i < toolSelectAbandons; i++) {
    sessions.push(makeAbandonedSession(`session-toolselect-${i}`, 'tool-selection', 80 + i * 10, "Participant didn't know which tool"));
  }
  for (let i = 0; i < disassemblyAbandons; i++) {
    sessions.push(makeAbandonedSession(`session-disassembly-${i}`, 'disassembly-mid', 400 + i * 20, 'Lost track of parts'));
  }
  return sessions;
}

// ─── Constants validation ─────────────────────────────────────────────────────

describe('FailureMapReport — constants', () => {
  test('MINIMUM_COHORT_SIZE is 5', () => {
    expect(MINIMUM_COHORT_SIZE).toBe(5);
  });

  test('PREFERRED_COHORT_SIZE is 8', () => {
    expect(PREFERRED_COHORT_SIZE).toBe(8);
  });

  test('BASELINE_COMPLETION_RATE_HYPOTHESIS is approximately 0.35', () => {
    expect(BASELINE_COMPLETION_RATE_HYPOTHESIS).toBeCloseTo(0.35, 2);
  });

  test('ROOT_CAUSE contains all expected values', () => {
    expect(ROOT_CAUSE.NAVIGATIONAL_CONFUSION).toBe('navigational_confusion');
    expect(ROOT_CAUSE.SKILL_GAP).toBe('skill_gap');
    expect(ROOT_CAUSE.UX_FRICTION).toBe('ux_friction');
    expect(ROOT_CAUSE.TOOLTIP_FAILURE).toBe('tooltip_failure');
    expect(ROOT_CAUSE.UNKNOWN).toBe('unknown');
  });
});

// ─── FailurePoint validation ──────────────────────────────────────────────────

describe('FailurePoint — construction and scoring', () => {
  test('throws when stepName is missing', () => {
    expect(() => new FailurePoint({ abandonmentCount: 1 })).toThrow('stepName');
  });

  test('dropOffScore weights abandonments 2× over confusions', () => {
    const fp = new FailurePoint({ stepName: 'tool-selection', abandonmentCount: 3, confusionCount: 2 });
    expect(fp.dropOffScore).toBe(3 * 2 + 2); // 8
  });

  test('dropOffScore is 0 for a step with no events', () => {
    const fp = new FailurePoint({ stepName: 'job-completion' });
    expect(fp.dropOffScore).toBe(0);
  });

  test('toJSON includes all required report fields', () => {
    const fp = new FailurePoint({
      stepName: 'tool-selection',
      abandonmentCount: 2,
      confusionCount: 1,
      averageTimeBeforeEventSecs: 85,
      observableBehaviors: ["Participant said 'which tool?'"],
      likelyCause: ROOT_CAUSE.UX_FRICTION,
      tooltipIgnoredCount: 1,
    });
    const json = fp.toJSON();
    expect(json).toHaveProperty('stepName');
    expect(json).toHaveProperty('abandonmentCount');
    expect(json).toHaveProperty('confusionCount');
    expect(json).toHaveProperty('averageTimeBeforeEventSecs');
    expect(json).toHaveProperty('observableBehaviors');
    expect(json).toHaveProperty('likelyCause');
    expect(json).toHaveProperty('tooltipIgnoredCount');
    expect(json).toHaveProperty('dropOffScore');
  });
});

// ─── AC1: Cohort & completion rate ───────────────────────────────────────────

describe('AC1 — Baseline completion rate captured', () => {
  test('getCompletionRate returns null for empty cohort', () => {
    const report = new FailureMapReport({ sessions: [] });
    expect(report.getCompletionRate()).toBeNull();
  });

  test('getCompletionRate returns 1.0 when all sessions complete', () => {
    const sessions = makeMixedCohort({ completions: 5 });
    const report = new FailureMapReport({ sessions });
    expect(report.getCompletionRate()).toBe(1.0);
  });

  test('getCompletionRate returns 0.0 when all sessions abandon', () => {
    const sessions = makeMixedCohort({ toolSelectAbandons: 5 });
    const report = new FailureMapReport({ sessions });
    expect(report.getCompletionRate()).toBe(0.0);
  });

  test('getCompletionRate returns 0.4 for 2 completions out of 5', () => {
    const sessions = makeMixedCohort({ completions: 2, toolSelectAbandons: 3 });
    const report = new FailureMapReport({ sessions });
    expect(report.getCompletionRate()).toBeCloseTo(0.4, 5);
  });

  test('cohortSize reflects the number of sessions', () => {
    const sessions = makeMixedCohort({ completions: 3, toolSelectAbandons: 2 });
    const report = new FailureMapReport({ sessions });
    expect(report.cohortSize).toBe(5);
  });

  test('hasSufficientCohort returns false when below minimum', () => {
    const sessions = makeMixedCohort({ completions: 4 }); // 4 < 5
    const report = new FailureMapReport({ sessions });
    expect(report.hasSufficientCohort()).toBe(false);
  });

  test('hasSufficientCohort returns true when at minimum (5)', () => {
    const sessions = makeMixedCohort({ completions: 5 });
    const report = new FailureMapReport({ sessions });
    expect(report.hasSufficientCohort()).toBe(true);
  });

  test('getCompletedSessionCount is accurate', () => {
    const sessions = makeMixedCohort({ completions: 3, toolSelectAbandons: 2 });
    const report = new FailureMapReport({ sessions });
    expect(report.getCompletedSessionCount()).toBe(3);
  });
});

// ─── AC2: Top failure points — ordered list ───────────────────────────────────

describe('AC2 — Failure map: ranked top failure points', () => {
  test('returns tool-selection as top failure when most abandonments occur there', () => {
    const sessions = makeMixedCohort({ toolSelectAbandons: 4, disassemblyAbandons: 1 });
    const report = new FailureMapReport({ sessions });
    const top = report.getTopFailurePoints();
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].stepName).toBe('tool-selection');
  });

  test('failure points are sorted descending by dropOffScore', () => {
    const sessions = makeMixedCohort({ toolSelectAbandons: 3, disassemblyAbandons: 1, completions: 1 });
    const report = new FailureMapReport({ sessions });
    const top = report.getTopFailurePoints();
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].dropOffScore).toBeGreaterThanOrEqual(top[i].dropOffScore);
    }
  });

  test('returns at most 5 failure points (design: top 3–5)', () => {
    // Create sessions abandoning at 6 distinct steps
    const sessions = [
      makeAbandonedSession('s1', 'job-selection', 30),
      makeAbandonedSession('s2', 'tool-selection', 80),
      makeAbandonedSession('s3', 'case-back-removal', 150),
      makeAbandonedSession('s4', 'movement-inspection', 200),
      makeAbandonedSession('s5', 'disassembly-start', 300),
      makeAbandonedSession('s6', 'disassembly-mid', 420),
    ];
    const report = new FailureMapReport({ sessions });
    expect(report.getTopFailurePoints(5).length).toBeLessThanOrEqual(5);
  });

  test('each failure point records abandonment count and step name', () => {
    const sessions = makeMixedCohort({ toolSelectAbandons: 3 });
    const report = new FailureMapReport({ sessions });
    const topPoint = report.getTopFailurePoints()[0];
    expect(topPoint.stepName).toBe('tool-selection');
    expect(topPoint.abandonmentCount).toBe(3);
  });

  test('confusion-with-recovery events are also captured in the failure map', () => {
    const session = new AnnotationRubric({ sessionId: 's-conf' });
    session.addEntry({
      stepName: 'component-identification',
      elapsedTimeSeconds: 250,
      eventType: EVENT_TYPES.CONFUSION_WITH_RECOVERY,
    });
    const report = new FailureMapReport({ sessions: [session] });
    const points = report.getTopFailurePoints();
    const confPoint = points.find((p) => p.stepName === 'component-identification');
    expect(confPoint).toBeDefined();
    expect(confPoint.confusionCount).toBe(1);
  });

  test('tooltip-ignored count is aggregated per step in the failure map', () => {
    const s1 = new AnnotationRubric({ sessionId: 's-tip1' });
    s1.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 60,
      eventType: EVENT_TYPES.TOOLTIP_IGNORED,
      tooltipInteraction: TOOLTIP_INTERACTIONS.NOT_NOTICED,
    });
    const s2 = new AnnotationRubric({ sessionId: 's-tip2' });
    s2.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 70,
      eventType: EVENT_TYPES.TOOLTIP_IGNORED,
      tooltipInteraction: TOOLTIP_INTERACTIONS.DISMISSED_IMMEDIATELY,
    });
    const report = new FailureMapReport({ sessions: [s1, s2] });
    const top = report.getTopFailurePoints();
    const toolPoint = top.find((p) => p.stepName === 'tool-selection');
    expect(toolPoint).toBeDefined();
    expect(toolPoint.tooltipIgnoredCount).toBe(2);
  });

  test('observable behaviors from annotator notes are included in failure point', () => {
    const sessions = [
      makeAbandonedSession('s1', 'tool-selection', 80, "Said: 'which tool do I use?'"),
      makeAbandonedSession('s2', 'tool-selection', 95, "Clicked randomly before giving up"),
    ];
    const report = new FailureMapReport({ sessions });
    const toolPoint = report.getTopFailurePoints()[0];
    expect(toolPoint.observableBehaviors.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── AC3: Step-level timing ───────────────────────────────────────────────────

describe('AC3 — Step-level timing: average time-before-abandonment', () => {
  test('getAverageTimeBeforeAbandonmentForStep returns correct average', () => {
    const sessions = [
      makeAbandonedSession('s1', 'tool-selection', 80),
      makeAbandonedSession('s2', 'tool-selection', 100),
      makeAbandonedSession('s3', 'tool-selection', 120),
    ];
    const report = new FailureMapReport({ sessions });
    const avg = report.getAverageTimeBeforeAbandonmentForStep('tool-selection');
    expect(avg).toBeCloseTo(100, 5); // (80+100+120)/3 = 100
  });

  test('getAverageTimeBeforeAbandonmentForStep returns null for step with no abandonments', () => {
    const sessions = [makeCompletedSession('s1')];
    const report = new FailureMapReport({ sessions });
    expect(report.getAverageTimeBeforeAbandonmentForStep('tool-selection')).toBeNull();
  });

  test('averageTimeBeforeEventSecs is captured in the aggregated failure point', () => {
    const sessions = [
      makeAbandonedSession('s1', 'disassembly-mid', 400),
      makeAbandonedSession('s2', 'disassembly-mid', 600),
    ];
    const report = new FailureMapReport({ sessions });
    const fp = report.getTopFailurePoints().find((p) => p.stepName === 'disassembly-mid');
    expect(fp).toBeDefined();
    expect(fp.averageTimeBeforeEventSecs).toBeCloseTo(500, 5); // (400+600)/2
  });
});

// ─── AC5: Confidence statement ────────────────────────────────────────────────

describe('AC5 — Confidence statement: confirms, revises, or flags insufficient cohort', () => {
  test('returns NO_DATA status for empty cohort', () => {
    const report = new FailureMapReport({ sessions: [] });
    const stmt = report.getConfidenceStatement();
    expect(stmt.status).toBe('NO_DATA');
    expect(stmt.completionRate).toBeNull();
  });

  test('returns BASELINE_CONFIRMED for ~35% completion rate (hypothesis range)', () => {
    // 2 out of 6 = 33.3%
    const sessions = makeMixedCohort({ completions: 2, toolSelectAbandons: 4 });
    const report = new FailureMapReport({ sessions });
    const stmt = report.getConfidenceStatement();
    expect(stmt.status).toBe('BASELINE_CONFIRMED');
    expect(stmt.completionRate).toBeCloseTo(0.333, 2);
  });

  test('returns BASELINE_REVISED_LOWER for very low completion rate (<25%)', () => {
    // 1 out of 8 = 12.5%
    const sessions = makeMixedCohort({ completions: 1, toolSelectAbandons: 7 });
    const report = new FailureMapReport({ sessions });
    const stmt = report.getConfidenceStatement();
    expect(stmt.status).toBe('BASELINE_REVISED_LOWER');
  });

  test('returns BASELINE_REVISED_HIGHER for high completion rate (>45%)', () => {
    // 5 out of 8 = 62.5%
    const sessions = makeMixedCohort({ completions: 5, toolSelectAbandons: 3 });
    const report = new FailureMapReport({ sessions });
    const stmt = report.getConfidenceStatement();
    expect(stmt.status).toBe('BASELINE_REVISED_HIGHER');
  });

  test('confidence statement includes cohortSize and completionRate', () => {
    const sessions = makeMixedCohort({ completions: 3, toolSelectAbandons: 2 });
    const report = new FailureMapReport({ sessions });
    const stmt = report.getConfidenceStatement();
    expect(stmt).toHaveProperty('cohortSize', 5);
    expect(stmt).toHaveProperty('completionRate');
    expect(typeof stmt.message).toBe('string');
    expect(stmt.message.length).toBeGreaterThan(0);
  });
});

// ─── Scenario 7: Fewer than 5 sessions (incomplete cohort) ───────────────────

describe('Scenario 7 — Fewer than 5 sessions: incomplete cohort handled gracefully', () => {
  test('hasSufficientCohort returns false with 4 sessions', () => {
    const sessions = makeMixedCohort({ completions: 2, toolSelectAbandons: 2 }); // 4 total
    const report = new FailureMapReport({ sessions });
    expect(report.hasSufficientCohort()).toBe(false);
  });

  test('getConfidenceStatement returns INSUFFICIENT_COHORT status', () => {
    const sessions = makeMixedCohort({ completions: 1, toolSelectAbandons: 2 }); // 3 sessions
    const report = new FailureMapReport({ sessions });
    const stmt = report.getConfidenceStatement();
    expect(stmt.status).toBe('INSUFFICIENT_COHORT');
  });

  test('INSUFFICIENT_COHORT message still includes partial completionRate and cohortSize', () => {
    const sessions = makeMixedCohort({ completions: 1, toolSelectAbandons: 3 }); // 4 sessions
    const report = new FailureMapReport({ sessions });
    const stmt = report.getConfidenceStatement();
    expect(stmt.status).toBe('INSUFFICIENT_COHORT');
    expect(stmt.completionRate).not.toBeNull();
    expect(stmt.cohortSize).toBe(4);
    expect(stmt.message).toContain('4');
    expect(stmt.message).toContain('5'); // mentions minimum
  });

  test('report still produces failure map results even with insufficient cohort', () => {
    const sessions = makeMixedCohort({ toolSelectAbandons: 3 }); // only 3 sessions
    const report = new FailureMapReport({ sessions });
    const top = report.getTopFailurePoints();
    // Should still show tool-selection as a failure point
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].stepName).toBe('tool-selection');
  });

  test('toJSON works with insufficient cohort and includes hasSufficientCohort: false', () => {
    const sessions = makeMixedCohort({ completions: 2 }); // only 2 sessions
    const report = new FailureMapReport({ sessions });
    const json = report.toJSON();
    expect(json.hasSufficientCohort).toBe(false);
    expect(json).toHaveProperty('confidenceStatement');
    expect(json.confidenceStatement.status).toBe('INSUFFICIENT_COHORT');
  });
});

// ─── Scenario 8: All participants complete — no failure points ────────────────

describe('Scenario 8 — All participants complete: no critical failure points found', () => {
  test('hasNoFailurePoints returns true when all sessions complete cleanly', () => {
    const sessions = makeMixedCohort({ completions: 6 });
    const report = new FailureMapReport({ sessions });
    expect(report.hasNoFailurePoints()).toBe(true);
  });

  test('getTopFailurePoints returns empty array when no abandonment or confusion', () => {
    const sessions = makeMixedCohort({ completions: 7 });
    const report = new FailureMapReport({ sessions });
    expect(report.getTopFailurePoints()).toHaveLength(0);
  });

  test('report still outputs a valid completion rate when no failures exist', () => {
    const sessions = makeMixedCohort({ completions: 5 });
    const report = new FailureMapReport({ sessions });
    expect(report.getCompletionRate()).toBe(1.0);
  });

  test('toJSON includes hasNoFailurePoints: true and empty topFailurePoints array', () => {
    const sessions = makeMixedCohort({ completions: 5 });
    const report = new FailureMapReport({ sessions });
    const json = report.toJSON();
    expect(json.hasNoFailurePoints).toBe(true);
    expect(json.topFailurePoints).toHaveLength(0);
  });

  test('confidence statement is still produced correctly for all-complete cohort', () => {
    const sessions = makeMixedCohort({ completions: 5 });
    const report = new FailureMapReport({ sessions });
    const stmt = report.getConfidenceStatement();
    // 100% completion >> 45% hypothesis range → BASELINE_REVISED_HIGHER
    expect(stmt.status).toBe('BASELINE_REVISED_HIGHER');
    expect(stmt.completionRate).toBe(1.0);
  });
});

// ─── AC4: Full report serialisation ──────────────────────────────────────────

describe('AC4 — Report delivered: toJSON includes all required deliverable fields', () => {
  test('toJSON schema matches required report fields', () => {
    const sessions = makeMixedCohort({ completions: 2, toolSelectAbandons: 3 });
    const report = new FailureMapReport({ sessions });
    const json = report.toJSON();

    expect(json).toHaveProperty('cohortSize');
    expect(json).toHaveProperty('completedSessionCount');
    expect(json).toHaveProperty('completionRate');
    expect(json).toHaveProperty('hasSufficientCohort');
    expect(json).toHaveProperty('hasNoFailurePoints');
    expect(json).toHaveProperty('confidenceStatement');
    expect(json).toHaveProperty('topFailurePoints');
    expect(Array.isArray(json.topFailurePoints)).toBe(true);
  });

  test('full cohort with mixed outcomes produces a complete, well-formed report', () => {
    const sessions = [
      makeCompletedSession('s1'),
      makeCompletedSession('s2'),
      makeAbandonedSession('s3', 'tool-selection', 85, "Didn't know which tool"),
      makeAbandonedSession('s4', 'tool-selection', 95, 'Picked wrong tool repeatedly'),
      makeAbandonedSession('s5', 'disassembly-mid', 450, 'Lost track of spring'),
    ];
    const report = new FailureMapReport({ sessions });
    const json = report.toJSON();

    expect(json.cohortSize).toBe(5);
    expect(json.completedSessionCount).toBe(2);
    expect(json.completionRate).toBeCloseTo(0.4, 5);
    expect(json.hasSufficientCohort).toBe(true);
    expect(json.topFailurePoints.length).toBeGreaterThan(0);
    expect(json.topFailurePoints[0].stepName).toBe('tool-selection');
    expect(json.topFailurePoints[0].abandonmentCount).toBe(2);
  });

  test('FailureMapReport accepts empty sessions without throwing', () => {
    expect(() => new FailureMapReport({ sessions: [] })).not.toThrow();
  });

  test('FailureMapReport accepts default constructor without arguments', () => {
    expect(() => new FailureMapReport()).not.toThrow();
  });
});
