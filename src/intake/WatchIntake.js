/**
 * WatchIntake — assigns Phase 1 damage states to incoming watches at intake.
 *
 * Responsibilities (AC1 — Issue #81):
 *   - Randomly assign a Phase 1 damage state (water_ingress, oxidation,
 *     crystal_crazing) to an incoming watch based on designer-configurable
 *     intake rate and per-type weights.
 *   - Provide the external visual cue descriptor for the damage state so the
 *     intake/inspection UI can render the appropriate "before" visuals.
 *   - Null damage_state (standard wear) must remain the majority case —
 *     Phase 1 states are additive, not replacing existing standard degradation.
 *
 * Design constraints:
 *   - Intake rate ≥ 20% (AC1).  Default config uses 25%.
 *   - Weights are normalised at runtime; designers control relative probability.
 *   - Standard wear path must be preserved: null damage_state = no Phase 1 state.
 *   - Accepts an injectable RNG for deterministic testing.
 */

'use strict';

/** @type {string[]} */
const PHASE1_DAMAGE_STATES = ['water_ingress', 'oxidation', 'crystal_crazing'];

/**
 * Visual cue descriptors shown at intake/inspection before full disassembly (AC1).
 * Each entry provides:
 *   externalCues  — cues visible on the exterior before opening
 *   diagnosticSignature — what the player observes at inspection to identify the type
 *   repairPath    — ordered steps required to complete the repair (no softlocks — AC2/3/4)
 */
const DAMAGE_STATE_VISUAL_CUES = {
  water_ingress: {
    id: 'water_ingress',
    label: 'Water Ingress / Verdigris',
    externalCues: [
      'Moisture condensation fog on inner crystal face',
      'Crown feels loose or turns without resistance',
      'Blue-green staining visible around crown tube',
    ],
    diagnosticSignature: 'Movement stops or stutters; blue-green verdigris corrosion visible on brass plates under inspection',
    repairPath: [
      'apply_corrosion_cleaning_tool',
      'replace_crown_and_gasket',
      'apply_crystal_defogging_solution',
      'relubricant_all_pivot_points',
    ],
    thumbnailDescription: 'Heavy blue-green verdigris bloom across brass movement plates with fogged crystal',
    requiredPartIds: ['corrosion-cleaning-tool', 'gasket-universal', 'crystal-defogging-solution'],
    faultHintId: 'water_ingress_damage',
  },
  oxidation: {
    id: 'oxidation',
    label: 'Oxidation / Tarnish',
    externalCues: [
      'Deep brown-black patination across case metal surfaces',
      'Dial surface shows brown deterioration and loss of lustre',
      'Movement is sluggish or fully stopped',
    ],
    diagnosticSignature: 'Tarnished case exterior; crystallised lubricant deposits visible on movement plates at inspection',
    repairPath: [
      'polish_case_exterior',
      'restore_dial_surface',
      'full_movement_cleaning',
      'apply_fresh_lubrication',
    ],
    thumbnailDescription: 'Heavily tarnished case with brown-black patination and deteriorated dial',
    requiredPartIds: ['case-polish-compound', 'dial-restoration-kit'],
    faultHintId: 'oxidation_tarnish_damage',
  },
  crystal_crazing: {
    id: 'crystal_crazing',
    label: 'Crystal Crazing',
    externalCues: [
      'Shattered or deeply crazed mineral crystal',
      'Hairline fractures spreading from crystal impact point into dial enamel',
      'Dial damage visible through fractured crystal face',
    ],
    diagnosticSignature: 'Cracked crystal prominent on case inspection; dial enamel hairline fractures detected on movement reveal',
    repairPath: [
      'replace_crystal',
      'repair_dial_enamel',
      'run_timing_regulation_check',
    ],
    thumbnailDescription: 'Dramatically shattered crystal with spiderweb crazing and hairline dial fractures visible underneath',
    requiredPartIds: ['crystal-mineral-universal', 'dial-enamel-repair-tool'],
    faultHintId: 'crystal_crazing_damage',
  },
};

/**
 * Default designer-configurable settings (mirrors damage_state_config.py pattern).
 * @typedef {{intakeRate: number, weights: Object.<string, number>}} IntakeConfig
 */
const DEFAULT_INTAKE_CONFIG = {
  intakeRate: 0.25,   // 25% of incoming watches — satisfies AC1 ≥20% requirement
  weights: {
    water_ingress: 1.0,
    oxidation: 1.0,
    crystal_crazing: 1.0,
  },
};

class WatchIntake {
  /**
   * @param {IntakeConfig} [config]  — designer-configurable intake settings
   * @param {() => number} [rng]    — injectable RNG (default: Math.random); returns [0, 1)
   */
  constructor(config = DEFAULT_INTAKE_CONFIG, rng = Math.random) {
    this._config = { ...DEFAULT_INTAKE_CONFIG, ...config };
    this._rng = rng;
  }

  /**
   * Assign a damage state to an incoming watch.
   *
   * Returns null for standard wear (majority case) or a damage state ID string.
   * AC1: Phase 1 states appear at intakeRate (default 25%) of intake events.
   *
   * @returns {string|null}  damage state ID or null
   */
  assignDamageState() {
    if (this._rng() >= this._config.intakeRate) {
      return null; // Standard wear — no Phase 1 damage state
    }
    return this._selectWeightedDamageState();
  }

  /**
   * Returns the visual cue descriptor for a damage state ID, or null for standard wear.
   *
   * @param {string|null} damageStateId
   * @returns {Object|null}
   */
  getVisualCues(damageStateId) {
    if (!damageStateId) return null;
    return DAMAGE_STATE_VISUAL_CUES[damageStateId] || null;
  }

  /**
   * Returns all Phase 1 damage state descriptors (for intake UI registration).
   * @returns {Object[]}
   */
  getAllDamageStateDescriptors() {
    return PHASE1_DAMAGE_STATES.map(id => DAMAGE_STATE_VISUAL_CUES[id]);
  }

  /**
   * Returns the repair path step IDs for a given damage state.
   * Returns an empty array for null/standard-wear.
   *
   * @param {string|null} damageStateId
   * @returns {string[]}
   */
  getRepairPath(damageStateId) {
    if (!damageStateId) return [];
    return (DAMAGE_STATE_VISUAL_CUES[damageStateId] || {}).repairPath || [];
  }

  /**
   * Returns the required part IDs for a damage state repair path.
   * Returns an empty array for null/standard-wear.
   *
   * @param {string|null} damageStateId
   * @returns {string[]}
   */
  getRequiredPartIds(damageStateId) {
    if (!damageStateId) return [];
    return (DAMAGE_STATE_VISUAL_CUES[damageStateId] || {}).requiredPartIds || [];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Weighted random selection across Phase 1 damage states.
   * @returns {string}
   */
  _selectWeightedDamageState() {
    const weights = this._config.weights;
    const states = PHASE1_DAMAGE_STATES.filter(id => (weights[id] || 0) > 0);
    const total = states.reduce((sum, id) => sum + (weights[id] || 0), 0);

    let roll = this._rng() * total;
    for (const id of states) {
      roll -= weights[id] || 0;
      if (roll <= 0) return id;
    }
    return states[states.length - 1]; // fallback: last entry
  }
}

module.exports = { WatchIntake, PHASE1_DAMAGE_STATES, DAMAGE_STATE_VISUAL_CUES, DEFAULT_INTAKE_CONFIG };
