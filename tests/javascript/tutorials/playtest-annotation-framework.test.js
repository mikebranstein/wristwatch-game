/**
 * Tests for Issue #112 — Onboarding Telemetry Baseline & Failure Map
 *
 * Covers all 5 acceptance criteria and all 8 test scenarios defined in the issue.
 *
 * AC1 — Baseline completion rate captured (≥5 sessions; numeric %)
 * AC2 — Failure map produced (ranked 3–5 decision points with behavior notes)
 * AC3 — Step-level timing recorded (average time-before-abandonment per drop-off point)
 * AC4 — Report delivered (failure-map report with graceful incomplete-cohort handling)
 * AC5 — Success gate confirmed or revised (~35% baseline, stated explicitly)
 *
 * Test Scenarios:
 *   1. Happy path — participant completes first job
 *   2. Participant abandons at tool-selection step
 *   3. Participant abandons mid-disassembly
 *   4. Participant asks for help without abandoning (confusion event, not abandonment)
 *   5. Participant skips/ignores existing tooltip
 *   6. Session recording reviewed post-session (async annotation support)
 *   7. Fewer than 5 sessions — graceful incomplete-data handling
 *   8. All participants complete — no-critical-failure-points result
 *
 * Run tests with: npm test
 */

'use strict';

const {
  PlaytestSession,
  PlaytestCohort,
  EVENT_TYPES,
  DECISION_POINTS,
  MIN_COHORT_SIZE,
  PREFERRED_COHORT_SIZE,
  CONFUSION_PAUSE_THRESHOLD_SECONDS,
} = require('../../../javascript/telemetry/PlaytestAnnotationFramework');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a cohort of N participants who all complete the first job. */
function buildAllCompletesCohort(n) {
  const cohort = new PlaytestCohort();
  for (let i = 0; i < n; i++) {
    const s = new PlaytestSession(`session-${i}`, `participant-${i}`);
    s.recordCompletion(240 + i * 10, 'Completed without issues');
    cohort.addSession(s);
  }
  return cohort;
}

/** Build a realistic mixed cohort of 6 sessions for standard AC tests. */
function buildMixedCohort() {
  const cohort = new PlaytestCohort();

  // Session 1 — completes
  const s1 = new PlaytestSession('s1', 'p1');
  s1.recordCompletion(300, 'Smooth run');
  cohort.addSession(s1);

  // Session 2 — abandons at tool_selection
  const s2 = new PlaytestSession('s2', 'p2');
  s2.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 45, "I don't know which tool to use");
  cohort.addSession(s2);

  // Session 3 — abandons at disassembly_start
  const s3 = new PlaytestSession('s3', 'p3');
  s3.recordAbandonment(DECISION_POINTS.DISASSEMBLY_START, 90, 'Confused about screw order');
  cohort.addSession(s3);

  // Session 4 — confusion at tool_selection but recovers, then completes
  const s4 = new PlaytestSession('s4', 'p4');
  s4.recordConfusion(DECISION_POINTS.TOOL_SELECTION, 38, 'Paused 15s, then asked for help, then continued');
  s4.recordCompletion(420, 'Completed after help');
  cohort.addSession(s4);

  // Session 5 — abandons at tool_selection (same step as s2)
  const s5 = new PlaytestSession('s5', 'p5');
  s5.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 52, 'Gave up — "too many options"');
  cohort.addSession(s5);

  // Session 6 — completes with tooltip-ignore observation
  const s6 = new PlaytestSession('s6', 'p6');
  s6.recordTooltipIgnored(DECISION_POINTS.TOOL_SELECTION, 20, 'Tooltip appeared but player scrolled past it');
  s6.recordCompletion(360, 'Completed, did not use tooltip');
  cohort.addSession(s6);

  return cohort;
}

// ─── Module exports present ───────────────────────────────────────────────────

