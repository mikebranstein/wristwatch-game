/**
 * ScatterLayout — authored displaced-component position data for Shock Damage repair.
 *
 * Issue #84: Phase 2 — Shock Damage spatial UI system.
 *
 * Design contract (from design decision):
 *   - 2+ distinct authored scatter layouts per watch model (not procedural).
 *   - Each layout defines displaced positions for movement components that
 *     the player must reposition to canonical targets.
 *   - Authored layouts cap scope, prevent edge-case breakage, and avoid
 *     component scatter memorisation (2+ layouts per model prevents rote learning).
 *   - Position values are in game-unit coordinates matching the movement viewport.
 *
 * Position schema per component entry:
 *   { x: number, y: number, rotation: number }
 *     x, y       — displaced position in game units (canonical positions defined separately)
 *     rotation   — degrees off-axis from canonical orientation
 *
 * The layout data is consumed by ComponentPositionValidator and the movement renderer.
 * The renderer reads the assigned scatter_layout_id and renders components in displaced positions.
 */

'use strict';

/**
 * Authored scatter layout library.
 * Keys are watch-model identifiers matching the catalog.
 * Each model has an array of at least 2 distinct scatter configurations.
 *
 * @type {Object.<string, Array<{layoutId: string, components: Object.<string, {x:number,y:number,rotation:number}>}>>}
 */
const SCATTER_LAYOUTS = {
  /**
   * Generic caliber used as the default/fallback model.
   * Canonical positions assumed to be centred around (200, 200) in a 400×400 viewport.
   */
  'caliber-generic': [
    {
      layoutId: 'generic-scatter-a',
      watchModel: 'caliber-generic',
      description: 'Impact from 9 o\'clock — components displaced toward 3 o\'clock',
      components: {
        balance_wheel:  { x: 280, y: 195, rotation: 42 },
        pallet_fork:    { x: 265, y: 175, rotation: -18 },
        balance_cock:   { x: 290, y: 220, rotation: 31 },
        hour_hand:      { x: 200, y: 200, rotation: 25 },   // bent
        minute_hand:    { x: 200, y: 200, rotation: -15 },  // bent
      },
    },
    {
      layoutId: 'generic-scatter-b',
      watchModel: 'caliber-generic',
      description: 'Impact from 12 o\'clock — components displaced downward',
      components: {
        balance_wheel:  { x: 195, y: 275, rotation: -29 },
        pallet_fork:    { x: 210, y: 260, rotation: 55 },
        balance_cock:   { x: 185, y: 285, rotation: -12 },
        hour_hand:      { x: 200, y: 200, rotation: -35 },  // bent
        minute_hand:    { x: 200, y: 200, rotation: 18 },   // bent
      },
    },
  ],

  /**
   * ETA 2824 caliber — common Swiss automatic movement.
   */
  'caliber-eta-2824': [
    {
      layoutId: 'eta2824-scatter-a',
      watchModel: 'caliber-eta-2824',
      description: 'Drop impact — balance and pallet scattered toward 4 o\'clock',
      components: {
        balance_wheel:  { x: 255, y: 238, rotation: 38 },
        pallet_fork:    { x: 248, y: 218, rotation: -22 },
        balance_cock:   { x: 268, y: 250, rotation: 15 },
        escape_wheel:   { x: 230, y: 245, rotation: 8 },
        hour_hand:      { x: 200, y: 200, rotation: 20 },
        minute_hand:    { x: 200, y: 200, rotation: -28 },
      },
    },
    {
      layoutId: 'eta2824-scatter-b',
      watchModel: 'caliber-eta-2824',
      description: 'Lateral impact — components scattered across upper movement',
      components: {
        balance_wheel:  { x: 160, y: 148, rotation: -47 },
        pallet_fork:    { x: 175, y: 162, rotation: 33 },
        balance_cock:   { x: 145, y: 155, rotation: -19 },
        escape_wheel:   { x: 170, y: 138, rotation: -5 },
        hour_hand:      { x: 200, y: 200, rotation: -42 },
        minute_hand:    { x: 200, y: 200, rotation: 30 },
      },
    },
  ],

  /**
   * Seiko 7S26 caliber — high-volume Japanese automatic.
   */
  'caliber-seiko-7s26': [
    {
      layoutId: 'seiko7s26-scatter-a',
      watchModel: 'caliber-seiko-7s26',
      description: 'Wrist-level drop — diagonal scatter pattern',
      components: {
        balance_wheel:  { x: 240, y: 158, rotation: 52 },
        pallet_fork:    { x: 255, y: 170, rotation: -30 },
        balance_cock:   { x: 228, y: 145, rotation: 24 },
        hour_hand:      { x: 200, y: 200, rotation: 33 },
        minute_hand:    { x: 200, y: 200, rotation: -22 },
      },
    },
    {
      layoutId: 'seiko7s26-scatter-b',
      watchModel: 'caliber-seiko-7s26',
      description: 'Edge impact — balance staff cracked, components displaced toward 6',
      components: {
        balance_wheel:  { x: 205, y: 272, rotation: -61 },
        pallet_fork:    { x: 192, y: 258, rotation: 18 },
        balance_cock:   { x: 218, y: 280, rotation: 40 },
        hour_hand:      { x: 200, y: 200, rotation: -18 },
        minute_hand:    { x: 200, y: 200, rotation: 44 },
      },
    },
  ],
};

