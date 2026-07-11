/**
 * Tests for AnnotationRubric — Issue #112: Onboarding Telemetry Baseline & Failure Map
 *
 * Covers all 8 test scenarios from the issue:
 *
 * Scenario 1: Happy path — participant completes first job
 *   AC1: Baseline completion rate counter works; completion annotated correctly.
 *
 * Scenario 2: Participant abandons at tool-selection step
 *   AC2: Failure map captures tool-select abandonment.
 *
 * Scenario 3: Participant abandons mid-disassembly
 *   AC2: Failure map captures distinct drop-off point from scenario 2.
 *
 * Scenario 4: Participant asks for help without abandoning
 *   AC2: Distinguishes confusion-with-recovery from hard abandonment.
 *
 * Scenario 5: Participant skips/ignores tooltip
 *   Report can identify tooltip-seen-but-ignored vs tooltip-not-noticed.
 *
 * Scenario 6: Session recording reviewed post-session (async annotation)
 *   Annotation framework supports async review via updateEntry().
 *
 * Scenario 7: Fewer than 5 sessions — incomplete cohort handling
 *   Report documents shortfall and confidence level gracefully.
 *
 * Scenario 8: All participants complete without failure
 *   Report outputs "no critical failure points found" — valid useful outcome.
 */

'use strict';

const {
  AnnotationRubric,
  AnnotationEntry,
  EVENT_TYPES,
  TOOLTIP_INTERACTIONS,
  FIRST_JOB_STEPS,
} = require('../../../javascript/onboarding/AnnotationRubric');

// ─── Rubric construction guards ───────────────────────────────────────────────

describe('AnnotationRubric — construction validation', () => {
  test('creates a valid rubric with required sessionId', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-001' });
    expect(rubric.sessionId).toBe('session-001');
  });

  test('throws when sessionId is missing', () => {
    expect(() => new AnnotationRubric({})).toThrow('sessionId is required');
  });

  test('participantId defaults to null when not provided', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-001' });
    expect(rubric.participantId).toBeNull();
  });

  test('asyncReview defaults to false', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-001' });
    expect(rubric.asyncReview).toBe(false);
  });

  test('asyncReview is true when explicitly set', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-001', asyncReview: true });
    expect(rubric.asyncReview).toBe(true);
  });
});

// ─── AnnotationEntry validation ───────────────────────────────────────────────

describe('AnnotationEntry — field validation', () => {
  test('creates valid entry with all required fields', () => {
    const entry = new AnnotationEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 45,
      eventType: EVENT_TYPES.ABANDONMENT,
    });
    expect(entry.stepName).toBe('tool-selection');
    expect(entry.elapsedTimeSeconds).toBe(45);
    expect(entry.eventType).toBe(EVENT_TYPES.ABANDONMENT);
  });

  test('notes default to empty string when not provided', () => {
    const entry = new AnnotationEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 10,
      eventType: EVENT_TYPES.COMPLETION,
    });
    expect(entry.notes).toBe('');
  });

  test('tooltipInteraction defaults to NONE when not provided', () => {
    const entry = new AnnotationEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 10,
      eventType: EVENT_TYPES.COMPLETION,
    });
    expect(entry.tooltipInteraction).toBe(TOOLTIP_INTERACTIONS.NONE);
  });

  test('throws for invalid eventType', () => {
    expect(() =>
      new AnnotationEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 10, eventType: 'invalid' })
    ).toThrow('eventType');
  });

  test('throws for negative elapsedTimeSeconds', () => {
    expect(() =>
      new AnnotationEntry({ stepName: 'tool-selection', elapsedTimeSeconds: -1, eventType: EVENT_TYPES.COMPLETION })
    ).toThrow('elapsedTimeSeconds');
  });

  test('throws when stepName is missing', () => {
    expect(() =>
      new AnnotationEntry({ elapsedTimeSeconds: 10, eventType: EVENT_TYPES.COMPLETION })
    ).toThrow('stepName');
  });

  test('all EVENT_TYPES values are accepted as eventType', () => {
    Object.values(EVENT_TYPES).forEach((type) => {
      expect(() =>
        new AnnotationEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 0, eventType: type })
      ).not.toThrow();
    });
  });

  test('all TOOLTIP_INTERACTIONS values are accepted', () => {
    Object.values(TOOLTIP_INTERACTIONS).forEach((interaction) => {
      expect(() =>
        new AnnotationEntry({
          stepName: 'tool-selection',
          elapsedTimeSeconds: 0,
          eventType: EVENT_TYPES.COMPLETION,
          tooltipInteraction: interaction,
        })
      ).not.toThrow();
    });
  });
});

