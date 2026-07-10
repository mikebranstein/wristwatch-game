'use strict';
const { DeliveryAudioController, DELIVERY_CUE } = require('../../src/completion/DeliveryAudioController');
describe('DeliveryAudioController', () => {
  let hook, ctrl;
  beforeEach(() => { hook = jest.fn(); ctrl = new DeliveryAudioController({ audioHook: hook }); });
  test('DELIVERY_CUE is delivery_confirmation', () => { expect(DELIVERY_CUE).toBe('delivery_confirmation'); });
  test('playDeliveryCue calls hook', () => { ctrl.playDeliveryCue('d1'); expect(hook).toHaveBeenCalledWith(DELIVERY_CUE); });
  test('one-shot: same id fires once', () => { ctrl.playDeliveryCue('d1'); ctrl.playDeliveryCue('d1'); expect(hook).toHaveBeenCalledTimes(1); });
  test('different ids each fire', () => { ctrl.playDeliveryCue('d1'); ctrl.playDeliveryCue('d2'); expect(hook).toHaveBeenCalledTimes(2); });
  test('hasFired true after fire', () => { ctrl.playDeliveryCue('d1'); expect(ctrl.hasFired('d1')).toBe(true); });
  test('hasFired false before fire', () => { expect(ctrl.hasFired('d1')).toBe(false); });
  test('audio-off: suppressed', () => { const c = new DeliveryAudioController({ audioHook: hook, audioEnabled: false }); c.playDeliveryCue('d1'); expect(hook).not.toHaveBeenCalled(); });
  test('audio-off: hasFired false', () => { const c = new DeliveryAudioController({ audioHook: hook, audioEnabled: false }); c.playDeliveryCue('d1'); expect(c.hasFired('d1')).toBe(false); });
  test('reset allows re-fire', () => { ctrl.playDeliveryCue('d1'); ctrl.reset(); ctrl.playDeliveryCue('d1'); expect(hook).toHaveBeenCalledTimes(2); });
  test('hasFired false after reset', () => { ctrl.playDeliveryCue('d1'); ctrl.reset(); expect(ctrl.hasFired('d1')).toBe(false); });
  test('no hook: no throw', () => { const c = new DeliveryAudioController({}); expect(() => c.playDeliveryCue('d1')).not.toThrow(); });
});