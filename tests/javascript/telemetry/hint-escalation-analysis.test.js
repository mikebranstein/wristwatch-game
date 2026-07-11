/**
 * Tests for Issue #110: Phase-Attributed Hint Escalation Analysis
 *
 * Validates HintEscalationAnalyzer against all five Acceptance Criteria and
 * all seven Test Scenarios defined in the feature request.
 *
 * Acceptance Criteria covered:
 *   AC1 — Hint events attributed to each phase; coverage % documented
 *   AC2 — Comparative report per phase across 200+ completed sessions
 *   AC3 — Binary gate outcome: diagnosis highest (PASS) or not (FAIL)
 *   AC4 — Numeric 'diagnosis-without-hint %' baseline for A/B test
 *   AC5 — generateReport() produces a summary with clearly labelled gate outcome
 *
 * Test Scenarios covered:
 *   Scenario 1 — Happy path: gate PASS (diagnosis is highest escalation phase)
 *   Scenario 2 — Happy path: gate FAIL (diagnosis is NOT highest)
 *   Scenario 3 — Partial attribution: nulls handled, coverage % reported
 *   Scenario 4 — Insufficient sample (<200 sessions): gap documented, no gate
 *   Scenario 5 — Schema gap: phase entirely absent → schemaGap blocker
 *   Scenario 6 — Baseline format: diagnosisWithoutHintPercent is numeric (1dp)
 *   Scenario 7 — Data integrity: no per-session PII in output
 */

const {
  HintEscalationAnalyzer,
  KNOWN_PHASES,
  MIN_SAMPLE,
  HINT_EVENT_NAMES,
  PHASE_BY_EVENT_NAME,
  resolveEventPhase,
  isHintEvent,
} = require('../../../src/telemetry/HintEscalationAnalyzer');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** Build a session record with the given events; completed:true by default. */
function makeSession(events, { completed = true, sessionId = 'sess-anon' } = {}) {
  return { sessionId, completed, events };
}

/** Diagnosis hint event (inferred phase from name). */
function diagHintEvent(tier = 1) {
  return { name: `hint_tier_${tier}_shown`, payload: { faultInstanceId: 'fi-1' }, timestamp: 1000 };
}

/** Diagnosis completion event — no hint used. */
function diagCompleteNoHint() {
  return { name: 'diagnosis_completed_without_hint', payload: { faultInstanceId: 'fi-1' }, timestamp: 2000 };
}

/** Diagnosis completion event — hint was used. */
function diagCompleteWithHint(tier = 1) {
  return { name: 'diagnosis_completed_with_hint', payload: { faultInstanceId: 'fi-1', highestTierUsed: tier }, timestamp: 2000 };
}

/** Cleaning event (inferred phase from name). */
function cleaningEvent() {
  return { name: 'cleaning_reveal_started', payload: {}, timestamp: 3000 };
}

/** Reassembly event (inferred phase from name). */
function reassemblyEvent() {
  return { name: 'reassembly_completed', payload: { partId: 'balance_wheel' }, timestamp: 4000 };
}

/** A hint event explicitly attributed to a phase via payload.phase. */
function explicitPhaseHintEvent(phase) {
  return { name: 'hint_shown', payload: { phase, hintShown: true }, timestamp: 1500 };
}

/** Build N completed sessions all following the same event factory. */
function makeSessions(count, eventsFn) {
  return Array.from({ length: count }, (_, i) => makeSession(eventsFn(i), { sessionId: `s-${i}` }));
}

/**
 * Build a representative 200-session dataset.
 * - 160 diagnosis-only sessions: 80 with hint, 80 without (50% escalation)
 * - 20 cleaning-only sessions: 2 with explicit hint (10% escalation)
 * - 20 reassembly-only sessions: 1 with explicit hint (5% escalation)
 */
