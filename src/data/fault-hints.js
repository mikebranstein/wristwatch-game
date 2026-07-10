/**
 * fault-hints — authored hint content for each diagnosable fault.
 *
 * Each fault entry has 3 tiers:
 *   tier1 — subtle nudge (points the player in a direction without spoiling)
 *   tier2 — directional clue (narrows the search to a subsystem)
 *   tier3 — explicit guided solution (tells the player exactly what to inspect)
 *
 * All copy is authored here; NO procedurally generated content is permitted
 * per the content constraint.
 */

const FAULT_HINTS = {
  mainspring_failure: {
    fault_id: 'mainspring_failure',
    tier1: "Something in the power train isn't doing its job. Look at where energy is stored.",
    tier2: "The mainspring is responsible for storing and releasing the energy that drives the watch. Check if it's wound and intact.",
    tier3: "Inspect the mainspring barrel. If the mainspring is broken or has lost tension, the watch has no driving force. Replace or re-tension the mainspring to restore power.",
  },
  escapement_fault: {
    fault_id: 'escapement_fault',
    tier1: "The watch seems to stop and start unpredictably. Think about the part that controls the release of energy.",
    tier2: "The escapement — specifically the pallet fork and escape wheel — governs how energy is released in precise ticks. Look for wear or misalignment here.",
    tier3: "Examine the pallet fork jewels and the escape wheel teeth. Chipped jewels, bent teeth, or incorrect endshake will cause erratic timekeeping or total stoppage. Clean and re-jewel if needed.",
  },
  balance_wheel_fault: {
    fault_id: 'balance_wheel_fault',
    tier1: "Time accuracy is off. The regulating organ may need attention.",
    tier2: "The balance wheel and hairspring together control the beat rate of the watch. An uneven swing or a distorted hairspring causes gain or loss.",
    tier3: "Check the balance wheel for physical damage and inspect the hairspring for kinks, coil touching, or stud displacement. Adjust the regulator or replace the hairspring to correct the rate.",
  },
  crown_stem_fault: {
    fault_id: 'crown_stem_fault',
    tier1: "The crown isn't responding correctly. The issue may be mechanical rather than electronic.",
    tier2: "The crown engages the time-setting and winding mechanisms via the stem. If it spins freely or won't pull out, the stem or setting lever may be the culprit.",
    tier3: "Remove the case back and locate the setting lever and stem. Look for a worn or broken click on the stem, or a setting lever spring that has lost tension. Replace the stem or re-tension the lever spring.",
  },
  cannon_pinion_slip: {
    fault_id: 'cannon_pinion_slip',
    tier1: "The hands aren't tracking with the movement. Something between the dial train and the hands may have slipped.",
    tier2: "The cannon pinion grips the center wheel arbor with friction to drive the minute hand. If it slips, the hands will lag or stop while the movement continues.",
    tier3: "Remove the dial and locate the cannon pinion on the center wheel arbor. Gently tighten the friction fit with a cannon pinion tool. Reinstall and verify the hands advance correctly.",
  },
  date_mechanism_fault: {
    fault_id: 'date_mechanism_fault',
    tier1: "The date isn't advancing at midnight like it should. Check the calendar mechanism.",
    tier2: "The date disc is driven by the date driving wheel and held in place between advances by the date jumper spring. A worn tooth or weak jumper spring can cause the date to skip or stick.",
    tier3: "Inspect the date disc teeth, date jumper, and date driving wheel. Replace any worn components and ensure the date jumper spring provides adequate tension to snap the disc cleanly at midnight.",
  },
  water_ingress_damage: {
    fault_id: 'water_ingress_damage',
    tier1: "Something has invaded this movement from outside. Moisture leaves its mark on metal.",
    tier2: "Water ingress causes blue-green verdigris corrosion on brass plates and poisons the lubricant. The crown seal has likely failed — check the gasket and crown before opening the movement.",
    tier3: "Disassemble fully and apply the corrosion cleaning tool to all brass plates showing verdigris. Replace the failed crown and gasket. Use the crystal defogging solution on the inside crystal face. Relubricant all pivot points after cleaning.",
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
  magnetism_fault: {
    fault_id: 'magnetism_fault',
    tier1: "The watch is running fast but everything looks intact. This fault leaves no visible trace on the movement.",
    tier2: "Magnetism causes the hairspring coils to attract each other, shortening the effective length and raising the beat rate. Hold a compass next to the movement — a deflection confirms magnetisation.",
    tier3: "Use the demagnetizer to demagnetise the movement. Pass the watch slowly through the demagnetizer field, then withdraw it gradually. Re-time the watch after demagnetisation to confirm the rate has returned to normal.",
  },
};

/**
 * Returns the hint object for a given fault ID.
 * Returns null if the fault is not found.
 *
 * @param {string} faultId
 * @returns {{fault_id: string, tier1: string, tier2: string, tier3: string}|null}
 */
function getHintsForFault(faultId) {
  return FAULT_HINTS[faultId] || null;
}

/**
 * Returns all authored fault IDs.
 * @returns {string[]}
 */
function getAllFaultIds() {
  return Object.keys(FAULT_HINTS);
}

module.exports = { FAULT_HINTS, getHintsForFault, getAllFaultIds };
