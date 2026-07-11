/**
 * Tests for ComponentPositionValidator.js — Issue #84.
 *
 * Acceptance Criteria covered:
 *   AC1: Scattered components rendered in non-standard arrangement — validated by
 *        ComponentPositionValidator recognising non-canonical vs canonical positions.
 *   AC1: Player must use bent-hand straightening tool and component repositioning
 *        before repair can be completed — enforced by areAllComponentsRepositioned.
 *   AC6 (Test Scenario 6 — no softlock): Player attempts reassembly before all
 *        scattered components are repositioned → warning surfaces, path stays open.
 *   Test Scenario 1 (Happy path): full scattered-component repair sequence.
 *   Test Scenario 3 (Persistence): repositioned state tracked per-component.
 */

'use strict';

const {
  ComponentPositionValidator,
  DEFAULT_COMPONENT_TOLERANCES,
  FALLBACK_TOLERANCE,
} = require('../../../src/reassembly/ComponentPositionValidator');

// ─── Default tolerance values ─────────────────────────────────────────────────

describe('ComponentPositionValidator — default tolerances', () => {
  test('has tolerances for all expected watch-movement components', () => {
    const expected = ['balance_wheel', 'pallet_fork', 'balance_cock', 'escape_wheel', 'hour_hand', 'minute_hand'];
    for (const comp of expected) {
      expect(DEFAULT_COMPONENT_TOLERANCES[comp]).toBeDefined();
    }
  });

  test('all default tolerances have positive position_tolerance and rotation_tolerance', () => {
    for (const [, tol] of Object.entries(DEFAULT_COMPONENT_TOLERANCES)) {
      expect(tol.position_tolerance).toBeGreaterThan(0);
      expect(tol.rotation_tolerance).toBeGreaterThan(0);
    }
  });

  test('hand tolerances are tighter than movement-component tolerances (hands require precision)', () => {
    const handTol = DEFAULT_COMPONENT_TOLERANCES.hour_hand;
    const movTol  = DEFAULT_COMPONENT_TOLERANCES.balance_wheel;
    expect(handTol.position_tolerance).toBeLessThan(movTol.position_tolerance);
  });

  test('FALLBACK_TOLERANCE has positive values', () => {
    expect(FALLBACK_TOLERANCE.position_tolerance).toBeGreaterThan(0);
    expect(FALLBACK_TOLERANCE.rotation_tolerance).toBeGreaterThan(0);
  });
});

// ─── isComponentRepositioned — within tolerance ───────────────────────────────

describe('ComponentPositionValidator — isComponentRepositioned', () => {
  const validator = new ComponentPositionValidator();
  const canonical = { x: 200, y: 200, rotation: 0 };

  test('exact canonical position is accepted', () => {
    expect(validator.isComponentRepositioned('balance_wheel', canonical, canonical)).toBe(true);
  });

  test('position within tolerance distance is accepted', () => {
    const tol = DEFAULT_COMPONENT_TOLERANCES.balance_wheel;
    const nearby = { x: 200 + tol.position_tolerance - 1, y: 200, rotation: 0 };
    expect(validator.isComponentRepositioned('balance_wheel', nearby, canonical)).toBe(true);
  });

  test('position just outside tolerance distance is rejected', () => {
    const tol = DEFAULT_COMPONENT_TOLERANCES.balance_wheel;
    const far = { x: 200 + tol.position_tolerance + 5, y: 200, rotation: 0 };
    expect(validator.isComponentRepositioned('balance_wheel', far, canonical)).toBe(false);
  });

  test('rotation within tolerance is accepted', () => {
    const tol = DEFAULT_COMPONENT_TOLERANCES.balance_wheel;
    const slightly_rotated = { x: 200, y: 200, rotation: tol.rotation_tolerance - 1 };
    expect(validator.isComponentRepositioned('balance_wheel', slightly_rotated, canonical)).toBe(true);
  });

  test('rotation just outside tolerance is rejected', () => {
    const tol = DEFAULT_COMPONENT_TOLERANCES.balance_wheel;
    const too_rotated = { x: 200, y: 200, rotation: tol.rotation_tolerance + 5 };
    expect(validator.isComponentRepositioned('balance_wheel', too_rotated, canonical)).toBe(false);
  });

  test('scattered position far from canonical is rejected (AC1: displaced = not repositioned)', () => {
    const scattered = { x: 280, y: 155, rotation: 42 }; // displaced as in scatter layout
    expect(validator.isComponentRepositioned('balance_wheel', scattered, canonical)).toBe(false);
  });

  test('uses FALLBACK_TOLERANCE for unknown component IDs', () => {
    const pos = { x: 200 + FALLBACK_TOLERANCE.position_tolerance - 1, y: 200, rotation: 0 };
    expect(validator.isComponentRepositioned('unknown_part', pos, canonical)).toBe(true);
  });

  test('rotation normalised across 360 boundary (359° = near 0°)', () => {
    const tol = DEFAULT_COMPONENT_TOLERANCES.balance_wheel;
    const nearZero = { x: 200, y: 200, rotation: 360 - (tol.rotation_tolerance - 1) };
    expect(validator.isComponentRepositioned('balance_wheel', nearZero, canonical)).toBe(true);
  });
});