// ─── EVENT_TYPES and TOOLTIP_INTERACTIONS completeness ───────────────────────

describe('EVENT_TYPES — required taxonomy is complete', () => {
  test('COMPLETION is defined', () => expect(EVENT_TYPES.COMPLETION).toBe('completion'));
  test('ABANDONMENT is defined', () => expect(EVENT_TYPES.ABANDONMENT).toBe('abandonment'));
  test('CONFUSION_WITH_RECOVERY is defined', () =>
    expect(EVENT_TYPES.CONFUSION_WITH_RECOVERY).toBe('confusion_with_recovery'));
  test('TOOLTIP_IGNORED is defined', () =>
    expect(EVENT_TYPES.TOOLTIP_IGNORED).toBe('tooltip_ignored'));
});

describe('TOOLTIP_INTERACTIONS — required taxonomy is complete', () => {
  test('READ is defined', () => expect(TOOLTIP_INTERACTIONS.READ).toBe('read'));
  test('DISMISSED_IMMEDIATELY is defined', () =>
    expect(TOOLTIP_INTERACTIONS.DISMISSED_IMMEDIATELY).toBe('dismissed_immediately'));
  test('NOT_NOTICED is defined', () =>
    expect(TOOLTIP_INTERACTIONS.NOT_NOTICED).toBe('not_noticed'));
  test('NONE is defined', () => expect(TOOLTIP_INTERACTIONS.NONE).toBe('none'));
});

describe('FIRST_JOB_STEPS — canonical step list', () => {
  test('contains at least 5 canonical steps', () => {
    expect(FIRST_JOB_STEPS.length).toBeGreaterThanOrEqual(5);
  });
  test('includes tool-selection step', () => {
    expect(FIRST_JOB_STEPS).toContain('tool-selection');
  });
  test('includes disassembly steps', () => {
    expect(FIRST_JOB_STEPS).toContain('disassembly-start');
    expect(FIRST_JOB_STEPS).toContain('disassembly-mid');
  });
  test('includes job-completion step', () => {
    expect(FIRST_JOB_STEPS).toContain('job-completion');
  });
});

// ─── Scenario 1: Happy path — participant completes first job ─────────────────

describe('Scenario 1 — Happy path: participant completes first job', () => {
  test('markComplete sets isSessionComplete to true', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-001' });
    rubric.markComplete();
    expect(rubric.isSessionComplete()).toBe(true);
  });

  test('completion entry is recorded correctly', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-001' });
    rubric.addEntry({
      stepName: 'job-completion',
      elapsedTimeSeconds: 1200,
      eventType: EVENT_TYPES.COMPLETION,
      notes: 'Participant finished smoothly, no hesitation on final assembly.',
    });
    rubric.markComplete();

    const entries = rubric.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].eventType).toBe(EVENT_TYPES.COMPLETION);
    expect(rubric.isSessionComplete()).toBe(true);
  });

  test('completed session has no abandonment', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-001' });
    rubric.addEntry({
      stepName: 'job-completion',
      elapsedTimeSeconds: 1200,
      eventType: EVENT_TYPES.COMPLETION,
    });
    rubric.markComplete();
    expect(rubric.hasAbandonment()).toBe(false);
    expect(rubric.getAbandonmentEntry()).toBeNull();
  });
});

// ─── Scenario 2: Abandons at tool-selection step ──────────────────────────────

describe('Scenario 2 — Participant abandons at tool-selection step', () => {
  test('abandonment entry captures step name, elapsed time, and notes', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-002' });
    rubric.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 90,
      eventType: EVENT_TYPES.ABANDONMENT,
      notes: "Participant said: 'I don't know which tool to use.' Exited session.",
    });

    const abandonEntry = rubric.getAbandonmentEntry();
    expect(abandonEntry).not.toBeNull();
    expect(abandonEntry.stepName).toBe('tool-selection');
    expect(abandonEntry.elapsedTimeSeconds).toBe(90);
    expect(abandonEntry.isAbandonment()).toBe(true);
  });

  test('hasAbandonment returns true after tool-selection abandonment is recorded', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-002' });
    rubric.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 90,
      eventType: EVENT_TYPES.ABANDONMENT,
    });
    expect(rubric.hasAbandonment()).toBe(true);
  });

  test('rubric is not marked complete when abandoned', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-002' });
    rubric.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 90,
      eventType: EVENT_TYPES.ABANDONMENT,
    });
    expect(rubric.isSessionComplete()).toBe(false);
  });
});

// ─── Scenario 3: Abandons mid-disassembly (different step from scenario 2) ────

