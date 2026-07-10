/**
 * FaultSignalConfig — fault-type-to-visual-signal-variant mapping.
 *
 * Issue #117 — Scaffolded Fault-Signal System: Phase 1 Loupe Visual Cues.
 *
 * Design contract (Design Decision, Issue #117):
 *   "Fault-signal mapping config uses an explicit allowlist of fault types;
 *    components with no matching fault type (including healthy ones) receive
 *    no overlay — no implicit default-to-signal path."
 *
 * Three signal variants are used to represent different fault categories,
 * selected for technical accuracy against watch restoration reference material
 * (Wristwatch Revival, TheWatchObsession):
 *
 *   faint-tint            — used for mechanical fatigue / deformation faults
 *                           (worn pivots, lost spring tension, slipped friction fits)
 *   texture-overlay       — used for contamination / substance faults
 *                           (dried lubricant, corrosion, oxidation tarnish)
 *   material-differentiation — used for structural damage / physical fracture faults
 *                           (cracked jewels, crystal crazing, crown/stem wear)
 *
 * IMPORTANT: Only fault types listed here receive a visual signal.
 * Healthy components (faultType === null / undefined / '') and any fault type
 * not on this list resolve to null — no overlay is applied.
 *
 * Technical accuracy note (AC5):
 *   Each fault-to-variant mapping below was selected to match observable
 *   physical characteristics of real fault states:
 *     - worn_pivot / mainspring_failure / balance_wheel_fault: mechanical
 *       deformation is represented by a faint colour tint signalling a subtle
 *       physical change in the part's geometry.
 *     - dried_lubricant / cannon_pinion_slip / date_mechanism_fault /
 *       water_ingress_damage: substance-level contamination is represented by
 *       a texture overlay that suggests gumminess, scale, or residue without
 *       specifying the substance type.
 *     - cracked_jewel / crown_stem_fault / oxidation_tarnish_damage /
 *       crystal_crazing_damage: structural fracture or surface degradation is
 *       represented by material differentiation, which conveys a change in the
 *       part's reflective or surface properties consistent with cracking or
 *       tarnishing.
 *   Pre-ship QA review against reference material is a blocking gate (AC5).
 */

const FAULT_SIGNAL_MAP = {
  // Mechanical deformation / fatigue → faint-tint
  worn_pivot:           'faint-tint',
  mainspring_failure:   'faint-tint',
  balance_wheel_fault:  'faint-tint',

  // Contamination / substance faults → texture-overlay
  dried_lubricant:      'texture-overlay',
  cannon_pinion_slip:   'texture-overlay',
  date_mechanism_fault: 'texture-overlay',
  water_ingress_damage: 'texture-overlay',

  // Structural damage / surface fracture → material-differentiation
  cracked_jewel:           'material-differentiation',
  crown_stem_fault:        'material-differentiation',
  oxidation_tarnish_damage:'material-differentiation',
  crystal_crazing_damage:  'material-differentiation',
  escapement_fault:        'material-differentiation',
};

/** All valid signal variant identifiers. */
const VALID_SIGNAL_VARIANTS = ['faint-tint', 'texture-overlay', 'material-differentiation'];

/**
 * Returns the signal variant for a given fault type ID, or null if not on the
 * allowlist (including healthy components with a null/undefined/empty faultType).
 *
 * @param {string|null|undefined} faultType
 * @returns {'faint-tint'|'texture-overlay'|'material-differentiation'|null}
 */
function getSignalVariant(faultType) {
  if (!faultType) return null;
  return FAULT_SIGNAL_MAP[faultType] || null;
}

/**
 * Returns true if the given fault type appears on the allowlist.
 *
 * @param {string} faultType
 * @returns {boolean}
 */
function isKnownFaultType(faultType) {
  return Object.prototype.hasOwnProperty.call(FAULT_SIGNAL_MAP, faultType);
}

/**
 * Returns all fault type IDs that have an authored signal.
 * @returns {string[]}
 */
function getAllSignaledFaultTypes() {
  return Object.keys(FAULT_SIGNAL_MAP);
}

module.exports = {
  FAULT_SIGNAL_MAP,
  VALID_SIGNAL_VARIANTS,
  getSignalVariant,
  isKnownFaultType,
  getAllSignaledFaultTypes,
};
