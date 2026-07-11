/**
 * Tests for TelemetryEmitter reassembly extension — Phase 1 (Issue #76)
 *
 * Validates the backward-compatible extension:
 *   undoAttempted(partId)      — emits 'undo_attempted' event
 *   reassemblyCompleted(partId) — emits 'reassembly_completed' event
 *
 * Ensures:
 *   - No regressions to existing diagnosis telemetry events
 *   - New events do not duplicate or conflict with existing events
 */

const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');

describe('TelemetryEmitter — reassembly extension: undoAttempted()', () => {
  let hook, emitter;
  beforeEach(() => {
    hook = jest.fn();
    emitter = new TelemetryEmitter(hook);
  });

  test('undoAttempted emits "undo_attempted" event via the hook', () => {
    emitter.undoAttempted('escape_wheel');
    expect(hook).toHaveBeenCalledWith('undo_attempted', { partId: 'escape_wheel' });
  });

  test('undoAttempted is recorded in getEmittedEvents()', () => {
    emitter.undoAttempted('pallet_fork');
    const emitted = emitter.getEmittedEvents();
    expect(emitted.some((e) => e.name === 'undo_attempted' && e.payload.partId === 'pallet_fork')).toBe(true);
  });

  test('wasEmitted returns true after undoAttempted', () => {
    emitter.undoAttempted('dial');
    expect(emitter.wasEmitted('undo_attempted')).toBe(true);
  });
});

describe('TelemetryEmitter — reassembly extension: reassemblyCompleted()', () => {
  let hook, emitter;
  beforeEach(() => {
    hook = jest.fn();
    emitter = new TelemetryEmitter(hook);
  });

  test('reassemblyCompleted emits "reassembly_completed" event via the hook', () => {
    emitter.reassemblyCompleted('balance_wheel');
    expect(hook).toHaveBeenCalledWith('reassembly_completed', { partId: 'balance_wheel' });
  });

  test('reassemblyCompleted is recorded in getEmittedEvents()', () => {
    emitter.reassemblyCompleted('mainspring');
    const emitted = emitter.getEmittedEvents();
    expect(emitted.some((e) => e.name === 'reassembly_completed' && e.payload.partId === 'mainspring')).toBe(true);
  });

  test('wasEmitted returns true after reassemblyCompleted', () => {
    emitter.reassemblyCompleted('crown');
    expect(emitter.wasEmitted('reassembly_completed')).toBe(true);
  });
});

describe('TelemetryEmitter — backward-compatibility: existing events unaffected', () => {
  let hook, emitter;
  beforeEach(() => {
    hook = jest.fn();
    emitter = new TelemetryEmitter(hook);
  });

  test('existing EVENTS object still exports all six diagnosis events', () => {
    expect(EVENTS.TUTORIAL_DIAGNOSIS_STARTED).toBe('tutorial_diagnosis_started');
    expect(EVENTS.HINT_TIER_1_SHOWN).toBe('hint_tier_1_shown');
    expect(EVENTS.HINT_TIER_2_SHOWN).toBe('hint_tier_2_shown');
    expect(EVENTS.HINT_TIER_3_SHOWN).toBe('hint_tier_3_shown');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITHOUT_HINT).toBe('diagnosis_completed_without_hint');
    expect(EVENTS.DIAGNOSIS_COMPLETED_WITH_HINT).toBe('diagnosis_completed_with_hint');
  });

  test('new reassembly events are exported in EVENTS', () => {
    expect(EVENTS.UNDO_ATTEMPTED).toBe('undo_attempted');
    expect(EVENTS.REASSEMBLY_COMPLETED).toBe('reassembly_completed');
  });

  test('diagnosisCompletedWithoutHint still works correctly after extension', () => {
    emitter.diagnosisCompletedWithoutHint('fi-1');
    expect(hook).toHaveBeenCalledWith('diagnosis_completed_without_hint', { faultInstanceId: 'fi-1' });
  });

  test('diagnosisCompletedWithHint still works correctly after extension', () => {
    emitter.diagnosisCompletedWithHint('fi-2', 2);
    expect(hook).toHaveBeenCalledWith('diagnosis_completed_with_hint', {
      faultInstanceId: 'fi-2',
      highestTierUsed: 2,
    });
  });

  test('undoAttempted and existing diagnosis events do NOT duplicate each other', () => {
    emitter.undoAttempted('stem');
    emitter.diagnosisCompletedWithoutHint('fi-3');
    const events = emitter.getEmittedEvents().map((e) => e.name);
    expect(events).toContain('undo_attempted');
    expect(events).toContain('diagnosis_completed_without_hint');
    expect(new Set(events).size).toBe(events.length); // no duplicates
  });
});
