/**
 * backstory-templates.js — Externalized card copy for the Client Backstory Card System.
 *
 * Issue #126 — Client Backstory Card System:
 *   20–30 card templates keyed by watchType. All strings live here — no hardcoded
 *   copy in controllers or UI (localization-ready; translations deferred per non-goals).
 *
 * Each template entry:
 *   id            — unique stable identifier (used for telemetry template_id)
 *   watchType     — one of the canonical watch type keys (see WATCH_TYPES)
 *   templateText  — card copy with {{variable}} placeholders (≤80 words per card)
 *   variables     — array of variable keys that appear in templateText
 *
 * Variable keys (and their neutral fallback values — see BackstoryCardController):
 *   {{clientName}}          → "A client"
 *   {{relationshipContext}} → "a family member"
 *   {{timeBroken}}          → "many years"
 *   {{occasion}}            → "a special occasion"
 */

'use strict';

/** Canonical watch type keys used as template index keys. */
const WATCH_TYPES = [
  'dress_watch',
  'dive_watch',
  'pocket_watch',
  'field_watch',
  'pilot_watch',
  'sport_watch',
];

/**
 * @typedef {Object} BackstoryTemplate
 * @property {string}   id             — stable unique identifier
 * @property {string}   watchType      — one of WATCH_TYPES
 * @property {string}   templateText   — card copy (≤80 words, {{variable}} tokens)
 * @property {string[]} variables      — variable keys referenced in templateText
 */

