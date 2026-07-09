const SNAP_LEVEL = {
  STANDARD: 'standard',
  ASSISTED: 'assisted',
  HIGH_ASSIST: 'high_assist',
};

const SNAP_RADIUS = {
  standard: 1.0,
  assisted: 1.5,
  high_assist: 2.5,
};

class SnapToleranceAssist {
  constructor({ toleranceApplier = null, initialLevel = SNAP_LEVEL.STANDARD } = {}) {
    this._toleranceApplier = toleranceApplier;
    if (!SnapToleranceAssist.getSupportedLevels().includes(initialLevel)) {
      throw new Error(`Unsupported snap tolerance level '${initialLevel}'.`);
    }
    this._level = initialLevel;
  }

  setLevel(level) {
    if (!SnapToleranceAssist.getSupportedLevels().includes(level)) {
      throw new Error(`Unsupported snap tolerance level '${level}'.`);
    }
    this._level = level;
    if (typeof this._toleranceApplier === 'function') {
      this._toleranceApplier(level, this.getRadiusMultiplier(level));
    }
  }

  getLevel() {
    return this._level;
  }

  getRadiusMultiplier(level = this._level) {
    return SNAP_RADIUS[level];
  }

  reset() {
    this.setLevel(SNAP_LEVEL.STANDARD);
  }

  static getSupportedLevels() {
    return Object.values(SNAP_LEVEL);
  }
}

module.exports = { SnapToleranceAssist, SNAP_LEVEL, SNAP_RADIUS };
