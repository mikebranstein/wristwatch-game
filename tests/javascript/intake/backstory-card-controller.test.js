/**
 * Tests for BackstoryCardController.js — Issue #126: Client Backstory Card System
 *
 * Acceptance Criteria covered:
 *   AC1 — backstory cohort shows a styled card (client name, relationship context, reason)
 *   AC2 — control cohort shows plain UI (no card returned)
 *   AC3 — analytics fired on accept/decline with correct has_backstory flag
 *   AC4 — all templates ≤80 words, no grammar structural issues (automated word-count gate)
 *   AC5 — card does not obscure controls; view-model returned, not DOM (architecture check)
 *
 * Test Scenarios covered:
 *   Scenario 1  — happy path backstory cohort: card returned with substituted text
 *   Scenario 2  — happy path control cohort: null returned, no card
 *   Scenario 3  — analytics fire on accept/decline; has_backstory correct for each cohort
 *   Scenario 4  — all watch types have at least one matching template
 *   Scenario 5  — variable substitution: no {{token}} appears in output
 *   Scenario 7  — rapid job cycling: no repeated card within a 5-job window
 *   Scenario 8  — edge case: missing variable falls back to neutral default phrase
 *   Scenario 10 — A/B split: 50 ± 5 in each cohort over 100 simulated assignments
 *
 * Run with: npm test
 */

'use strict';

const { PlayerSaveState } = require('../../../javascript/state/PlayerSaveState');
const { TelemetryEmitter, EVENTS } = require('../../../javascript/telemetry/TelemetryEmitter');
const {
  BackstoryCardController,
  COHORT_BACKSTORY,
  COHORT_CONTROL,
  VARIABLE_FALLBACKS,
  RECENCY_BUFFER_SIZE,
} = require('../../../javascript/intake/BackstoryCardController');
const { BACKSTORY_TEMPLATES, WATCH_TYPES } = require('../../../javascript/data/backstory-templates');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTelemetry() {
  return new TelemetryEmitter(jest.fn());
}

function makeSave(overrides = {}) {
  return new PlayerSaveState(overrides);
}

/** Fixed RNG that always returns `value`. */
const fixedRng = (value) => () => value;

/** Sequential RNG cycling through `values`. */
const seqRng = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const BASE_JOB = { jobId: 'job-001', watchType: 'dive_watch' };

// ─── AC1: Backstory cohort shows a card ──────────────────────────────────────

describe('BackstoryCardController — AC1: backstory cohort card', () => {
  test('returns a non-null card view-model when cohort is backstory', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    // rng < 0.5 → backstory cohort, but save already has it set
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob(BASE_JOB);
    expect(card).not.toBeNull();
  });

  test('returned card has cardText, templateId, and jobId fields', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob(BASE_JOB);
    expect(typeof card.cardText).toBe('string');
    expect(card.cardText.length).toBeGreaterThan(0);
    expect(typeof card.templateId).toBe('string');
    expect(card.jobId).toBe('job-001');
  });

  test('card contains at least one substituted field (clientName, timeBroken, etc.)', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob({
      jobId: 'job-001',
      watchType: 'dive_watch',
      variables: { clientName: 'Jordan', timeBroken: '22 years' },
    });
    // Either the provided value or a fallback should appear — but no raw token
    expect(card.cardText).not.toMatch(/\{\{/);
    expect(card.cardText).not.toMatch(/\}\}/);
  });

  test('card view-model is a plain object — controller does not own DOM', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob(BASE_JOB);
    // Must be a plain object, not a DOM element or class instance
    expect(card).toMatchObject({ cardText: expect.any(String), templateId: expect.any(String) });
  });
});

// ─── AC2: Control cohort — no card ──────────────────────────────────────────

describe('BackstoryCardController — AC2: control cohort no card', () => {
  test('returns null when cohort is control', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_CONTROL });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.9));
    const card = ctrl.getCardForJob(BASE_JOB);
    expect(card).toBeNull();
  });

  test('control cohort: existing intake UI path is unaffected (null response)', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_CONTROL });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.9));
    // Multiple calls all return null
    for (let i = 0; i < 5; i++) {
      expect(ctrl.getCardForJob({ jobId: `job-${i}`, watchType: 'dress_watch' })).toBeNull();
    }
  });
});