function make200Sessions({ diagRate = 0.5, cleanRate = 0.1, reassemblyRate = 0.05 } = {}) {
  const sessions = [];

  const diagCount = 160;
  const diagHintCount = Math.round(diagCount * diagRate);
  for (let i = 0; i < diagCount; i++) {
    const useHint = i < diagHintCount;
    sessions.push(makeSession(
      useHint
        ? [diagHintEvent(1), diagCompleteWithHint(1)]
        : [diagCompleteNoHint()],
      { sessionId: `diag-${i}` }
    ));
  }

  const cleanCount = 20;
  const cleanHintCount = Math.round(cleanCount * cleanRate);
  for (let i = 0; i < cleanCount; i++) {
    const useHint = i < cleanHintCount;
    sessions.push(makeSession(
      useHint
        ? [cleaningEvent(), explicitPhaseHintEvent('cleaning')]
        : [cleaningEvent()],
      { sessionId: `clean-${i}` }
    ));
  }

  const reassemblyCount = 20;
  const reassemblyHintCount = Math.round(reassemblyCount * reassemblyRate);
  for (let i = 0; i < reassemblyCount; i++) {
    const useHint = i < reassemblyHintCount;
    sessions.push(makeSession(
      useHint
        ? [reassemblyEvent(), explicitPhaseHintEvent('reassembly')]
        : [reassemblyEvent()],
      { sessionId: `reassembly-${i}` }
    ));
  }

  return sessions; // 200 sessions total
}

// ─── Module exports ───────────────────────────────────────────────────────────

describe('HintEscalationAnalyzer — module exports', () => {
  test('exports HintEscalationAnalyzer class', () => {
    expect(typeof HintEscalationAnalyzer).toBe('function');
  });

  test('exports KNOWN_PHASES with all four game phases', () => {
    expect(KNOWN_PHASES).toEqual(['diagnosis', 'cleaning', 'reassembly', 'delivery']);
  });

  test('exports MIN_SAMPLE as 200', () => {
    expect(MIN_SAMPLE).toBe(200);
  });

  test('exports HINT_EVENT_NAMES as a Set containing all three hint tier events', () => {
    expect(HINT_EVENT_NAMES.has('hint_tier_1_shown')).toBe(true);
    expect(HINT_EVENT_NAMES.has('hint_tier_2_shown')).toBe(true);
    expect(HINT_EVENT_NAMES.has('hint_tier_3_shown')).toBe(true);
  });

  test('PHASE_BY_EVENT_NAME maps hint tier events to diagnosis', () => {
    expect(PHASE_BY_EVENT_NAME['hint_tier_1_shown']).toBe('diagnosis');
    expect(PHASE_BY_EVENT_NAME['hint_tier_2_shown']).toBe('diagnosis');
    expect(PHASE_BY_EVENT_NAME['hint_tier_3_shown']).toBe('diagnosis');
  });

  test('PHASE_BY_EVENT_NAME maps cleaning events to cleaning phase', () => {
    expect(PHASE_BY_EVENT_NAME['cleaning_reveal_started']).toBe('cleaning');
    expect(PHASE_BY_EVENT_NAME['cleaning_reveal_dismissed']).toBe('cleaning');
  });

  test('PHASE_BY_EVENT_NAME maps reassembly events to reassembly phase', () => {
    expect(PHASE_BY_EVENT_NAME['reassembly_completed']).toBe('reassembly');
    expect(PHASE_BY_EVENT_NAME['undo_attempted']).toBe('reassembly');
  });
});

// ─── Constructor guard ────────────────────────────────────────────────────────

describe('HintEscalationAnalyzer — constructor validation', () => {
  test('throws TypeError when sessions is not an array', () => {
    expect(() => new HintEscalationAnalyzer(null)).toThrow(TypeError);
    expect(() => new HintEscalationAnalyzer('not-an-array')).toThrow(TypeError);
    expect(() => new HintEscalationAnalyzer(42)).toThrow(TypeError);
  });

  test('accepts an empty array without throwing', () => {
    expect(() => new HintEscalationAnalyzer([])).not.toThrow();
  });

  test('accepts a well-formed sessions array without throwing', () => {
    const sessions = [makeSession([diagCompleteNoHint()])];
    expect(() => new HintEscalationAnalyzer(sessions)).not.toThrow();
  });
});

// ─── resolveEventPhase helper ─────────────────────────────────────────────────

