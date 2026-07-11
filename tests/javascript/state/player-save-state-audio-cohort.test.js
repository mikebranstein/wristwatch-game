'use strict';
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');
describe('PlayerSaveState ab_audio_cohort (Issue #128)', () => {
  test('defaults to null', () => { expect(new PlayerSaveState().get('ab_audio_cohort')).toBeNull(); });
  test('present in snapshot', () => { expect(new PlayerSaveState().snapshot()).toHaveProperty('ab_audio_cohort', null); });
  test('backward compat: pre-feature save gets null', () => { expect(new PlayerSaveState({ tutorial_first_fault_seen: true }).get('ab_audio_cohort')).toBeNull(); });
  test('other cohorts unaffected', () => { const s = new PlayerSaveState({ ab_first_job_cohort: 'guided' }); expect(s.get('ab_first_job_cohort')).toBe('guided'); expect(s.get('ab_audio_cohort')).toBeNull(); });
  test('can set audio-on', () => { const s = new PlayerSaveState(); s.set('ab_audio_cohort', 'audio-on'); expect(s.get('ab_audio_cohort')).toBe('audio-on'); });
  test('can set audio-off', () => { const s = new PlayerSaveState(); s.set('ab_audio_cohort', 'audio-off'); expect(s.get('ab_audio_cohort')).toBe('audio-off'); });
  test('initial audio-on preserved', () => { expect(new PlayerSaveState({ ab_audio_cohort: 'audio-on' }).get('ab_audio_cohort')).toBe('audio-on'); });
  test('snapshot reflects assigned cohort', () => { const s = new PlayerSaveState(); s.set('ab_audio_cohort', 'audio-on'); expect(s.snapshot()).toHaveProperty('ab_audio_cohort', 'audio-on'); });
  test('isolated instances', () => { const s1 = new PlayerSaveState(); const s2 = new PlayerSaveState(); s1.set('ab_audio_cohort', 'audio-on'); expect(s2.get('ab_audio_cohort')).toBeNull(); });
});