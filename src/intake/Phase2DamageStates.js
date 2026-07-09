/**
 * Phase2DamageStates — authored data for Phase 2 mechanical-complexity damage states.
 *
 * Issue #84: Watch Damage State Variety — Phase 2 (Shock Damage & Rust-Fused Fasteners).
 *
 * Two mechanically distinct damage archetypes:
 *   1. shock_damage     — scattered/displaced components, bent hands, cracked balance staff.
 *                         Requires: bent-hand straightening tool + component repositioning.
 *   2. rust_fused_fasteners — one or more fasteners rust-fused; standard disassembly blocked.
 *                         Requires: penetrant applicator → fastener extractor → standard path.
 *
 * Follows the same visual-cue descriptor pattern as Phase 1 damage states in WatchIntake.js.
 * These entries are registered additively alongside Phase 1 states in the WatchIntake pool.
 */

'use strict';

/** @type {string[]} */
const PHASE2_DAMAGE_STATES = ['shock_damage', 'rust_fused_fasteners'];

/**
 * Visual cue descriptors for Phase 2 damage states.
 * Mirrors the DAMAGE_STATE_VISUAL_CUES structure in WatchIntake.js.
 *
 * Each entry provides:
 *   externalCues       — visible on exterior before opening (intake/inspection view)
 *   diagnosticSignature — what the player observes to identify the type at intake
 *   repairPath         — ordered steps required to complete the repair (no softlocks)
 *   thumbnailDescription — dramatic "before" description for the completion screen
 *   requiredPartIds    — tool/part IDs required (drives conditional tool injection)
 *   faultHintId        — maps to damage-state-hints.js authored hint content
 */
const PHASE2_DAMAGE_STATE_CUES = {
  shock_damage: {
    id: 'shock_damage',
    label: 'Shock Damage',
    externalCues: [
      'Visible dent or deformation on case exterior at impact point',
      'Hands misaligned — one or both hands visibly bent or off-axis through crystal',
      'Movement completely stopped; no tick audible even after crown wind',
    ],
    diagnosticSignature:
      'Visible case deformation on exterior inspection; movement reveal shows scattered/displaced ' +
      'components and at least one bent hand in non-standard position',
    repairPath: [
      'inspect_movement_for_scattered_components',
      'use_bent_hand_straightening_tool',
      'reposition_all_displaced_components',
      'replace_cracked_balance_staff',
      'run_timing_regulation',
    ],
    thumbnailDescription:
      'Dented case exterior with visibly bent hands through crystal; movement interior shows ' +
      'scattered components and cracked balance staff in dramatic disarray',
    requiredPartIds: [
      'bent-hand-straightening-tool',
      'balance-staff-replacement',
    ],
    faultHintId: 'shock_damage_fault',
  },

  rust_fused_fasteners: {
    id: 'rust_fused_fasteners',
    label: 'Rust-Fused Fasteners',
    externalCues: [
      'Brown-orange rust staining around case back fastener heads',
      'One or more case screws show discolouration consistent with active corrosion',
      'Case back slightly proud — metal expansion from rust has loosened fit tolerances',
    ],
    diagnosticSignature:
      'Rust staining at case fastener heads visible on exterior inspection; standard case-back ' +
      'removal attempt blocked — fasteners resist tool engagement',
    repairPath: [
      'inspect_fasteners_for_corrosion',
      'apply_penetrant_to_fused_fasteners',
      'use_fastener_extractor_tool',
      'complete_standard_disassembly',
      'replace_fused_fasteners_on_reassembly',
    ],
    thumbnailDescription:
      'Case back with heavy rust staining at fastener heads; orange-brown corrosion bloom ' +
      'spreading from screw seats indicating long-term moisture ingress at the case seam',
    requiredPartIds: [
      'penetrant-applicator',
      'fastener-extractor',
      'fastener-replacement-set',
    ],
    faultHintId: 'rust_fused_fasteners_fault',
  },
};

/**
 * Default designer-configurable intake weights for Phase 2 states.
 * These are added to the combined pool when Phase 2 is active.
 * Weights are relative and normalised at runtime alongside Phase 1 weights.
 */
const PHASE2_DEFAULT_WEIGHTS = {
  shock_damage: 1.0,
  rust_fused_fasteners: 1.0,
};

/**
 * Returns the Phase 2 visual cue descriptor for a damage state ID, or null.
 *
 * @param {string} damageStateId
 * @returns {Object|null}
 */
function getPhase2VisualCues(damageStateId) {
  return PHASE2_DAMAGE_STATE_CUES[damageStateId] || null;
}

/**
 * Returns all Phase 2 damage state descriptors.
 * @returns {Object[]}
 */
function getAllPhase2DamageStateDescriptors() {
  return PHASE2_DAMAGE_STATES.map(id => PHASE2_DAMAGE_STATE_CUES[id]);
}

/**
 * Returns true if the damage state ID is a Phase 2 state.
 * @param {string} damageStateId
 * @returns {boolean}
 */
function isPhase2DamageState(damageStateId) {
  return PHASE2_DAMAGE_STATES.includes(damageStateId);
}

module.exports = {
  PHASE2_DAMAGE_STATES,
  PHASE2_DAMAGE_STATE_CUES,
  PHASE2_DEFAULT_WEIGHTS,
  getPhase2VisualCues,
  getAllPhase2DamageStateDescriptors,
  isPhase2DamageState,
};
