'use strict';
const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');
const mk = () => { const hook = jest.fn(); return { emitter: new TelemetryEmitter(hook), hook }; };
describe('TelemetryEmitter audio events (Issue #128)', () => {
  test('AUDIO_SESSION_START', () => { expect(EVENTS.AUDIO_SESSION_START).toBe('audio_session_start'); });
  test('AUDIO_SESSION_END', () => { expect(EVENTS.AUDIO_SESSION_END).toBe('audio_session_end'); });
  test('AUDIO_CLEANING_REVEAL_FIRED', () => { expect(EVENTS.AUDIO_CLEANING_REVEAL_FIRED).toBe('audio_cleaning_reveal_fired'); });
  test('AUDIO_FIRST_TICK_FIRED', () => { expect(EVENTS.AUDIO_FIRST_TICK_FIRED).toBe('audio_first_tick_fired'); });
  test('AUDIO_CASE_BACK_FIRED', () => { expect(EVENTS.AUDIO_CASE_BACK_FIRED).toBe('audio_case_back_fired'); });
  test('AUDIO_TOOL_PICKUP_FIRED', () => { expect(EVENTS.AUDIO_TOOL_PICKUP_FIRED).toBe('audio_tool_pickup_fired'); });
  test('AUDIO_DELIVERY_FIRED', () => { expect(EVENTS.AUDIO_DELIVERY_FIRED).toBe('audio_delivery_fired'); });
  test('all 7 unique', () => { const evs = [EVENTS.AUDIO_SESSION_START,EVENTS.AUDIO_SESSION_END,EVENTS.AUDIO_CLEANING_REVEAL_FIRED,EVENTS.AUDIO_FIRST_TICK_FIRED,EVENTS.AUDIO_CASE_BACK_FIRED,EVENTS.AUDIO_TOOL_PICKUP_FIRED,EVENTS.AUDIO_DELIVERY_FIRED]; expect(new Set(evs).size).toBe(7); });
  test('existing AB_COHORT_ASSIGNED unchanged', () => { expect(EVENTS.AB_COHORT_ASSIGNED).toBe('ab_cohort_assigned'); });
  test('audioSessionStart emits correct event', () => { const { emitter, hook } = mk(); emitter.audioSessionStart('s1', 'audio-on'); expect(hook).toHaveBeenCalledWith(EVENTS.AUDIO_SESSION_START, expect.objectContaining({ sessionId: 's1', cohort: 'audio-on' })); });
  test('audioSessionEnd emits with sessionLengthMs', () => { const { emitter, hook } = mk(); emitter.audioSessionEnd('s1', 'audio-on', 180000); expect(hook).toHaveBeenCalledWith(EVENTS.AUDIO_SESSION_END, expect.objectContaining({ sessionId: 's1', cohort: 'audio-on', sessionLengthMs: 180000 })); });
  test('audioCleaningRevealFired emits correct event', () => { const { emitter, hook } = mk(); emitter.audioCleaningRevealFired('s1', 'audio-on'); expect(hook).toHaveBeenCalledWith(EVENTS.AUDIO_CLEANING_REVEAL_FIRED, expect.objectContaining({ sessionId: 's1', cohort: 'audio-on' })); });
  test('audioFirstTickFired emits correct event', () => { const { emitter, hook } = mk(); emitter.audioFirstTickFired('s1', 'audio-on'); expect(hook).toHaveBeenCalledWith(EVENTS.AUDIO_FIRST_TICK_FIRED, expect.objectContaining({ sessionId: 's1', cohort: 'audio-on' })); });
  test('audioCaseBackFired emits correct event', () => { const { emitter, hook } = mk(); emitter.audioCaseBackFired('s1', 'audio-off'); expect(hook).toHaveBeenCalledWith(EVENTS.AUDIO_CASE_BACK_FIRED, expect.objectContaining({ sessionId: 's1', cohort: 'audio-off' })); });
  test('audioToolPickupFired emits correct event', () => { const { emitter, hook } = mk(); emitter.audioToolPickupFired('s1', 'audio-on'); expect(hook).toHaveBeenCalledWith(EVENTS.AUDIO_TOOL_PICKUP_FIRED, expect.objectContaining({ sessionId: 's1', cohort: 'audio-on' })); });
  test('audioDeliveryFired emits correct event', () => { const { emitter, hook } = mk(); emitter.audioDeliveryFired('s1', 'audio-on'); expect(hook).toHaveBeenCalledWith(EVENTS.AUDIO_DELIVERY_FIRED, expect.objectContaining({ sessionId: 's1', cohort: 'audio-on' })); });
  test('wasEmitted after audioSessionStart', () => { const { emitter } = mk(); emitter.audioSessionStart('s1', 'audio-off'); expect(emitter.wasEmitted(EVENTS.AUDIO_SESSION_START)).toBe(true); });
  test('audio-off cohort: all 5 events still emit', () => {
    const { emitter } = mk(); const s='s-off'; const c='audio-off';
    emitter.audioSessionStart(s,c); emitter.audioCleaningRevealFired(s,c); emitter.audioFirstTickFired(s,c); emitter.audioCaseBackFired(s,c); emitter.audioDeliveryFired(s,c); emitter.audioSessionEnd(s,c,5000);
    const names = emitter.getEmittedEvents().map(e => e.name);
    [EVENTS.AUDIO_SESSION_START,EVENTS.AUDIO_CLEANING_REVEAL_FIRED,EVENTS.AUDIO_FIRST_TICK_FIRED,EVENTS.AUDIO_CASE_BACK_FIRED,EVENTS.AUDIO_DELIVERY_FIRED,EVENTS.AUDIO_SESSION_END].forEach(ev => expect(names).toContain(ev));
  });
});