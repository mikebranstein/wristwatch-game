'use strict';

const { AccessibilitySettingsScreen } = require('../../../javascript/accessibility/AccessibilitySettingsScreen');

describe('Audio volume settings UI — Issue #132', () => {
  test('settings snapshot exposes audioVolumePct for the pause/settings surface', () => {
    const screen = new AccessibilitySettingsScreen();
    expect(screen.getSettings()).toHaveProperty('audioVolumePct', 100);
  });

  test('setAudioVolumePct updates the screen state and emits an audio_volume event', () => {
    const events = [];
    const screen = new AccessibilitySettingsScreen({ onChange: (event) => events.push(event) });

    screen.setAudioVolumePct(30);
    expect(screen.audioVolumePct).toBe(30);
    expect(events).toContainEqual({ type: 'audio_volume', value: 30 });
  });

  test('audio volume persists through toSaveData() / fromSaveData()', () => {
    const first = new AccessibilitySettingsScreen();
    first.setAudioVolumePct(55);

    const second = new AccessibilitySettingsScreen();
    second.fromSaveData(first.toSaveData());
    expect(second.audioVolumePct).toBe(55);
  });

  test('resetToDefaults restores audio volume to 100%', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setAudioVolumePct(0);
    screen.resetToDefaults();
    expect(screen.audioVolumePct).toBe(100);
  });
});
