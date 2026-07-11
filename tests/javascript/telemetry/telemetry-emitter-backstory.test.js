'use strict';

const { TelemetryEmitter, EVENTS } = require('../../../javascript/telemetry/TelemetryEmitter');

function makeEmitter() {
  return new TelemetryEmitter(jest.fn());
}

describe('TelemetryEmitter — Issue #130 backstory analytics', () => {
  test('EVENTS.BACKSTORY_CARD_SHOWN is defined', () => {
    expect(EVENTS.BACKSTORY_CARD_SHOWN).toBe('backstory_card_shown');
  });

  test('backstoryCardShown() emits sessionId, card_variant_id, client_persona_id, and arc_position', () => {
    const emitter = makeEmitter();
    emitter.backstoryCardShown('session-1', 'template_dive_001', 'persona-margaret', 2);

    const event = emitter.getEmittedEvents().find((entry) => entry.name === EVENTS.BACKSTORY_CARD_SHOWN);
    expect(event.payload).toEqual({
      sessionId: 'session-1',
      card_variant_id: 'template_dive_001',
      client_persona_id: 'persona-margaret',
      arc_position: 2,
    });
  });

  test('control cohort can emit null-valued additive fields', () => {
    const emitter = makeEmitter();
    emitter.backstoryCardShown('session-2', null, null, null);

    const event = emitter.getEmittedEvents().find((entry) => entry.name === EVENTS.BACKSTORY_CARD_SHOWN);
    expect(event.payload).toEqual({
      sessionId: 'session-2',
      card_variant_id: null,
      client_persona_id: null,
      arc_position: null,
    });
  });

  test('existing events remain unmodified', () => {
    const emitter = makeEmitter();
    emitter.jobAccepted('job-1', 'dive_watch', true);
    emitter.cleaningRevealStarted('before', 'after');

    const accepted = emitter.getEmittedEvents().find((entry) => entry.name === EVENTS.JOB_ACCEPTED);
    const cleaning = emitter.getEmittedEvents().find((entry) => entry.name === EVENTS.CLEANING_REVEAL_STARTED);

    expect(accepted.payload).toEqual({
      job_id: 'job-1',
      job_type: 'dive_watch',
      has_backstory: true,
    });
    expect(cleaning.payload).toEqual({
      preTexture: 'before',
      postTexture: 'after',
    });
  });
});
