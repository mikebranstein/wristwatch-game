const CVD_MODE = {
  NONE: 'none',
  DEUTERANOPIA: 'deuteranopia',
  PROTANOPIA: 'protanopia',
  TRITANOPIA: 'tritanopia',
};

const CVD_MATRICES = {
  deuteranopia: [
    [0.367, 0.861, -0.228],
    [-0.280, 1.158, 0.123],
    [0.011, -0.085, 1.074],
  ],
  protanopia: [
    [0.152, 1.053, -0.205],
    [0.115, 0.786, 0.099],
    [0.003, -0.021, 1.018],
  ],
  tritanopia: [
    [1.256, -0.077, -0.179],
    [-0.078, 0.931, 0.148],
    [0.005, 0.691, 0.304],
  ],
};

class CvdPaletteMode {
  constructor({ paletteRenderer = null } = {}) {
    this._mode = CVD_MODE.NONE;
    this._paletteRenderer = paletteRenderer;
  }

  setMode(mode) {
    if (!CvdPaletteMode.getSupportedModes().includes(mode)) {
      throw new Error(`Unsupported CVD mode '${mode}'.`);
    }
    if (this._mode === mode) {
      return;
    }

    this._mode = mode;
    if (typeof this._paletteRenderer === 'function') {
      this._paletteRenderer(mode, this.getMatrix(mode));
    }
  }

  getMode() {
    return this._mode;
  }

  getMatrix(mode = this._mode) {
    if (mode === CVD_MODE.NONE) {
      return null;
    }
    return CVD_MATRICES[mode] || null;
  }

  reset() {
    this.setMode(CVD_MODE.NONE);
  }

  static getSupportedModes() {
    return Object.values(CVD_MODE);
  }
}

module.exports = { CvdPaletteMode, CVD_MODE, CVD_MATRICES };
