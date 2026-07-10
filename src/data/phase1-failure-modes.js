/**
 * phase1-failure-modes — authored failure mode vocabulary for the 5 Phase 1
 * wrong-tool consequence operations.
 *
 * Issue #295 — Wrong-Tool Consequence System Phase 1
 *
 * Each entry maps an operationId to the failure mode message that appears in
 * DamageRecoveryPrompt when a wrong-tool damage event fires for that operation.
 *
 * Design constraint (from approved design): follows the existing damage-state-hints.js
 * pattern — plain authored data, no runtime logic. Imported by the wiring layer that
 * connects OperationGatingSystem.onWrongTool to DamageEventDetector.
 *
 * Scope gate: ONLY the 5 Phase 1 targeted operations are listed here.
 * Do NOT add operations 6–27 — that is Phase 2 scope.
 *
 * Phase 1 operations and their failure modes (issue-specified vocabulary):
 *   wind-mainspring      — wrong-gauge screwdriver → burred screw head
 *   remove-cannon-pinion — wrong tool on cannon pinion → deformed pinion seat
 *   remove-balance-wheel — incorrect tool on balance wheel → scored balance staff
 *   oil-jewel-seat       — over-application on jewel seat → flooded jewel
 *   set-crown            — tweezers on crown setting → bent crown stem
 */

'use strict';

/**
 * @typedef {{ operationId: string, componentId: string, message: string }} Phase1FailureMode
 */

/** @type {Object.<string, Phase1FailureMode>} */
const PHASE1_FAILURE_MODES = {
  /**
   * Mainspring winding requires the correct flat-blade screwdriver gauge.
   * Using the wrong screwdriver burrs the winding screw head.
   */
  'wind-mainspring': {
    operationId:  'wind-mainspring',
    componentId:  'mainspring',
    message:      'Wrong-gauge screwdriver — screw head is burred.',
  },

  /**
   * Cannon pinion removal requires the rodico/movement-holder for safe extraction.
   * Using the wrong tool deforms the cannon pinion seat.
   */
  'remove-cannon-pinion': {
    operationId:  'remove-cannon-pinion',
    componentId:  'cannon-pinion',
    message:      'Incorrect tool on cannon pinion — pinion seat is deformed.',
  },

  /**
   * Balance wheel removal requires fine-tip tweezers to avoid stressing the staff.
   * Using the wrong tool scores the delicate balance staff.
   */
  'remove-balance-wheel': {
    operationId:  'remove-balance-wheel',
    componentId:  'balance-wheel',
    message:      'Incorrect tool on balance wheel — balance staff is scored.',
  },

  /**
   * Jewel seat oiling requires the oiler/rodico for precise application.
   * Using the wrong tool floods the jewel with excess oil.
   */
  'oil-jewel-seat': {
    operationId:  'oil-jewel-seat',
    componentId:  'jewel-seat',
    message:      'Over-application on jewel seat — jewel is flooded with oil.',
  },

  /**
   * Crown setting requires the hand-setting tool to press evenly without damage.
   * Using tweezers or the wrong tool bends the crown stem.
   */
  'set-crown': {
    operationId:  'set-crown',
    componentId:  'crown-wheel',
    message:      'Wrong tool on crown setting — crown stem is bent.',
  },
};

/**
 * Returns the Phase 1 failure mode for the given operationId, or null if
 * the operation is not in the Phase 1 target set.
 *
 * @param {string} operationId
 * @returns {Phase1FailureMode|null}
 */
function getPhase1FailureMode(operationId) {
  return PHASE1_FAILURE_MODES[operationId] || null;
}

/**
 * Returns all Phase 1 target operation IDs.
 * @returns {string[]}
 */
function getPhase1OperationIds() {
  return Object.keys(PHASE1_FAILURE_MODES);
}

module.exports = { PHASE1_FAILURE_MODES, getPhase1FailureMode, getPhase1OperationIds };
