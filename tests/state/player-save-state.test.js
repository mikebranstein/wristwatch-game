/**
 * Tests: PlayerSaveState — Issue #82 backward-compatible new fields
 *
 * AC1: current_stage, last_checkpoint_stage, autosave_slot fields
 *
 * Run with: npm test
 */

const { PlayerSaveState } = require('../../src/state/PlayerSaveState');

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
