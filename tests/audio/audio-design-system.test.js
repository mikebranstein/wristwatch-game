'use strict';

const { performance } = require('perf_hooks');

const { AudioDesignSystem } = require('../../src/audio/AudioDesignSystem');
const { AudioVolumeSettings } = require('../../src/audio/AudioVolumeSettings');

function makeSystem(volumePct = 100) {
  const audioHook = jest.fn();
  const stopHook = jest.fn();
  const volumeSettings = new AudioVolumeSettings({
    storage: AudioVolumeSettings.createMemoryStorage(),
  });
  volumeSettings.setVolume(volumePct);

  const system = new AudioDesignSystem({ audioHook, stopHook, volumeSettings });
  system.unlockInteraction();
  return { system, audioHook, stopHook };
}

describe('AC1 — full event coverage plays correct clips within 200ms', () => {
  test('enqueue forwards the correct cue payload immediately after the triggering action', () => {
    const { system, audioHook } = makeSystem();
    const before = performance.now();
    system.enqueue('case_screw_removal');
    const after = performance.now();

    expect(audioHook).toHaveBeenCalledWith(
      'case_screw_removal',
      expect.objectContaining({
        cueId: 'case_screw_removal',
        assetPath: expect.stringContaining('case-screw-removal'),
      })
    );
    expect(after - before).toBeLessThan(200);
  });
});

describe('AC2 — priority queue prevents more than two simultaneous events', () => {
  test('a third lower-priority event is deferred while two higher-priority events are active', () => {
    const { system, audioHook } = makeSystem();
    system.enqueue('delivery_confirmation');
    system.enqueue('case_back_close');
    const result = system.enqueue('tool_pickup');

    expect(result.reason).toBe('deferred');
    expect(system.getActiveSlots()).toHaveLength(2);
    expect(system.getDeferredQueue()).toHaveLength(1);
    expect(audioHook).toHaveBeenCalledTimes(2);
  });

  test('a higher-priority third event preempts the lowest-priority active event', () => {
    const { system, stopHook } = makeSystem();
    system.enqueue('tool_pickup');
    system.enqueue('case_screw_removal');
    const result = system.enqueue('delivery_confirmation');

    expect(result.reason).toBe('started_after_preempt');
    expect(system.getActiveSlots().map((slot) => slot.cueId)).toEqual(expect.arrayContaining([
      'case_screw_removal',
      'delivery_confirmation',
    ]));
    expect(stopHook).toHaveBeenCalledWith('tool_pickup', 'preempted');
  });
});

describe('AC4 — performance overhead remains within a small dispatch budget', () => {
  test('1000 enqueue/release cycles stay comfortably below a quarter second on Node test hardware', () => {
    const { system } = makeSystem();
    const startedAt = performance.now();

    for (let i = 0; i < 1000; i += 1) {
      system.enqueue('tool_pickup');
      system.releaseCue('tool_pickup');
    }

    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeLessThan(250);
  });
});

describe('Safari-style first interaction gate', () => {
  test('audio is suppressed before interaction unlock, then enabled afterward', () => {
    const audioHook = jest.fn();
    const system = new AudioDesignSystem({ audioHook });

    expect(system.enqueue('tool_pickup').reason).toBe('interaction_locked');
    system.unlockInteraction();
    expect(system.enqueue('tool_pickup').reason).toBe('started');
    expect(audioHook).toHaveBeenCalledTimes(1);
  });
});

describe('partial asset load failure fallback', () => {
  test('unavailable assets fail silently while other cues keep playing', () => {
    const { system, audioHook } = makeSystem();
    system.setAssetAvailability('delivery_confirmation', false);

    const failed = system.enqueue('delivery_confirmation');
    const passed = system.enqueue('tool_pickup');

    expect(failed.reason).toBe('asset_unavailable');
    expect(passed.reason).toBe('started');
    expect(audioHook).toHaveBeenCalledTimes(1);
    expect(audioHook).toHaveBeenCalledWith('tool_pickup', expect.any(Object));
  });
});