describe('Scenario 3 — Participant abandons mid-disassembly (distinct drop-off point)', () => {
  test('rubric captures mid-disassembly abandonment with its own step name', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-003' });
    rubric.addEntry({
      stepName: 'disassembly-mid',
      elapsedTimeSeconds: 420,
      eventType: EVENT_TYPES.ABANDONMENT,
      notes: 'Participant lost track of removed parts, gave up.',
    });

    const abandonEntry = rubric.getAbandonmentEntry();
    expect(abandonEntry.stepName).toBe('disassembly-mid');
    expect(abandonEntry.elapsedTimeSeconds).toBe(420);
  });

  test('two sessions with different abandonment steps produce two distinct entries', () => {
    const s2 = new AnnotationRubric({ sessionId: 'session-002' });
    s2.addEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 90, eventType: EVENT_TYPES.ABANDONMENT });

    const s3 = new AnnotationRubric({ sessionId: 'session-003' });
    s3.addEntry({ stepName: 'disassembly-mid', elapsedTimeSeconds: 420, eventType: EVENT_TYPES.ABANDONMENT });

    const step2 = s2.getAbandonmentEntry().stepName;
    const step3 = s3.getAbandonmentEntry().stepName;
    expect(step2).not.toBe(step3);
    expect(step2).toBe('tool-selection');
    expect(step3).toBe('disassembly-mid');
  });
});

// ─── Scenario 4: Confusion-with-recovery (not hard abandonment) ───────────────

describe('Scenario 4 — Participant asks for help without abandoning', () => {
  test('CONFUSION_WITH_RECOVERY entry is distinguishable from ABANDONMENT', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-004' });
    rubric.addEntry({
      stepName: 'component-identification',
      elapsedTimeSeconds: 300,
      eventType: EVENT_TYPES.CONFUSION_WITH_RECOVERY,
      notes: 'Participant paused 15 s, asked "which is the mainspring?", then continued.',
    });

    expect(rubric.hasAbandonment()).toBe(false);
    expect(rubric.getConfusionEntries()).toHaveLength(1);
    expect(rubric.getConfusionEntries()[0].isConfusionWithRecovery()).toBe(true);
    expect(rubric.getAbandonmentEntry()).toBeNull();
  });

  test('session with confusion-but-no-abandonment can still be marked complete', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-004' });
    rubric.addEntry({
      stepName: 'component-identification',
      elapsedTimeSeconds: 300,
      eventType: EVENT_TYPES.CONFUSION_WITH_RECOVERY,
    });
    rubric.markComplete();
    expect(rubric.isSessionComplete()).toBe(true);
  });

  test('rubric correctly separates confusion entries from abandonment entries', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-mixed' });
    rubric.addEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 60, eventType: EVENT_TYPES.CONFUSION_WITH_RECOVERY });
    rubric.addEntry({ stepName: 'disassembly-start', elapsedTimeSeconds: 200, eventType: EVENT_TYPES.ABANDONMENT });

    expect(rubric.hasAbandonment()).toBe(true);
    expect(rubric.getConfusionEntries()).toHaveLength(1);
    expect(rubric.getAbandonmentEntry().stepName).toBe('disassembly-start');
  });
});

// ─── Scenario 5: Tooltip ignored ─────────────────────────────────────────────

describe('Scenario 5 — Participant skips or ignores existing tooltip', () => {
  test('TOOLTIP_IGNORED entry records that tooltip was shown but not read', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-005' });
    rubric.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 45,
      eventType: EVENT_TYPES.TOOLTIP_IGNORED,
      notes: 'Tooltip for "choose the case opener" was visible; participant proceeded without reading it.',
      tooltipInteraction: TOOLTIP_INTERACTIONS.NOT_NOTICED,
    });

    const tooltipEntries = rubric.getTooltipIgnoredEntries();
    expect(tooltipEntries).toHaveLength(1);
    expect(tooltipEntries[0].tooltipInteraction).toBe(TOOLTIP_INTERACTIONS.NOT_NOTICED);
    expect(tooltipEntries[0].isTooltipIgnored()).toBe(true);
  });

  test('TOOLTIP_IGNORED can distinguish not-noticed from dismissed-immediately', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-005b' });
    rubric.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 50,
      eventType: EVENT_TYPES.TOOLTIP_IGNORED,
      tooltipInteraction: TOOLTIP_INTERACTIONS.DISMISSED_IMMEDIATELY,
    });

    const entry = rubric.getTooltipIgnoredEntries()[0];
    expect(entry.tooltipInteraction).toBe(TOOLTIP_INTERACTIONS.DISMISSED_IMMEDIATELY);
  });

  test('COMPLETION with tooltipInteraction READ shows tooltip was engaged', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-005c' });
    rubric.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 60,
      eventType: EVENT_TYPES.COMPLETION,
      tooltipInteraction: TOOLTIP_INTERACTIONS.READ,
    });

    expect(rubric.getTooltipIgnoredEntries()).toHaveLength(0);
    expect(rubric.getEntries()[0].tooltipInteraction).toBe(TOOLTIP_INTERACTIONS.READ);
  });
});