describe('PlaytestAnnotationFramework — module exports', () => {
  test('PlaytestSession is exported', () => {
    expect(PlaytestSession).toBeDefined();
  });

  test('PlaytestCohort is exported', () => {
    expect(PlaytestCohort).toBeDefined();
  });

  test('EVENT_TYPES has expected values', () => {
    expect(EVENT_TYPES.COMPLETION).toBe('completion');
    expect(EVENT_TYPES.ABANDONMENT).toBe('abandonment');
    expect(EVENT_TYPES.CONFUSION).toBe('confusion');
    expect(EVENT_TYPES.TOOLTIP_IGNORED).toBe('tooltip_ignored');
  });

  test('DECISION_POINTS has first-job steps', () => {
    expect(DECISION_POINTS.TOOL_SELECTION).toBe('tool_selection');
    expect(DECISION_POINTS.DISASSEMBLY_START).toBe('disassembly_start');
    expect(DECISION_POINTS.REASSEMBLY_STEP).toBe('reassembly_step');
  });

  test('MIN_COHORT_SIZE is 5', () => {
    expect(MIN_COHORT_SIZE).toBe(5);
  });

  test('CONFUSION_PAUSE_THRESHOLD_SECONDS is 10', () => {
    expect(CONFUSION_PAUSE_THRESHOLD_SECONDS).toBe(10);
  });
});

// ─── PlaytestSession construction ────────────────────────────────────────────

describe('PlaytestSession — construction', () => {
  test('constructs with valid sessionId and participantId', () => {
    const s = new PlaytestSession('s-001', 'p-001');
    expect(s.sessionId).toBe('s-001');
    expect(s.participantId).toBe('p-001');
  });

  test('throws when sessionId is missing', () => {
    expect(() => new PlaytestSession('', 'p-001')).toThrow();
  });

  test('throws when participantId is missing', () => {
    expect(() => new PlaytestSession('s-001', '')).toThrow();
  });

  test('new session starts as not completed and not abandoned', () => {
    const s = new PlaytestSession('s-001', 'p-001');
    expect(s.completed).toBe(false);
    expect(s.abandoned).toBe(false);
    expect(s.abandonedAtStep).toBeNull();
    expect(s.annotations).toHaveLength(0);
  });
});

// ─── Test Scenario 1: Happy path — participant completes first job ─────────────

describe('Test Scenario 1 — Happy path: participant completes first job', () => {
  let session;

  beforeEach(() => {
    session = new PlaytestSession('s-happy', 'p-happy');
    session.recordCompletion(300, 'No hesitation; completed all steps without assistance');
  });

  test('session.completed is true after recordCompletion', () => {
    expect(session.completed).toBe(true);
  });

  test('session.abandoned remains false', () => {
    expect(session.abandoned).toBe(false);
  });

  test('annotations contains one COMPLETION event', () => {
    const completions = session.annotations.filter(
      (a) => a.eventType === EVENT_TYPES.COMPLETION
    );
    expect(completions).toHaveLength(1);
  });

  test('completion annotation records elapsed time', () => {
    const completion = session.annotations.find(
      (a) => a.eventType === EVENT_TYPES.COMPLETION
    );
    expect(completion.elapsedSeconds).toBe(300);
  });

  test('completion annotation records qualitative notes', () => {
    const completion = session.annotations.find(
      (a) => a.eventType === EVENT_TYPES.COMPLETION
    );
    expect(completion.qualitativeNotes).toBe(
      'No hesitation; completed all steps without assistance'
    );
  });

  test('cohort completion counter increments when session added (AC1)', () => {
    const cohort = new PlaytestCohort();
    cohort.addSession(session);
    expect(cohort.completedSessionCount()).toBe(1);
  });
});

// ─── Test Scenario 2: Participant abandons at tool-selection step ─────────────

