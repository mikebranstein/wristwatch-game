/**
 * Tests: PlayerSaveState — Issue #82 backward-compatible new fields
 *                          Issue #127 completed_watches gallery field
 *
 * AC1: current_stage, last_checkpoint_stage, autosave_slot fields
 * Issue #127: completed_watches array, recordWatchDelivery, getCompletedWatches
 *
 * Run with: npm test
 */

const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');

describe('PlayerSaveState — Issue #82 save reliability fields', () => {
  // ── Backward compatibility ─────────────────────────────────────────────

  describe('backward compatibility', () => {
    it('existing saves without new fields load without errors', () => {
      const state = new PlayerSaveState({ tutorial_first_fault_seen: true });
      expect(state.get('tutorial_first_fault_seen')).toBe(true);
    });

    it('pre-feature saves without stage fields get null defaults', () => {
      const state = new PlayerSaveState({ tutorial_first_fault_seen: false });
      expect(state.get('current_stage')).toBeNull();
      expect(state.get('last_checkpoint_stage')).toBeNull();
      expect(state.get('autosave_slot')).toBe(false);
    });

    it('existing fields are preserved alongside new fields', () => {
      const state = new PlayerSaveState({
        tutorial_first_fault_seen: true,
        current_stage: 'cleaning',
        last_checkpoint_stage: 'teardown',
        autosave_slot: true,
      });
      expect(state.get('tutorial_first_fault_seen')).toBe(true);
      expect(state.get('current_stage')).toBe('cleaning');
    });
  });

  // ── Default values ─────────────────────────────────────────────────────

  describe('default values for new fields', () => {
    it('current_stage defaults to null', () => {
      const state = new PlayerSaveState();
      expect(state.get('current_stage')).toBeNull();
    });

    it('last_checkpoint_stage defaults to null', () => {
      const state = new PlayerSaveState();
      expect(state.get('last_checkpoint_stage')).toBeNull();
    });

    it('autosave_slot defaults to false', () => {
      const state = new PlayerSaveState();
      expect(state.get('autosave_slot')).toBe(false);
    });
  });

  // ── setCurrentStage ────────────────────────────────────────────────────

  describe('setCurrentStage()', () => {
    it('sets current_stage', () => {
      const state = new PlayerSaveState();
      state.setCurrentStage('teardown');
      expect(state.get('current_stage')).toBe('teardown');
    });

    it('updates current_stage across all four stages', () => {
      const state = new PlayerSaveState();
      for (const stage of ['teardown', 'cleaning', 'sourcing', 'reassembly']) {
        state.setCurrentStage(stage);
        expect(state.get('current_stage')).toBe(stage);
      }
    });
  });

  // ── markCheckpointStage ────────────────────────────────────────────────

  describe('markCheckpointStage()', () => {
    it('sets last_checkpoint_stage', () => {
      const state = new PlayerSaveState();
      state.markCheckpointStage('cleaning');
      expect(state.get('last_checkpoint_stage')).toBe('cleaning');
    });

    it('sets autosave_slot to true', () => {
      const state = new PlayerSaveState();
      state.markCheckpointStage('reassembly');
      expect(state.get('autosave_slot')).toBe(true);
    });

    it('snapshot includes updated checkpoint fields', () => {
      const state = new PlayerSaveState();
      state.markCheckpointStage('sourcing');
      const snap = state.snapshot();
      expect(snap.last_checkpoint_stage).toBe('sourcing');
      expect(snap.autosave_slot).toBe(true);
    });
  });

  // ── snapshot serialisation ─────────────────────────────────────────────

  describe('snapshot()', () => {
    it('snapshot includes all new fields', () => {
      const state = new PlayerSaveState();
      state.setCurrentStage('teardown');
      state.markCheckpointStage('teardown');
      const snap = state.snapshot();
      expect(snap).toHaveProperty('current_stage', 'teardown');
      expect(snap).toHaveProperty('last_checkpoint_stage', 'teardown');
      expect(snap).toHaveProperty('autosave_slot', true);
      expect(snap).toHaveProperty('tutorial_first_fault_seen');
    });

    it('snapshot is a copy — mutations do not affect internal store', () => {
      const state = new PlayerSaveState();
      const snap = state.snapshot();
      snap.current_stage = 'hacked';
      expect(state.get('current_stage')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue #127 — Workshop Collection Gallery: completed_watches field
// ─────────────────────────────────────────────────────────────────────────────

describe('PlayerSaveState — Issue #127 completed_watches', () => {

  // ── Default value ──────────────────────────────────────────────────────────

  it('completed_watches defaults to empty array', () => {
    const state = new PlayerSaveState();
    expect(state.get('completed_watches')).toEqual([]);
  });

  it('pre-feature save without completed_watches gets [] default (backward-compat)', () => {
    const state = new PlayerSaveState({ tutorial_first_fault_seen: true });
    expect(state.getCompletedWatches()).toEqual([]);
  });

  it('existing saves preserve completed_watches when present', () => {
    const prior = [{ watchId: 'w1', watchName: 'Seiko', clientName: 'Alice', completionDate: '2026-07-01', portraitAssetKey: null }];
    const state = new PlayerSaveState({ completed_watches: prior });
    expect(state.getCompletedWatches()).toHaveLength(1);
    expect(state.getCompletedWatches()[0].watchName).toBe('Seiko');
  });

  // ── recordWatchDelivery ────────────────────────────────────────────────────

  describe('recordWatchDelivery()', () => {
    const ENTRY = {
      watchId:          'watch-001',
      watchName:        'Omega Speedmaster',
      clientName:       'Bob Carter',
      completionDate:   '2026-07-10',
      portraitAssetKey: 'portraits/omega.png',
    };

    it('appends entry to completed_watches', () => {
      const state = new PlayerSaveState();
      state.recordWatchDelivery(ENTRY);
      expect(state.getCompletedWatches()).toHaveLength(1);
    });

    it('stores all entry fields correctly', () => {
      const state = new PlayerSaveState();
      state.recordWatchDelivery(ENTRY);
      const watches = state.getCompletedWatches();
      expect(watches[0].watchName).toBe('Omega Speedmaster');
      expect(watches[0].clientName).toBe('Bob Carter');
      expect(watches[0].completionDate).toBe('2026-07-10');
      expect(watches[0].portraitAssetKey).toBe('portraits/omega.png');
    });

    it('appends multiple entries in order', () => {
      const state = new PlayerSaveState();
      state.recordWatchDelivery({ ...ENTRY, watchId: 'w1', watchName: 'First' });
      state.recordWatchDelivery({ ...ENTRY, watchId: 'w2', watchName: 'Second' });
      const watches = state.getCompletedWatches();
      expect(watches).toHaveLength(2);
      expect(watches[0].watchName).toBe('First');
      expect(watches[1].watchName).toBe('Second');
    });

    it('is non-destructive — existing entries are preserved', () => {
      const prior = [{ watchId: 'old', watchName: 'Old Watch', clientName: 'X', completionDate: '2026-01-01', portraitAssetKey: null }];
      const state = new PlayerSaveState({ completed_watches: prior });
      state.recordWatchDelivery(ENTRY);
      expect(state.getCompletedWatches()).toHaveLength(2);
      expect(state.getCompletedWatches()[0].watchName).toBe('Old Watch');
    });
  });

  // ── getCompletedWatches ────────────────────────────────────────────────────

  describe('getCompletedWatches()', () => {
    it('returns a copy — mutations do not affect internal store', () => {
      const state = new PlayerSaveState();
      state.recordWatchDelivery({ watchId: 'w1', watchName: 'Test', clientName: 'C', completionDate: '2026-07-10', portraitAssetKey: null });
      const copy = state.getCompletedWatches();
      copy.push({ watchId: 'injected' });
      expect(state.getCompletedWatches()).toHaveLength(1);
    });

    it('returns [] when completed_watches is not an array (corrupt data guard)', () => {
      const state = new PlayerSaveState({ completed_watches: null });
      expect(state.getCompletedWatches()).toEqual([]);
    });
  });

  // ── snapshot includes completed_watches ───────────────────────────────────

  describe('snapshot() includes completed_watches', () => {
    it('snapshot includes completed_watches array', () => {
      const state = new PlayerSaveState();
      state.recordWatchDelivery({ watchId: 'w1', watchName: 'Test', clientName: 'C', completionDate: '2026-07-10', portraitAssetKey: null });
      const snap = state.snapshot();
      expect(snap).toHaveProperty('completed_watches');
      expect(snap.completed_watches).toHaveLength(1);
    });

    it('snapshot with empty completed_watches includes empty array', () => {
      const state = new PlayerSaveState();
      const snap  = state.snapshot();
      expect(snap.completed_watches).toEqual([]);
    });
  });
});
