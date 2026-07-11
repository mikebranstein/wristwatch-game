/**
 * damage-state-hints — authored hint content for Phase 1 and Phase 2 damage-state faults.
 *
 * Follows the exact same 3-tier pattern as fault-hints.js.
 * Registered as a standalone data file so damage-state hints can be imported
 * independently or merged with FAULT_HINTS at game-startup time.
 *
 * Each fault entry has 3 tiers:
 *   tier1 — subtle nudge (points the player in a direction without spoiling)
 *   tier2 — directional clue (narrows to the damage-state subsystem)
 *   tier3 — explicit guided solution (tells the player exactly what to do)
 *
 * Issue #81 (Phase 1): water_ingress_damage, oxidation_tarnish_damage,
 * crystal_crazing_damage.
 *
 * Issue #84 (Phase 2): shock_damage_fault, rust_fused_fasteners_fault.
 */

'use strict';

const DAMAGE_STATE_HINTS = {
  water_ingress_damage: {
    fault_id: 'water_ingress_damage',
    tier1: "Something has invaded this movement from outside. Moisture leaves its mark on metal.",
    tier2: "Water ingress causes blue-green verdigris corrosion on brass plates and poisons the lubricant. The crown seal has likely failed — check the gasket and crown before opening the movement.",
    tier3: "Disassemble fully and apply the corrosion cleaning tool to all brass plates showing verdigris. Replace the failed crown and gasket. Use the crystal defogging solution on the inside crystal face. Re-lubricate all pivot points after cleaning.",
  },
  oxidation_tarnish_damage: {
    fault_id: 'oxidation_tarnish_damage',
    tier1: "Time has not been kind to this watch's finish. The case tells the story before you even open it.",
    tier2: "Heavy oxidation tarnishes the case metal and dial. Inside, lubricant has crystallised into a gummy residue that slows or stops the escapement. The movement needs a full strip-down and clean.",
    tier3: "Polish the case exterior to remove tarnish. Restore the dial surface using the dial restoration tool. Strip the movement completely, dissolve the crystallised lubricant in cleaning solution, and apply fresh lubrication to all jewels and pivot points.",
  },
  crystal_crazing_damage: {
    fault_id: 'crystal_crazing_damage',
    tier1: "You can see the problem from across the bench — look at the watch face.",
    tier2: "The mineral crystal has shattered or crazed, with hairline fractures spreading across the dial enamel beneath. The crystal must be replaced before the dial damage worsens.",
    tier3: "Remove the damaged crystal and replace it with a correctly sized mineral crystal. Repair the hairline fractures in the dial enamel using the dial enamel repair tool. Run a timing regulation check after reassembly to confirm no shock damage to the balance staff.",
  },
  // ── Phase 2 hints (Issue #84) ──────────────────────────────────────────────
  shock_damage_fault: {
    fault_id: 'shock_damage_fault',
    tier1: "This movement took a hit. Not everything inside is where it should be.",
    tier2: "A physical impact has scattered components across the movement plate and bent one or more hands off-axis. The balance staff is likely cracked. You'll need to straighten the hands before you can reposition everything else.",
    tier3: "Use the bent-hand straightening tool on every misaligned hand first. Then perform a component inventory check — displaced components must be moved back to their canonical positions. Replace the cracked balance staff, then run timing regulation to confirm the repair.",
  },
  rust_fused_fasteners_fault: {
    fault_id: 'rust_fused_fasteners_fault',
    tier1: "The case back isn't budging. Something is stopping standard disassembly.",
    tier2: "One or more fasteners have corroded solid — the rust has bonded the screw head to the case metal. Standard driver tools can't get purchase on a fused head; you need a different approach.",
    tier3: "Apply the penetrant applicator to each fused fastener and allow it to work into the rust bond. Once treated, use the fastener extractor to remove the corroded fasteners. Proceed with standard disassembly, then replace all extracted fasteners with fresh ones on reassembly.",
  },
};

/**
 * Returns the hint object for a given damage-state fault ID.
 * Returns null if the fault is not found.
 *
 * @param {string} faultId
 * @returns {{fault_id: string, tier1: string, tier2: string, tier3: string}|null}
 */
function getDamageStateHints(faultId) {
  return DAMAGE_STATE_HINTS[faultId] || null;
}

/**
 * Returns all authored damage-state fault IDs.
 * @returns {string[]}
 */
function getAllDamageStateFaultIds() {
  return Object.keys(DAMAGE_STATE_HINTS);
}

module.exports = { DAMAGE_STATE_HINTS, getDamageStateHints, getAllDamageStateFaultIds };
