'use strict';

const { DeliveryAudioController, DELIVERY_CUE } = require('../../../src/completion/DeliveryAudioController');

function makeController(audioEnabled = true) {
  const audioHook = jest.fn();
  const ctrl = new DeliveryAudioController(audioHook, audioEnabled);
  return { ctrl, audioHook };
}

describe('DeliveryAudioController', () => {
  test('fires once per delivery id and preserves the canonical cue id', () => {
    const { ctrl, audioHook } = makeController();
    expect(ctrl.fireDeliveryCue('watch-001').fired).toBe(true);
    expect(ctrl.fireDeliveryCue('watch-001').fired).toBe(false);
    expect(ctrl.fireDeliveryCue('watch-002').fired).toBe(true);
    expect(audioHook).toHaveBeenNthCalledWith(1, DELIVERY_CUE);
    expect(audioHook).toHaveBeenNthCalledWith(2, DELIVERY_CUE);
  });

  test('audio-off mode records delivery completion silently', () => {
    const { ctrl, audioHook } = makeController(false);
    expect(ctrl.fireDeliveryCue('watch-001').fired).toBe(true);
    expect(ctrl.hasFired('watch-001')).toBe(true);
    expect(audioHook).not.toHaveBeenCalled();
  });
});

// Phase 1 regression contracts (AC5) — all Phase 1 delivery behaviors must continue
describe('DeliveryAudioController — Phase 1 regression contracts (AC5)', () => {
  test('DELIVERY_CUE is delivery_confirmation', () => {
    expect(DELIVERY_CUE).toBe('delivery_confirmation');
  });

  test('fires delivery cue via audioHook', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, true);
    ctrl.fireDeliveryCue('d1');
    expect(hook).toHaveBeenCalledWith(DELIVERY_CUE);
  });

  test('one-shot: same id fires hook only once', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, true);
    ctrl.fireDeliveryCue('d1');
    ctrl.fireDeliveryCue('d1');
    expect(hook).toHaveBeenCalledTimes(1);
  });

  test('different ids each fire the hook', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, true);
    ctrl.fireDeliveryCue('d1');
    ctrl.fireDeliveryCue('d2');
    expect(hook).toHaveBeenCalledTimes(2);
  });

  test('hasFired true after fire', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, true);
    ctrl.fireDeliveryCue('d1');
    expect(ctrl.hasFired('d1')).toBe(true);
  });

  test('hasFired false before fire', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, true);
    expect(ctrl.hasFired('d1')).toBe(false);
  });

  test('audio-off: hook not called', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, false);
    ctrl.fireDeliveryCue('d1');
    expect(hook).not.toHaveBeenCalled();
  });

  test('reset allows re-fire of same delivery id', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, true);
    ctrl.fireDeliveryCue('d1');
    ctrl.reset();
    ctrl.fireDeliveryCue('d1');
    expect(hook).toHaveBeenCalledTimes(2);
  });

  test('hasFired false after reset', () => {
    const hook = jest.fn();
    const ctrl = new DeliveryAudioController(hook, true);
    ctrl.fireDeliveryCue('d1');
    ctrl.reset();
    expect(ctrl.hasFired('d1')).toBe(false);
  });
});