describe('resolveEventPhase — phase resolution priority', () => {
  test('returns explicit payload.phase when present and valid', () => {
    const event = { name: 'hint_tier_1_shown', payload: { phase: 'cleaning' }, timestamp: 0 };
    const result = resolveEventPhase(event);
    expect(result.phase).toBe('cleaning');
    expect(result.attributed).toBe(true);
    expect(result.source).toBe('explicit');
  });

  test('falls back to inferred phase when payload.phase is absent', () => {
    const event = { name: 'hint_tier_2_shown', payload: {}, timestamp: 0 };
    const result = resolveEventPhase(event);
    expect(result.phase).toBe('diagnosis');
    expect(result.attributed).toBe(true);
    expect(result.source).toBe('inferred');
  });

  test('returns attributed:false when event name is unknown and no payload.phase', () => {
    const event = { name: 'unknown_event_xyz', payload: {}, timestamp: 0 };
    const result = resolveEventPhase(event);
    expect(result.phase).toBeNull();
    expect(result.attributed).toBe(false);
    expect(result.source).toBe('none');
  });

  test('ignores unknown payload.phase values and falls back to inference', () => {
    const event = { name: 'hint_tier_1_shown', payload: { phase: 'not_a_real_phase' }, timestamp: 0 };
    const result = resolveEventPhase(event);
    // 'not_a_real_phase' is not in KNOWN_PHASES → inferred from event name
    expect(result.phase).toBe('diagnosis');
    expect(result.source).toBe('inferred');
  });

  test('returns attributed:false for event with no payload', () => {
    const event = { name: 'custom_event_no_payload', timestamp: 0 };
    const result = resolveEventPhase(event);
    expect(result.attributed).toBe(false);
  });
});

// ─── isHintEvent helper ───────────────────────────────────────────────────────

describe('isHintEvent — hint detection', () => {
  test.each(['hint_tier_1_shown', 'hint_tier_2_shown', 'hint_tier_3_shown'])(
    '"%s" is a hint event',
    (name) => {
      expect(isHintEvent({ name, payload: {} })).toBe(true);
    }
  );

  test('event with payload.hintShown:true is treated as a hint event', () => {
    const event = { name: 'generic_hint_event', payload: { hintShown: true, phase: 'cleaning' } };
    expect(isHintEvent(event)).toBe(true);
  });

  test('non-hint events return false', () => {
    expect(isHintEvent({ name: 'diagnosis_completed_without_hint', payload: {} })).toBe(false);
    expect(isHintEvent({ name: 'reassembly_completed', payload: {} })).toBe(false);
    expect(isHintEvent({ name: 'cleaning_reveal_started', payload: {} })).toBe(false);
  });

  test('event with payload.hintShown:false is not a hint event', () => {
    expect(isHintEvent({ name: 'some_event', payload: { hintShown: false } })).toBe(false);
  });
});

// ─── AC1: Phase attribution and coverage % ───────────────────────────────────

describe('AC1 — Phase attribution and coverage % (Issue #110)', () => {
  test('result includes overallCoveragePercent as a number between 0 and 100', () => {
    const sessions = [makeSession([diagHintEvent(1), diagCompleteWithHint(1)])];
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(typeof result.overallCoveragePercent).toBe('number');
    expect(result.overallCoveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.overallCoveragePercent).toBeLessThanOrEqual(100);
  });

  test('coverage is 100% when all events have resolvable phase attribution', () => {
    const sessions = [makeSession([diagHintEvent(1), diagCompleteWithHint(1)])];
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // Both events are inferred as diagnosis → 100% coverage
    expect(result.overallCoveragePercent).toBe(100);
    expect(result.schemaGap).toBe(false);
  });

  test('coverage < 100% when some events have no phase attribution (Test Scenario 3)', () => {
    const unknownEvent = { name: 'completely_unknown_event', payload: {}, timestamp: 999 };
    const sessions = [makeSession([diagHintEvent(1), unknownEvent, diagCompleteWithHint(1)])];
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // 2 of 3 events attributed → ~66.7%
    expect(result.overallCoveragePercent).toBeLessThan(100);
    expect(result.overallCoveragePercent).toBeGreaterThan(0);
    expect(result.schemaGap).toBe(false);
  });

  test('all four phases are present in the result.phases map', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.phases).toHaveProperty('diagnosis');
    expect(result.phases).toHaveProperty('cleaning');
    expect(result.phases).toHaveProperty('reassembly');
    expect(result.phases).toHaveProperty('delivery');
  });

  test('each phase entry has sessionsWithPhase, sessionsWithHint, escalationRate', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    for (const phase of KNOWN_PHASES) {
      const s = result.phases[phase];
      expect(s).toHaveProperty('sessionsWithPhase');
      expect(s).toHaveProperty('sessionsWithHint');
      expect(s).toHaveProperty('escalationRate');
    }
  });

  test('sessionsWithHint ≤ sessionsWithPhase for every phase', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    for (const phase of KNOWN_PHASES) {
      const s = result.phases[phase];
      expect(s.sessionsWithHint).toBeLessThanOrEqual(s.sessionsWithPhase);
    }
  });

  test('explicit payload.phase attribution is respected over name-inferred phase', () => {
    // A hint_tier_1_shown event overridden to be cleaning via payload.phase
    const event = { name: 'hint_tier_1_shown', payload: { phase: 'cleaning', faultInstanceId: 'fi' }, timestamp: 0 };
    const sessions = [makeSession([event, cleaningEvent()])];
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // Should count as cleaning hint, not diagnosis hint
    expect(result.phases.cleaning.sessionsWithHint).toBe(1);
    expect(result.phases.diagnosis.sessionsWithHint).toBe(0);
  });
});