describe('Test Scenario 2 — Abandonment at tool-selection step', () => {
  let session;

  beforeEach(() => {
    session = new PlaytestSession('s-abandon-tool', 'p-2');
    session.recordAbandonment(
      DECISION_POINTS.TOOL_SELECTION,
      45,
      "I don't know which tool to use"
    );
  });

  test('session.abandoned is true after recordAbandonment', () => {
    expect(session.abandoned).toBe(true);
  });

  test('session.abandonedAtStep is tool_selection', () => {
    expect(session.abandonedAtStep).toBe(DECISION_POINTS.TOOL_SELECTION);
  });

  test('session.completed remains false', () => {
    expect(session.completed).toBe(false);
  });

  test('annotations contains one ABANDONMENT event at tool_selection', () => {
    const abandonments = session.getAbandonmentAnnotations();
    expect(abandonments).toHaveLength(1);
    expect(abandonments[0].stepName).toBe(DECISION_POINTS.TOOL_SELECTION);
  });

  test('abandonment annotation records elapsed time (45s)', () => {
    const a = session.getAbandonmentAnnotations()[0];
    expect(a.elapsedSeconds).toBe(45);
  });

  test('abandonment annotation preserves participant verbalization', () => {
    const a = session.getAbandonmentAnnotations()[0];
    expect(a.qualitativeNotes).toContain("don't know which tool");
  });

  test('failure map captures tool_selection as a drop-off point', () => {
    const cohort = new PlaytestCohort();
    cohort.addSession(session);
    const failureMap = cohort.buildFailureMap();
    const toolSelectionEntry = failureMap.find(
      (e) => e.stepName === DECISION_POINTS.TOOL_SELECTION
    );
    expect(toolSelectionEntry).toBeDefined();
    expect(toolSelectionEntry.abandonmentCount).toBe(1);
  });

  test('cannot record a completion on an already-abandoned session', () => {
    expect(() => session.recordCompletion(300)).toThrow();
  });
});

// ─── Test Scenario 3: Participant abandons mid-disassembly ───────────────────

describe('Test Scenario 3 — Abandonment mid-disassembly', () => {
  let session;

  beforeEach(() => {
    session = new PlaytestSession('s-abandon-disassembly', 'p-3');
    session.recordAbandonment(
      DECISION_POINTS.DISASSEMBLY_START,
      90,
      'Confused about which screws to remove first'
    );
  });

  test('failure map captures disassembly_start as a drop-off point', () => {
    const cohort = new PlaytestCohort();
    cohort.addSession(session);
    const map = cohort.buildFailureMap();
    const entry = map.find((e) => e.stepName === DECISION_POINTS.DISASSEMBLY_START);
    expect(entry).toBeDefined();
    expect(entry.abandonmentCount).toBe(1);
  });

  test('failure map can capture multiple distinct drop-off points across sessions', () => {
    const cohort = new PlaytestCohort();
    // Scenario 2 step
    const s2 = new PlaytestSession('s2', 'p2');
    s2.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 45, 'no idea');
    cohort.addSession(s2);
    // Scenario 3 step
    cohort.addSession(session);

    const map = cohort.buildFailureMap();
    const steps = map.map((e) => e.stepName);
    expect(steps).toContain(DECISION_POINTS.TOOL_SELECTION);
    expect(steps).toContain(DECISION_POINTS.DISASSEMBLY_START);
  });
});

// ─── Test Scenario 4: Participant asks for help without abandoning ────────────

describe('Test Scenario 4 — Confusion event without abandonment (help-seeking, recovery)', () => {
  let session;

  beforeEach(() => {
    session = new PlaytestSession('s-confusion', 'p-4');
    session.recordConfusion(
      DECISION_POINTS.TOOL_SELECTION,
      38,
      'Paused 15s staring at tool list, then said "which one?" aloud — annotator pointed at rubric — continued'
    );
    session.recordCompletion(420, 'Completed after help prompt');
  });

  test('session.abandoned is false (confusion is not abandonment)', () => {
    expect(session.abandoned).toBe(false);
  });

  test('session.completed is true (participant recovered and finished)', () => {
    expect(session.completed).toBe(true);
  });

  test('annotations contains a CONFUSION event', () => {
    const confusions = session.getConfusionAnnotations();
    expect(confusions).toHaveLength(1);
    expect(confusions[0].eventType).toBe(EVENT_TYPES.CONFUSION);
  });

  test('CONFUSION event is NOT classified as ABANDONMENT', () => {
    const abandonments = session.getAbandonmentAnnotations();
    expect(abandonments).toHaveLength(0);
  });

  test('confusion event records the step name', () => {
    const confusion = session.getConfusionAnnotations()[0];
    expect(confusion.stepName).toBe(DECISION_POINTS.TOOL_SELECTION);
  });

  test('confusion event records elapsed time (38s > 10s threshold)', () => {
    const confusion = session.getConfusionAnnotations()[0];
    expect(confusion.elapsedSeconds).toBeGreaterThan(CONFUSION_PAUSE_THRESHOLD_SECONDS);
  });

  test('failure map does NOT count this session as an abandonment at tool_selection', () => {
    const cohort = new PlaytestCohort();
    cohort.addSession(session);
    const map = cohort.buildFailureMap();
    const toolEntry = map.find((e) => e.stepName === DECISION_POINTS.TOOL_SELECTION);
    // confusion events are NOT abandonments — tool_selection should not appear in failure map
    expect(toolEntry).toBeUndefined();
  });
});

