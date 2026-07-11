const { CvdPaletteMode, CVD_MODE } = require('./CvdPaletteMode');
const { UiScaleController, UI_SCALE_DEFAULT } = require('./UiScaleController');
const { SnapToleranceAssist, SNAP_LEVEL } = require('./SnapToleranceAssist');
const { DEFAULT_AUDIO_VOLUME, clampVolume } = require('../audio/AudioVolumeSettings');

class AccessibilitySettings {
  constructor({
    paletteRenderer = null,
    scaleRenderer = null,
    toleranceApplier = null,
    audioVolumeApplier = null,
    savedSettings = null,
  } = {}) {
    this._cvdPaletteMode = new CvdPaletteMode({ paletteRenderer });
    this._uiScaleController = new UiScaleController({ scaleRenderer });
    this._snapToleranceAssist = new SnapToleranceAssist({ toleranceApplier });
    this._audioVolumeApplier = typeof audioVolumeApplier === 'function' ? audioVolumeApplier : null;
    this._audioVolume = DEFAULT_AUDIO_VOLUME;

    if (savedSettings) {
      this._applySavedSettings(savedSettings);
    }
  }

  _applySavedSettings(savedSettings) {
    const hasCvdMode = Object.prototype.hasOwnProperty.call(savedSettings, 'cvd_mode');
    const hasUiScale = Object.prototype.hasOwnProperty.call(savedSettings, 'ui_scale');
    const hasSnapLevel = Object.prototype.hasOwnProperty.call(savedSettings, 'snap_tolerance_level');
    const hasAudioVolume = Object.prototype.hasOwnProperty.call(savedSettings, 'audio_volume');

    if (hasCvdMode && savedSettings.cvd_mode !== CVD_MODE.NONE) {
      this.setCvdMode(savedSettings.cvd_mode);
    }
    if (hasUiScale) {
      this.setUiScale(savedSettings.ui_scale);
    }
    if (hasSnapLevel) {
      this.setSnapLevel(savedSettings.snap_tolerance_level);
    }
    if (hasAudioVolume) {
      this.setAudioVolume(savedSettings.audio_volume);
    }
  }

  setCvdMode(mode) {
    this._cvdPaletteMode.setMode(mode);
  }

  getCvdMode() {
    return this._cvdPaletteMode.getMode();
  }

  setUiScale(pct) {
    this._uiScaleController.setScale(pct);
  }

  getUiScale() {
    return this._uiScaleController.getScale();
  }

  setSnapLevel(level) {
    this._snapToleranceAssist.setLevel(level);
  }

  getSnapLevel() {
    return this._snapToleranceAssist.getLevel();
  }

  setAudioVolume(volumePct) {
    const nextVolume = clampVolume(volumePct);
    this._audioVolume = nextVolume;
    if (this._audioVolumeApplier) {
      this._audioVolumeApplier(nextVolume);
    }
  }

  getAudioVolume() {
    return this._audioVolume;
  }

  toSaveData() {
    return {
      cvd_mode: this.getCvdMode(),
      ui_scale: this.getUiScale(),
      snap_tolerance_level: this.getSnapLevel(),
      audio_volume: this.getAudioVolume(),
    };
  }

  resetAll() {
    this._cvdPaletteMode.reset();
    this._uiScaleController.reset();
    this._snapToleranceAssist.reset();
    this.setAudioVolume(DEFAULT_AUDIO_VOLUME);
  }

  static fromSaveData(saveData = {}, renderers = {}) {
    return new AccessibilitySettings({
      ...renderers,
      savedSettings: {
        cvd_mode: Object.prototype.hasOwnProperty.call(saveData, 'cvd_mode') ? saveData.cvd_mode : CVD_MODE.NONE,
        ui_scale: Object.prototype.hasOwnProperty.call(saveData, 'ui_scale') ? saveData.ui_scale : UI_SCALE_DEFAULT,
        snap_tolerance_level: Object.prototype.hasOwnProperty.call(saveData, 'snap_tolerance_level')
          ? saveData.snap_tolerance_level
          : SNAP_LEVEL.STANDARD,
        audio_volume: Object.prototype.hasOwnProperty.call(saveData, 'audio_volume')
          ? saveData.audio_volume
          : DEFAULT_AUDIO_VOLUME,
      },
    });
  }
}

module.exports = { AccessibilitySettings };
