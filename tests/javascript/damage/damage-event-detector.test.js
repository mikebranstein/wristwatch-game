/**
 * Tests: DamageEventDetector — Issue #148
 *
 * AC1: When a part damage event triggers, the part is placed into a distinct
 *      broken/damaged visual state and a recovery prompt appears within 1 second.
 *
 * Run with: npm test
 */

'use strict';

const { DamageEventDetector, DAMAGE_EVENT_TYPES } = require('../../../src/damage/DamageEventDetector');

function makeDetector(onDamage = jest.fn()) {
  return new DamageEventDetector(onDamage);
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('DamageEventDetector — constructor', () => {
  test('throws when onDamage is not a function', () => {
    expect(() => new DamageEventDetector('not-a-fn')).toThrow(
      'DamageEventDetector requires an onDamage callback function.'
    );
  });

  test('constructs successfully with a valid callback', () => {
    expect(() => makeDetector()).not.toThrow();
  });
});

// ─── DAMAGE_EVENT_TYPES constants ────────────────────────────────────────────

describe('DAMAGE_EVENT_TYPES constants', () => {
  test('OVER_TORQUE is "over_torque"', () => {
    expect(DAMAGE_EVENT_TYPES.OVER_TORQUE).toBe('over_torque');
  });

  test('DROP is "drop"', () => {
    expect(DAMAGE_EVENT_TYPES.DROP).toBe('drop');
  });

  test('SNAP is "snap"', () => {
    expect(DAMAGE_EVENT_TYPES.SNAP).toBe('snap');
  });
});

// ─── AC1: registerDamageEvent() — broken visual state ────────────────────────

describe('DamageEventDetector — AC1: registerDamageEvent() sets broken visual state', () => {
  test('getPartState returns "broken" after damage event', () => {
    const d = makeDetector();
    d.registerDamageEvent('over_torque', 'part-001', 'rest-001');
    expect(d.getPartState('part-001')).toBe('broken');
  });

  test('broken state is clearly distinct from "installed" (undamaged default)', () => {
    const d = makeDetector();
    expect(d.getPartState('undamaged-part')).toBe('installed');
    d.registerDamageEvent('drop', 'part-abc', 'rest-001');
    expect(d.getPartState('part-abc')).toBe('broken');
    expect(d.getPartState('undamaged-part')).toBe('installed'); // unaffected
  });

  test('broken state is distinct from "missing" (never returned for registered parts)', () => {
    const d = makeDetector();
    d.registerDamageEvent('snap', 'part-snap', 'rest-001');
    // broken and missing are different values
    expect(d.getPartState('part-snap')).toBe('broken');
    expect(d.getPartState('part-snap')).not.toBe('missing');
    expect(d.getPartState('part-snap')).not.toBe('installed');
  });

  test('isPartDamaged returns true after damage event', () => {
    const d = makeDetector();
    expect(d.isPartDamaged('part-001')).toBe(false);
    d.registerDamageEvent('over_torque', 'part-001', 'rest-001');
    expect(d.isPartDamaged('part-001')).toBe(true);
  });

  test('getDamageRecord returns correct record after damage event', () => {
    const d = makeDetector();
    d.registerDamageEvent('drop', 'part-dropped', 'rest-xyz');
    const rec = d.getDamageRecord('part-dropped');
    expect(rec).not.toBeNull();
    expect(rec.state).toBe('broken');
    expect(rec.eventType).toBe('drop');
    expect(rec.restorationId).toBe('rest-xyz');
  });

  test('getDamageRecord returns null for undamaged part', () => {
    const d = makeDetector();
    expect(d.getDamageRecord('no-such-part')).toBeNull();
  });
});

// ─── AC1: onDamage callback fires synchronously ───────────────────────────────

describe('DamageEventDetector — AC1: onDamage callback fires synchronously (≤1s)', () => {
  test('onDamage callback is invoked synchronously on registerDamageEvent', () => {
    const onDamage = jest.fn();
    const d = new DamageEventDetector(onDamage);
    d.registerDamageEvent('over_torque', 'part-001', 'rest-001');
    expect(onDamage).toHaveBeenCalledTimes(1);
  });

  test('callback receives correct event object', () => {
    const onDamage = jest.fn();
    const d = new DamageEventDetector(onDamage);
    d.registerDamageEvent('drop', 'part-dropped', 'rest-99');
    const [event] = onDamage.mock.calls[0];
    expect(event.partId).toBe('part-dropped');
    expect(event.restorationId).toBe('rest-99');
    expect(event.eventType).toBe('drop');
    expect(typeof event.timestamp).toBe('number');
  });
});

// ─── Multiple damage events in one restoration (AC4 scenario) ────────────────

describe('DamageEventDetector — multi-damage (AC4)', () => {
  test('two separate parts can be damaged independently', () => {
    const d = makeDetector();
    d.registerDamageEvent('over_torque', 'part-A', 'rest-001');
    d.registerDamageEvent('drop', 'part-B', 'rest-001');
    expect(d.getPartState('part-A')).toBe('broken');
    expect(d.getPartState('part-B')).toBe('broken');
  });

  test('getDamagedPartIds returns all damaged parts', () => {
    const d = makeDetector();
    d.registerDamageEvent('snap', 'part-X', 'rest-001');
    d.registerDamageEvent('drop', 'part-Y', 'rest-001');
    const ids = d.getDamagedPartIds();
    expect(ids).toContain('part-X');
    expect(ids).toContain('part-Y');
    expect(ids).toHaveLength(2);
  });
});

// ─── clearDamage (after replacement installed) ───────────────────────────────

describe('DamageEventDetector — clearDamage()', () => {
  test('part returns to "installed" state after clearDamage()', () => {
    const d = makeDetector();
    d.registerDamageEvent('over_torque', 'part-clear', 'rest-001');
    expect(d.getPartState('part-clear')).toBe('broken');
    d.clearDamage('part-clear');
    expect(d.getPartState('part-clear')).toBe('installed');
  });

  test('clearDamage removes partId from getDamagedPartIds()', () => {
    const d = makeDetector();
    d.registerDamageEvent('drop', 'part-Z', 'rest-001');
    d.clearDamage('part-Z');
    expect(d.getDamagedPartIds()).not.toContain('part-Z');
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('DamageEventDetector — input validation', () => {
  test('throws on unknown eventType', () => {
    const d = makeDetector();
    expect(() => d.registerDamageEvent('cosmic_ray', 'part-001', 'rest-001')).toThrow(
      'Unknown damage event type'
    );
  });

  test('throws on empty partId', () => {
    const d = makeDetector();
    expect(() => d.registerDamageEvent('drop', '', 'rest-001')).toThrow(
      'partId must be a non-empty string'
    );
  });

  test('throws on empty restorationId', () => {
    const d = makeDetector();
    expect(() => d.registerDamageEvent('drop', 'part-001', '')).toThrow(
      'restorationId must be a non-empty string'
    );
  });
});
