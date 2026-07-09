/**
 * HorologyGlossary — single source of truth for all technical horology terms
 * used in the diagnosis UI.
 *
 * AC3: Every technical horology term appearing in the diagnosis UI must have an
 * inline tooltip with a plain-language definition.  This registry is the
 * authoritative list QA uses to validate 100% tooltip coverage (Scenario 5).
 *
 * Adding a new term to diagnosis UI copy? Register it here first.
 */

const GLOSSARY = {
  mainspring: {
    term: 'mainspring',
    definition:
      'The coiled metal spring inside the barrel that stores the energy used to drive the watch. When wound, it slowly releases that energy to power the movement.',
  },
  escapement: {
    term: 'escapement',
    definition:
      'The mechanism that controls the release of stored energy in precise, equally-spaced beats. It consists of the escape wheel and pallet fork working together.',
  },
  pallet_fork: {
    term: 'pallet fork',
    definition:
      'A lever with two jewel-tipped arms (pallets) that alternately lock and release the escape wheel teeth, creating the ticking motion.',
  },
  balance_wheel: {
    term: 'balance wheel',
    definition:
      "The oscillating weighted wheel that beats back and forth at a fixed rate, acting as the watch's timekeeping regulator — the equivalent of a pendulum in a clock.",
  },
  hairspring: {
    term: 'hairspring',
    definition:
      'An extremely fine coiled spring attached to the balance wheel that causes it to oscillate back and forth. Its length and tension determine the beat rate.',
  },
  escape_wheel: {
    term: 'escape wheel',
    definition:
      'A toothed wheel that is the last wheel in the gear train before the escapement. Its teeth are alternately caught and released by the pallet fork to produce the tick.',
  },
  barrel: {
    term: 'barrel',
    definition:
      'The cylindrical container that houses the mainspring. The barrel also acts as a gear, transmitting power from the mainspring to the rest of the gear train.',
  },
  crown: {
    term: 'crown',
    definition:
      'The knob on the outside of the watch case used to wind the mainspring and set the time (and date, on watches that have one).',
  },
  stem: {
    term: 'stem',
    definition:
      'The metal rod connecting the crown to the movement. Pulling or rotating the crown rotates the stem, which engages the winding or time-setting mechanisms.',
  },
  setting_lever: {
    term: 'setting lever',
    definition:
      'A lever inside the movement that detects the crown position (pushed-in for winding, pulled-out for setting) and engages the correct mechanism accordingly.',
  },
  crown_wheel: {
    term: 'crown wheel',
    definition:
      'In older pocket watches, the wheel driven by the crown that transfers winding force to the mainspring. Not present in all modern movements.',
  },
  cannon_pinion: {
    term: 'cannon pinion',
    definition:
      'A small tube that fits over the center wheel arbor with a friction grip, carrying the minute hand. The friction allows you to set the time without stopping the movement.',
  },
  center_wheel: {
    term: 'center wheel',
    definition:
      'The large wheel in the center of the movement that makes one full revolution per hour, to which the cannon pinion (and thus the minute hand) is attached.',
  },
  click_spring: {
    term: 'click spring',
    definition:
      'A small spring that holds the click (a pawl) against the ratchet wheel, preventing the mainspring from unwinding when you release the crown.',
  },
  ratchet_wheel: {
    term: 'ratchet wheel',
    definition:
      'The toothed wheel engaged by the click during winding that allows the mainspring to be wound but not to unwind on its own.',
  },
  date_disc: {
    term: 'date disc',
    definition:
      'The ring printed with the numbers 1–31 that sits beneath the dial and rotates once per day to show the current date through the date aperture.',
  },
  date_jumper: {
    term: 'date jumper',
    definition:
      'A spring-loaded lever that snaps the date disc positively into place at each date position, preventing it from landing between two numbers.',
  },
  date_driving_wheel: {
    term: 'date driving wheel',
    definition:
      'The wheel that advances the date disc one position at midnight by engaging a finger on the date disc.',
  },
  seconds_wheel: {
    term: 'seconds wheel',
    definition:
      'The wheel in the gear train that makes one revolution per minute and typically carries the seconds hand.',
  },
  crystal: {
    term: 'crystal',
    definition:
      'The transparent cover over the watch dial, made from mineral glass, acrylic, or sapphire, that protects the dial and hands while remaining readable.',
  },
  dial: {
    term: 'dial',
    definition:
      "The face of the watch — the decorated plate bearing hour markers, brand name, and other indicators that you read to tell the time.",
  },
  gasket: {
    term: 'gasket',
    definition:
      'A rubber or synthetic seal fitted around the crystal, case back, and crown to prevent water and dust from entering the watch case.',
  },
  gear_train: {
    term: 'gear train',
    definition:
      "The series of interconnected wheels and pinions that transmit and reduce the mainspring's energy down to the escapement at the correct rate.",
  },
  jewel: {
    term: 'jewel',
    definition:
      "A synthetic ruby or sapphire bearing used at high-wear pivot points in the movement to reduce friction and extend the watch's running life.",
  },
  endshake: {
    term: 'endshake',
    definition:
      'The small amount of vertical (axial) play allowed in a wheel or pinion pivot. Too little causes binding; too much causes inconsistent timekeeping.',
  },
};

/**
 * Returns the glossary entry for a given term key.
 * @param {string} termKey — the snake_case key (e.g. 'balance_wheel')
 * @returns {{term: string, definition: string}|null}
 */
function getTooltip(termKey) {
  return GLOSSARY[termKey] || null;
}

/**
 * Returns all registered term keys — used by QA (Scenario 5) to validate
 * that every term in the diagnosis UI has a tooltip entry.
 * @returns {string[]}
 */
function getAllTermKeys() {
  return Object.keys(GLOSSARY);
}

/**
 * Returns true when the supplied termKey has a registered glossary entry.
 * @param {string} termKey
 * @returns {boolean}
 */
function hasTooltip(termKey) {
  return Object.prototype.hasOwnProperty.call(GLOSSARY, termKey);
}

module.exports = { GLOSSARY, getTooltip, getAllTermKeys, hasTooltip };
