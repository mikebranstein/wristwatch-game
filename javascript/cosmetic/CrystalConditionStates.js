/**
 * CrystalConditionStates — static data and utilities for crystal condition states.
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2
 *
 * Responsibilities:
 *   - Define the three crystal condition states: scratched, cracked, clean.
 *   - Provide per-state shader/texture asset keys for mesh material swaps.
 *   - Expose a helper to derive crystal_condition from watch condition data.
 *   - Provide the extensible part-condition data model so Phase 3 (case
 *     polishing) can adopt the same structure without a breaking change.
 *
 * Design contract — extensibility:
 *   The PART_CONDITION_REGISTRY maps part type → condition states. Phase 3 can
 *   register 'case' without touching CrystalConditionStates — it extends the
 *   same data model rather than replacing it.
 *
 * Constraint: condition states driven by texture/shader swap on the existing
 *   crystal mesh — no new rigging required. (Design AC, Constraints section)
 */

'use strict';

// ── Crystal condition state identifiers ──────────────────────────────────────

/** @type {string[]} */
const CRYSTAL_CONDITION_IDS = ['scratched', 'cracked', 'clean'];

/**
 * @typedef {Object} CrystalConditionState
 * @property {string} id          — state identifier ('scratched' | 'cracked' | 'clean')
 * @property {string} assetKey    — shader/texture asset key applied to the crystal mesh
 * @property {string} label       — human-readable display label
 * @property {string} description — short description used in before/after display
 * @property {boolean} needsReplacement — true when the player should be offered a replacement
 */

/** @type {CrystalConditionState[]} */
const CRYSTAL_CONDITION_CATALOGUE = [
  {
    id: 'scratched',
    assetKey: 'crystal_scratched',
    label: 'Scratched Crystal',
    description: 'Surface scratch marks visible across the crystal face.',
    needsReplacement: true,
  },
  {
    id: 'cracked',
    assetKey: 'crystal_cracked',
    label: 'Cracked Crystal',
    description: 'Visible fracture lines across the crystal — significant damage.',
    needsReplacement: true,
  },
  {
    id: 'clean',
    assetKey: 'crystal_clean',
    label: 'Clean Crystal',
    description: 'Crystal is clear and undamaged — no replacement needed.',
    needsReplacement: false,
  },
];

/** @type {Map<string, CrystalConditionState>} */
const _BY_ID = new Map(CRYSTAL_CONDITION_CATALOGUE.map((s) => [s.id, s]));

// ── Part-condition data model (extensible — Phase 3 uses same structure) ─────

/**
 * @typedef {Object} PartConditionDescriptor
 * @property {string}   partType   — e.g. 'crystal', 'case' (Phase 3)
 * @property {string[]} stateIds   — ordered list of valid state identifiers for this part
 * @property {string}   defaultId  — fallback state when watch data lacks a condition value
 */

/** @type {Map<string, PartConditionDescriptor>} */
const PART_CONDITION_REGISTRY = new Map([
  [
    'crystal',
    {
      partType: 'crystal',
      stateIds: CRYSTAL_CONDITION_IDS,
      defaultId: 'clean',
    },
  ],
  // Phase 3 — case polishing registers here:
  // ['case', { partType: 'case', stateIds: ['oxidised', 'scratched', 'polished'], defaultId: 'oxidised' }],
]);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the CrystalConditionState for the given id, or null if unknown.
 * @param {string} conditionId
 * @returns {CrystalConditionState|null}
 */
function getCrystalConditionState(conditionId) {
  return _BY_ID.get(conditionId) || null;
}

/**
 * Returns the clean condition state (the replacement target state).
 * @returns {CrystalConditionState}
 */
function getCleanCrystalState() {
  return _BY_ID.get('clean');
}

/**
 * Derives the crystal_condition from watch data.
 *
 * AC7 (edge case): if the watch data has no crystal_condition field or an
 * unrecognised value, defaults gracefully to 'clean' — no crash.
 *
 * @param {Object|null} watchData — raw watch entry data (may be null/undefined)
 * @returns {CrystalConditionState}
 */
function resolveCrystalCondition(watchData) {
  const raw = watchData && watchData.crystal_condition;
  if (raw && _BY_ID.has(raw)) {
    return _BY_ID.get(raw);
  }
  // AC7: missing/unknown condition → default to 'clean' gracefully
  return _BY_ID.get('clean');
}

/**
 * Returns all crystal condition states (ordered: scratched, cracked, clean).
 * @returns {CrystalConditionState[]}
 */
function getAllCrystalConditionStates() {
  return [...CRYSTAL_CONDITION_CATALOGUE];
}

/**
 * Returns the PartConditionDescriptor for a given part type.
 * Returns null if the part type is not registered.
 * Used by Phase 3 to adopt the same extensible data model.
 *
 * @param {string} partType
 * @returns {PartConditionDescriptor|null}
 */
function getPartConditionDescriptor(partType) {
  return PART_CONDITION_REGISTRY.get(partType) || null;
}

module.exports = {
  CRYSTAL_CONDITION_IDS,
  CRYSTAL_CONDITION_CATALOGUE,
  PART_CONDITION_REGISTRY,
  getCrystalConditionState,
  getCleanCrystalState,
  resolveCrystalCondition,
  getAllCrystalConditionStates,
  getPartConditionDescriptor,
};
