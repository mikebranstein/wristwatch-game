/**
 * symptom-parts-map — authored data map: symptom label → [candidate part IDs].
 *
 * Design note: values MUST be arrays (never a single string) to satisfy the
 * 1-to-many requirement (AC1 / Scenario 6 — "stops running" maps to multiple
 * plausible parts simultaneously).
 *
 * Part IDs correspond to the watch anatomy diagram component identifiers.
 */

const SYMPTOM_PARTS_MAP = {
  'stops_running': ['mainspring', 'escapement', 'balance_wheel', 'pallet_fork'],
  'loses_time': ['balance_wheel', 'hairspring', 'escapement'],
  'gains_time': ['balance_wheel', 'hairspring'],
  'crown_wont_engage': ['crown', 'stem', 'setting_lever', 'crown_wheel'],
  'no_power_reserve': ['mainspring', 'click_spring', 'ratchet_wheel'],
  'seconds_hand_stuck': ['seconds_wheel', 'cannon_pinion', 'center_wheel'],
  'dial_face_damage': ['dial', 'crystal'],
  'water_damage_visible': ['gasket', 'crown', 'crystal'],
  'skipping_seconds': ['balance_wheel', 'pallet_fork', 'escape_wheel'],
  'date_not_advancing': ['date_disc', 'date_jumper', 'date_driving_wheel'],
};

/**
 * Returns the array of candidate part IDs for a given symptom key.
 * Returns an empty array if the symptom is not found.
 *
 * @param {string} symptomKey
 * @returns {string[]}
 */
function getPartsForSymptom(symptomKey) {
  return SYMPTOM_PARTS_MAP[symptomKey] || [];
}

/**
 * Returns all known symptom keys.
 * @returns {string[]}
 */
function getAllSymptomKeys() {
  return Object.keys(SYMPTOM_PARTS_MAP);
}

module.exports = { SYMPTOM_PARTS_MAP, getPartsForSymptom, getAllSymptomKeys };
