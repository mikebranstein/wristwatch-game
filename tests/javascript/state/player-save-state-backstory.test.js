/**
 * Tests for PlayerSaveState.js — Issue #126: ab_backstory_cohort field
 *
 * Validates backward-compatible addition of the ab_backstory_cohort key.
 *
 * Run with: npm test
 */

'use strict';

const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');

describe('PlayerSaveState — Issue #126: ab_backstory_cohort field', () => {
  test('ab_backstory_cohort defaults to null for new saves', () => {
    const state = new PlayerSaveState();
    expect(state.get('ab_backstory_cohort')).toBeNull();
  });

  test('pre-existing saves without ab_backstory_cohort get null default', () => {
    const state = new PlayerSaveState({ tutorial_first_fault_seen: true });
    expect(state.get('ab_backstory_cohort')).toBeNull();
  });

  test('ab_backstory_cohort can be set to "backstory"', () => {
    const state = new PlayerSaveState();
    state.set('ab_backstory_cohort', 'backstory');
    expect(state.get('ab_backstory_cohort')).toBe('backstory');
  });

  test('ab_backstory_cohort can be set to "control"', () => {
    const state = new PlayerSaveState();
    state.set('ab_backstory_cohort', 'control');
    expect(state.get('ab_backstory_cohort')).toBe('control');
  });

  test('ab_backstory_cohort is included in snapshot()', () => {
    const state = new PlayerSaveState();
    state.set('ab_backstory_cohort', 'backstory');
    const snap = state.snapshot();
    expect(snap).toHaveProperty('ab_backstory_cohort', 'backstory');
  });

  test('ab_backstory_cohort does not affect pre-existing fields', () => {
    const state = new PlayerSaveState({
      tutorial_first_fault_seen: true,
      ab_first_job_cohort: 'guided',
    });
    expect(state.get('tutorial_first_fault_seen')).toBe(true);
    expect(state.get('ab_first_job_cohort')).toBe('guided');
    expect(state.get('ab_backstory_cohort')).toBeNull(); // new field defaults to null
  });

  test('snapshot is isolated from internal store mutations', () => {
    const state = new PlayerSaveState();
    state.set('ab_backstory_cohort', 'backstory');
    const snap = state.snapshot();
    snap.ab_backstory_cohort = 'hacked';
    expect(state.get('ab_backstory_cohort')).toBe('backstory');
  });
});

describe('PlayerSaveState — Issue #130: client_persona_history', () => {
  test('client_persona_history defaults to null for new saves', () => {
    const state = new PlayerSaveState();
    expect(state.get('client_persona_history')).toBeNull();
  });

  test('pre-feature saves without client_persona_history get null default', () => {
    const state = new PlayerSaveState({ tutorial_first_fault_seen: true });
    expect(state.get('client_persona_history')).toBeNull();
  });

  test('getPersonaHistory() returns null when no history exists', () => {
    const state = new PlayerSaveState();
    expect(state.getPersonaHistory('persona-margaret')).toBeNull();
  });

  test('recordPersonaJobCompletion() stores persona history correctly', () => {
    const state = new PlayerSaveState();
    state.recordPersonaJobCompletion('persona-margaret', 'job-42', 2);

    expect(state.get('client_persona_history')).toEqual({
      'persona-margaret': {
        last_job_id: 'job-42',
        arc_position: 2,
      },
    });
  });

  test('getPersonaHistory() retrieves recorded values', () => {
    const state = new PlayerSaveState();
    state.recordPersonaJobCompletion('persona-helen', 'job-77', 3);

    expect(state.getPersonaHistory('persona-helen')).toEqual({
      last_job_id: 'job-77',
      arc_position: 3,
    });
  });
});
