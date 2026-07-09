/**
 * DirectionalMessageMap — static mapping of watch part ID → directional error message.
 *
 * Design rules (Phase 2 — Issue #78):
 *   - Every part in the reassembly workflow must have a unique entry (AC1).
 *   - Every message must include the part name and at least one corrective action
 *     (rotation direction, flip instruction, or spatial reference) (AC2).
 *   - Every message must be ≤ 15 words (AC2). Enforced at runtime by DirectionalMessageService.
 *   - English-only MVP; copy written for clear translation when localization is added.
 *   - Domain accuracy: copy reviewed for correct watch-assembly directional guidance.
 *
 * Part list matches SnapZoneTolerance.SNAP_ZONES — every part with a snap zone
 * has a corresponding directional message (zero generic fallbacks).
 */

const DIRECTIONAL_MESSAGES = {
  mainspring:
    'Mainspring wound backwards — release tension and rewind clockwise.',

  barrel:
    'Barrel misaligned — rotate 90° clockwise to seat the arbor correctly.',

  barrel_bridge:
    'Barrel bridge flipped — flip 180° so the jewel faces down.',

  escape_wheel:
    'Escape wheel rotated — turn clockwise one tooth to align the pallet.',

  pallet_fork:
    'Pallet fork angled wrong — rotate counterclockwise to face the balance wheel.',

  balance_wheel:
    'Balance wheel inverted — flip upright, hairspring should face upward.',

  balance_cock:
    'Balance cock tilted — slide toward the jewel hole and press flat.',

  cannon_pinion:
    'Cannon pinion off-axis — align the flat edge with the keyway.',

  minute_wheel:
    'Minute wheel out of mesh — rotate clockwise until all teeth engage.',

  hour_wheel:
    'Hour wheel reversed — flip right-side up to expose the pipe.',

  dial:
    'Dial upside down — rotate 180° so the 12 faces the crown.',

  crown:
    'Crown not engaged — push inward, then rotate clockwise to seat.',

  stem:
    'Stem inserted backwards — remove, flip 180°, and reinsert toward the crown.',
};

module.exports = { DIRECTIONAL_MESSAGES };
