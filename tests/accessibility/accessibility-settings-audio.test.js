'use strict';

/**
 * Unit tests for AccessibilitySettings.js — audio volume touch points
 * Issue #132: Full Audio Design Pass — Phase 2
 * Covers AC3a–AC3g: all seven audio-volume behaviors added to the DI-injected
 * backend orchestrator class (distinct from AccessibilitySettingsScreen.js).
 */

const { AccessibilitySettings } = require('../../src/accessibility/AccessibilitySettings');
const { DEFAULT_AUDIO_VOLUME } = require('../../src/audio/AudioVolumeSettings');

// ---------------------------------------------------------------------------
// AC3a — Constructor stores audioVolumeApplier callback and initialises
//         _audioVolume to DEFAULT_AUDIO_VOLUME (100)
// ---------------------------------------------------------------------------
describe('AccessibilitySettings — AC3a: constructor DI injection and default initialisation', () => {
  test('initialises _audioVolume to DEFAULT_AUDIO_VOLUME (100) when no savedSettings provided', () => {
    const settings = new AccessibilitySettings();
    expect(settings.getAudioVolume()).toBe(DEFAULT_AUDIO_VOLUME);
    expect(DEFAULT_AUDIO_VOLUME).toBe(100);
  });

  test('stores the audioVolumeApplier callback for later invocation', () => {
    const applier = jest.fn();
    const settings = new AccessibilitySettings({ audioVolumeApplier: applier });
    // Applier should NOT be called during construction (no savedSettings)
    expect(applier).not.toHaveBeenCalled();
    // But the reference is stored — calling setAudioVolume must invoke it
    settings.setAudioVolume(80);
    expect(applier).toHaveBeenCalledWith(80);
  });

  test('accepts a null/missing audioVolumeApplier without throwing', () => {
    expect(() => new AccessibilitySettings({ audioVolumeApplier: null })).not.toThrow();
    expect(() => new AccessibilitySettings({})).not.toThrow();
    expect(() => new AccessibilitySettings()).not.toThrow();
  });

  test('ignores non-function audioVolumeApplier gracefully', () => {
    const settings = new AccessibilitySettings({ audioVolumeApplier: 'not-a-function' });
    // setAudioVolume must not throw when the stored applier is null
    expect(() => settings.setAudioVolume(50)).not.toThrow();
    expect(settings.getAudioVolume()).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// AC3b — setAudioVolume() clamps via clampVolume(), updates _audioVolume,
//         and invokes audioVolumeApplier with the clamped value
// ---------------------------------------------------------------------------
describe('AccessibilitySettings — AC3b: setAudioVolume() clamping and applier invocation', () => {
  test('stores the exact value when within 0–100 range', () => {
    const settings = new AccessibilitySettings();
    settings.setAudioVolume(75);
    expect(settings.getAudioVolume()).toBe(75);
  });

  test('clamps a value above 100 down to 100', () => {
    const applier = jest.fn();
    const settings = new AccessibilitySettings({ audioVolumeApplier: applier });
    settings.setAudioVolume(150);
    expect(settings.getAudioVolume()).toBe(100);
    expect(applier).toHaveBeenCalledWith(100);
  });

  test('clamps a value below 0 up to 0', () => {
    const applier = jest.fn();
    const settings = new AccessibilitySettings({ audioVolumeApplier: applier });
    settings.setAudioVolume(-10);
    expect(settings.getAudioVolume()).toBe(0);
    expect(applier).toHaveBeenCalledWith(0);
  });

  test('invokes audioVolumeApplier with the clamped value', () => {
    const applier = jest.fn();
    const settings = new AccessibilitySettings({ audioVolumeApplier: applier });
    settings.setAudioVolume(42);
    expect(applier).toHaveBeenCalledTimes(1);
    expect(applier).toHaveBeenCalledWith(42);
  });

  test('does not invoke applier when none provided', () => {
    // Must not throw when no applier is registered
    const settings = new AccessibilitySettings();
    expect(() => settings.setAudioVolume(60)).not.toThrow();
    expect(settings.getAudioVolume()).toBe(60);
  });

  test('rounds fractional values per clampVolume semantics', () => {
    const settings = new AccessibilitySettings();
    settings.setAudioVolume(37.6);
    expect(settings.getAudioVolume()).toBe(38); // Math.round(37.6) = 38
  });

  test('throws RangeError for non-finite input (delegates to clampVolume)', () => {
    const settings = new AccessibilitySettings();
    expect(() => settings.setAudioVolume(NaN)).toThrow(RangeError);
    expect(() => settings.setAudioVolume(Infinity)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// AC3c — getAudioVolume() returns the current _audioVolume value
// ---------------------------------------------------------------------------
describe('AccessibilitySettings — AC3c: getAudioVolume() state read', () => {
  test('returns DEFAULT_AUDIO_VOLUME (100) before any mutation', () => {
    const settings = new AccessibilitySettings();
    expect(settings.getAudioVolume()).toBe(100);
  });

  test('reflects the last value passed to setAudioVolume()', () => {
    const settings = new AccessibilitySettings();
    settings.setAudioVolume(33);
    expect(settings.getAudioVolume()).toBe(33);
    settings.setAudioVolume(0);
    expect(settings.getAudioVolume()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC3d — toSaveData() includes audio_volume field equal to getAudioVolume()
// ---------------------------------------------------------------------------
describe('AccessibilitySettings — AC3d: toSaveData() serialisation', () => {
  test('toSaveData() returns an object with an audio_volume field', () => {
    const settings = new AccessibilitySettings();
    const data = settings.toSaveData();
    expect(data).toHaveProperty('audio_volume');
  });

  test('audio_volume in toSaveData() matches getAudioVolume()', () => {
    const settings = new AccessibilitySettings();
    settings.setAudioVolume(65);
    const data = settings.toSaveData();
    expect(data.audio_volume).toBe(settings.getAudioVolume());
    expect(data.audio_volume).toBe(65);
  });

  test('toSaveData() reflects the default volume before any mutation', () => {
    const settings = new AccessibilitySettings();
    const data = settings.toSaveData();
    expect(data.audio_volume).toBe(DEFAULT_AUDIO_VOLUME);
  });

  test('toSaveData() also contains other existing accessibility fields', () => {
    const settings = new AccessibilitySettings();
    const data = settings.toSaveData();
    expect(data).toHaveProperty('cvd_mode');
    expect(data).toHaveProperty('ui_scale');
    expect(data).toHaveProperty('snap_tolerance_level');
    expect(data).toHaveProperty('audio_volume');
  });
});

// ---------------------------------------------------------------------------
// AC3e — fromSaveData() static factory hydrates _audioVolume and invokes
//         audioVolumeApplier when audio_volume is present in save data
// ---------------------------------------------------------------------------
describe('AccessibilitySettings — AC3e: fromSaveData() hydration', () => {
  test('hydrates _audioVolume from saveData.audio_volume', () => {
    const saveData = { audio_volume: 55 };
    const settings = AccessibilitySettings.fromSaveData(saveData);
    expect(settings.getAudioVolume()).toBe(55);
  });

  test('invokes audioVolumeApplier with the loaded volume when factory is used with audio_volume', () => {
    const applier = jest.fn();
    const saveData = { audio_volume: 72 };
    AccessibilitySettings.fromSaveData(saveData, { audioVolumeApplier: applier });
    expect(applier).toHaveBeenCalledWith(72);
  });

  test('defaults audio_volume to DEFAULT_AUDIO_VOLUME when absent from saveData', () => {
    const settings = AccessibilitySettings.fromSaveData({});
    expect(settings.getAudioVolume()).toBe(DEFAULT_AUDIO_VOLUME);
  });

  test('round-trip: toSaveData() output can be restored via fromSaveData()', () => {
    const original = new AccessibilitySettings();
    original.setAudioVolume(88);
    const saveData = original.toSaveData();

    const restored = AccessibilitySettings.fromSaveData(saveData);
    expect(restored.getAudioVolume()).toBe(88);
  });
});

// ---------------------------------------------------------------------------
// AC3f — _applySavedSettings() calls setAudioVolume() when hasAudioVolume is true
// ---------------------------------------------------------------------------
describe('AccessibilitySettings — AC3f: _applySavedSettings() hasAudioVolume branch', () => {
  test('calls setAudioVolume() with the saved value when audio_volume is present in savedSettings', () => {
    const applier = jest.fn();
    // Directly exercise _applySavedSettings via the constructor's savedSettings path
    const settings = new AccessibilitySettings({
      audioVolumeApplier: applier,
      savedSettings: { audio_volume: 40 },
    });
    // Constructor calls _applySavedSettings, which should invoke setAudioVolume(40)
    expect(settings.getAudioVolume()).toBe(40);
    expect(applier).toHaveBeenCalledWith(40);
  });

  test('does NOT call setAudioVolume() when audio_volume is absent from savedSettings', () => {
    const applier = jest.fn();
    const settings = new AccessibilitySettings({
      audioVolumeApplier: applier,
      savedSettings: {}, // no audio_volume key — empty saved settings
    });
    // _audioVolume should remain at DEFAULT; applier must not be called
    expect(settings.getAudioVolume()).toBe(DEFAULT_AUDIO_VOLUME);
    expect(applier).not.toHaveBeenCalled();
  });

  test('clamps the saved value via setAudioVolume() (clamping path in _applySavedSettings)', () => {
    const settings = new AccessibilitySettings({
      savedSettings: { audio_volume: 200 }, // out-of-range
    });
    expect(settings.getAudioVolume()).toBe(100); // clamped
  });
});

// ---------------------------------------------------------------------------
// AC3g — resetAll() resets _audioVolume to DEFAULT_AUDIO_VOLUME (100) and
//         invokes audioVolumeApplier
// ---------------------------------------------------------------------------
describe('AccessibilitySettings — AC3g: resetAll() resets audio volume', () => {
  test('resets _audioVolume to DEFAULT_AUDIO_VOLUME (100) after mutation', () => {
    const settings = new AccessibilitySettings();
    settings.setAudioVolume(25);
    expect(settings.getAudioVolume()).toBe(25);

    settings.resetAll();
    expect(settings.getAudioVolume()).toBe(DEFAULT_AUDIO_VOLUME);
    expect(settings.getAudioVolume()).toBe(100);
  });

  test('invokes audioVolumeApplier with DEFAULT_AUDIO_VOLUME during resetAll()', () => {
    const applier = jest.fn();
    const settings = new AccessibilitySettings({ audioVolumeApplier: applier });
    settings.setAudioVolume(10); // applier called once here
    applier.mockClear();

    settings.resetAll();
    expect(applier).toHaveBeenCalledTimes(1);
    expect(applier).toHaveBeenCalledWith(DEFAULT_AUDIO_VOLUME);
  });

  test('resetAll() on a fresh instance (already at default) still behaves correctly', () => {
    const applier = jest.fn();
    const settings = new AccessibilitySettings({ audioVolumeApplier: applier });
    settings.resetAll();
    expect(settings.getAudioVolume()).toBe(100);
    expect(applier).toHaveBeenCalledWith(100);
  });
});
