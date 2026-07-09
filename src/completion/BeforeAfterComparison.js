/**
 * BeforeAfterComparison — completion screen component (AC5 — Issue #81).
 *
 * Responsibilities:
 *   - Produce a structured before/after comparison payload whenever a Phase 1
 *     damage-state watch restoration is completed.
 *   - For standard wear watches (null damage_state), return null — no
 *     comparison is shown (additive feature, not replacing existing completion).
 *   - The comparison payload is consumed by the UI render layer; this module
 *     is purely data-construction (no DOM/canvas dependency) so it is
 *     fully testable in isolation.
 *
 * AC5: Given a player completes the restoration of any Phase 1 damage-state
 * watch, when the completion screen is shown, then a side-by-side or animated
 * before/after visual comparison is displayed that highlights the transformation
 * contrast.
 */

'use strict';

const { DAMAGE_STATE_VISUAL_CUES } = require('../intake/WatchIntake');

/**
 * @typedef {Object} BeforeAfterPayload
 * @property {string}   damageStateId        — Phase 1 damage state identifier
 * @property {string}   damageStateLabel     — human-readable damage state name
 * @property {string}   beforeDescription    — dramatic "before" visual description (thumbnail-worthy)
 * @property {string}   afterDescription     — "after" state description (restored)
 * @property {string[]} beforeCues           — visual cues that were visible before restoration
 * @property {string[]} repairStepsCompleted — ordered repair steps completed
 * @property {string}   displayMode          — 'side_by_side' | 'animated_reveal'
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
};

class BeforeAfterComparison {
  /**
   * Build the completion screen comparison payload for a completed Phase 1 restoration.
   *
   * @param {string|null} damageStateId   — damage state that was repaired (null = standard wear)
   * @param {string[]}    repairStepsDone — the repair steps the player executed, in order
   * @param {string}      [displayMode]   — 'side_by_side' (default) | 'animated_reveal'
   * @returns {BeforeAfterPayload|null}   — null if standard wear (no comparison to show)
   */
  buildPayload(damageStateId, repairStepsDone = [], displayMode = 'side_by_side') {
    if (!damageStateId) {
      return null; // Standard wear completion — no Phase 1 before/after comparison
    }

    const cues = DAMAGE_STATE_VISUAL_CUES[damageStateId];
    if (!cues) {
      return null; // Unknown damage state — defensive null
    }

    return {
      damageStateId,
      damageStateLabel: cues.label,
      beforeDescription: cues.thumbnailDescription,
      afterDescription: AFTER_DESCRIPTIONS[damageStateId] || 'Watch fully restored.',
      beforeCues: cues.externalCues.slice(),
      repairStepsCompleted: repairStepsDone.slice(),
      displayMode: displayMode === 'animated_reveal' ? 'animated_reveal' : 'side_by_side',
    };
  }

  /**
   * Returns true if a given damage state warrants a before/after comparison.
   * Standard wear (null) does not.
   *
   * @param {string|null} damageStateId
   * @returns {boolean}
   */
  shouldShowComparison(damageStateId) {
    return !!damageStateId && !!DAMAGE_STATE_VISUAL_CUES[damageStateId];
  }
}

module.exports = { BeforeAfterComparison, AFTER_DESCRIPTIONS };
