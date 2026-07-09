/**
 * Tests for SnapZoneTolerance — Phase 1 (Issue #76)
 *
 * Covers:
 *   - Two-radius model: approach_radius >= 2 × lock_radius invariant
 *   - getZone() returns correct constants per part
 *   - isInApproachZone / isInLockZone boundary conditions
 *   - Screen-context guard (non-reassembly context throws)
 *   - Unknown part ID throws
 *   - getSupportedParts() returns full part list
 */

const { SnapZoneTolerance, SNAP_ZONES } = require('../../src/reassembly/SnapZoneTolerance');

describe('SnapZoneTolerance — 2× radius invariant', () => {
  test('every part satisfies approach_radius >= 2 × lock_radius', () => {
    for (const [partId, zone] of Object.entries(SNAP_ZONES)) {
      expect(zone.approach_radius).toBeGreaterThanOrEqual(2 * zone.lock_radius);
    }
  });

  test('approach_radius is strictly greater than lock_radius for all parts', () => {
    for (const zone of Object.values(SNAP_ZONES)) {
      expect(zone.approach_radius).toBeGreaterThan(zone.lock_radius);
    }
  });
});

describe('SnapZoneTolerance — getZone()', () => {
  let szt;
  beforeEach(() => { szt = new SnapZoneTolerance('reassembly'); });

  test('getZone returns approach_radius and lock_radius for a known part', () => {
    const zone = szt.getZone('balance_wheel');
    expect(zone).toHaveProperty('approach_radius');
    expect(zone).toHaveProperty('lock_radius');
    expect(typeof zone.approach_radius).toBe('number');
    expect(typeof zone.lock_radius).toBe('number');
  });

  test('getZone returns a copy — mutations do not affect the internal map', () => {
    const zone = szt.getZone('dial');
    zone.approach_radius = 9999;
    expect(szt.getZone('dial').approach_radius).not.toBe(9999);
  });

  test('getZone throws for an unknown part ID', () => {
    expect(() => szt.getZone('unknown_part')).toThrow(/unknown part ID/i);
  });

  test('getZone throws when screenContext is not "reassembly"', () => {
    const badCtx = new SnapZoneTolerance('teardown');
    expect(() => badCtx.getZone('dial')).toThrow(/only valid in the "reassembly" context/i);
  });
});

describe('SnapZoneTolerance — isInApproachZone()', () => {
  let szt;
  beforeEach(() => { szt = new SnapZoneTolerance('reassembly'); });

  test('returns true when distance equals approach_radius (boundary)', () => {
    const { approach_radius } = SNAP_ZONES.dial;
    expect(szt.isInApproachZone('dial', approach_radius)).toBe(true);
  });

  test('returns true when distance is less than approach_radius', () => {
    const { approach_radius } = SNAP_ZONES.dial;
    expect(szt.isInApproachZone('dial', approach_radius - 1)).toBe(true);
  });

  test('returns false when distance exceeds approach_radius', () => {
    const { approach_radius } = SNAP_ZONES.dial;
    expect(szt.isInApproachZone('dial', approach_radius + 1)).toBe(false);
  });

  test('returns false at distance 0 + approach_radius + 1 for escape_wheel', () => {
    const { approach_radius } = SNAP_ZONES.escape_wheel;
    expect(szt.isInApproachZone('escape_wheel', approach_radius + 1)).toBe(false);
  });
});

describe('SnapZoneTolerance — isInLockZone()', () => {
  let szt;
  beforeEach(() => { szt = new SnapZoneTolerance('reassembly'); });

  test('returns true when distance equals lock_radius (boundary)', () => {
    const { lock_radius } = SNAP_ZONES.balance_wheel;
    expect(szt.isInLockZone('balance_wheel', lock_radius)).toBe(true);
  });

  test('returns true when distance is less than lock_radius', () => {
    const { lock_radius } = SNAP_ZONES.balance_wheel;
    expect(szt.isInLockZone('balance_wheel', lock_radius - 1)).toBe(true);
  });

  test('returns false when distance exceeds lock_radius', () => {
    const { lock_radius } = SNAP_ZONES.balance_wheel;
    expect(szt.isInLockZone('balance_wheel', lock_radius + 1)).toBe(false);
  });

  test('part is in approach zone but NOT in lock zone at midpoint distance', () => {
    const { approach_radius, lock_radius } = SNAP_ZONES.barrel;
    const midpoint = Math.floor((approach_radius + lock_radius) / 2) + 1;
    expect(szt.isInApproachZone('barrel', midpoint)).toBe(true);
    expect(szt.isInLockZone('barrel', midpoint)).toBe(false);
  });
});

describe('SnapZoneTolerance — getSupportedParts()', () => {
  test('returns an array of strings', () => {
    const szt = new SnapZoneTolerance('reassembly');
    const parts = szt.getSupportedParts();
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
    parts.forEach((p) => expect(typeof p).toBe('string'));
  });

  test('returned list matches the keys of SNAP_ZONES', () => {
    const szt = new SnapZoneTolerance('reassembly');
    expect(szt.getSupportedParts().sort()).toEqual(Object.keys(SNAP_ZONES).sort());
  });
});