/**
 * Canonical (target) positions for each component — where components must be
 * repositioned to during shock-damage repair. Shared across all models (the
 * movement renderer applies model-specific offsets on top of these).
 *
 * @type {Object.<string, {x:number, y:number, rotation:number}>}
 */
const CANONICAL_POSITIONS = {
  balance_wheel:  { x: 200, y: 200, rotation: 0 },
  pallet_fork:    { x: 200, y: 200, rotation: 0 },
  balance_cock:   { x: 200, y: 200, rotation: 0 },
  escape_wheel:   { x: 200, y: 200, rotation: 0 },
  hour_hand:      { x: 200, y: 200, rotation: 0 },
  minute_hand:    { x: 200, y: 200, rotation: 0 },
};

/** Fallback model key when the requested watch model has no authored layouts. */
const FALLBACK_MODEL = 'caliber-generic';

/**
 * Retrieve the scatter layout for a specific watch model and layout ID.
 *
 * @param {string} watchModel   — watch model identifier (catalog key)
 * @param {string} layoutId     — specific layout to load
 * @returns {Object|null}       — scatter layout object, or null if not found
 */
function getScatterLayout(watchModel, layoutId) {
  const modelLayouts = SCATTER_LAYOUTS[watchModel] || SCATTER_LAYOUTS[FALLBACK_MODEL];
  if (!modelLayouts) return null;
  return modelLayouts.find(l => l.layoutId === layoutId) || null;
}

/**
 * Retrieve all scatter layouts for a watch model.
 * Falls back to the generic caliber if the model has no authored layouts.
 *
 * @param {string} watchModel
 * @returns {Array}
 */
function getScatterLayoutsForModel(watchModel) {
  return SCATTER_LAYOUTS[watchModel] || SCATTER_LAYOUTS[FALLBACK_MODEL] || [];
}

/**
 * Pick a random scatter layout for a watch model.
 * Uses an injectable RNG for deterministic testing.
 *
 * @param {string} watchModel
 * @param {() => number} [rng]  — returns [0, 1); defaults to Math.random
 * @returns {Object|null}
 */
function pickScatterLayout(watchModel, rng = Math.random) {
  const layouts = getScatterLayoutsForModel(watchModel);
  if (!layouts.length) return null;
  const idx = Math.floor(rng() * layouts.length);
  return layouts[idx];
}

/**
 * Returns the canonical position for a component.
 * @param {string} componentId
 * @returns {{x:number, y:number, rotation:number}|null}
 */
function getCanonicalPosition(componentId) {
  return CANONICAL_POSITIONS[componentId] || null;
}

/**
 * Returns all watch models that have authored scatter layouts.
 * @returns {string[]}
 */
function getSupportedWatchModels() {
  return Object.keys(SCATTER_LAYOUTS);
}

module.exports = {
  SCATTER_LAYOUTS,
  CANONICAL_POSITIONS,
  FALLBACK_MODEL,
  getScatterLayout,
  getScatterLayoutsForModel,
  pickScatterLayout,
  getCanonicalPosition,
  getSupportedWatchModels,
};