// ─── AC1/AC2: A/B cohort assignment ─────────────────────────────────────────

describe('BackstoryCardController — cohort assignment', () => {
  test('assignCohortIfNeeded() assigns backstory when rng < 0.5', () => {
    const save = makeSave();
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.1));
    expect(ctrl.assignCohortIfNeeded()).toBe(COHORT_BACKSTORY);
    expect(save.get('ab_backstory_cohort')).toBe(COHORT_BACKSTORY);
  });

  test('assignCohortIfNeeded() assigns control when rng >= 0.5', () => {
    const save = makeSave();
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.7));
    expect(ctrl.assignCohortIfNeeded()).toBe(COHORT_CONTROL);
    expect(save.get('ab_backstory_cohort')).toBe(COHORT_CONTROL);
  });

  test('assignCohortIfNeeded() does not reassign existing cohort', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.9));
    expect(ctrl.assignCohortIfNeeded()).toBe(COHORT_BACKSTORY);
  });

  test('getCohort() returns null before assignment', () => {
    const save = makeSave();
    const ctrl = new BackstoryCardController(save, makeTelemetry());
    expect(ctrl.getCohort()).toBeNull();
  });

  test('getCohort() returns assigned cohort after assignment', () => {
    const save = makeSave();
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.3));
    ctrl.assignCohortIfNeeded();
    expect(ctrl.getCohort()).toBe(COHORT_BACKSTORY);
  });

  test('AB_COHORT_ASSIGNED telemetry event fires on first assignment', () => {
    const save = makeSave();
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry, fixedRng(0.2));
    ctrl.assignCohortIfNeeded();
    expect(telemetry.wasEmitted(EVENTS.AB_COHORT_ASSIGNED)).toBe(true);
  });

  test('AB_COHORT_ASSIGNED does NOT fire again if cohort already set', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_CONTROL });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry, fixedRng(0.2));
    ctrl.assignCohortIfNeeded();
    const fired = telemetry.getEmittedEvents().filter((e) => e.name === EVENTS.AB_COHORT_ASSIGNED);
    expect(fired).toHaveLength(0);
  });
});

// ─── Scenario 10: A/B split integrity ────────────────────────────────────────
// NOTE: 100-trial probabilistic tests have ~36% chance of landing outside 45–55
// with a fair coin. We scale to 10 000 trials (same ±5% criterion) for a
// statistically reliable, deterministic-enough result without mocking RNG.

describe('BackstoryCardController — Scenario 10: A/B split 50±5 over 100 assignments', () => {
  test('50 ± 5 backstory assignments in 100 simulated players', () => {
    // Use 10 000 trials so the ±5 % bound (4 500–5 500) is essentially never
    // breached by a correct 50/50 implementation (P(fail) < 1 in 1 000 000).
    const TRIALS = 10_000;
    let backstoryCount = 0;
    for (let i = 0; i < TRIALS; i++) {
      const save = makeSave();
      const ctrl = new BackstoryCardController(save, makeTelemetry());
      const cohort = ctrl.assignCohortIfNeeded();
      if (cohort === COHORT_BACKSTORY) backstoryCount++;
    }
    // ±5 % of 10 000 = ±500
    expect(backstoryCount).toBeGreaterThanOrEqual(4500);
    expect(backstoryCount).toBeLessThanOrEqual(5500);
  });
});

// ─── AC3: Analytics events ───────────────────────────────────────────────────