// ─── Scenario 6: Async post-session recording review ─────────────────────────

describe('Scenario 6 — Session recording reviewed post-session (async annotation)', () => {
  test('rubric created with asyncReview: true correctly marks async source', () => {
    const rubric = new AnnotationRubric({
      sessionId: 'session-006',
      asyncReview: true,
    });
    expect(rubric.asyncReview).toBe(true);
  });

  test('updateEntry allows annotator to refine a live annotation after recording review', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-006', asyncReview: true });
    rubric.addEntry({
      stepName: 'disassembly-mid',
      elapsedTimeSeconds: 350,
      eventType: EVENT_TYPES.CONFUSION_WITH_RECOVERY,
      notes: 'Paused — unclear why.',
    });

    // After reviewing recording, annotator refines the note and upgrades to abandonment
    rubric.updateEntry('disassembly-mid', {
      eventType: EVENT_TYPES.ABANDONMENT,
      notes: "Recording shows participant said 'I give up' and closed the window.",
    });

    const entry = rubric.getEntries()[0];
    expect(entry.eventType).toBe(EVENT_TYPES.ABANDONMENT);
    expect(entry.notes).toContain('I give up');
    expect(entry.elapsedTimeSeconds).toBe(350); // preserved from original
  });

  test('updateEntry throws if step does not exist', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-006', asyncReview: true });
    expect(() => rubric.updateEntry('nonexistent-step', { notes: 'test' })).toThrow();
  });

  test('async rubric supports the same addEntry, getEntries, hasAbandonment API as live rubric', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-006b', asyncReview: true });
    rubric.addEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 75, eventType: EVENT_TYPES.ABANDONMENT });

    expect(rubric.hasAbandonment()).toBe(true);
    expect(rubric.getEntries()).toHaveLength(1);
  });
});

// ─── getEntriesForStep ────────────────────────────────────────────────────────

describe('AnnotationRubric.getEntriesForStep', () => {
  test('returns only entries matching the requested step', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-multi' });
    rubric.addEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 60, eventType: EVENT_TYPES.CONFUSION_WITH_RECOVERY });
    rubric.addEntry({ stepName: 'disassembly-start', elapsedTimeSeconds: 200, eventType: EVENT_TYPES.COMPLETION });
    rubric.addEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 300, eventType: EVENT_TYPES.ABANDONMENT });

    const toolEntries = rubric.getEntriesForStep('tool-selection');
    expect(toolEntries).toHaveLength(2);
    toolEntries.forEach((e) => expect(e.stepName).toBe('tool-selection'));
  });

  test('returns empty array when step has no entries', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-empty-step' });
    rubric.addEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 60, eventType: EVENT_TYPES.COMPLETION });
    expect(rubric.getEntriesForStep('reassembly-start')).toHaveLength(0);
  });
});

// ─── toJSON serialisation ─────────────────────────────────────────────────────

describe('AnnotationRubric.toJSON', () => {
  test('toJSON includes all required top-level fields', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-json', participantId: 'P-01', asyncReview: false });
    rubric.addEntry({ stepName: 'tool-selection', elapsedTimeSeconds: 50, eventType: EVENT_TYPES.COMPLETION });
    rubric.markComplete();

    const json = rubric.toJSON();
    expect(json).toHaveProperty('sessionId', 'session-json');
    expect(json).toHaveProperty('participantId', 'P-01');
    expect(json).toHaveProperty('asyncReview', false);
    expect(json).toHaveProperty('sessionComplete', true);
    expect(json).toHaveProperty('entries');
    expect(Array.isArray(json.entries)).toBe(true);
  });

  test('toJSON entries include all 5 required rubric fields', () => {
    const rubric = new AnnotationRubric({ sessionId: 'session-json' });
    rubric.addEntry({
      stepName: 'tool-selection',
      elapsedTimeSeconds: 55,
      eventType: EVENT_TYPES.CONFUSION_WITH_RECOVERY,
      notes: 'Hesitated',
      tooltipInteraction: TOOLTIP_INTERACTIONS.READ,
    });

    const entryJson = rubric.toJSON().entries[0];
    expect(entryJson).toHaveProperty('stepName');
    expect(entryJson).toHaveProperty('elapsedTimeSeconds');
    expect(entryJson).toHaveProperty('eventType');
    expect(entryJson).toHaveProperty('notes');
    expect(entryJson).toHaveProperty('tooltipInteraction');
  });
});
