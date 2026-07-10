/**
 * Tests for BeforeAfterComparison.js Phase 2 extensions — Issue #84.
 *
 * Acceptance Criteria covered:
 *   AC3: Given a player completes a Shock Damage restoration, when the completion
 *        screen is shown, then a before/after comparison is displayed that prominently
 *        features the scattered-component "before" state vs. the fully reassembled "after" state.
 *   Regression: Phase 1 before/after comparison still works correctly after Phase 2 ships.
 *   Standard wear: still returns null.
 */

'use strict';

const {
  BeforeAfterComparison,
  AFTER_DESCRIPTIONS,
  PHASE2_SCATTER_STATES,
} = require('../../src/completion/BeforeAfterComparison');

const PHASE1_DAMAGE_STATES = ['water_ingress', 'oxidation', 'crystal_crazing'];
const PHASE2_DAMAGE_STATES = ['shock_damage', 'rust_fused_fasteners'];

// ─── AC3: Phase 2 before/after comparison ────────────────────────────────────

describe('BeforeAfterComparison — AC3: Phase 2 before/after payload', () => {
  const comparison = new BeforeAfterComparison();

  test('buildPayload("shock_damage", ...) returns non-null payload', () => {
    const payload = comparison.buildPayload('shock_damage', ['use_bent_hand_straightening_tool']);
    expect(payload).not.toBeNull();
  });

  test('shock_damage payload has isPhase2 = true', () => {
    const payload = comparison.buildPayload('shock_damage', []);
    expect(payload.isPhase2).toBe(true);
  });

  test('shock_damage payload has a thumbnailDescription (dramatic "before" state)', () => {
    const payload = comparison.buildPayload('shock_damage', []);
    expect(typeof payload.beforeDescription).toBe('string');
    expect(payload.beforeDescription.length).toBeGreaterThan(20);
  });

  test('shock_damage beforeDescription mentions scattered/disarray state', () => {
    const payload = comparison.buildPayload('shock_damage', []);
    expect(payload.beforeDescription.toLowerCase()).toMatch(/scatter|disarray|bent|displace/);
  });

  test('shock_damage afterDescription mentions components repositioned and restored', () => {
    const payload = comparison.buildPayload('shock_damage', []);
    expect(payload.afterDescription.toLowerCase()).toMatch(/repositioned|restor|beats/);
  });

  test('shock_damage payload includes scatterSnapshot when provided (AC3: prominent before state)', () => {
    const snapshot = { layoutId: 'eta2824-scatter-a', capturedAt: 12345 };
    const payload = comparison.buildPayload('shock_damage', [], 'side_by_side', snapshot);
    expect(payload.scatterSnapshot).not.toBeNull();
    expect(payload.scatterSnapshot.layoutId).toBe('eta2824-scatter-a');
  });

  test('shock_damage payload scatterSnapshot is null when no snapshot provided', () => {
    const payload = comparison.buildPayload('shock_damage', []);
    expect(payload.scatterSnapshot).toBeNull();
  });

  test('rust_fused_fasteners payload is non-null with isPhase2 = true', () => {
    const payload = comparison.buildPayload('rust_fused_fasteners', []);
    expect(payload).not.toBeNull();
    expect(payload.isPhase2).toBe(true);
  });

  test('rust_fused_fasteners payload has an afterDescription', () => {
    const payload = comparison.buildPayload('rust_fused_fasteners', []);
    expect(typeof payload.afterDescription).toBe('string');
    expect(payload.afterDescription.length).toBeGreaterThan(20);
  });

  test('rust_fused_fasteners does NOT include scatterSnapshot', () => {
    const payload = comparison.buildPayload('rust_fused_fasteners', [], 'side_by_side', { layoutId: 'x' });
    expect(payload.scatterSnapshot).toBeNull(); // only shock_damage uses scatter snapshot
  });
});

// ─── requiresScatterSnapshot ──────────────────────────────────────────────────

