/**
 * Tests for PlayerSaveState — Issue #141 additions
 * Verifies that `job_state_captures` field is backward-compatible.
 *
 * Acceptance criteria covered:
 *   AC4  — state persisted using existing save/session system (additive, backward-compatible).
 *
 * Test scenarios:
 *   - New saves initialise with empty job_state_captures object.
 *   - Pre-feature saves (no job_state_captures key) default to {}.
 *   - get/set round-trips correctly for job_state_captures.
 */

'use strict';

const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');

describe('PlayerSaveState — Issue #141: job_state_captures', () => {
  test('new save has job_state_captures default of empty object', () => {
    const state = new PlayerSaveState();
    expect(state.get('job_state_captures')).toEqual({});
  });

  test('pre-feature save (no job_state_captures) defaults to empty object', () => {
    const state = new PlayerSaveState({ completed_watches: [] });
    expect(state.get('job_state_captures')).toEqual({});
  });

  test('job_state_captures can be read and written via get/set', () => {
    const state = new PlayerSaveState();
    const captures = { 'job-001': { before: { condition: 'worn' }, after: { condition: 'restored' } } };
    state.set('job_state_captures', captures);
    expect(state.get('job_state_captures')['job-001'].before.condition).toBe('worn');
    expect(state.get('job_state_captures')['job-001'].after.condition).toBe('restored');
  });

  test('existing fields are unchanged after adding job_state_captures', () => {
    const state = new PlayerSaveState({
      completed_watches: [{ watchId: 'w-001' }],
      ab_first_job_cohort: 'guided',
    });
    expect(state.getCompletedWatches()).toHaveLength(1);
    expect(state.get('ab_first_job_cohort')).toBe('guided');
    expect(state.get('job_state_captures')).toEqual({});
  });

  test('snapshot() includes job_state_captures', () => {
    const state = new PlayerSaveState();
    state.set('job_state_captures', { 'job-001': { before: {}, after: {} } });
    const snap = state.snapshot();
    expect(snap.job_state_captures).toBeDefined();
    expect(snap.job_state_captures['job-001']).toBeDefined();
  });

  test('multiple job captures stored independently', () => {
    const state = new PlayerSaveState();
    state.set('job_state_captures', {
      'job-001': { before: { condition: 'A' } },
      'job-002': { before: { condition: 'B' } },
    });
    const caps = state.get('job_state_captures');
    expect(caps['job-001'].before.condition).toBe('A');
    expect(caps['job-002'].before.condition).toBe('B');
  });
});
