/**
 * Tests for SnapZoneTolerance — AC1: Tiered snap zone tolerance model.
 *
 * AC1: Snap zones implement a tiered tolerance model — approach/placement radius
 * is at minimum 2× larger than the final confirmation lock radius; confirmed by
 * design spec and playtester observation.
 *
 * Test Scenarios covered:
 *   Scenario 1  — Happy path: correct placement hits lock zone
 *   Scenario 3  — Approach proximity without correct orientation
 *   Scenario 4  — No interaction / far from snap zone → outside
 *   Scenario 5  — Final confirmation lock precision preserved
 *   Scenario 6  — Wrong part attempted: unknown part rejected
 *   Scenario 8  — Regression: disassembly context rejected
 */

const { SnapZoneTolerance, DEFAULT_TOLERANCES, ALLOWED_CONTEXTS } = require('../../../src/reassembly/SnapZoneTolerance');

// ─── Constructor guards ───────────────────────────────────────────────────────

describe('SnapZoneTolerance — constructor context guard (Scenario 8 regression)', () => {
  test('constructs successfully with "reassembly" context', () => {
    expect(() => new SnapZoneTolerance('reassembly')).not.toThrow();
  });

  test('throws when context is "teardown"', () => {
    expect(() => new SnapZoneTolerance('teardown')).toThrow(/allowed/i);
  });

  test('throws when context is "disassembly"', () => {
    expect(() => new SnapZoneTolerance('disassembly')).toThrow(/allowed/i);
  });

  test('throws when context is empty string', () => {
    expect(() => new SnapZoneTolerance('')).toThrow();
  });

  test('throws when context is null', () => {
    expect(() => new SnapZoneTolerance(null)).toThrow();
  });

  test('getContext() returns "reassembly"', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(sz.getContext()).toBe('reassembly');
  });
});

// ─── 2× constraint enforcement (AC1) ─────────────────────────────────────────

describe('AC1 — 2× tiered tolerance constraint enforcement', () => {
  test('registerPart accepts approach_radius = exactly 2 × lock_radius', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.registerPart('test_part', { approach_radius: 40, lock_radius: 20 })).not.toThrow();
  });

  test('registerPart accepts approach_radius > 2 × lock_radius', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.registerPart('test_part', { approach_radius: 100, lock_radius: 20 })).not.toThrow();
  });

  test('registerPart throws when approach_radius < 2 × lock_radius', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.registerPart('bad_part', { approach_radius: 30, lock_radius: 20 })).toThrow(/AC1/);
  });

  test('registerPart throws when approach_radius = 1.9 × lock_radius (just below constraint)', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.registerPart('bad_part', { approach_radius: 38, lock_radius: 20 })).toThrow(/AC1/);
  });

  test('registerPart throws when lock_radius is 0', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.registerPart('bad_part', { approach_radius: 0, lock_radius: 0 })).toThrow();
  });

  test('registerPart throws when radii are not numbers', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.registerPart('bad_part', { approach_radius: '60', lock_radius: 20 })).toThrow(/numbers/i);
  });

  test('default tolerances all satisfy the 2× constraint', () => {
    for (const [partId, tol] of Object.entries(DEFAULT_TOLERANCES)) {
      expect(tol.approach_radius).toBeGreaterThanOrEqual(2 * tol.lock_radius);
    }
  });
});

// ─── Zone evaluation (AC1, Scenarios 1, 3, 4, 5) ─────────────────────────────

describe('AC1 — getZone() zone evaluation', () => {
  let sz;
  const APPROACH = 60;
  const LOCK = 20;

  beforeEach(() => {
    sz = new SnapZoneTolerance('reassembly');
    sz.registerPart('mainspring', { approach_radius: APPROACH, lock_radius: LOCK });
  });

  test('Scenario 4 — distance beyond approach radius → "outside"', () => {
    expect(sz.getZone('mainspring', APPROACH + 1)).toBe('outside');
  });

  test('distance exactly at approach radius boundary → "approach"', () => {
    expect(sz.getZone('mainspring', APPROACH)).toBe('approach');
  });

  test('Scenario 3 — distance inside approach but outside lock → "approach"', () => {
    expect(sz.getZone('mainspring', LOCK + 1)).toBe('approach');
  });

  test('Scenario 5 — distance exactly at lock radius boundary → "lock"', () => {
    expect(sz.getZone('mainspring', LOCK)).toBe('lock');
  });

  test('Scenario 1 — distance well inside lock radius → "lock"', () => {
    expect(sz.getZone('mainspring', 0)).toBe('lock');
  });

  test('distance of 1 inside lock radius → "lock"', () => {
    expect(sz.getZone('mainspring', LOCK - 1)).toBe('lock');
  });

  test('Scenario 5 — lock zone cannot be reached from approach zone alone without entering lock radius', () => {
    // Being in approach zone (LOCK+1) does not return 'lock'
    expect(sz.getZone('mainspring', LOCK + 1)).toBe('approach');
  });
});

// ─── Scenario 6 — Wrong part: unknown part throws ─────────────────────────────

describe('Scenario 6 — Unknown part handling', () => {
  test('getZone throws for an unregistered part', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.getZone('unknown_part', 10)).toThrow(/unknown part/i);
  });

  test('getTolerances throws for an unregistered part', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(() => sz.getTolerances('unknown_part')).toThrow(/unknown part/i);
  });
});

// ─── hasPart / getTolerances ──────────────────────────────────────────────────

describe('SnapZoneTolerance — hasPart and getTolerances', () => {
  test('hasPart returns true for a default part', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(sz.hasPart('mainspring')).toBe(true);
  });

  test('hasPart returns false for an unregistered part', () => {
    const sz = new SnapZoneTolerance('reassembly');
    expect(sz.hasPart('alien_component')).toBe(false);
  });

  test('getTolerances returns the correct values after registerPart', () => {
    const sz = new SnapZoneTolerance('reassembly');
    sz.registerPart('custom_part', { approach_radius: 80, lock_radius: 30 });
    expect(sz.getTolerances('custom_part')).toEqual({ approach_radius: 80, lock_radius: 30 });
  });

  test('getTolerances returns a copy (mutation does not affect internal state)', () => {
    const sz = new SnapZoneTolerance('reassembly');
    const tol = sz.getTolerances('mainspring');
    tol.approach_radius = 9999;
    expect(sz.getTolerances('mainspring').approach_radius).toBe(DEFAULT_TOLERANCES.mainspring.approach_radius);
  });

  test('all default watch parts are pre-loaded', () => {
    const sz = new SnapZoneTolerance('reassembly');
    const expectedParts = Object.keys(DEFAULT_TOLERANCES);
    for (const partId of expectedParts) {
      expect(sz.hasPart(partId)).toBe(true);
    }
  });
});

// ─── ALLOWED_CONTEXTS export ──────────────────────────────────────────────────

describe('SnapZoneTolerance — ALLOWED_CONTEXTS export', () => {
  test('ALLOWED_CONTEXTS contains "reassembly"', () => {
    expect(ALLOWED_CONTEXTS).toContain('reassembly');
  });

  test('ALLOWED_CONTEXTS does not contain teardown or disassembly', () => {
    expect(ALLOWED_CONTEXTS).not.toContain('teardown');
    expect(ALLOWED_CONTEXTS).not.toContain('disassembly');
  });
});
