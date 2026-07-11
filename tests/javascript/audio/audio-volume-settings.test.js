'use strict';

const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');
const {
  AudioVolumeSettings,
  DEFAULT_AUDIO_VOLUME,
  AUDIO_VOLUME_STORAGE_KEY,
} = require('../../../src/audio/AudioVolumeSettings');
const { AudioDesignSystem } = require('../../../src/audio/AudioDesignSystem');

describe('AC3 — volume control and persistence', () => {
  test('volume defaults to 100% and can be adjusted across the full 0–100 range', () => {
    const settings = new AudioVolumeSettings({
      storage: AudioVolumeSettings.createMemoryStorage(),
    });

    expect(settings.getVolume()).toBe(DEFAULT_AUDIO_VOLUME);
    settings.setVolume(0);
    expect(settings.getVolume()).toBe(0);
    settings.setVolume(50);
    expect(settings.getVolume()).toBe(50);
    settings.setVolume(100);
    expect(settings.getVolume()).toBe(100);
  });

  test('volume persists across sessions using localStorage-like storage', () => {
    const storage = AudioVolumeSettings.createMemoryStorage();
    const first = new AudioVolumeSettings({ storage });
    first.setVolume(30);

    const second = new AudioVolumeSettings({ storage });
    expect(second.getVolume()).toBe(30);
    expect(storage.getItem(AUDIO_VOLUME_STORAGE_KEY)).toBe('30');
  });

  test('save state receives the additive audio_volume field as a fallback sync layer', () => {
    const saveState = new PlayerSaveState();
    const settings = new AudioVolumeSettings({
      storage: AudioVolumeSettings.createMemoryStorage(),
      saveState,
    });

    settings.setVolume(42);
    expect(saveState.get('audio_volume')).toBe(42);
    expect(saveState.snapshot()).toHaveProperty('audio_volume', 42);
  });

  test('0% volume silences playback while 50% applies reduced normalized gain', () => {
    const storage = AudioVolumeSettings.createMemoryStorage();
    const settings = new AudioVolumeSettings({ storage });
    const audioHook = jest.fn();
    const system = new AudioDesignSystem({ audioHook, volumeSettings: settings });
    system.unlockInteraction();

    settings.setVolume(0);
    expect(system.enqueue('tool_pickup').reason).toBe('muted');
    expect(audioHook).not.toHaveBeenCalled();

    settings.setVolume(50);
    expect(system.enqueue('case_back_close').reason).toBe('started');
    expect(audioHook).toHaveBeenCalledWith(
      'case_back_close',
      expect.objectContaining({
        normalizedGain: expect.any(Number),
      })
    );
    expect(audioHook.mock.calls[0][1].normalizedGain).toBeLessThan(1);
  });
});
