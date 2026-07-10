/**
 * FaultSignalConfig — maps fault type IDs to visual signal variants for the loupe overlay.
 *
 * Issue #117 — Scaffolded Fault-Signal System, Phase 1: Loupe Visual Cues
 *
 * Design constraint: This is an EXPLICIT ALLOWLIST.  Components with no matching
 * fault type (including healthy ones) receive NO overlay — there is no implicit
 * default-to-signal path (AC2 / Design mitigation #3).
 *
 * Technical accuracy notes (validated against Wristwatch Revival / TheWatchObsession):
 *   - worn_pivot:        Dry-running brass pivot leaves a warm amber tint at the pivot seat.
 *   - dried_lubricant:   Evaporated oil leaves a white/grey crystalline haze on jewel surfaces.
 *   - cracked_jewel:     Hairline fracture visible as a dark crack line across the jewel face.
 *   - worn_wheel:        Micro-pitting on gear tooth flanks from metal-on-metal contact.
 *   - moisture_damage:   Rust micro-spots from condensation, visible under magnification.
 *   - mainspring_failure: Metal fatigue presents as a dull amber discolouration on the coil.
 *   - escapement_fault:  Surface pitting on the escape wheel tooth profile.
 *   - balance_wheel_fault: Pivot wear tint on the balance staff.
 *
 * AC5 (technical accuracy gate): All variants listed here must be reviewed against
 * watch restoration reference material (Wristwatch Revival, TheWatchObsession) and
 * signed off by QA before the feature ships to any player.
 */

const FAULT_SIGNAL_MAP = {
  worn_pivot: {
    variant: 'faint_amber_tint',
    description: 'Dry brass residue tint at pivot seat — indicates insufficient lubrication or pivot wear',
  },
  dried_lubricant: {
    variant: 'dried_lubricant_haze',
    description: 'Crystalline white/grey haze over jewel surface — evaporated lubricant residue',
  },
  cracked_jewel: {
    variant: 'hairline_crack_overlay',
    description: 'Hairline fracture line across jewel face — impact or thermal stress damage',
  },
  worn_wheel: {
    variant: 'surface_pitting',
    description: 'Micro-pitting texture on gear tooth flanks — metal-on-metal wear pattern',
  },
  moisture_damage: {
    variant: 'corrosion_spotting',
    description: 'Rust micro-spot overlay — condensation corrosion visible under magnification',
  },
  mainspring_failure: {
    variant: 'faint_amber_tint',
    description: 'Metal fatigue discolouration on mainspring coil — brittle or set spring',
  },
  escapement_fault: {
    variant: 'surface_pitting',
    description: 'Wear pitting on escape wheel tooth profile — dried lubricant and friction damage',
  },
  balance_wheel_fault: {
    variant: 'faint_amber_tint',
    description: 'Pivot wear tint on balance staff — dry-running balance pivot',
  },
};

/**
 * Returns the visual signal config for a given fault type ID.
 * Returns null for healthy components or fault types not in the allowlist.
 *
 * @param {string} faultTypeId
 * @returns {{ variant: string, description: string }|null}
 */
function getSignalVariant(faultTypeId) {
  if (!faultTypeId) return null;
  return FAULT_SIGNAL_MAP[faultTypeId] || null;
}

module.exports = { FAULT_SIGNAL_MAP, getSignalVariant };