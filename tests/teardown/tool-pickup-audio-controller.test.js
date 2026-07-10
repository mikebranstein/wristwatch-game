'use strict';

const {
  ToolPickupAudioController,
  TOOL_PICKUP_CUE,
  DEFAULT_COOLDOWN_MS,
} = require('../../src/teardown/ToolPickupAudioController');

function makeController(audioEnabled = true, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const audioHook = jest.fn();
  const ctrl = new ToolPickupAudioController(audioHook, audioEnabled, cooldownMs);
  return { ctrl, audioHook };
}

describe('ToolPickupAudioController', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('fires once inside a cooldown window and allows replay after cooldown expiry', () => {
    const { ctrl, audioHook } = makeController();
    expect(ctrl.fireToolPickupCue().fired).toBe(true);
    expect(ctrl.fireToolPickupCue().fired).toBe(false);
    expect(audioHook).toHaveBeenCalledWith(TOOL_PICKUP_CUE);

    jest.advanceTimersByTime(DEFAULT_COOLDOWN_MS);
    expect(ctrl.fireToolPickupCue().fired).toBe(true);
    expect(audioHook).toHaveBeenCalledTimes(2);
  });

  test('audio-off mode stays silent without breaking cooldown bookkeeping', () => {
    const { ctrl, audioHook } = makeController(false);
    expect(ctrl.fireToolPickupCue().fired).toBe(true);
    expect(ctrl.isPlaying()).toBe(true);
    expect(audioHook).not.toHaveBeenCalled();
  });
});

// Phase 1 regression contracts (AC5) — all Phase 1 tool-pickup behaviors must continue
describe('ToolPickupAudioController — Phase 1 regression contracts (AC5)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('TOOL_PICKUP_CUE is tool_pickup', () => {
    expect(TOOL_PICKUP_CUE).toBe('tool_pickup');
  });

  test('DEFAULT_COOLDOWN_MS is 300', () => {
    expect(DEFAULT_COOLDOWN_MS).toBe(300);
  });

  test('fires pickup cue via audioHook', () => {
    const hook = jest.fn();
    const ctrl = new ToolPickupAudioController(hook, true);
    ctrl.fireToolPickupCue();
    expect(hook).toHaveBeenCalledWith(TOOL_PICKUP_CUE);
  });

  test('isPlaying true after fire (replaces Phase 1 isInCooldown)', () => {
    const hook = jest.fn();
    const ctrl = new ToolPickupAudioController(hook, true);
    ctrl.fireToolPickupCue();
    expect(ctrl.isPlaying()).toBe(true);
  });

  test('cooldown guard blocks second call within window', () => {
    const hook = jest.fn();
    const ctrl = new ToolPickupAudioController(hook, true);
    ctrl.fireToolPickupCue();
    ctrl.fireToolPickupCue();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  test('cooldown expiry allows second fire', () => {
    const hook = jest.fn();
    const ctrl = new ToolPickupAudioController(hook, true, DEFAULT_COOLDOWN_MS);
    ctrl.fireToolPickupCue();
    jest.advanceTimersByTime(DEFAULT_COOLDOWN_MS);
    ctrl.fireToolPickupCue();
    expect(hook).toHaveBeenCalledTimes(2);
  });

  test('audio-off: no hook call', () => {
    const hook = jest.fn();
    const ctrl = new ToolPickupAudioController(hook, false);
    ctrl.fireToolPickupCue();
    expect(hook).not.toHaveBeenCalled();
  });

  test('stop clears isPlaying (replaces Phase 1 reset)', () => {
    const hook = jest.fn();
    const ctrl = new ToolPickupAudioController(hook, true);
    ctrl.fireToolPickupCue();
    ctrl.stop();
    expect(ctrl.isPlaying()).toBe(false);
  });
});