// ─── Test Scenario 5: Participant ignores existing tooltip ────────────────────

describe('Test Scenario 5 — Participant skips/ignores tooltip', () => {
  let session;

  beforeEach(() => {
    session = new PlaytestSession('s-tooltip-ignore', 'p-5');
    session.recordTooltipIgnored(
      DECISION_POINTS.TOOL_SELECTION,
      20,
      'Tooltip appeared for tool selection; participant scrolled past without reading'
    );
    session.recordCompletion(360, 'Completed without reading tooltip');
  });

  test('session has a TOOLTIP_IGNORED annotation', () => {
    const tooltipEvents = session.getTooltipIgnoredAnnotations();
    expect(tooltipEvents).toHaveLength(1);
    expect(tooltipEvents[0].eventType).toBe(EVENT_TYPES.TOOLTIP_IGNORED);
  });

  test('tooltip_ignored annotation marks tooltipVisible = true', () => {
    const a = session.getTooltipIgnoredAnnotations()[0];
    expect(a.tooltipVisible).toBe(true);
  });

  test('tooltip-ignored event is distinguished from ABANDONMENT', () => {
    expect(session.getAbandonmentAnnotations()).toHaveLength(0);
  });

  test('report can identify whether tooltips are being ignored (not just unseen)', () => {
    const cohort = new PlaytestCohort();
    cohort.addSession(session);
    // Tooltip-ignored events appear in raw annotations, not in failureMap (not an abandonment)
    const allAnnotations = session.annotations.filter(
      (a) => a.eventType === EVENT_TYPES.TOOLTIP_IGNORED
    );
    expect(allAnnotations).toHaveLength(1);
    expect(allAnnotations[0].tooltipVisible).toBe(true);
  });
});

// ─── Test Scenario 6: Async post-session annotation ──────────────────────────

describe('Test Scenario 6 — Async post-session recording review', () => {
  test('recordAbandonment supports asyncReviewed = true', () => {
    const session = new PlaytestSession('s-async', 'p-6');
    session.recordAbandonment(
      DECISION_POINTS.COMPONENT_IDENTIFICATION,
      110,
      'Re-watched recording; participant skipped component step',
      true // asyncReviewed
    );
    expect(session.getAbandonmentAnnotations()[0].asyncReviewed).toBe(true);
  });

  test('recordConfusion supports asyncReviewed = true', () => {
    const session = new PlaytestSession('s-async-2', 'p-6b');
    session.recordConfusion(
      DECISION_POINTS.DIAGNOSIS_STEP,
      75,
      'Post-session review: annotator noticed 20s pause not caught live',
      true
    );
    expect(session.getConfusionAnnotations()[0].asyncReviewed).toBe(true);
  });

  test('recordCompletion supports asyncReviewed = true', () => {
    const session = new PlaytestSession('s-async-3', 'p-6c');
    session.recordCompletion(280, 'Confirmed complete via recording', true);
    const completions = session.annotations.filter(
      (a) => a.eventType === EVENT_TYPES.COMPLETION
    );
    expect(completions[0].asyncReviewed).toBe(true);
  });

  test('hasAsyncAnnotations() returns true when any annotation is async-reviewed', () => {
    const session = new PlaytestSession('s-async-4', 'p-6d');
    session.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 40, 'notes', true);
    expect(session.hasAsyncAnnotations()).toBe(true);
  });

  test('hasAsyncAnnotations() returns false when all annotations are live', () => {
    const session = new PlaytestSession('s-live', 'p-6e');
    session.recordCompletion(250, 'live observation', false);
    expect(session.hasAsyncAnnotations()).toBe(false);
  });

  test('recordTooltipIgnored supports asyncReviewed = true', () => {
    const session = new PlaytestSession('s-async-5', 'p-6f');
    session.recordTooltipIgnored(
      DECISION_POINTS.CLEANING_STEP,
      30,
      'Rewound recording to confirm tooltip was on screen',
      true
    );
    expect(session.getTooltipIgnoredAnnotations()[0].asyncReviewed).toBe(true);
  });
});

