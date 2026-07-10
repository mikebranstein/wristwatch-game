'use strict';
const { ToolPickupAudioController, TOOL_PICKUP_CUE, DEFAULT_COOLDOWN_MS } = require('../../src/teardown/ToolPickupAudioController');
describe('ToolPickupAudioController', () => {
  let hook, timerFn, ctrl;
  beforeEach(() => { hook = jest.fn(); timerFn = jest.fn(); ctrl = new ToolPickupAudioController({ audioHook: hook, timerFn }); });
  test('TOOL_PICKUP_CUE is tool_pickup', () => { expect(TOOL_PICKUP_CUE).toBe('tool_pickup'); });
  test('DEFAULT_COOLDOWN_MS is 300', () => { expect(DEFAULT_COOLDOWN_MS).toBe(300); });
  test('playPickupCue calls hook', () => { ctrl.playPickupCue(); expect(hook).toHaveBeenCalledWith(TOOL_PICKUP_CUE); });
  test('isInCooldown true after play', () => { ctrl.playPickupCue(); expect(ctrl.isInCooldown()).toBe(true); });
  test('cooldown guard blocks second call', () => { ctrl.playPickupCue(); ctrl.playPickupCue(); expect(hook).toHaveBeenCalledTimes(1); });
  test('timer callback clears cooldown', () => { ctrl.playPickupCue(); timerFn.mock.calls[0][0](); expect(ctrl.isInCooldown()).toBe(false); });
  test('play allowed after cooldown', () => { ctrl.playPickupCue(); timerFn.mock.calls[0][0](); ctrl.playPickupCue(); expect(hook).toHaveBeenCalledTimes(2); });
  test('timer called with cooldownMs', () => { ctrl.playPickupCue(); expect(timerFn.mock.calls[0][1]).toBe(DEFAULT_COOLDOWN_MS); });
  test('audio-off: no hook call', () => { const c = new ToolPickupAudioController({ audioHook: hook, timerFn, audioEnabled: false }); c.playPickupCue(); expect(hook).not.toHaveBeenCalled(); });
  test('reset clears cooldown', () => { ctrl.playPickupCue(); ctrl.reset(); expect(ctrl.isInCooldown()).toBe(false); });
  test('no hook: no throw', () => { const c = new ToolPickupAudioController({ timerFn }); expect(() => c.playPickupCue()).not.toThrow(); });
});