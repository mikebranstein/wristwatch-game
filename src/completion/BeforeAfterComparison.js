/**
 * BeforeAfterComparison — completion screen component (AC5 — Issue #81, AC3 — Issue #84).
 *
 * Responsibilities:
 *   - Produce a structured before/after comparison payload whenever a damage-state
 *     watch restoration is completed (Phase 1 or Phase 2).
 *   - For standard wear watches (null damage_state), return null — no
 *     comparison is shown (additive feature, not replacing existing completion).
 *   - Phase 2 (Issue #84 AC3): For shock_damage, the before/after payload prominently
 *     features the scattered-component "before" state using the pre_repair_scatter_snapshot
 *     captured at watch acceptance (RepairSessionRecord.getPreRepairScatterSnapshot()).
 *   - The comparison payload is consumed by the UI render layer; this module
 *     is purely data-construction (no DOM/canvas dependency) so it is
 *     fully testable in isolation.
 *
 * AC5 (Issue #81): Given a player completes the restoration of any Phase 1 damage-state
 * watch, when the completion screen is shown, then a side-by-side or animated
 * before/after visual comparison is displayed that highlights the transformation contrast.
 *
 * AC3 (Issue #84): Given a player completes a Shock Damage restoration, when the
 * completion screen is shown, then a before/after comparison is displayed that
 * prominently features the scattered-component "before" state.
 */

'use strict';

const { ALL_DAMAGE_STATE_VISUAL_CUES } = require('../intake/WatchIntake');

/**
 * @typedef {Object} BeforeAfterPayload
 * @property {string}   damageStateId        — damage state identifier (Phase 1 or Phase 2)
 * @property {string}   damageStateLabel     — human-readable damage state name
 * @property {string}   beforeDescription    — dramatic "before" visual description (thumbnail-worthy)
 * @property {string}   afterDescription     — "after" state description (restored)
 * @property {string[]} beforeCues           — visual cues that were visible before restoration
 * @property {string[]} repairStepsCompleted — ordered repair steps completed
 * @property {string}   displayMode          — 'side_by_side' | 'animated_reveal'
 * @property {Object|null} scatterSnapshot   — Phase 2 only: pre-repair scatter snapshot for shock_damage
 * @property {boolean}  isPhase2             — true for Phase 2 damage states
 */

/**
 * After-state descriptions for each Phase 1 damage type.
 * Authored for maximum contrast against the "before" thumbnail description.
 */
const AFTER_DESCRIPTIONS = {
  water_ingress: (
    'Movement fully cleaned: brass plates gleam under loupe, crystal crystal-clear, ' +
    'new crown seated with fresh gasket, all lubricants refreshed — movement runs clean.'
  ),
  oxidation: (
    'Case metal polished to a warm lustre, dial restored and legible, ' +
    'movement stripped and re-lubricated — escapement beats crisply at full amplitude.'
  ),
  crystal_crazing: (
    'New mineral crystal fitted perfectly clear, dial enamel fractures repaired and smooth, ' +
    'timing regulation verified — watch reads accurately and looks showroom-ready.'
  ),
  // Phase 2 after-state descriptions (Issue #84)
  shock_damage: (
    'Case dent smoothed, all displaced components precisely repositioned in canonical locations, ' +
    'bent hands straightened and re-fitted, cracked balance staff replaced — movement beats ' +
    'steadily at full amplitude, transformation from disarray to precision is striking.'
  ),
  rust_fused_fasteners: (
    'All corroded fasteners extracted and replaced with fresh stainless fasteners, ' +
    'case back sealed cleanly — movement serviced through the now-accessible case back, ' +
    'no trace of the rust staining that was visible at intake.'
  ),
};

/** Phase 2 damage state IDs that support scatter snapshot rendering. */
const PHASE2_SCATTER_STATES = ['shock_damage'];

class BeforeAfterComparison {
  /**
   * Build the completion screen comparison payload for a completed damage-state restoration.
   * Supports both Phase 1 and Phase 2 damage states.
   *
   * @param {string|null} damageStateId      — damage state that was repaired (null = standard wear)
   * @param {string[]}    repairStepsDone    — the repair steps the player executed, in order
   * @param {string}      [displayMode]      — 'side_by_side' (default) | 'animated_reveal'
   * @param {Object|null} [scatterSnapshot]  — Phase 2: pre-repair scatter snapshot from RepairSessionRecord
   * @returns {BeforeAfterPayload|null}      — null if standard wear (no comparison to show)
   */
  buildPayload(damageStateId, repairStepsDone = [], displayMode = 'side_by_side', scatterSnapshot = null) {
    if (!damageStateId) {
      return null; // Standard wear completion — no before/after comparison
    }

    const cues = ALL_DAMAGE_STATE_VISUAL_CUES[damageStateId];
    if (!cues) {
      return null; // Unknown damage state — defensive null
    }

    const isPhase2 = PHASE2_SCATTER_STATES.includes(damageStateId) ||
      damageStateId === 'rust_fused_fasteners';

    // For shock_damage: include the scatter snapshot so the renderer can show
    // the scattered-component "before" state prominently (AC3 — Issue #84).
    const resolvedScatterSnapshot =
      PHASE2_SCATTER_STATES.includes(damageStateId) ? (scatterSnapshot || null) : null;

    return {
      damageStateId,
      damageStateLabel: cues.label,
      beforeDescription: cues.thumbnailDescription,
      afterDescription: AFTER_DESCRIPTIONS[damageStateId] || 'Watch fully restored.',
      beforeCues: cues.externalCues.slice(),
      repairStepsCompleted: repairStepsDone.slice(),
      displayMode: displayMode === 'animated_reveal' ? 'animated_reveal' : 'side_by_side',
      scatterSnapshot: resolvedScatterSnapshot,
      isPhase2,
    };
  }

  /**
   * Returns true if a given damage state warrants a before/after comparison.
   * Standard wear (null) does not.
   * Covers both Phase 1 and Phase 2 states.
   *
   * @param {string|null} damageStateId
   * @returns {boolean}
   */
  shouldShowComparison(damageStateId) {
    return !!damageStateId && !!ALL_DAMAGE_STATE_VISUAL_CUES[damageStateId];
  }

  /**
   * Returns true when the before/after payload should feature scattered-component
   * rendering (Phase 2 shock_damage only — AC3).
   *
   * @param {string|null} damageStateId
   * @returns {boolean}
   */
  requiresScatterSnapshot(damageStateId) {
    return PHASE2_SCATTER_STATES.includes(damageStateId || '');
  }
}

module.exports = { BeforeAfterComparison, AFTER_DESCRIPTIONS, PHASE2_SCATTER_STATES };