// ─── Test Scenario 7: Fewer than 5 sessions — graceful handling ──────────────

describe('Test Scenario 7 — Fewer than 5 sessions: graceful incomplete-data handling', () => {
  let smallCohort;

  beforeEach(() => {
    smallCohort = new PlaytestCohort();
    const s = new PlaytestSession('s-only1', 'p-solo');
    s.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 30, 'Only participant so far');
    smallCohort.addSession(s);
  });

  test('completionRate() returns a numeric value even with small cohort', () => {
    expect(smallCohort.completionRate()).toBe(0); // 0 completions / 1 session
  });

  test('baselineStatus() returns "not_measurable" when cohort < 5', () => {
    expect(smallCohort.baselineStatus()).toBe('not_measurable');
  });

  test('generateReport() documents cohort shortfall', () => {
    const report = smallCohort.generateReport();
    expect(report.cohortShortfall).not.toBeNull();
    expect(report.cohortShortfall).toContain('1 of 5 minimum');
  });

  test('generateReport() reports confidence as "low"', () => {
    const report = smallCohort.generateReport();
    expect(report.confidence).toBe('low');
  });

  test('generateReport() does not throw — handles incomplete data gracefully', () => {
    expect(() => smallCohort.generateReport()).not.toThrow();
  });

  test('buildFailureMap() still runs and returns ranked results for small cohort', () => {
    const map = smallCohort.buildFailureMap();
    expect(Array.isArray(map)).toBe(true);
    expect(map.length).toBeGreaterThan(0);
  });

  test('completionRatePercent() returns "0%" (not null) for sub-minimum cohort', () => {
    // 0 completions out of 1 session → "0%"
    expect(smallCohort.completionRatePercent()).toBe('0%');
  });
});

// ─── Test Scenario 8: All participants complete — no-failure-points case ──────

describe('Test Scenario 8 — All participants complete: no critical failure points', () => {
  let allCompleteCohort;

  beforeEach(() => {
    allCompleteCohort = buildAllCompletesCohort(6);
  });

  test('cohort has 6 sessions all marked completed', () => {
    expect(allCompleteCohort.completedSessionCount()).toBe(6);
  });

  test('buildFailureMap() returns empty array when no abandonments', () => {
    expect(allCompleteCohort.buildFailureMap()).toHaveLength(0);
  });

  test('topFailurePoints() returns empty array when no abandonments', () => {
    expect(allCompleteCohort.topFailurePoints()).toHaveLength(0);
  });

  test('generateReport().noCriticalFailurePoints is true', () => {
    const report = allCompleteCohort.generateReport();
    expect(report.noCriticalFailurePoints).toBe(true);
  });

  test('generateReport().failurePoints contains the no-failure sentinel entry', () => {
    const report = allCompleteCohort.generateReport();
    expect(report.failurePoints[0].stepName).toBe('none');
    expect(report.failurePoints[0].notes[0]).toContain('No critical failure points found');
  });

  test('phase2Recommendation mentions considering whether intervention is still warranted', () => {
    const report = allCompleteCohort.generateReport();
    expect(report.phase2Recommendation.toLowerCase()).toContain('no critical failure points');
  });
});

// ─── AC1: Baseline completion rate captured ───────────────────────────────────

describe('AC1 — Baseline completion rate captured', () => {
  test('completionRate() returns 0.5 for 3 of 6 sessions completed', () => {
    const cohort = buildMixedCohort(); // 3 complete, 3 abandon
    expect(cohort.completionRate()).toBeCloseTo(0.5, 2);
  });

  test('completionRatePercent() returns "50%" for the mixed cohort', () => {
    const cohort = buildMixedCohort();
    expect(cohort.completionRatePercent()).toBe('50%');
  });

  test('completionRate() returns null for empty cohort', () => {
    expect(new PlaytestCohort().completionRate()).toBeNull();
  });

  test('AC1: numeric completion rate is available in the report', () => {
    const cohort = buildMixedCohort();
    const report = cohort.generateReport();
    expect(report.completionRatePercent).toMatch(/\d+%/);
  });
});

