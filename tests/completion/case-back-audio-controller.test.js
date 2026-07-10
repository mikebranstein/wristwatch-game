'use strict';
const { CaseBackAudioController, CASE_BACK_CUE } = require('../../src/completion/CaseBackAudioController');
describe('CaseBackAudioController', () => {
  let hook, ctrl;
  beforeEach(() => { hook = jest.fn(); ctrl = new CaseBackAudioController({ audioHook: hook }); });
  test('CASE_BACK_CUE constant is case_back_close', () => { expect(CASE_BACK_CUE).toBe('case_back_close'); });
  test('playCaseBackCue calls audioHook', () => { ctrl.playCaseBackCue(); expect(hook).toHaveBeenCalledWith(CASE_BACK_CUE); });
  test('isPlaying true after play', () => { ctrl.playCaseBackCue(); expect(ctrl.isPlaying()).toBe(true); });
  test('stacking guard: second call ignored', () => { ctrl.playCaseBackCue(); ctrl.playCaseBackCue(); expect(hook).toHaveBeenCalledTimes(1); });
  test('play allowed after onCueComplete', () => { ctrl.playCaseBackCue(); ctrl.onCueComplete(); ctrl.playCaseBackCue(); expect(hook).toHaveBeenCalledTimes(2); });
  test('audio-off: no hook call', () => { const c = new CaseBackAudioController({ audioHook: hook, audioEnabled: false }); c.playCaseBackCue(); expect(hook).not.toHaveBeenCalled(); });
  test('audio-off: isPlaying stays false', () => { const c = new CaseBackAudioController({ audioHook: hook, audioEnabled: false }); c.playCaseBackCue(); expect(c.isPlaying()).toBe(false); });
  test('no audioHook: no throw', () => { const c = new CaseBackAudioController({}); expect(() => c.playCaseBackCue()).not.toThrow(); });
  test('stop resets isPlaying', () => { ctrl.playCaseBackCue(); ctrl.stop(); expect(ctrl.isPlaying()).toBe(false); });
  test('stop on idle does not throw', () => { expect(() => ctrl.stop()).not.toThrow(); });
});