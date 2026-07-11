'use strict';

const { BackstoryCardSelector, WATCH_TYPE_POOL_MAP, CLIENT_PERSONAS } = require('../../../src/clients/BackstoryCardSelector');
const { BACKSTORY_TEMPLATES } = require('../../../src/data/backstory_templates');
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');

function makeSelector(overrides = {}) {
  return new BackstoryCardSelector({
    templateLibrary: BACKSTORY_TEMPLATES,
    saveState: overrides.saveState || new PlayerSaveState(),
    rng: overrides.rng || (() => 0),
  });
}

describe('BackstoryCardSelector — AC1 model-specific pool routing', () => {
  test('resolvePoolId("dive") returns pool_dive', () => {
    expect(makeSelector().resolvePoolId('dive')).toBe('pool_dive');
  });

  test('dive watch cards are drawn from the dive pool', () => {
    const result = makeSelector().selectCard({ watch_type: 'dive', client_persona_id: null });
    expect(result.card.template_pool_id).toBe(WATCH_TYPE_POOL_MAP.dive);
  });

  test('dress watch cards are drawn from the dress pool', () => {
    const result = makeSelector().selectCard({ watch_type: 'dress', client_persona_id: null });
    expect(result.card.template_pool_id).toBe(WATCH_TYPE_POOL_MAP.dress);
  });

  test('unknown watch type falls back to the generic pool', () => {
    const result = makeSelector().selectCard({ watch_type: 'moonphase', client_persona_id: null });
    expect(result.card.template_pool_id).toBe(WATCH_TYPE_POOL_MAP.generic);
  });
});

describe('BackstoryCardSelector — AC2 persona callbacks', () => {
  test('first encounter has no callback phrase', () => {
    const result = makeSelector().selectCard({
      watch_type: 'dive',
      client_persona_id: 'persona-margaret',
    });

    expect(result.has_callback).toBe(false);
    expect(result.card.callback_phrase).toBeNull();
    expect(result.arc_position).toBe(1);
  });

  test('prior persona history enables a non-empty callback phrase', () => {
    const saveState = new PlayerSaveState();
    saveState.recordPersonaJobCompletion('persona-margaret', 'job-1', 1);

    const result = makeSelector({ saveState }).selectCard({
      watch_type: 'dress',
      client_persona_id: 'persona-margaret',
    });

    expect(result.has_callback).toBe(true);
    expect(typeof result.card.callback_phrase).toBe('string');
    expect(result.card.callback_phrase.length).toBeGreaterThan(0);
  });

  test('callback phrase explicitly references prior work for Margaret', () => {
    const saveState = new PlayerSaveState();
    saveState.recordPersonaJobCompletion('persona-margaret', 'job-1', 0);

    const result = makeSelector({ saveState }).selectCard({
      watch_type: 'field',
      client_persona_id: 'persona-margaret',
    });

    expect(result.card.callback_phrase).toContain("brought my husband's watch back to life");
  });
});

describe('BackstoryCardSelector — AC3 variant counts', () => {
  test('dive has at least three variants', () => {
    expect(makeSelector().getVariantCount('dive')).toBeGreaterThanOrEqual(3);
  });

  test('dress has at least three variants', () => {
    expect(makeSelector().getVariantCount('dress')).toBeGreaterThanOrEqual(3);
  });

  test('template library contains at least 50 variants', () => {
    expect(BACKSTORY_TEMPLATES.length).toBeGreaterThanOrEqual(50);
  });
});

describe('BackstoryCardSelector — AC4 arc progression', () => {
  test('first encounter starts at arc position 1', () => {
    const result = makeSelector().selectCard({
      watch_type: 'pocket',
      client_persona_id: 'persona-helen',
    });
    expect(result.arc_position).toBe(1);
  });

  test('second encounter advances arc position to 2 after recording completion', () => {
    const saveState = new PlayerSaveState();
    saveState.recordPersonaJobCompletion('persona-helen', 'job-1', 1);

    const result = makeSelector({ saveState }).selectCard({
      watch_type: 'pocket',
      client_persona_id: 'persona-helen',
    });

    expect(result.arc_position).toBe(2);
  });

  test('arc position clamps to the persona arc length maximum', () => {
    const saveState = new PlayerSaveState();
    saveState.recordPersonaJobCompletion('persona-arthur', 'job-9', 99);

    const result = makeSelector({ saveState }).selectCard({
      watch_type: 'chronograph',
      client_persona_id: 'persona-arthur',
    });

    expect(result.arc_position).toBe(CLIENT_PERSONAS['persona-arthur'].arc_length);
  });
});

describe('BackstoryCardSelector — AC5 telemetry-facing result shape', () => {
  test('selected result includes card id, client_persona_id, and arc_position', () => {
    const result = makeSelector().selectCard({
      watch_type: 'chronograph',
      client_persona_id: 'persona-arthur',
    });

    expect(result.card.id).toMatch(/^template_chronograph_/);
    expect(result.client_persona_id).toBe('persona-arthur');
    expect(result.arc_position).toBe(1);
  });
});
