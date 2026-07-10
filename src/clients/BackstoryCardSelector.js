/**
 * BackstoryCardSelector — model-specific template pool routing with client
 * persona history callbacks (Issue #130 — Backstory Card Expansion).
 *
 * Implements three logical layers:
 *   1. Model-specific pool routing (AC1) — maps watch model type to template_pool_id
 *   2. Persona history callbacks (AC2) — inserts callback phrase when prior job exists
 *   3. Card variant cycling (AC3) — ensures ≥3 variants per watch type
 *
 * Acceptance criteria covered:
 *   AC1 — model-specific pool routing from watch_type to template_pool_id
 *   AC2 — persona callback phrase when client_persona_history shows prior job
 *   AC3 — at least 3 card variants per watch type (enforced by template library size)
 *   AC4 — arc_position advances correctly across linked cards
 *   AC5 — telemetry payload includes card_variant_id, client_persona_id, arc_position
 */

'use strict';

const WATCH_TYPE_POOL_MAP = {
  dive: 'pool_dive',
  dress: 'pool_dress',
  field: 'pool_field',
  pocket: 'pool_pocket',
  chronograph: 'pool_chronograph',
  generic: 'pool_generic',
};

const CLIENT_PERSONAS = {
  'persona-margaret': {
    id: 'persona-margaret',
    name: 'Margaret',
    arc_length: 3,
    callback_phrases: [
      "You brought my husband's watch back to life last year…",
      'I still think about the care you showed with that first piece…',
      "You've become my most trusted craftsman. I have another job for you.",
    ],
  },
  'persona-arthur': {
    id: 'persona-arthur',
    name: 'Arthur',
    arc_length: 2,
    callback_phrases: [
      'That Longines you fixed for me still runs perfectly. I trust your hands.',
      'Word of your work has spread. My brother wants you to look at something.',
    ],
  },
  'persona-helen': {
    id: 'persona-helen',
    name: 'Helen',
    arc_length: 3,
    callback_phrases: [
      "You repaired my grandmother's brooch watch — it means everything to her.",
      'She wore it every day after you fixed it. Now I need the matching pocket watch.',
      "Our family has decided you're the only craftsman we trust with these heirlooms.",
    ],
  },
};

class BackstoryCardSelector {
  /**
   * @param {Object} opts
   * @param {Object[]} opts.templateLibrary
   * @param {Object} opts.saveState
   * @param {Function} [opts.rng]
   */
  constructor({ templateLibrary, saveState, rng = Math.random }) {
    this._templates = templateLibrary;
    this._saveState = saveState;
    this._rng = rng;
  }

  /**
   * @param {{ watch_type: string, client_persona_id: string|null }} jobContext
   * @returns {{ card: Object, arc_position: number, has_callback: boolean, client_persona_id: string|null }|null}
   */
  selectCard(jobContext) {
    const { watch_type = 'generic', client_persona_id = null } = jobContext;
    const poolId = this.resolvePoolId(watch_type);
    const poolTemplates = this._templates.filter((template) => template.template_pool_id === poolId);
    const fallbackTemplates = this._templates.filter(
      (template) => template.template_pool_id === WATCH_TYPE_POOL_MAP.generic,
    );
    const candidates = poolTemplates.length > 0 ? poolTemplates : fallbackTemplates;

    if (candidates.length === 0) return null;

    const card = candidates[Math.floor(this._rng() * candidates.length)];
    let arcPosition = 1;
    let hasCallback = false;
    let callbackPhrase = null;

    if (client_persona_id && CLIENT_PERSONAS[client_persona_id]) {
      const persona = CLIENT_PERSONAS[client_persona_id];
      const history = this._saveState.getPersonaHistory
        ? this._saveState.getPersonaHistory(client_persona_id)
        : null;

      if (history && history.last_job_id) {
        hasCallback = true;
        arcPosition = Math.min((history.arc_position || 0) + 1, persona.arc_length);
        const phraseIndex = Math.min(arcPosition - 1, persona.callback_phrases.length - 1);
        callbackPhrase = persona.callback_phrases[phraseIndex];
      }
    }

    return {
      card: {
        ...card,
        callback_phrase: callbackPhrase,
      },
      arc_position: arcPosition,
      has_callback: hasCallback,
      client_persona_id,
    };
  }

  /**
   * @param {string} watchType
   * @returns {string}
   */
  resolvePoolId(watchType) {
    return WATCH_TYPE_POOL_MAP[watchType] || WATCH_TYPE_POOL_MAP.generic;
  }

  /**
   * @param {string} watchType
   * @returns {number}
   */
  getVariantCount(watchType) {
    const poolId = this.resolvePoolId(watchType);
    return this._templates.filter((template) => template.template_pool_id === poolId).length;
  }
}

module.exports = { BackstoryCardSelector, WATCH_TYPE_POOL_MAP, CLIENT_PERSONAS };
