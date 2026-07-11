const UI_SCALE_MIN = 80;
const UI_SCALE_MAX = 150;
const UI_SCALE_DEFAULT = 100;

class UiScaleController {
  constructor({ scaleRenderer = null, initialScale = UI_SCALE_DEFAULT } = {}) {
    this._scaleRenderer = scaleRenderer;
    this._scale = this._clampScale(initialScale);
  }

  setScale(scalePct) {
    this._scale = this._clampScale(scalePct);
    if (typeof this._scaleRenderer === 'function') {
      this._scaleRenderer(this._scale);
    }
  }

  getScale() {
    return this._scale;
  }

  reset() {
    this.setScale(UI_SCALE_DEFAULT);
  }

  _clampScale(scalePct) {
    if (typeof scalePct !== 'number' || Number.isNaN(scalePct)) {
      throw new Error('UI scale must be a valid number.');
    }
    return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scalePct));
  }

  static getScaleRange() {
    return {
      min: UI_SCALE_MIN,
      max: UI_SCALE_MAX,
      default: UI_SCALE_DEFAULT,
    };
  }
}

module.exports = { UiScaleController, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_DEFAULT };