describe('BeforeAfterComparison — requiresScatterSnapshot', () => {
  const comparison = new BeforeAfterComparison();

  test('requiresScatterSnapshot("shock_damage") = true', () => {
    expect(comparison.requiresScatterSnapshot('shock_damage')).toBe(true);
  });

  test('requiresScatterSnapshot("rust_fused_fasteners") = false', () => {
    expect(comparison.requiresScatterSnapshot('rust_fused_fasteners')).toBe(false);
  });

  test.each(PHASE1_DAMAGE_STATES)(
    'requiresScatterSnapshot("%s") = false (Phase 1)',
    (stateId) => {
      expect(comparison.requiresScatterSnapshot(stateId)).toBe(false);
    }
  );

  test('requiresScatterSnapshot(null) = false', () => {
    expect(comparison.requiresScatterSnapshot(null)).toBe(false);
  });

  test('PHASE2_SCATTER_STATES contains shock_damage', () => {
    expect(PHASE2_SCATTER_STATES).toContain('shock_damage');
  });
});

// ─── shouldShowComparison: Phase 2 states now covered ────────────────────────

describe('BeforeAfterComparison — shouldShowComparison covers Phase 2', () => {
  const comparison = new BeforeAfterComparison();

  test.each(PHASE2_DAMAGE_STATES)(
    'shouldShowComparison("%s") = true',
    (stateId) => {
      expect(comparison.shouldShowComparison(stateId)).toBe(true);
    }
  );

  test('shouldShowComparison(null) = false (standard wear)', () => {
    expect(comparison.shouldShowComparison(null)).toBe(false);
  });
});

// ─── AC3: AFTER_DESCRIPTIONS has Phase 2 entries ─────────────────────────────

describe('BeforeAfterComparison — AFTER_DESCRIPTIONS Phase 2 entries', () => {
  test('AFTER_DESCRIPTIONS has shock_damage entry', () => {
    expect(typeof AFTER_DESCRIPTIONS.shock_damage).toBe('string');
    expect(AFTER_DESCRIPTIONS.shock_damage.length).toBeGreaterThan(20);
  });

  test('AFTER_DESCRIPTIONS has rust_fused_fasteners entry', () => {
    expect(typeof AFTER_DESCRIPTIONS.rust_fused_fasteners).toBe('string');
    expect(AFTER_DESCRIPTIONS.rust_fused_fasteners.length).toBeGreaterThan(20);
  });
});

// ─── Phase 1 regression: Phase 1 before/after still works ────────────────────

describe('BeforeAfterComparison — Phase 1 regression (unaffected by Phase 2 changes)', () => {
  const comparison = new BeforeAfterComparison();

  test.each(PHASE1_DAMAGE_STATES)(
    'buildPayload("%s", ...) returns non-null payload (Phase 1 unaffected)',
    (stateId) => {
      const payload = comparison.buildPayload(stateId, []);
      expect(payload).not.toBeNull();
      expect(payload.damageStateId).toBe(stateId);
    }
  );

  test.each(PHASE1_DAMAGE_STATES)(
    'Phase 1 payload has isPhase2 = false',
    (stateId) => {
      const payload = comparison.buildPayload(stateId, []);
      expect(payload.isPhase2).toBe(false);
    }
  );

  test.each(PHASE1_DAMAGE_STATES)(
    'Phase 1 payload scatterSnapshot is null',
    (stateId) => {
      const payload = comparison.buildPayload(stateId, []);
      expect(payload.scatterSnapshot).toBeNull();
    }
  );

  test('buildPayload(null, ...) still returns null (standard wear unaffected)', () => {
    expect(comparison.buildPayload(null, [])).toBeNull();
  });

  test('Phase 1 displayMode setting still works', () => {
    const payload = comparison.buildPayload('water_ingress', [], 'animated_reveal');
    expect(payload.displayMode).toBe('animated_reveal');
  });

  test('water_ingress beforeCues array still present', () => {
    const payload = comparison.buildPayload('water_ingress', []);
    expect(Array.isArray(payload.beforeCues)).toBe(true);
    expect(payload.beforeCues.length).toBeGreaterThan(0);
  });

  test('repairStepsCompleted is preserved in payload', () => {
    const steps = ['apply_corrosion_cleaning_tool', 'replace_crown_and_gasket'];
    const payload = comparison.buildPayload('water_ingress', steps);
    expect(payload.repairStepsCompleted).toEqual(steps);
  });
});