// ─── AC2: Comparative escalation rates across 200+ sessions ──────────────────

describe('AC2 — Comparative report across 200+ sessions (Issue #110)', () => {
  test('sufficientSampleSize is true when completedSessions >= 200', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.completedSessions).toBe(200);
    expect(result.sufficientSampleSize).toBe(true);
    expect(result.insufficientSample).toBe(false);
  });

  test('diagnosis escalation rate is correct when 80 of 160 sessions hint in diagnosis', () => {
    const sessions = make200Sessions({ diagRate: 0.5 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.phases.diagnosis.sessionsWithPhase).toBe(160);
    expect(result.phases.diagnosis.sessionsWithHint).toBe(80);
    expect(result.phases.diagnosis.escalationRate).toBe(50.0);
  });

  test('cleaning escalation rate is correct when 2 of 20 sessions hint in cleaning', () => {
    const sessions = make200Sessions({ cleanRate: 0.1 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.phases.cleaning.sessionsWithPhase).toBe(20);
    expect(result.phases.cleaning.sessionsWithHint).toBe(2);
    expect(result.phases.cleaning.escalationRate).toBe(10.0);
  });

  test('escalation rate is null for phases with no sessions (e.g. delivery in basic data)', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // make200Sessions has no delivery events
    expect(result.phases.delivery.sessionsWithPhase).toBe(0);
    expect(result.phases.delivery.escalationRate).toBeNull();
  });

  test('escalation rates are rounded to one decimal place', () => {
    // 1 hint in 3 sessions = 33.333...% → should round to 33.3
    const sessions = [
      makeSession([diagHintEvent(1), diagCompleteWithHint(1)]),
      makeSession([diagCompleteNoHint()]),
      makeSession([diagCompleteNoHint()]),
    ];
    // Pad to 200+ with clean sessions to enable gate
    for (let i = 0; i < 197; i++) {
      sessions.push(makeSession([cleaningEvent()]));
    }
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.phases.diagnosis.escalationRate).toBe(33.3);
  });

  test('only completed sessions are included in analysis', () => {
    const completedSession = makeSession([diagHintEvent(1)], { completed: true });
    const incompleteSession = makeSession([diagHintEvent(1)], { completed: false });
    const paddedCompleted = makeSessions(199, () => [cleaningEvent()]);
    const sessions = [completedSession, incompleteSession, ...paddedCompleted];
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // incompleteSession should NOT count
    expect(result.completedSessions).toBe(200);
    expect(result.phases.diagnosis.sessionsWithHint).toBe(1);
  });
});

// ─── AC3: Binary gate outcome (PASS / FAIL) ───────────────────────────────────

