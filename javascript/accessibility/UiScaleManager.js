/**
 * UiScaleManager — global UI scale multiplier for the Accessibility Suite.
 *
 * Implements Issue #115 — AC2 (UI scale slider, real-time rescale,
 * no layout breakage at boundary values, persistence via AccessibilitySettings).
 *
 * Usage
 * -----
 *   const mgr = new UiScaleManager(130);
 *   const scaled = mgr.apply(16);   // 16px → 20.8px
 */

'use strict';

const UI_SCALE_MIN = 80;
const UI_SCALE_MAX = 150;
const UI_SCALE_DEFAULT = 100;
const UI_SCALE_STEP = 5;

class UiScaleManager {
  /**
   * @param {number} scalePct — scale percentage in [80, 150]. Default: 100.
   */
  constructor(scalePct = UI_SCALE_DEFAULT) {
    this._scalePct = UiScaleManager._validate(scalePct);
  }

  // ── Properties ──────────────────────────────────────────────────────────

  /** @returns {number} Scale percentage (80–150). */
  get scalePct() { return this._scalePct; }

  /** @returns {number} Multiplier, e.g. 1.30 for 130%. */
  get multiplier() { return this._scalePct / 100; }

  // ── Core operation ───────────────────────────────────────────────────────

  /**
   * Apply the current scale multiplier to a base value.
   *
   * @param {number} baseValue — pixel size / layout dimension at 100% scale.
   * @returns {number} Scaled value.
   */
  apply(baseValue) {
    return baseValue * this.multiplier;
  }

  /**
   * Like `apply` but rounds to the nearest integer (pixel-aligned).
   *
   * @param {number} baseValue
   * @returns {number}
   */
  applyInt(baseValue) {
    return Math.round(this.apply(baseValue));
  }

  // ── Static helpers ───────────────────────────────────────────────────────

  /**
   * Return true if scalePct is within the valid range [80, 150].
   *
   * @param {number} scalePct
   * @returns {boolean}
   */
  static isValidScale(scalePct) {
    const n = Number(scalePct);
    return !isNaN(n) && n >= UI_SCALE_MIN && n <= UI_SCALE_MAX;
  }

  /** @returns {UiScaleManager} Manager at minimum scale (80%). */
  static minimum() { return new UiScaleManager(UI_SCALE_MIN); }

  /** @returns {UiScaleManager} Manager at maximum scale (150%). */
  static maximum() { return new UiScaleManager(UI_SCALE_MAX); }

  /** @returns {UiScaleManager} Manager at default scale (100%). */
  static default() { return new UiScaleManager(UI_SCALE_DEFAULT); }

  // ── Private ──────────────────────────────────────────────────────────────

  static _validate(value) {
    const n = Number(value);
    if (isNaN(n) || n < UI_SCALE_MIN || n > UI_SCALE_MAX) {
      throw new RangeError(
        `UiScaleManager: scalePct must be in [${UI_SCALE_MIN}, ${UI_SCALE_MAX}]. Got: ${value}`
      );
    }
    return n;
  }
}

module.exports = {
  UiScaleManager,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_DEFAULT,
  UI_SCALE_STEP,
};