// ─── areAllComponentsRepositioned ────────────────────────────────────────────

describe('ComponentPositionValidator — areAllComponentsRepositioned', () => {
  const validator = new ComponentPositionValidator();
  const canonical = {
    balance_wheel: { x: 200, y: 200, rotation: 0 },
    pallet_fork:   { x: 200, y: 200, rotation: 0 },
  };

  test('returns true when all components are at canonical positions', () => {
    const states = {
      balance_wheel: { x: 200, y: 200, rotation: 0 },
      pallet_fork:   { x: 200, y: 200, rotation: 0 },
    };
    expect(validator.areAllComponentsRepositioned(states, canonical)).toBe(true);
  });

  test('returns false when one component is still displaced (AC1: not complete)', () => {
    const states = {
      balance_wheel: { x: 280, y: 155, rotation: 42 }, // still displaced
      pallet_fork:   { x: 200, y: 200, rotation: 0 },  // repositioned
    };
    expect(validator.areAllComponentsRepositioned(states, canonical)).toBe(false);
  });

  test('returns false when a component is missing from states', () => {
    const states = {
      balance_wheel: { x: 200, y: 200, rotation: 0 },
      // pallet_fork missing
    };
    expect(validator.areAllComponentsRepositioned(states, canonical)).toBe(false);
  });

  test('returns true for empty canonical map (no components require repositioning)', () => {
    expect(validator.areAllComponentsRepositioned({}, {})).toBe(true);
  });
});

// ─── AC6 / Test Scenario 6: No-softlock — blocked reassembly warning ─────────

describe('ComponentPositionValidator — AC6/Scenario 6: incomplete-repair warning (no-softlock)', () => {
  const validator = new ComponentPositionValidator();
  const canonical = {
    balance_wheel: { x: 200, y: 200, rotation: 0 },
    pallet_fork:   { x: 200, y: 200, rotation: 0 },
    minute_hand:   { x: 200, y: 200, rotation: 0 },
  };

  test('getIncompleteComponents returns empty array when all done', () => {
    const states = {
      balance_wheel: { x: 200, y: 200, rotation: 0 },
      pallet_fork:   { x: 200, y: 200, rotation: 0 },
      minute_hand:   { x: 200, y: 200, rotation: 0 },
    };
    const incomplete = validator.getIncompleteComponents(states, canonical);
    expect(incomplete).toHaveLength(0);
  });

  test('getIncompleteComponents returns displaced component IDs', () => {
    const states = {
      balance_wheel: { x: 280, y: 155, rotation: 42 }, // displaced
      pallet_fork:   { x: 200, y: 200, rotation: 0 },  // done
      minute_hand:   { x: 200, y: 200, rotation: 25 }, // out of rotation tolerance
    };
    const incomplete = validator.getIncompleteComponents(states, canonical);
    expect(incomplete).toContain('balance_wheel');
    expect(incomplete).toContain('minute_hand');
    expect(incomplete).not.toContain('pallet_fork');
  });

  test('getIncompleteRepairWarning returns null when all components done', () => {
    expect(validator.getIncompleteRepairWarning([])).toBeNull();
  });

  test('getIncompleteRepairWarning returns string warning for incomplete components (AC6)', () => {
    const warning = validator.getIncompleteRepairWarning(['balance_wheel', 'minute_hand']);
    expect(typeof warning).toBe('string');
    expect(warning.length).toBeGreaterThan(0);
  });

  test('warning mentions the count of incomplete components', () => {
    const warning = validator.getIncompleteRepairWarning(['balance_wheel', 'minute_hand']);
    expect(warning).toMatch(/2 component/);
  });

  test('warning lists the incomplete component IDs', () => {
    const warning = validator.getIncompleteRepairWarning(['balance_wheel']);
    expect(warning).toContain('balance_wheel');
  });

  test('warning mentions reassembly is blocked', () => {
    const warning = validator.getIncompleteRepairWarning(['balance_wheel']);
    expect(warning.toLowerCase()).toMatch(/blocked|reassembl/);
  });
});

