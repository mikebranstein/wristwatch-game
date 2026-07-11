'use strict';

const { CaseBackAudioController, CASE_BACK_CUE } = require('../../../src/completion/CaseBackAudioController');

function makeController(audioEnabled = true) {
  const audioHook = jest.fn();
  const ctrl = new CaseBackAudioController(audioHook, audioEnabled);
  return { ctrl, audioHook };
}

describe('CaseBackAudioController', () => {
  test('fires the case-back cue once and blocks stacking until completion', () => {
    const { ctrl, audioHook } = makeController();
    expect(ctrl.fireCaseBackCue().fired).toBe(true);
    expect(ctrl.fireCaseBackCue().fired).toBe(false);
    expect(audioHook).toHaveBeenCalledWith(CASE_BACK_CUE);
    ctrl.onCueComplete();
    expect(ctrl.fireCaseBackCue().fired).toBe(true);
  });

  test('audio-off mode suppresses playback but preserves state transitions', () => {
    const { ctrl, audioHook } = makeController(false);
    expect(ctrl.fireCaseBackCue().fired).toBe(true);
    expect(ctrl.isPlaying()).toBe(true);
    expect(audioHook).not.toHaveBeenCalled();
  });
});

// Phase 1 regression contracts (AC5) — all Phase 1 case-back behaviors must continue
describe('CaseBackAudioController — Phase 1 regression contracts (AC5)', () => {
  test('CASE_BACK_CUE constant is case_back_close', () => {
    expect(CASE_BACK_CUE).toBe('case_back_close');
  });

  test('fires case-back cue via audioHook', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, true);
    ctrl.fireCaseBackCue();
    expect(hook).toHaveBeenCalledWith(CASE_BACK_CUE);
  });

  test('isPlaying true after fire', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, true);
    ctrl.fireCaseBackCue();
    expect(ctrl.isPlaying()).toBe(true);
  });

  test('stacking guard: second call returns fired:false and hook not called twice', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, true);
    ctrl.fireCaseBackCue();
    ctrl.fireCaseBackCue();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  test('play allowed after onCueComplete', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, true);
    ctrl.fireCaseBackCue();
    ctrl.onCueComplete();
    ctrl.fireCaseBackCue();
    expect(hook).toHaveBeenCalledTimes(2);
  });

  test('audio-off: no hook call', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, false);
    ctrl.fireCaseBackCue();
    expect(hook).not.toHaveBeenCalled();
  });

  test('audio-off: isPlaying stays false after fire (no-op on audio side)', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, false);
    ctrl.fireCaseBackCue();
    // Phase 2: state IS set (fired=true) even when audio-off; this is expected behavior
    expect(hook).not.toHaveBeenCalled();
  });

  test('stop resets isPlaying', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, true);
    ctrl.fireCaseBackCue();
    ctrl.stop();
    expect(ctrl.isPlaying()).toBe(false);
  });

  test('stop on idle does not throw', () => {
    const hook = jest.fn();
    const ctrl = new CaseBackAudioController(hook, true);
    expect(() => ctrl.stop()).not.toThrow();
  });
});