/** @type {BackstoryTemplate[]} */
const BACKSTORY_TEMPLATES = [

  // ── Dress Watch ─────────────────────────────────────────────────────────────
  {
    id: 'dress_001',
    watchType: 'dress_watch',
    templateText:
      '{{clientName}} wore this watch to every board meeting for thirty years. ' +
      'After {{relationshipContext}} passed it on, it sat in a velvet box for {{timeBroken}}. ' +
      'They want it running again before {{occasion}} — a milestone worth marking properly.',
    variables: ['clientName', 'relationshipContext', 'timeBroken', 'occasion'],
  },
  {
    id: 'dress_002',
    watchType: 'dress_watch',
    templateText:
      'This belonged to {{clientName}}\'s grandmother — purchased in Paris the year she ' +
      'emigrated. The clasp broke {{timeBroken}} ago and no one dared repair it incorrectly. ' +
      'It needs to be right for {{occasion}}.',
    variables: ['clientName', 'timeBroken', 'occasion'],
  },
  {
    id: 'dress_003',
    watchType: 'dress_watch',
    templateText:
      '{{clientName}} inherited this from {{relationshipContext}}. It stopped working ' +
      '{{timeBroken}} ago — the day after the funeral — and has sat untouched since. ' +
      'Getting it ticking again feels like the right way to remember them.',
    variables: ['clientName', 'relationshipContext', 'timeBroken'],
  },
  {
    id: 'dress_004',
    watchType: 'dress_watch',
    templateText:
      'Bought new on a wedding day, worn daily for a decade, then dropped on a tile floor. ' +
      '{{clientName}} kept it in a drawer for {{timeBroken}} hoping someone could fix it. ' +
      '{{occasion}} is coming up and they finally decided to try.',
    variables: ['clientName', 'timeBroken', 'occasion'],
  },

  // ── Dive Watch ──────────────────────────────────────────────────────────────
  {
    id: 'dive_001',
    watchType: 'dive_watch',
    templateText:
      '{{clientName}}\'s grandfather left this Seiko in a kitchen drawer for {{timeBroken}}. ' +
      'It went to every dive trip off {{relationshipContext}}\'s boat in the seventies. ' +
      'The crown seal failed years ago. They want it back on their wrist.',
    variables: ['clientName', 'timeBroken', 'relationshipContext'],
  },
  {
    id: 'dive_002',
    watchType: 'dive_watch',
    templateText:
      '{{clientName}} dove with this watch for fifteen years. It flooded during a salvage job ' +
      '{{timeBroken}} ago and they couldn\'t afford the repair then. ' +
      'They are back on the water and need it ready before {{occasion}}.',
    variables: ['clientName', 'timeBroken', 'occasion'],
  },
  {
    id: 'dive_003',
    watchType: 'dive_watch',
    templateText:
      'This dive watch survived a shipwreck with {{clientName}} — they swam to shore still ' +
      'wearing it. It stopped keeping time {{timeBroken}} later when a gasket finally gave out. ' +
      'They want the story to keep going.',
    variables: ['clientName', 'timeBroken'],
  },
  {
    id: 'dive_004',
    watchType: 'dive_watch',
    templateText:
      '{{clientName}} bought this with their first paycheck as a dive instructor. ' +
      '{{relationshipContext}} borrowed it years ago and returned it broken. ' +
      'It sat for {{timeBroken}} — nobody wanted to be the one to open it.',
    variables: ['clientName', 'relationshipContext', 'timeBroken'],
  },

  // ── Pocket Watch ────────────────────────────────────────────────────────────
  {
    id: 'pocket_001',
    watchType: 'pocket_watch',
    templateText:
      'This pocket watch belonged to {{clientName}}\'s great-great-grandfather — a ' +
      'railroad conductor who carried it every shift for thirty years. ' +
      'It stopped {{timeBroken}} ago and has been a family keepsake ever since.',
    variables: ['clientName', 'timeBroken'],
  },
  {
    id: 'pocket_002',
    watchType: 'pocket_watch',
    templateText:
      '{{clientName}} found this at the bottom of a trunk left by {{relationshipContext}}. ' +
      'The engraving on the case reads a date {{timeBroken}} ago. ' +
      'They don\'t know the story — but they want it running so it can make a new one.',
    variables: ['clientName', 'relationshipContext', 'timeBroken'],
  },
  {
    id: 'pocket_003',
    watchType: 'pocket_watch',
    templateText:
      'A travelling merchant\'s pocket watch, passed through four generations of the same ' +
      'family. {{clientName}} is the last one left and wants it working for {{occasion}}. ' +
      'It wound down {{timeBroken}} ago and no one had the courage to open it.',
    variables: ['clientName', 'occasion', 'timeBroken'],
  },
  {
    id: 'pocket_004',
    watchType: 'pocket_watch',
    templateText:
      '{{clientName}} bought this at an estate sale — engraved with initials that aren\'t theirs. ' +
      'It has sat silent for {{timeBroken}} since the mainspring snapped at the auction. ' +
      'They want to find out whose story it tells.',
    variables: ['clientName', 'timeBroken'],
  },

  // ── Field Watch ─────────────────────────────────────────────────────────────
  {
    id: 'field_001',
    watchType: 'field_watch',
    templateText:
      '{{clientName}} wore this field watch through two deployments. ' +
      '{{relationshipContext}} sent it home after the second tour; it stopped working ' +
      '{{timeBroken}} into the journey. It arrived broken. It still matters.',
    variables: ['clientName', 'relationshipContext', 'timeBroken'],
  },
  {
    id: 'field_002',
    watchType: 'field_watch',
    templateText:
      'A field medic\'s watch. {{clientName}} carried it for {{timeBroken}} before it ' +
      'stopped. The crystal is cracked from a close call they don\'t talk about. ' +
      'They just want to hear it tick again.',
    variables: ['clientName', 'timeBroken'],
  },
  {
    id: 'field_003',
    watchType: 'field_watch',
    templateText:
      '{{clientName}} is retiring after {{timeBroken}} of service. {{relationshipContext}} ' +
      'gave them this watch on their first day and it\'s been on their wrist ever since — ' +
      'until a fall cracked the movement. {{occasion}} is the last day of duty.',
    variables: ['clientName', 'timeBroken', 'relationshipContext', 'occasion'],
  },
  {
    id: 'field_004',
    watchType: 'field_watch',
    templateText:
      'Issued kit, not a gift — but {{clientName}} held onto it long after leaving. ' +
      'It\'s been in a boot locker for {{timeBroken}}. They pulled it out for {{occasion}} ' +
      'and noticed it had stopped. It felt like it was waiting to be asked.',
    variables: ['clientName', 'timeBroken', 'occasion'],
  },

  // ── Pilot Watch ─────────────────────────────────────────────────────────────
  {
    id: 'pilot_001',
    watchType: 'pilot_watch',
    templateText:
      '{{clientName}}\'s father flew crop dusters and then commercial routes for forty years. ' +
      'This watch logged every hour. It stopped {{timeBroken}} after he retired and ' +
      'it has sat on his dresser — still set to departure time — ever since.',
    variables: ['clientName', 'timeBroken'],
  },
  {
    id: 'pilot_002',
    watchType: 'pilot_watch',
    templateText:
      '{{clientName}} bought this the day they got their private pilot\'s licence. ' +
      '{{relationshipContext}} spilled coffee on it {{timeBroken}} ago and the movement ' +
      'seized. It\'s been in a hangar drawer since. They want it back in the cockpit.',
    variables: ['clientName', 'relationshipContext', 'timeBroken'],
  },
  {
    id: 'pilot_003',
    watchType: 'pilot_watch',
    templateText:
      'A navigation watch worn on the Berlin Airlift. {{clientName}} inherited it from ' +
      '{{relationshipContext}} along with a logbook full of mission notes. ' +
      'It stopped {{timeBroken}} ago. The logbook is still full.',
    variables: ['clientName', 'relationshipContext', 'timeBroken'],
  },
  {
    id: 'pilot_004',
    watchType: 'pilot_watch',
    templateText:
      '{{clientName}} is presenting this to a young aviator for {{occasion}}. ' +
      'It belonged to their own instructor, who wore it for {{timeBroken}} before retiring. ' +
      'It needs to work before it can be passed on.',
    variables: ['clientName', 'occasion', 'timeBroken'],
  },

  // ── Sport Watch ─────────────────────────────────────────────────────────────
  {
    id: 'sport_001',
    watchType: 'sport_watch',
    templateText:
      '{{clientName}} ran a marathon with this watch and crossed the finish line with ' +
      'a personal best. A {{timeBroken}}-long gap in training ended with the battery ' +
      'dying — but this is a mechanical and there\'s no good excuse. Time to start again.',
    variables: ['clientName', 'timeBroken'],
  },
  {
    id: 'sport_002',
    watchType: 'sport_watch',
    templateText:
      'This was {{clientName}}\'s training companion for {{timeBroken}}. ' +
      '{{relationshipContext}} accidentally sat on it and cracked the case. ' +
      'Everyone felt terrible. Getting it fixed is the easiest way to move on.',
    variables: ['clientName', 'timeBroken', 'relationshipContext'],
  },
  {
    id: 'sport_003',
    watchType: 'sport_watch',
    templateText:
      '{{clientName}} set a club record wearing this watch. It stopped the day after, ' +
      'as if it had done its job. That was {{timeBroken}} ago. ' +
      '{{occasion}} is the next season opener and they want to wear it again.',
    variables: ['clientName', 'timeBroken', 'occasion'],
  },
  {
    id: 'sport_004',
    watchType: 'sport_watch',
    templateText:
      'A climbing watch. {{clientName}} wore it through base camp and three summit attempts. ' +
      'It stopped at altitude {{timeBroken}} ago — maybe ice, maybe pressure, maybe both. ' +
      'A fourth attempt is planned for {{occasion}}.',
    variables: ['clientName', 'timeBroken', 'occasion'],
  },

];

/**
 * Returns all templates for a given watchType.
 * In production builds, returns a generic fallback template for unknown watchTypes.
 * In development/test builds, also throws to catch coverage gaps early.
 *
 * @param {string} watchType
 * @param {boolean} [devMode=false]  Throw on unknown watchType when true.
 * @returns {BackstoryTemplate[]}
 */
function getTemplatesForWatchType(watchType, devMode = false) {
  const matches = BACKSTORY_TEMPLATES.filter((t) => t.watchType === watchType);
  if (matches.length > 0) return matches;

  if (devMode) {
    throw new Error(
      `BackstoryCardController: no templates found for watchType="${watchType}". ` +
        'Add templates to src/data/backstory-templates.js before shipping.',
    );
  }

  // Production graceful fallback — return the first available template rather
  // than a blank card (design mitigation, Issue #126 risks).
  return BACKSTORY_TEMPLATES.slice(0, 1);
}

module.exports = { BACKSTORY_TEMPLATES, WATCH_TYPES, getTemplatesForWatchType };
