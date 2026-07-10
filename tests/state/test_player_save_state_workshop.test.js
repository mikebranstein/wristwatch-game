/**
 * Tests for PlayerSaveState — Issue #119 extensions
 * ==================================================
 * Covers backward-compatible DEFAULT_SAVE additions for workshop queue keys.
 *
 * Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
 * Run with: npm test
 */

const { PlayerSaveState } = require('../../src/state/PlayerSaveState');

describe('PlayerSaveState — Issue #119 Workshop Queue Meta-Game extensions', () => {

  describe('DEFAULT_SAVE backward compatibility', () => {
    it('initialises workshop_jobs to null (backward-compatible default)', () => {
      const state = new PlayerSaveState();
      expect(state.get('workshop_jobs')).toBeNull();
    });

    it('initialises intake_queue to null', () => {
      const state = new PlayerSaveState();
      expect(state.get('intake_queue')).toBeNull();
    });

    it('initialises clients to null', () => {
      const state = new PlayerSaveState();
      expect(state.get('clients')).toBeNull();
    });

    it('initialises reputation to null', () => {
      const state = new PlayerSaveState();
      expect(state.get('reputation')).toBeNull();
    });

    it('initialises bench_slots to null', () => {
      const state = new PlayerSaveState();
      expect(state.get('bench_slots')).toBeNull();
    });

    it('initialises queue_feature_flag to false (feature off by default)', () => {
      const state = new PlayerSaveState();
      expect(state.get('queue_feature_flag')).toBe(false);
    });
  });

  describe('pre-feature save compatibility', () => {
    it('loads a pre-feature save without workshop keys without errors', () => {
      const legacySave = {
        tutorial_first_fault_seen: true,
        chronograph_overlay_seen: false,
        current_stage: 'sourcing',
      };
      const state = new PlayerSaveState(legacySave);
      // Existing keys preserved
      expect(state.get('tutorial_first_fault_seen')).toBe(true);
      expect(state.get('current_stage')).toBe('sourcing');
      // New keys default to null/false
      expect(state.get('workshop_jobs')).toBeNull();
      expect(state.get('queue_feature_flag')).toBe(false);
    });

    it('preserves all legacy keys when loading a pre-feature save', () => {
      const legacySave = {
        ab_first_job_cohort: 'guided',
        autosave_slot: true,
        last_checkpoint_stage: 'reassembly',
      };
      const state = new PlayerSaveState(legacySave);
      expect(state.get('ab_first_job_cohort')).toBe('guided');
      expect(state.get('autosave_slot')).toBe(true);
      expect(state.get('last_checkpoint_stage')).toBe('reassembly');
    });
  });

  describe('workshop queue flag and data operations', () => {
    it('can set and get queue_feature_flag', () => {
      const state = new PlayerSaveState();
      state.set('queue_feature_flag', true);
      expect(state.get('queue_feature_flag')).toBe(true);
    });

    it('can store and retrieve workshop_jobs list', () => {
      const state = new PlayerSaveState();
      const jobs = [{ id: 'job-001', watch_type: 'dress_watch', bench_slot: 1 }];
      state.set('workshop_jobs', jobs);
      expect(state.get('workshop_jobs')).toEqual(jobs);
    });

    it('can store and retrieve reputation object', () => {
      const state = new PlayerSaveState();
      const rep = { score: 75.0, tier: 2, tier_thresholds: [0, 50, 150], jobs_evaluated: 8 };
      state.set('reputation', rep);
      expect(state.get('reputation')).toEqual(rep);
    });

    it('can store and retrieve bench_slots list', () => {
      const state = new PlayerSaveState();
      const slots = [
        { slot_id: 1, job_id: 'job-001', unlocked: true },
        { slot_id: 2, job_id: null, unlocked: true },
        { slot_id: 3, job_id: null, unlocked: false },
        { slot_id: 4, job_id: null, unlocked: false },
      ];
      state.set('bench_slots', slots);
      expect(state.get('bench_slots')).toEqual(slots);
    });

    it('snapshot includes all new Issue #119 keys', () => {
      const state = new PlayerSaveState();
      const snap = state.snapshot();
      expect(snap).toHaveProperty('workshop_jobs');
      expect(snap).toHaveProperty('intake_queue');
      expect(snap).toHaveProperty('clients');
      expect(snap).toHaveProperty('reputation');
      expect(snap).toHaveProperty('bench_slots');
      expect(snap).toHaveProperty('queue_feature_flag');
    });
  });
});
