/**
 * AccessibilitySettingsScreen — settings UI controller for the Accessibility Suite.
 *
 * Implements Issue #115 — AC1, AC2, AC3, AC4, AC5.
 *
 * This class is the front-end controller for the Accessibility Settings panel.
 * It owns the three settings values, validates input, emits change events, and
 * exposes serialisation helpers for persistence via the player save profile.
 *
 * It can be accessed from the **main menu** before the first play session
 * (constraint from issue #115) as well as from the in-game pause menu.
 *
 * Settings
 * --------
 *   cvdMode           : null | 'deuteranopia' | 'protanopia' | 'tritanopia'
 *   uiScalePct        : number  80–150
 *   snapToleranceLevel: 'standard' | 'assisted' | 'high_assist'
 *
 * Events emitted on the optional `onChange` callback:
 *   { type: 'cvd_mode', value }
 *   { type: 'ui_scale', value }
 *   { type: 'snap_tolerance', value }
 *   { type: 'reset' }
 *
 * Usage
 * -----
 *   const screen = new AccessibilitySettingsScreen({ onChange: (evt) => applyToGame(evt) });
 *   screen.setCvdMode('deuteranopia');
 *   screen.setUiScale(130);
 *   screen.setSnapToleranceLevel('high_assist');
 *   const saved = screen.toSaveData();   // persist to profile
 *   screen.fromSaveData(saved);          // restore on session start
 */

'use strict';

const { CvdPaletteManager, VALID_MODES } = require('./CvdPaletteManager');
const { UiScaleManager, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_DEFAULT } = require('./UiScaleManager');

const SNAP_TOLERANCE_LEVELS = ['standard', 'assisted', 'high_assist'];

// Snap tolerance radius multipliers (mirrors Python SnapToleranceAssist)
const ASSIST_MULTIPLIERS = {
  standard:    { approach: 1.0, lock: 1.0 },
  assisted:    { approach: 1.5, lock: 1.5 },
  high_assist: { approach: 2.0, lock: 2.0 },
};