// ─── registerComponentTolerance — override tolerance ─────────────────────────

describe('ComponentPositionValidator — registerComponentTolerance', () => {
  test('can override tolerance for an existing component', () => {
    const validator = new ComponentPositionValidator();
    validator.registerComponentTolerance('balance_wheel', { position_tolerance: 5, rotation_tolerance: 3 });
    const tol = validator.getComponentTolerance('balance_wheel');
    expect(tol.position_tolerance).toBe(5);
    expect(tol.rotation_tolerance).toBe(3);
  });

  test('can register tolerance for a new component', () => {
    const validator = new ComponentPositionValidator();
    validator.registerComponentTolerance('second_hand', { position_tolerance: 8, rotation_tolerance: 5 });
    const tol = validator.getComponentTolerance('second_hand');
    expect(tol.position_tolerance).toBe(8);
  });

  test('throws for non-number tolerances', () => {
    const validator = new ComponentPositionValidator();
    expect(() => {
      validator.registerComponentTolerance('balance_wheel', { position_tolerance: 'big', rotation_tolerance: 5 });
    }).toThrow(/numbers/i);
  });

  test('throws for zero tolerance values', () => {
    const validator = new ComponentPositionValidator();
    expect(() => {
      validator.registerComponentTolerance('balance_wheel', { position_tolerance: 0, rotation_tolerance: 5 });
    }).toThrow(/positive/i);
  });
});

// ─── constructor tolerance overrides ─────────────────────────────────────────

describe('ComponentPositionValidator — constructor tolerance config overrides', () => {
  test('custom constructor config overrides matching defaults', () => {
    const validator = new ComponentPositionValidator({
      balance_wheel: { position_tolerance: 5, rotation_tolerance: 3 },
    });
    const tol = validator.getComponentTolerance('balance_wheel');
    expect(tol.position_tolerance).toBe(5);
    expect(tol.rotation_tolerance).toBe(3);
  });

  test('non-overridden defaults are preserved', () => {
    const validator = new ComponentPositionValidator({
      balance_wheel: { position_tolerance: 5, rotation_tolerance: 3 },
    });
    const tol = validator.getComponentTolerance('pallet_fork');
    expect(tol).toStrictEqual(DEFAULT_COMPONENT_TOLERANCES.pallet_fork);
  });
});

// ─── Test Scenario 1 (Happy path): scattered-component full repair sequence ──

describe('ComponentPositionValidator — Scenario 1: full shock damage repair path', () => {
  test('scattered → partial reposition → all done sequence works end-to-end', () => {
    const validator = new ComponentPositionValidator();
    const canonical = {
      balance_wheel: { x: 200, y: 200, rotation: 0 },
      pallet_fork:   { x: 200, y: 200, rotation: 0 },
    };

    // Start: both displaced (as in scatter layout)
    let states = {
      balance_wheel: { x: 280, y: 155, rotation: 42 },
      pallet_fork:   { x: 265, y: 175, rotation: -18 },
    };
    expect(validator.areAllComponentsRepositioned(states, canonical)).toBe(false);

    const incomplete1 = validator.getIncompleteComponents(states, canonical);
    expect(incomplete1).toContain('balance_wheel');
    expect(incomplete1).toContain('pallet_fork');
    const warning = validator.getIncompleteRepairWarning(incomplete1);
    expect(warning).not.toBeNull(); // reassembly blocked

    // Reposition balance_wheel
    states = { ...states, balance_wheel: { x: 200, y: 200, rotation: 0 } };
    expect(validator.areAllComponentsRepositioned(states, canonical)).toBe(false);

    // Reposition pallet_fork
    states = { ...states, pallet_fork: { x: 200, y: 200, rotation: 0 } };
    expect(validator.areAllComponentsRepositioned(states, canonical)).toBe(true);

    const incomplete2 = validator.getIncompleteComponents(states, canonical);
    expect(incomplete2).toHaveLength(0);
    expect(validator.getIncompleteRepairWarning(incomplete2)).toBeNull();
  });
});
