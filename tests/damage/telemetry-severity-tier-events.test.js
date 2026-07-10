/**
 * Tests for TelemetryEmitter.partDamaged — Issue #153 AC5: tier_classification field.
 *
 * Covers:
 *   - partDamaged emits tier_classification field (additive extension — AC5)
 *   - Backward compatibility: partDamaged without tierClassification emits null field
 *   - All three tier values propagate correctly through the emitter
 *   - Existing PART_DAMAGE_RECOVERY_CHOSEN event is unaffected (no regressions)
 */

'use strict';

const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');

function makeEmitter() {
  const hook = jest.fn();
  return { emitter: new TelemetryEmitter(hook), hook };
}


// ---------------------------------------------------------------------------
// partDamaged — tier_classification field (AC5)
// ---------------------------------------------------------------------------

describe('partDamaged — tier_classification field (AC5)', () => {
  test('emits tier_classification = "minor_slip" when provided', () => {
    const { emitter, hook } = makeEmitter();
    emitter.partDamaged('part-01', 'rest-001', 'over_torque', 'minor_slip');
    expect(hook).toHaveBeenCalledWith(EVENTS.PART_DAMAGED, expect.objectContaining({
      partId:             'part-01',
      restorationId:      'rest-001',
      eventType:          'over_torque',
      tier_classification: 'minor_slip',
    }));
  });

  test('emits tier_classification = "significant_damage" when provided', () => {
    const { emitter, hook } = makeEmitter();
    emitter.partDamaged('part-02', 'rest-002', 'snap', 'significant_damage');
    expect(hook).toHaveBeenCalledWith(EVENTS.PART_DAMAGED, expect.objectContaining({
      tier_classification: 'significant_damage',
    }));
  });

  test('emits tier_classification = "extreme_negligence" when provided', () => {
    const { emitter, hook } = makeEmitter();
    emitter.partDamaged('part-03', 'rest-003', 'drop', 'extreme_negligence');
    expect(hook).toHaveBeenCalledWith(EVENTS.PART_DAMAGED, expect.objectContaining({
      tier_classification: 'extreme_negligence',
    }));
  });

  test('backward compat: omitting tierClassification emits tier_classification = null', () => {
    const { emitter, hook } = makeEmitter();
    emitter.partDamaged('part-04', 'rest-004', 'over_torque');
    expect(hook).toHaveBeenCalledWith(EVENTS.PART_DAMAGED, expect.objectContaining({
      tier_classification: null,
    }));
  });

  test('payload still includes partId, restorationId, eventType (existing fields unaffected)', () => {
    const { emitter, hook } = makeEmitter();
    emitter.partDamaged('part-05', 'rest-005', 'snap', 'significant_damage');
    const payload = hook.mock.calls[0][1];
    expect(payload.partId).toBe('part-05');
    expect(payload.restorationId).toBe('rest-005');
    expect(payload.eventType).toBe('snap');
  });
});


// ---------------------------------------------------------------------------
// partDamageRecoveryChosen — regression: unaffected by Issue #153 changes
// ---------------------------------------------------------------------------

describe('partDamageRecoveryChosen — regression (Issue #148 event unaffected)', () => {
  test('partDamageRecoveryChosen emits correct event name', () => {
    const { emitter, hook } = makeEmitter();
    emitter.partDamageRecoveryChosen('part-01', 'rest-001', 'ordered');
    expect(hook).toHaveBeenCalledWith(EVENTS.PART_DAMAGE_RECOVERY_CHOSEN, expect.objectContaining({
      partId:       'part-01',
      restorationId: 'rest-001',
      playerChoice:  'ordered',
    }));
  });

  test('partDamageRecoveryChosen with "declined" choice emits correctly', () => {
    const { emitter, hook } = makeEmitter();
    emitter.partDamageRecoveryChosen('part-02', 'rest-002', 'declined');
    expect(hook.mock.calls[0][1].playerChoice).toBe('declined');
  });
});


// ---------------------------------------------------------------------------
// EVENTS constants — PART_DAMAGED exists (regression)
// ---------------------------------------------------------------------------

describe('EVENTS constants — regression', () => {
  test('EVENTS.PART_DAMAGED is defined', () => {
    expect(EVENTS.PART_DAMAGED).toBe('part_damaged');
  });

  test('EVENTS.PART_DAMAGE_RECOVERY_CHOSEN is defined', () => {
    expect(EVENTS.PART_DAMAGE_RECOVERY_CHOSEN).toBe('part_damage_recovery_chosen');
  });
});