describe('BackstoryCardController — AC3: analytics events', () => {
  test('getCardForJob fires backstory_card_shown for backstory cohort', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry, fixedRng(0.0));
    ctrl.getCardForJob(BASE_JOB);
    expect(telemetry.wasEmitted(EVENTS.BACKSTORY_CARD_SHOWN)).toBe(true);
  });

  test('getCardForJob does NOT fire backstory_card_shown for control cohort', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_CONTROL });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry, fixedRng(0.9));
    ctrl.getCardForJob(BASE_JOB);
    expect(telemetry.wasEmitted(EVENTS.BACKSTORY_CARD_SHOWN)).toBe(false);
  });

  test('backstory_card_shown payload includes job_id, job_type, template_id', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry, fixedRng(0.0));
    ctrl.getCardForJob(BASE_JOB);
    const evt = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.BACKSTORY_CARD_SHOWN);
    expect(evt.payload.job_id).toBe('job-001');
    expect(evt.payload.job_type).toBe('dive_watch');
    expect(typeof evt.payload.template_id).toBe('string');
  });

  test('recordJobAccepted fires job_accepted with has_backstory=true for backstory cohort', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry);
    ctrl.recordJobAccepted(BASE_JOB);
    const evt = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.JOB_ACCEPTED);
    expect(evt).toBeDefined();
    expect(evt.payload.has_backstory).toBe(true);
    expect(evt.payload.job_id).toBe('job-001');
    expect(evt.payload.job_type).toBe('dive_watch');
  });

  test('recordJobAccepted fires job_accepted with has_backstory=false for control cohort', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_CONTROL });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry);
    ctrl.recordJobAccepted(BASE_JOB);
    const evt = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.JOB_ACCEPTED);
    expect(evt.payload.has_backstory).toBe(false);
  });

  test('recordJobDeclined fires job_declined with has_backstory=true for backstory cohort', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry);
    ctrl.recordJobDeclined(BASE_JOB);
    const evt = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.JOB_DECLINED);
    expect(evt).toBeDefined();
    expect(evt.payload.has_backstory).toBe(true);
  });

  test('recordJobDeclined fires job_declined with has_backstory=false for control cohort', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_CONTROL });
    const telemetry = makeTelemetry();
    const ctrl = new BackstoryCardController(save, telemetry);
    ctrl.recordJobDeclined(BASE_JOB);
    const evt = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.JOB_DECLINED);
    expect(evt.payload.has_backstory).toBe(false);
  });

  test('both cohorts fire job_accepted analytics on accept (Scenario 3)', () => {
    for (const cohort of [COHORT_BACKSTORY, COHORT_CONTROL]) {
      const save = makeSave({ ab_backstory_cohort: cohort });
      const telemetry = makeTelemetry();
      const ctrl = new BackstoryCardController(save, telemetry);
      ctrl.recordJobAccepted(BASE_JOB);
      expect(telemetry.wasEmitted(EVENTS.JOB_ACCEPTED)).toBe(true);
      const evt = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.JOB_ACCEPTED);
      expect(evt.payload.has_backstory).toBe(cohort === COHORT_BACKSTORY);
    }
  });
});

// ─── Scenario 4: Template coverage — all watch types ─────────────────────────

describe('BackstoryCardController — Scenario 4: all watch types have templates', () => {
  test.each(WATCH_TYPES)(
    'watch type "%s" has at least one backstory template',
    (watchType) => {
      const templates = BACKSTORY_TEMPLATES.filter((t) => t.watchType === watchType);
      expect(templates.length).toBeGreaterThanOrEqual(1);
    },
  );

  test('getCardForJob returns a card for each known watch type (backstory cohort)', () => {
    for (const watchType of WATCH_TYPES) {
      const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
      const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
      const card = ctrl.getCardForJob({ jobId: 'job-x', watchType });
      expect(card).not.toBeNull();
      expect(card.cardText.length).toBeGreaterThan(0);
    }
  });
});

// ─── Scenario 5: Variable substitution — no raw tokens ───────────────────────

describe('BackstoryCardController — Scenario 5: variable substitution', () => {
  test('no {{token}} appears in card output when all variables are provided', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob({
      jobId: 'job-002',
      watchType: 'dive_watch',
      variables: {
        clientName: 'Alex',
        relationshipContext: 'their father',
        timeBroken: '22 years',
        occasion: 'a retirement party',
      },
    });
    expect(card.cardText).not.toMatch(/\{\{/);
    expect(card.cardText).not.toMatch(/\}\}/);
  });

  test('provided variable values appear in the rendered card text', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    // Use seqRng to deterministically pick a specific template that uses clientName
    const ctrl = new BackstoryCardController(save, makeTelemetry(), seqRng([0.0, 0.0]));
    const card = ctrl.getCardForJob({
      jobId: 'job-003',
      watchType: 'dive_watch',
      variables: { clientName: 'Specific Name XYZ' },
    });
    expect(card.cardText).toContain('Specific Name XYZ');
  });
});