// ─── AC2: Failure map produced ────────────────────────────────────────────────

describe('AC2 — Failure map produced (ranked drop-off list)', () => {
  test('failure map is ranked by drop-off frequency descending', () => {
    const cohort = buildMixedCohort();
    const map = cohort.buildFailureMap();
    // tool_selection should rank first (2 abandonments) before disassembly_start (1)
    expect(map[0].stepName).toBe(DECISION_POINTS.TOOL_SELECTION);
    expect(map[0].abandonmentCount).toBe(2);
  });

  test('each failure-map entry has stepName, abandonmentCount, averageElapsedSeconds, notes', () => {
    const cohort = buildMixedCohort();
    const map = cohort.buildFailureMap();
    for (const entry of map) {
      expect(entry).toHaveProperty('stepName');
      expect(entry).toHaveProperty('abandonmentCount');
      expect(entry).toHaveProperty('averageElapsedSeconds');
      expect(entry).toHaveProperty('notes');
      expect(Array.isArray(entry.notes)).toBe(true);
    }
  });

  test('failure map includes qualitative notes per high-drop-off step', () => {
    const cohort = buildMixedCohort();
    const map = cohort.buildFailureMap();
    const toolEntry = map.find((e) => e.stepName === DECISION_POINTS.TOOL_SELECTION);
    expect(toolEntry.notes.length).toBeGreaterThan(0);
  });

  test('topFailurePoints(3) returns at most 3 entries', () => {
    const cohort = buildMixedCohort();
    const top = cohort.topFailurePoints(3);
    expect(top.length).toBeLessThanOrEqual(3);
  });
});

// ─── AC3: Step-level timing recorded ─────────────────────────────────────────

describe('AC3 — Step-level timing recorded', () => {
  test('averageElapsedSeconds is computed per step across sessions', () => {
    const cohort = new PlaytestCohort();
    const s1 = new PlaytestSession('s1', 'p1');
    s1.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 40);
    const s2 = new PlaytestSession('s2', 'p2');
    s2.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 60);
    cohort.addSession(s1).addSession(s2);

    const timing = cohort.stepLevelTiming();
    const toolTiming = timing.find((t) => t.stepName === DECISION_POINTS.TOOL_SELECTION);
    expect(toolTiming.averageElapsedSeconds).toBe(50); // (40+60)/2
  });

  test('step-level timing available in report', () => {
    const cohort = buildMixedCohort();
    const report = cohort.generateReport();
    expect(Array.isArray(report.stepLevelTiming)).toBe(true);
    expect(report.stepLevelTiming.length).toBeGreaterThan(0);
  });
});

// ─── AC4: Report generated ───────────────────────────────────────────────────

describe('AC4 — Report delivered (failure-map report structure)', () => {
  test('generateReport() returns an object with all required report fields', () => {
    const cohort = buildMixedCohort();
    const report = cohort.generateReport();

    expect(report).toHaveProperty('reportTitle');
    expect(report).toHaveProperty('cohortSize');
    expect(report).toHaveProperty('completedCount');
    expect(report).toHaveProperty('completionRatePercent');
    expect(report).toHaveProperty('baselineStatus');
    expect(report).toHaveProperty('confidence');
    expect(report).toHaveProperty('failurePoints');
    expect(report).toHaveProperty('noCriticalFailurePoints');
    expect(report).toHaveProperty('stepLevelTiming');
    expect(report).toHaveProperty('phase2Recommendation');
  });

  test('report title identifies Phase 1 onboarding telemetry sprint', () => {
    const report = buildMixedCohort().generateReport();
    expect(report.reportTitle).toContain('Onboarding Telemetry Baseline');
  });

  test('cohortShortfall is null when cohort meets minimum size', () => {
    const report = buildMixedCohort().generateReport();
    expect(report.cohortShortfall).toBeNull();
  });

  test('phase2Recommendation is a non-empty string', () => {
    const report = buildMixedCohort().generateReport();
    expect(typeof report.phase2Recommendation).toBe('string');
    expect(report.phase2Recommendation.length).toBeGreaterThan(0);
  });
});

// ─── AC5: Success gate confirmed or revised ───────────────────────────────────

