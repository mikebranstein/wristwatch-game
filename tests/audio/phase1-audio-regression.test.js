'use strict';

const { AudioDesignSystem } = require('../../src/audio/AudioDesignSystem');
const { AudioVolumeSettings } = require('../../src/audio/AudioVolumeSettings');
const { RevealAudioController } = require('../../src/cleaning/RevealAudioController');
const { FirstTickAudioController } = require('../../src/completion/FirstTickAudioController');
const { CaseBackAudioController } = require('../../src/completion/CaseBackAudioController');
const { ToolPickupAudioController } = require('../../src/teardown/ToolPickupAudioController');
const { DeliveryAudioController } = require('../../src/completion/DeliveryAudioController');

describe('AC5 — Phase 1 audio events remain regression-free through AudioDesignSystem', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('cleaning reveal, first tick, case-back close, tool pickup, and delivery confirmation still route correctly', () => {
    const audioHook = jest.fn();
    const volumeSettings = new AudioVolumeSettings({
      storage: AudioVolumeSettings.createMemoryStorage(),
    });
    const system = new AudioDesignSystem({ audioHook, volumeSettings });
    system.unlockInteraction();

    const reveal = new RevealAudioController(audioHook, undefined, system);
    reveal.playRevealCue();
    reveal.onCueComplete();

    const firstTick = new FirstTickAudioController({
      audioHook,
      silenceGateMs: 500,
      audioDesignSystem: system,
    });
    firstTick.fireFirstTick();
    jest.advanceTimersByTime(500);
    system.releaseCue('first_tick_one_shot');
    system.releaseCue('first_tick_ticking_loop');

    const caseBack = new CaseBackAudioController(audioHook, true, system);
    caseBack.fireCaseBackCue();
    caseBack.onCueComplete();

    const toolPickup = new ToolPickupAudioController(audioHook, true, 300, system);
    toolPickup.fireToolPickupCue();
    jest.advanceTimersByTime(300);

    const delivery = new DeliveryAudioController(audioHook, true, system);
    delivery.fireDeliveryCue('delivery-1');

    const cueIds = audioHook.mock.calls.map((call) => call[0]);
    expect(cueIds).toEqual(expect.arrayContaining([
      'reveal_cue',
      'first_tick_one_shot',
      'first_tick_ticking_loop',
      'case_back_close',
      'tool_pickup',
      'delivery_confirmation',
    ]));
  });
});