class AccessibilitySettingsScreen {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.onChange]  — called with a change event on every
   *   settings update.  Signature: (evt: { type, value }) => void.
   */
  constructor({ onChange = null } = {}) {
    this._cvdMode = null;
    this._uiScalePct = UI_SCALE_DEFAULT;
    this._snapToleranceLevel = 'standard';
    this._onChange = typeof onChange === 'function' ? onChange : null;
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  /** @returns {string|null} Active CVD mode. */
  get cvdMode() { return this._cvdMode; }

  /** @returns {number} UI scale percentage (80–150). */
  get uiScalePct() { return this._uiScalePct; }

  /** @returns {string} Active snap tolerance level. */
  get snapToleranceLevel() { return this._snapToleranceLevel; }

  /** @returns {Object} Copy of all current settings. */
  getSettings() {
    return {
      cvdMode: this._cvdMode,
      uiScalePct: this._uiScalePct,
      snapToleranceLevel: this._snapToleranceLevel,
    };
  }

  // ── Setters ──────────────────────────────────────────────────────────────

  /**
   * Set the CVD palette mode (AC1).
   *
   * @param {string|null} mode — null for baseline (AC5); or 'deuteranopia',
   *   'protanopia', 'tritanopia'.
   */
  setCvdMode(mode) {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`AccessibilitySettingsScreen: invalid cvdMode '${mode}'.`);
    }
    this._cvdMode = mode;
    this._emit({ type: 'cvd_mode', value: mode });
  }

  /**
   * Set the UI scale percentage (AC2).
   *
   * @param {number} scalePct — value in [80, 150].
   */
  setUiScale(scalePct) {
    if (!UiScaleManager.isValidScale(scalePct)) {
      throw new RangeError(
        `AccessibilitySettingsScreen: uiScalePct must be in [${UI_SCALE_MIN}, ${UI_SCALE_MAX}]. Got: ${scalePct}`
      );
    }
    this._uiScalePct = Number(scalePct);
    this._emit({ type: 'ui_scale', value: this._uiScalePct });
  }

  /**
   * Set the snap tolerance assist level (AC3).
   *
   * @param {string} level — 'standard', 'assisted', or 'high_assist'.
   */
  setSnapToleranceLevel(level) {
    if (!SNAP_TOLERANCE_LEVELS.includes(level)) {
      throw new Error(
        `AccessibilitySettingsScreen: invalid snap tolerance level '${level}'. ` +
        `Must be one of ${JSON.stringify(SNAP_TOLERANCE_LEVELS)}.`
      );
    }
    this._snapToleranceLevel = level;
    this._emit({ type: 'snap_tolerance', value: level });
  }

  /**
   * Reset all settings to factory defaults (AC5 baseline).
   */
  resetToDefaults() {
    this._cvdMode = null;
    this._uiScalePct = UI_SCALE_DEFAULT;
    this._snapToleranceLevel = 'standard';
    this._emit({ type: 'reset', value: null });
  }

  // ── Snap-tolerance radius helper (AC3) ───────────────────────────────────

  /**
   * Return adjusted tolerance radii for a given part based on the current
   * snap tolerance level.
   *
   * @param {{ approach_radius: number, lock_radius: number }} baseTolerance
   * @returns {{ approach_radius: number, lock_radius: number }}
   */
  adjustSnapTolerance(baseTolerance) {
    const mult = ASSIST_MULTIPLIERS[this._snapToleranceLevel];
    return {
      approach_radius: baseTolerance.approach_radius * mult.approach,
      lock_radius: baseTolerance.lock_radius * mult.lock,
    };
  }

  // ── CVD palette helper (AC1) ─────────────────────────────────────────────

  /**
   * Return a new CvdPaletteManager for the current CVD mode.
   *
   * @returns {CvdPaletteManager}
   */
  buildCvdPaletteManager() {
    return new CvdPaletteManager(this._cvdMode);
  }

  // ── UI scale helper (AC2) ────────────────────────────────────────────────

  /**
   * Return a new UiScaleManager for the current scale.
   *
   * @returns {UiScaleManager}
   */
  buildUiScaleManager() {
    return new UiScaleManager(this._uiScalePct);
  }

  // ── Persistence (AC4) ────────────────────────────────────────────────────

  /**
   * Serialise settings to a JSON-safe dict for the player save profile.
   *
   * @returns {{ cvd_mode: string|null, ui_scale: number, snap_tolerance_level: string }}
   */
  toSaveData() {
    return {
      cvd_mode: this._cvdMode,
      ui_scale: this._uiScalePct,
      snap_tolerance_level: this._snapToleranceLevel,
    };
  }

  /**
   * Restore settings from a save-profile dict.  Missing keys fall back to
   * defaults for backward-compatibility with pre-feature saves (AC4).
   *
   * @param {Object|null} data
   */
  fromSaveData(data) {
    const d = data || {};
    const section = d.accessibility || d;

    const cvdMode = section.cvd_mode !== undefined ? section.cvd_mode : null;
    const uiScale = section.ui_scale !== undefined ? Number(section.ui_scale) : UI_SCALE_DEFAULT;
    const snapLevel = section.snap_tolerance_level || 'standard';

    // Validate and apply each field (fall back to default if corrupt)
    this._cvdMode = VALID_MODES.includes(cvdMode) ? cvdMode : null;
    this._uiScalePct = UiScaleManager.isValidScale(uiScale) ? uiScale : UI_SCALE_DEFAULT;
    this._snapToleranceLevel = SNAP_TOLERANCE_LEVELS.includes(snapLevel) ? snapLevel : 'standard';
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _emit(event) {
    if (this._onChange) {
      this._onChange(event);
    }
  }
}

module.exports = {
  AccessibilitySettingsScreen,
  SNAP_TOLERANCE_LEVELS,
  ASSIST_MULTIPLIERS,
};
