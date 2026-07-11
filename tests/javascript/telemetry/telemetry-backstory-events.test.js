/**
 * Tests for TelemetryEmitter.js — Issue #126: Client Backstory Card System events
 *
 * Validates the three new additive events:
 *   job_accepted, job_declined, backstory_card_shown
 *
 * Run with: npm test
 */

'use strict';

const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');

function makeEmitter() {
  return new TelemetryEmitter(jest.fn());
}

// ─── New event constants are present ─────────────────────────────────────────

describe('TelemetryEmitter — Issue #126: new event constants', () => {
  test('EVENTS.JOB_ACCEPTED is defined and equals "job_accepted"', () => {
    expect(EVENTS.JOB_ACCEPTED).toBe('job_accepted');
  });

  test('EVENTS.JOB_DECLINED is defined and equals "job_declined"', () => {
    expect(EVENTS.JOB_DECLINED).toBe('job_declined');
  });

  test('EVENTS.BACKSTORY_CARD_SHOWN is defined and equals "backstory_card_shown"', () => {
    expect(EVENTS.BACKSTORY_CARD_SHOWN).toBe('backstory_card_shown');
  });

  test('new event constants do not conflict with existing event names', () => {
    const existingValues = new Set([
      'tutorial_diagnosis_started', 'hint_tier_1_shown', 'hint_tier_2_shown',
      'hint_tier_3_shown', 'diagnosis_completed_without_hint', 'diagnosis_completed_with_hint',
      'undo_attempted', 'reassembly_part_confirmed', 'reassembly_completed',
      'cleaning_reveal_started', 'cleaning_reveal_dismissed', 'cleaning_reveal_auto_dismissed',
      'first_tick_tension_ramp_started', 'first_tick_fired', 'first_tick_ticking_loop_started',
      'first_tick_rewound_no_drama', 'first_tick_sequence_aborted', 'first_tick_incorrect_assembly_no_tick',
      'complication_gate_reached', 'chronograph_overlay_shown', 'chronograph_overlay_dismissed',
      'chronograph_overlay_skipped', 'part_group_revealed', 'discovery_mode_toggled',
      'onboarding_started', 'onboarding_step_completed', 'onboarding_skipped',
      'onboarding_completed', 'ab_cohort_assigned',
    ]);
    expect(existingValues.has(EVENTS.JOB_ACCEPTED)).toBe(false);
    expect(existingValues.has(EVENTS.JOB_DECLINED)).toBe(false);
    expect(existingValues.has(EVENTS.BACKSTORY_CARD_SHOWN)).toBe(false);
  });
});

// ─── jobAccepted() convenience method ────────────────────────────────────────

describe('TelemetryEmitter — jobAccepted()', () => {
  test('emits job_accepted event', () => {
    const emitter = makeEmitter();
    emitter.jobAccepted('job-1', 'dive_watch', true);
    expect(emitter.wasEmitted(EVENTS.JOB_ACCEPTED)).toBe(true);
  });

  test('payload contains job_id, job_type, has_backstory', () => {
    const emitter = makeEmitter();
    emitter.jobAccepted('job-99', 'field_watch', false);
    const evt = emitter.getEmittedEvents().find((e) => e.name === EVENTS.JOB_ACCEPTED);
    expect(evt.payload).toMatchObject({
      job_id: 'job-99',
      job_type: 'field_watch',
      has_backstory: false,
    });
  });

  test('has_backstory is true when backstory cohort', () => {
    const emitter = makeEmitter();
    emitter.jobAccepted('job-2', 'dress_watch', true);
    const evt = emitter.getEmittedEvents().find((e) => e.name === EVENTS.JOB_ACCEPTED);
    expect(evt.payload.has_backstory).toBe(true);
  });
});

// ─── jobDeclined() convenience method ────────────────────────────────────────

describe('TelemetryEmitter — jobDeclined()', () => {
  test('emits job_declined event', () => {
    const emitter = makeEmitter();
    emitter.jobDeclined('job-3', 'pocket_watch', true);
    expect(emitter.wasEmitted(EVENTS.JOB_DECLINED)).toBe(true);
  });

  test('payload contains job_id, job_type, has_backstory', () => {
    const emitter = makeEmitter();
    emitter.jobDeclined('job-50', 'pilot_watch', false);
    const evt = emitter.getEmittedEvents().find((e) => e.name === EVENTS.JOB_DECLINED);
    expect(evt.payload).toMatchObject({
      job_id: 'job-50',
      job_type: 'pilot_watch',
      has_backstory: false,
    });
  });
});

// ─── backstoryCardShown() convenience method ─────────────────────────────────

describe('TelemetryEmitter — backstoryCardShown()', () => {
  test('emits backstory_card_shown event', () => {
    const emitter = makeEmitter();
    emitter.backstoryCardShown('job-4', 'sport_watch', 'sport_001');
    expect(emitter.wasEmitted(EVENTS.BACKSTORY_CARD_SHOWN)).toBe(true);
  });

  test('payload contains job_id, job_type, template_id', () => {
    const emitter = makeEmitter();
    emitter.backstoryCardShown('job-77', 'dive_watch', 'dive_002');
    const evt = emitter.getEmittedEvents().find((e) => e.name === EVENTS.BACKSTORY_CARD_SHOWN);
    expect(evt.payload).toMatchObject({
      job_id: 'job-77',
      job_type: 'dive_watch',
      template_id: 'dive_002',
    });
  });
});

// ─── Backward-compatibility: existing events unaffected ──────────────────────

describe('TelemetryEmitter — backward compatibility (Issue #126 does not break existing events)', () => {
  test('existing AB_COHORT_ASSIGNED event still works', () => {
    const emitter = makeEmitter();
    emitter.abCohortAssigned('backstory', 'job-1');
    expect(emitter.wasEmitted(EVENTS.AB_COHORT_ASSIGNED)).toBe(true);
  });

  test('existing onboardingStarted event still works', () => {
    const emitter = makeEmitter();
    emitter.onboardingStarted('job-1', 'guided');
    expect(emitter.wasEmitted(EVENTS.ONBOARDING_STARTED)).toBe(true);
  });

  test('existing cleaningRevealStarted event still works', () => {
    const emitter = makeEmitter();
    emitter.cleaningRevealStarted('pre', 'post');
    expect(emitter.wasEmitted(EVENTS.CLEANING_REVEAL_STARTED)).toBe(true);
  });
});