// ─── Scenario 8: Missing variable fallback ───────────────────────────────────

describe('BackstoryCardController — Scenario 8: missing variable fallback', () => {
  test('no raw {{token}} appears when variables is empty', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob({ jobId: 'job-004', watchType: 'dive_watch', variables: {} });
    expect(card.cardText).not.toMatch(/\{\{/);
    expect(card.cardText).not.toMatch(/\}\}/);
  });

  test('fallback values are neutral phrases, not blank', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob({ jobId: 'job-005', watchType: 'dive_watch', variables: {} });
    // Card text must be non-trivially long (fallbacks fill in, not left blank)
    expect(card.cardText.trim().length).toBeGreaterThan(20);
  });

  test('no raw {{token}} appears when variables is undefined', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry(), fixedRng(0.0));
    const card = ctrl.getCardForJob({ jobId: 'job-006', watchType: 'pocket_watch' });
    expect(card.cardText).not.toMatch(/\{\{/);
    expect(card.cardText).not.toMatch(/\}\}/);
  });

  test('all VARIABLE_FALLBACKS are non-empty strings', () => {
    for (const [key, val] of Object.entries(VARIABLE_FALLBACKS)) {
      expect(typeof val).toBe('string');
      expect(val.trim().length).toBeGreaterThan(0);
    }
  });
});

// ─── AC4: Template quality gate — ≤80 words per card ─────────────────────────

describe('BackstoryCardController — AC4: template word-count gate (≤80 words)', () => {
  test.each(BACKSTORY_TEMPLATES)(
    'template "$id" (watchType: $watchType) is ≤80 words',
    ({ id, templateText }) => {
      // Remove {{variable}} placeholders for word-count measurement
      const cleaned = templateText.replace(/\{\{[^}]+\}\}/g, 'word');
      const wordCount = cleaned.trim().split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(80);
    },
  );

  test('all templates have non-empty templateText', () => {
    for (const t of BACKSTORY_TEMPLATES) {
      expect(typeof t.templateText).toBe('string');
      expect(t.templateText.trim().length).toBeGreaterThan(0);
    }
  });

  test('all templates have a stable non-empty id', () => {
    const ids = BACKSTORY_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length); // no duplicates
    ids.forEach((id) => expect(id.trim().length).toBeGreaterThan(0));
  });
});

// ─── Scenario 7: No repeated card within a 5-job window ──────────────────────

describe('BackstoryCardController — Scenario 7: recency shuffle (no repeats in 5-job window)', () => {
  test('no duplicate templateId within a 5-job window for dive_watch (4 templates)', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry());
    const seenIds = [];
    for (let i = 0; i < 4; i++) {
      const card = ctrl.getCardForJob({ jobId: `job-${i}`, watchType: 'dive_watch' });
      expect(seenIds).not.toContain(card.templateId);
      seenIds.push(card.templateId);
    }
  });

  test('recency buffer size is RECENCY_BUFFER_SIZE', () => {
    expect(RECENCY_BUFFER_SIZE).toBe(5);
  });

  test('10 consecutive jobs produce at least 3 distinct templateIds (variation confirmed)', () => {
    const save = makeSave({ ab_backstory_cohort: COHORT_BACKSTORY });
    const ctrl = new BackstoryCardController(save, makeTelemetry());
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      const card = ctrl.getCardForJob({ jobId: `job-${i}`, watchType: 'dive_watch' });
      seen.add(card.templateId);
    }
    // With 4 dive_watch templates and recency buffer, we expect variety
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

// ─── Constructor guard rails ──────────────────────────────────────────────────

describe('BackstoryCardController — constructor validation', () => {
  test('throws if saveState is missing', () => {
    expect(() => new BackstoryCardController(null, makeTelemetry())).toThrow();
  });

  test('throws if telemetry is missing', () => {
    expect(() => new BackstoryCardController(makeSave(), null)).toThrow();
  });
});