describe('AC5 — Success gate confirmed or revised (~35% baseline)', () => {
  test('baselineStatus() is "confirmed" when rate is within ±10pp of 35%', () => {
    // Build cohort: 2 of 6 complete → ~33% (within ±10pp of 35%)
    const cohort = new PlaytestCohort();
    for (let i = 0; i < 4; i++) {
      const s = new PlaytestSession(`s-fail-${i}`, `p-fail-${i}`);
      s.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 30);
      cohort.addSession(s);
    }
    for (let i = 0; i < 2; i++) {
      const s = new PlaytestSession(`s-complete-${i}`, `p-complete-${i}`);
      s.recordCompletion(300);
      cohort.addSession(s);
    }
    expect(cohort.baselineStatus()).toBe('confirmed');
  });

  test('baselineStatus() is "revised_higher" when rate significantly exceeds 35%', () => {
    // 5 of 6 complete → ~83%
    const cohort = buildAllCompletesCohort(5);
    const s = new PlaytestSession('s-fail', 'p-fail');
    s.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 30);
    cohort.addSession(s);
    expect(cohort.baselineStatus()).toBe('revised_higher');
  });

  test('baselineStatus() is "revised_lower" when rate significantly below 35%', () => {
    // 0 of 6 complete → 0%
    const cohort = new PlaytestCohort();
    for (let i = 0; i < 6; i++) {
      const s = new PlaytestSession(`s-${i}`, `p-${i}`);
      s.recordAbandonment(DECISION_POINTS.TOOL_SELECTION, 30);
      cohort.addSession(s);
    }
    expect(cohort.baselineStatus()).toBe('revised_lower');
  });

  test('baselineStatus() is "not_measurable" with sub-minimum cohort (< 5 sessions)', () => {
    const cohort = new PlaytestCohort();
    const s = new PlaytestSession('s-1', 'p-1');
    s.recordCompletion(300);
    cohort.addSession(s);
    expect(cohort.baselineStatus()).toBe('not_measurable');
  });

  test('report explicitly includes baselineStatus field (AC5 requirement)', () => {
    const report = buildMixedCohort().generateReport();
    expect(['confirmed', 'revised_higher', 'revised_lower', 'not_measurable']).toContain(
      report.baselineStatus
    );
  });
});

// ─── PlaytestCohort — validation ──────────────────────────────────────────────

describe('PlaytestCohort — input validation', () => {
  test('addSession throws when argument is not a PlaytestSession', () => {
    const cohort = new PlaytestCohort();
    expect(() => cohort.addSession({ sessionId: 'fake' })).toThrow();
  });

  test('size returns the correct number of sessions', () => {
    const cohort = buildAllCompletesCohort(3);
    expect(cohort.size).toBe(3);
  });
});

// ─── Regression guard — existing TelemetryEmitter not modified ────────────────

describe('Regression — TelemetryEmitter untouched (no game code changes)', () => {
  let TelemetryEmitter, EVENTS;

  beforeAll(() => {
    ({ TelemetryEmitter, EVENTS } = require('../../../javascript/telemetry/TelemetryEmitter'));
  });

  test('EVENTS.TUTORIAL_DIAGNOSIS_STARTED unchanged', () => {
    expect(EVENTS.TUTORIAL_DIAGNOSIS_STARTED).toBe('tutorial_diagnosis_started');
  });

  test('EVENTS.REASSEMBLY_COMPLETED unchanged', () => {
    expect(EVENTS.REASSEMBLY_COMPLETED).toBe('reassembly_completed');
  });

  test('EVENTS.COMPLICATION_GATE_REACHED unchanged', () => {
    expect(EVENTS.COMPLICATION_GATE_REACHED).toBe('complication_gate_reached');
  });

  test('TelemetryEmitter still constructs with a hook function', () => {
    const emitter = new TelemetryEmitter(() => {});
    expect(emitter).toBeDefined();
  });

  test('PlaytestAnnotationFramework does not modify TelemetryEmitter', () => {
    // Importing the framework should not change TelemetryEmitter behaviour
    const { PlaytestCohort: C } = require('../../../javascript/telemetry/PlaytestAnnotationFramework');
    const emitter = new TelemetryEmitter(() => {});
    expect(emitter.wasEmitted).toBeDefined(); // existing method still present
  });
});
