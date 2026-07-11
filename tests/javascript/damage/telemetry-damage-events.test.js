/**
 * Tests: TelemetryEmitter — Issue #148 damage recovery events (AC5)
 *
 * Validates the two new additive events:
 *   part_damaged, part_damage_recovery_chosen
 *
 * Run with: npm test
 */

'use strict';

const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');

function makeEmitter() {
  return new TelemetryEmitter(jest.fn());
}

// ─── New event constants are present ─────────────────────────────────────────

describe('TelemetryEmitter — Issue #148: new event constants', () => {
  test('EVENTS.PART_DAMAGED is defined as "part_damaged"', () => {
    expect(EVENTS.PART_DAMAGED).toBe('part_damaged');
  });

  test('EVENTS.PART_DAMAGE_RECOVERY_CHOSEN is defined as "part_damage_recovery_chosen"', () => {
    expect(EVENTS.PART_DAMAGE_RECOVERY_CHOSEN).toBe('part_damage_recovery_chosen');
  });

  test('new constants do not conflict with existing event names', () => {
    const allValues = Object.values(EVENTS);
    const uniqueValues = new Set(allValues);
    // No duplicates across all event constants (implies no naming collision)
    expect(uniqueValues.size).toBe(allValues.length);
  });
});

// ─── partDamaged() convenience method ────────────────────────────────────────

describe('TelemetryEmitter — partDamaged()', () => {
  test('emits part_damaged event', () => {
    const e = makeEmitter();
    e.partDamaged('p1', 'r1', 'over_torque');
    expect(e.wasEmitted(EVENTS.PART_DAMAGED)).toBe(true);
  });

  test('payload contains partId, restorationId, eventType', () => {
    const e = makeEmitter();
    e.partDamaged('part-99', 'rest-42', 'drop');
    const evt = e.getEmittedEvents().find((ev) => ev.name === EVENTS.PART_DAMAGED);
    expect(evt.payload).toMatchObject({
      partId:        'part-99',
      restorationId: 'rest-42',
      eventType:     'drop',
    });
  });

  test('can emit multiple part_damaged events (multi-damage scenario)', () => {
    const e = makeEmitter();
    e.partDamaged('p-A', 'r1', 'over_torque');
    e.partDamaged('p-B', 'r1', 'drop');
    const evts = e.getEmittedEvents().filter((ev) => ev.name === EVENTS.PART_DAMAGED);
    expect(evts).toHaveLength(2);
  });
});

// ─── partDamageRecoveryChosen() convenience method ───────────────────────────

describe('TelemetryEmitter — partDamageRecoveryChosen()', () => {
  test('emits part_damage_recovery_chosen event', () => {
    const e = makeEmitter();
    e.partDamageRecoveryChosen('p1', 'r1', 'ordered');
    expect(e.wasEmitted(EVENTS.PART_DAMAGE_RECOVERY_CHOSEN)).toBe(true);
  });

  test('payload contains partId, restorationId, playerChoice when ordered', () => {
    const e = makeEmitter();
    e.partDamageRecoveryChosen('part-77', 'rest-01', 'ordered');
    const evt = e.getEmittedEvents().find((ev) => ev.name === EVENTS.PART_DAMAGE_RECOVERY_CHOSEN);
    expect(evt.payload).toMatchObject({
      partId:        'part-77',
      restorationId: 'rest-01',
      playerChoice:  'ordered',
    });
  });

  test('payload playerChoice is "declined" when player declines', () => {
    const e = makeEmitter();
    e.partDamageRecoveryChosen('part-55', 'rest-55', 'declined');
    const evt = e.getEmittedEvents().find((ev) => ev.name === EVENTS.PART_DAMAGE_RECOVERY_CHOSEN);
    expect(evt.payload.playerChoice).toBe('declined');
  });
});

// ─── Backward-compatibility ───────────────────────────────────────────────────

describe('TelemetryEmitter — Issue #148 backward compatibility', () => {
  test('existing reassemblyComponentSeatedSuccess event still works', () => {
    const e = makeEmitter();
    e.reassemblyComponentSeatedSuccess('comp-1', 'cohort-A');
    expect(e.wasEmitted(EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBe(true);
  });

  test('existing jobAccepted event still works', () => {
    const e = makeEmitter();
    e.jobAccepted('job-1', 'dive_watch', true);
    expect(e.wasEmitted(EVENTS.JOB_ACCEPTED)).toBe(true);
  });

  test('existing partDamaged does not interfere with onboardingStarted', () => {
    const e = makeEmitter();
    e.partDamaged('p1', 'r1', 'snap');
    e.onboardingStarted('j1', 'guided');
    expect(e.wasEmitted(EVENTS.ONBOARDING_STARTED)).toBe(true);
    expect(e.wasEmitted(EVENTS.PART_DAMAGED)).toBe(true);
  });
});
