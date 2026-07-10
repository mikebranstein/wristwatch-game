/**
 * CvdPaletteManager — CVD-safe palette remap for the Accessibility Suite.
 *
 * Implements Issue #115 — AC1 (CVD palette modes) and AC5 (baseline unchanged).
 *
 * Scientific basis
 * ----------------
 * Palette remap derived from:
 *   Machado, G. M., Oliveira, M. M., & Fernandes, L. A. F. (2009).
 *   "A Physiologically-based Model for Simulation of Color Vision Deficiency."
 *   IEEE Transactions on Visualization and Computer Graphics, 15(6), 1291–1298.
 * Replacement palette: Okabe & Ito (2002) universally distinguishable palette.
 *
 * Usage
 * -----
 *   const mgr = new CvdPaletteManager('deuteranopia');
 *   const safeColor = mgr.remapHex('#ef5350');    // → '#e69f00'
 *   const safeVisuals = mgr.remapStateVisuals(STATE_VISUALS);
 */

'use strict';

// ---------------------------------------------------------------------------
// Palette lookup tables
// ---------------------------------------------------------------------------

/**
 * CVD-safe palette remaps per mode.
 *
 * Key: lowercase 7-char hex, Value: CVD-safe replacement hex.
 *
 * Remapping strategy (Okabe–Ito universally-safe palette):
 *   WRONG_ORI red   (#ef5350) → orange  (#e69f00) — D/P distinguishable (blue–orange axis)
 *   LOCKED_IN green (#66bb6a) → blue    (#0072b2) — D/P distinguishable
 *   PROXIMITY cyan  (#4fc3f7) → sky-blue (#56b4e9) — maintained, distinct from both
 *
 *   Tritanopia (blue–yellow axis):
 *   WRONG_ORI red   (#ef5350) → deep red (#cc3311) — T unaffected by red/green
 *   LOCKED_IN green (#66bb6a) → teal    (#009e73) — T safe
 *   PROXIMITY cyan  (#4fc3f7) → magenta (#cc79a7) — T safe blue replacement
 */
const CVD_PALETTES = {
  deuteranopia: {
    '#ef5350': '#e69f00',
    '#66bb6a': '#0072b2',
    '#4fc3f7': '#56b4e9',
  },
  protanopia: {
    '#ef5350': '#e69f00',
    '#66bb6a': '#0072b2',
    '#4fc3f7': '#56b4e9',
  },
  tritanopia: {
    '#ef5350': '#cc3311',
    '#66bb6a': '#009e73',
    '#4fc3f7': '#cc79a7',
  },
};

const VALID_MODES = [null, 'deuteranopia', 'protanopia', 'tritanopia'];

// ---------------------------------------------------------------------------
// CvdPaletteManager
// ---------------------------------------------------------------------------

class CvdPaletteManager {
  /**
   * @param {string|null} mode — one of null, 'deuteranopia', 'protanopia', 'tritanopia'.
   *   null = baseline; no color transformation (AC5).
   */
  constructor(mode = null) {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(
        `CvdPaletteManager: mode must be one of ${JSON.stringify(VALID_MODES)}. Got: ${mode}`
      );
    }
    this._mode = mode;
    this._palette = (mode && CVD_PALETTES[mode]) ? CVD_PALETTES[mode] : {};
  }

  // ── Properties ──────────────────────────────────────────────────────────

  /** @returns {string|null} Active CVD mode. */
  get mode() { return this._mode; }

  /** @returns {boolean} True when a CVD mode is active. */
  get isActive() { return this._mode !== null; }

  // ── Color remap ─────────────────────────────────────────────────────────

  /**
   * Remap a single hex color string to its CVD-safe equivalent.
   *
   * @param {string|null} hexColor — e.g. '#ef5350'. null is returned as-is.
   * @returns {string|null}
   */
  remapHex(hexColor) {
    if (hexColor === null || hexColor === undefined) return hexColor;
    const normalised = hexColor.toLowerCase();
    return this._palette[normalised] !== undefined
      ? this._palette[normalised]
      : normalised;
  }

  /**
   * Return a copy of a state-visuals object with all `color` values remapped.
   *
   * The input object is NOT mutated.
   *
   * @param {Object} stateVisuals — { [stateId]: { color, highlight, glow, animation } }
   * @returns {Object} — new object with CVD-safe colors.
   */
  remapStateVisuals(stateVisuals) {
    const result = {};
    for (const [stateId, visuals] of Object.entries(stateVisuals)) {
      result[stateId] = {
        ...visuals,
        color: this.remapHex(visuals.color),
      };
    }
    return result;
  }
}

module.exports = {
  CvdPaletteManager,
  CVD_PALETTES,
  VALID_MODES,
};