describe('AC3 — Binary gate outcome (Issue #110)', () => {
  test('Scenario 1: gateOutcome is PASS when diagnosis has the highest escalation rate', () => {
    // diagnosis: 50%, cleaning: 10%, reassembly: 5%
    const sessions = make200Sessions({ diagRate: 0.5, cleanRate: 0.1, reassemblyRate: 0.05 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.diagnosisIsHighest).toBe(true);
    expect(result.gateOutcome).toBe('PASS');
  });

  test('Scenario 2: gateOutcome is FAIL when another phase has a higher escalation rate', () => {
    // cleaning: 80% > diagnosis: 20% → FAIL
    const sessions = make200Sessions({ diagRate: 0.2, cleanRate: 0.8, reassemblyRate: 0.05 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.diagnosisIsHighest).toBe(false);
    expect(result.gateOutcome).toBe('FAIL');
  });

  test('gateOutcome is null when insufficientSample (Scenario 4)', () => {
    // Only 10 sessions — cannot declare gate
    const sessions = makeSessions(10, () => [diagHintEvent(1), diagCompleteWithHint(1)]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.insufficientSample).toBe(true);
    expect(result.gateOutcome).toBeNull();
    expect(result.diagnosisIsHighest).toBeNull();
  });

  test('gateOutcome is null when schemaGap (Scenario 5)', () => {
    // Sessions with only unknown events → schema gap
    const sessions = makeSessions(300, () => [
      { name: 'unknown_event', payload: {}, timestamp: 0 },
    ]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.schemaGap).toBe(true);
    expect(result.gateOutcome).toBeNull();
  });

  test('gateOutcome is PASS when diagnosis is tied with another phase (equal is highest)', () => {
    // Both diagnosis and cleaning have 50% escalation → diagnosis is still "highest" (tied)
    const sessions = make200Sessions({ diagRate: 0.5, cleanRate: 0.5, reassemblyRate: 0.1 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.diagnosisIsHighest).toBe(true);
    expect(result.gateOutcome).toBe('PASS');
  });

  test('result contains exactly PASS or FAIL string when gate is declared', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(['PASS', 'FAIL']).toContain(result.gateOutcome);
  });
});

// ─── AC4: Baseline 'diagnosis-without-hint %' ────────────────────────────────

describe('AC4 — Diagnosis-without-hint % baseline for A/B test (Issue #110)', () => {
  test('Scenario 6: diagnosisWithoutHintPercent is a number (not a string or null) when data exists', () => {
    const sessions = make200Sessions({ diagRate: 0.5 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(typeof result.diagnosisWithoutHintPercent).toBe('number');
    expect(result.diagnosisWithoutHintPercent).not.toBeNaN();
  });

  test('Scenario 6: diagnosisWithoutHintPercent is rounded to one decimal place', () => {
    // 80 sessions with hint, 80 without → exactly 50.0%
    const sessions = make200Sessions({ diagRate: 0.5 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // Value should be a number with at most one decimal
    const str = String(result.diagnosisWithoutHintPercent);
    const parts = str.split('.');
    if (parts.length > 1) {
      expect(parts[1].length).toBeLessThanOrEqual(1);
    }
  });

  test('diagnosisWithoutHintPercent is 50 when half of diagnosis sessions used no hint', () => {
    const sessions = make200Sessions({ diagRate: 0.5 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // 80 hint-used, 80 no-hint → 50% without-hint
    expect(result.diagnosisWithoutHintPercent).toBe(50.0);
  });

  test('diagnosisWithoutHintPercent is 100 when no diagnosis sessions used a hint', () => {
    const sessions = make200Sessions({ diagRate: 0.0 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.diagnosisWithoutHintPercent).toBe(100.0);
  });

  test('diagnosisWithoutHintPercent is 0 when all diagnosis sessions used a hint', () => {
    const sessions = make200Sessions({ diagRate: 1.0 });
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.diagnosisWithoutHintPercent).toBe(0.0);
  });

  test('diagnosisWithoutHintPercent is null when no diagnosis-phase events exist', () => {
    // Sessions with only cleaning events
    const sessions = makeSessions(200, () => [cleaningEvent()]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.diagnosisWithoutHintPercent).toBeNull();
  });

  test('diagnosisWithoutHintPercent is null when schemaGap is true', () => {
    const sessions = makeSessions(300, () => [{ name: 'unattributed_event', payload: {}, timestamp: 0 }]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.schemaGap).toBe(true);
    expect(result.diagnosisWithoutHintPercent).toBeNull();
  });
});

// ─── AC5: Report format ───────────────────────────────────────────────────────

describe('AC5 — generateReport() produces findings summary (Issue #110)', () => {
  test('generateReport() returns a non-empty string', () => {
    const sessions = make200Sessions();
    const analyzer = new HintEscalationAnalyzer(sessions);
    const result = analyzer.analyze();
    const report = analyzer.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  test('report includes "PASS" label when gateOutcome is PASS', () => {
    const sessions = make200Sessions({ diagRate: 0.5, cleanRate: 0.1 });
    const analyzer = new HintEscalationAnalyzer(sessions);
    const report = analyzer.generateReport(analyzer.analyze());
    expect(report).toMatch(/PASS/);
  });

  test('report includes "FAIL" label when gateOutcome is FAIL', () => {
    const sessions = make200Sessions({ diagRate: 0.1, cleanRate: 0.9 });
    const analyzer = new HintEscalationAnalyzer(sessions);
    const report = analyzer.generateReport(analyzer.analyze());
    expect(report).toMatch(/FAIL/);
  });

  test('report includes "BLOCKER" when schemaGap is true', () => {
    const sessions = makeSessions(300, () => [{ name: 'no_phase', payload: {}, timestamp: 0 }]);
    const analyzer = new HintEscalationAnalyzer(sessions);
    const report = analyzer.generateReport(analyzer.analyze());
    expect(report).toMatch(/BLOCKER/i);
  });

  test('report contains a Markdown table with all four phases', () => {
    const sessions = make200Sessions();
    const analyzer = new HintEscalationAnalyzer(sessions);
    const report = analyzer.generateReport(analyzer.analyze());
    expect(report).toMatch(/diagnosis/);
    expect(report).toMatch(/cleaning/);
    expect(report).toMatch(/reassembly/);
    expect(report).toMatch(/delivery/);
  });

  test('report includes the numeric diagnosisWithoutHintPercent value', () => {
    const sessions = make200Sessions({ diagRate: 0.5 });
    const analyzer = new HintEscalationAnalyzer(sessions);
    const result = analyzer.analyze();
    const report = analyzer.generateReport(result);
    expect(report).toMatch(/50/); // 50.0% should appear in report
  });

  test('report includes attribution coverage %', () => {
    const sessions = make200Sessions();
    const analyzer = new HintEscalationAnalyzer(sessions);
    const result = analyzer.analyze();
    const report = analyzer.generateReport(result);
    expect(report).toMatch(/Coverage/i);
    expect(report).toMatch(new RegExp(`${result.overallCoveragePercent}`));
  });

  test('report includes "INCONCLUSIVE" when sample is insufficient', () => {
    const sessions = makeSessions(10, () => [diagCompleteNoHint()]);
    const analyzer = new HintEscalationAnalyzer(sessions);
    const report = analyzer.generateReport(analyzer.analyze());
    expect(report).toMatch(/INCONCLUSIVE/i);
  });
});

// ─── Scenario 3: Partial attribution ─────────────────────────────────────────

describe('Scenario 3 — Partial attribution: nulls handled, coverage % reported', () => {
  test('unattributed events reduce overallCoveragePercent below 100%', () => {
    // 1 attributed event + 1 unattributed event → 50% coverage
    const event1 = diagHintEvent(1);          // attributed (inferred)
    const event2 = { name: 'unknown_xyz', payload: {}, timestamp: 0 }; // unattributed
    // Pad to 200 sessions with diagnosis events to get sufficient sample
    const sessions = [makeSession([event1, event2])];
    for (let i = 0; i < 199; i++) {
      sessions.push(makeSession([diagCompleteNoHint()]));
    }
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.schemaGap).toBe(false);
    expect(result.overallCoveragePercent).toBeLessThan(100);
  });

  test('unattributed events do not corrupt phase-level counts', () => {
    const unknownEvent = { name: 'unknown_event', payload: {}, timestamp: 0 };
    const sessions = [makeSession([diagHintEvent(1), unknownEvent])];
    for (let i = 0; i < 199; i++) {
      sessions.push(makeSession([cleaningEvent()]));
    }
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // Only the diagHintEvent session should count as diagnosis-phase with hint
    expect(result.phases.diagnosis.sessionsWithHint).toBe(1);
  });

  test('schemaGap is false when at least one event is attributable', () => {
    // Mix of unknown events + one known event
    const sessions = makeSessions(200, (i) =>
      i === 0
        ? [diagCompleteNoHint(), { name: 'unknown', payload: {}, timestamp: 0 }]
        : [{ name: 'another_unknown', payload: {}, timestamp: 0 }]
    );
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.schemaGap).toBe(false);
  });
});

// ─── Scenario 4: Insufficient sample ─────────────────────────────────────────

describe('Scenario 4 — Insufficient sample: gap documented, no gate declared', () => {
  test('insufficientSample is true when completedSessions < 200', () => {
    const sessions = makeSessions(50, () => [diagHintEvent(1)]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.insufficientSample).toBe(true);
    expect(result.sufficientSampleSize).toBe(false);
    expect(result.completedSessions).toBe(50);
  });

  test('gateOutcome is null when sample is insufficient', () => {
    const sessions = makeSessions(100, () => [diagHintEvent(1), diagCompleteWithHint(1)]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.gateOutcome).toBeNull();
  });

  test('diagnosisIsHighest is null when sample is insufficient', () => {
    const sessions = makeSessions(150, () => [diagHintEvent(1)]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.diagnosisIsHighest).toBeNull();
  });

  test('phase escalation stats are still computed when sample < 200 (partial output)', () => {
    const sessions = makeSessions(50, () => [diagHintEvent(1), diagCompleteWithHint(1)]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // Even with insufficient sample, per-phase data is available
    expect(result.phases.diagnosis.sessionsWithHint).toBe(50);
    expect(result.phases.diagnosis.escalationRate).toBe(100.0);
  });

  test('totalSessions includes incomplete sessions in the count', () => {
    const completedSessions = makeSessions(30, () => [diagCompleteNoHint()]);
    const incompleteSessions = makeSessions(20, () => [diagHintEvent(1)], );
    // Mark incomplete
    incompleteSessions.forEach((s) => (s.completed = false));
    const result = new HintEscalationAnalyzer([...completedSessions, ...incompleteSessions]).analyze();
    expect(result.totalSessions).toBe(50);
    expect(result.completedSessions).toBe(30);
  });
});

// ─── Scenario 5: Schema gap ───────────────────────────────────────────────────

describe('Scenario 5 — Schema gap: phase attribution entirely absent', () => {
  test('schemaGap is true when no events have any attributable phase', () => {
    const sessions = makeSessions(300, () => [
      { name: 'unrecognized_event_a', payload: {}, timestamp: 0 },
      { name: 'unrecognized_event_b', payload: {}, timestamp: 1 },
    ]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.schemaGap).toBe(true);
    expect(result.overallCoveragePercent).toBe(0);
    expect(result.gateOutcome).toBeNull();
    expect(result.diagnosisWithoutHintPercent).toBeNull();
  });

  test('schemaGap is true for empty sessions array', () => {
    const result = new HintEscalationAnalyzer([]).analyze();
    expect(result.schemaGap).toBe(true);
    expect(result.totalSessions).toBe(0);
    expect(result.completedSessions).toBe(0);
  });

  test('all phase stats are zero when schemaGap is true', () => {
    const sessions = makeSessions(300, () => [{ name: 'no_phase_event', payload: {}, timestamp: 0 }]);
    const result = new HintEscalationAnalyzer(sessions).analyze();
    for (const phase of KNOWN_PHASES) {
      expect(result.phases[phase].sessionsWithPhase).toBe(0);
      expect(result.phases[phase].sessionsWithHint).toBe(0);
      expect(result.phases[phase].escalationRate).toBeNull();
    }
  });
});

// ─── Scenario 7: Data integrity — no PII in output ───────────────────────────

describe('Scenario 7 — Data integrity: no per-session PII in output', () => {
  test('analyze() result does not include sessionId values', () => {
    const sessions = make200Sessions();
    sessions.forEach((s, i) => (s.sessionId = `player-pii-id-${i}`));
    const result = new HintEscalationAnalyzer(sessions).analyze();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/player-pii-id/);
  });

  test('analyze() result does not include individual faultInstanceId values', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    const serialized = JSON.stringify(result);
    // faultInstanceIds like 'fi-1' should not appear in aggregate output
    expect(serialized).not.toMatch(/"faultInstanceId"/);
  });

  test('result contains only aggregate counts and rates — no per-session arrays', () => {
    const sessions = make200Sessions();
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // Top-level result must not expose session-level detail arrays
    expect(result).not.toHaveProperty('sessionDetails');
    expect(result).not.toHaveProperty('rawEvents');
    expect(result).not.toHaveProperty('sessions');
  });

  test('generateReport() does not expose sessionId in the report text', () => {
    const sessions = make200Sessions();
    sessions.forEach((s, i) => (s.sessionId = `sensitive-player-${i}`));
    const analyzer = new HintEscalationAnalyzer(sessions);
    const report = analyzer.generateReport(analyzer.analyze());
    expect(report).not.toMatch(/sensitive-player/);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('HintEscalationAnalyzer — edge cases', () => {
  test('sessions with empty events arrays are handled without error', () => {
    const sessions = makeSessions(200, () => []);
    expect(() => new HintEscalationAnalyzer(sessions).analyze()).not.toThrow();
  });

  test('sessions with missing events property are handled without error', () => {
    const sessions = Array.from({ length: 200 }, () => ({ sessionId: 'x', completed: true }));
    expect(() => new HintEscalationAnalyzer(sessions).analyze()).not.toThrow();
  });

  test('a session using all three hint tiers is counted only once per phase (not three times)', () => {
    const sessions = [
      makeSession([diagHintEvent(1), diagHintEvent(2), diagHintEvent(3), diagCompleteWithHint(3)]),
    ];
    for (let i = 0; i < 199; i++) sessions.push(makeSession([cleaningEvent()]));
    const result = new HintEscalationAnalyzer(sessions).analyze();
    // The one diagnosis session with 3 hint events should count as 1 hint session
    expect(result.phases.diagnosis.sessionsWithHint).toBe(1);
    expect(result.phases.diagnosis.sessionsWithPhase).toBe(1);
  });

  test('delivery phase hint captured when event has payload.phase = delivery', () => {
    const deliveryHint = { name: 'hint_shown', payload: { phase: 'delivery', hintShown: true }, timestamp: 0 };
    const sessions = [makeSession([deliveryHint])];
    for (let i = 0; i < 199; i++) sessions.push(makeSession([cleaningEvent()]));
    const result = new HintEscalationAnalyzer(sessions).analyze();
    expect(result.phases.delivery.sessionsWithHint).toBe(1);
    expect(result.phases.delivery.sessionsWithPhase).toBe(1);
    expect(result.phases.delivery.escalationRate).toBe(100.0);
  });

  test('totalSessions correctly counts all sessions regardless of completed flag', () => {
    const s = [
      makeSession([diagCompleteNoHint()], { completed: true }),
      makeSession([diagCompleteNoHint()], { completed: false }),
      makeSession([diagCompleteNoHint()], { completed: false }),
    ];
    const result = new HintEscalationAnalyzer(s).analyze();
    expect(result.totalSessions).toBe(3);
    expect(result.completedSessions).toBe(1);
  });
});

// ─── Integration: full 200-session analysis ───────────────────────────────────

describe('Integration — 200-session analysis with PASS outcome', () => {
  let result;

  beforeAll(() => {
    const sessions = make200Sessions({ diagRate: 0.5, cleanRate: 0.1, reassemblyRate: 0.05 });
    result = new HintEscalationAnalyzer(sessions).analyze();
  });

  test('completedSessions is 200', () => expect(result.completedSessions).toBe(200));
  test('sufficientSampleSize is true', () => expect(result.sufficientSampleSize).toBe(true));
  test('schemaGap is false', () => expect(result.schemaGap).toBe(false));
  test('insufficientSample is false', () => expect(result.insufficientSample).toBe(false));
  test('gateOutcome is PASS', () => expect(result.gateOutcome).toBe('PASS'));
  test('diagnosisIsHighest is true', () => expect(result.diagnosisIsHighest).toBe(true));
  test('diagnosis escalation rate is 50.0%', () => expect(result.phases.diagnosis.escalationRate).toBe(50.0));
  test('diagnosisWithoutHintPercent is 50.0', () => expect(result.diagnosisWithoutHintPercent).toBe(50.0));
  test('overallCoveragePercent > 0', () => expect(result.overallCoveragePercent).toBeGreaterThan(0));
});

describe('Integration — 200-session analysis with FAIL outcome', () => {
  let result;

  beforeAll(() => {
    // Make cleaning the highest-escalation phase
    const sessions = make200Sessions({ diagRate: 0.1, cleanRate: 0.9, reassemblyRate: 0.05 });
    result = new HintEscalationAnalyzer(sessions).analyze();
  });

  test('gateOutcome is FAIL', () => expect(result.gateOutcome).toBe('FAIL'));
  test('diagnosisIsHighest is false', () => expect(result.diagnosisIsHighest).toBe(false));
  test('cleaning escalation rate is higher than diagnosis escalation rate', () => {
    expect(result.phases.cleaning.escalationRate).toBeGreaterThan(result.phases.diagnosis.escalationRate);
  });
});
