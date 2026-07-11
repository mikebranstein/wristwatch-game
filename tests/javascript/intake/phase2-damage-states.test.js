/**
 * Tests for Phase2DamageStates.js and WatchIntake.js Phase 2 integration — Issue #84.
 *
 * Acceptance Criteria covered:
 *   AC1: Given a watch arrives with the Shock Damage state, when the player opens the
 *        movement, then displaced/scattered components and bent hands are visually rendered
 *        — verified via externalCues and diagnosticSignature at intake view.
 *   AC2: Given a watch arrives with Rust-Fused Fasteners, when attempting standard
 *        disassembly, then fused fasteners resist removal — verified via cues and repair path.
 *   AC4: Player can identify damage type from intake/inspection view alone — verified via
 *        externalCues presence and diagnosticSignature before opening movement.
 *   AC7 (Test Scenario 7): Phase 2 states appear alongside Phase 1 in the random pool
 *        (additive, not replacing).
 *   AC8 (Test Scenario 8): Phase 1 states unaffected after Phase 2 code ships.
 *   AC9 (Test Scenario 9): Standard wear unaffected after Phase 2 ships.
 */

'use strict';

const {
  PHASE2_DAMAGE_STATES,
  PHASE2_DAMAGE_STATE_CUES,
  PHASE2_DEFAULT_WEIGHTS,
  getPhase2VisualCues,
  getAllPhase2DamageStateDescriptors,
  isPhase2DamageState,
} = require('../../../src/intake/Phase2DamageStates');

const {
  WatchIntake,
  PHASE1_DAMAGE_STATES,
  DAMAGE_STATE_VISUAL_CUES,
  ALL_DAMAGE_STATE_VISUAL_CUES,
  DEFAULT_INTAKE_CONFIG,
  PHASE2_INTAKE_CONFIG,
} = require('../../../src/intake/WatchIntake');

// ─── Deterministic RNG helpers ────────────────────────────────────────────────

const fixedRng = (value) => () => value;
const sequenceRng = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

// ─── Phase 2 state definitions ────────────────────────────────────────────────

describe('Phase2DamageStates — state array and identifiers', () => {
  test('PHASE2_DAMAGE_STATES contains exactly shock_damage and rust_fused_fasteners', () => {
    expect(PHASE2_DAMAGE_STATES).toContain('shock_damage');
    expect(PHASE2_DAMAGE_STATES).toContain('rust_fused_fasteners');
    expect(PHASE2_DAMAGE_STATES).toHaveLength(2);
  });

  test('isPhase2DamageState returns true for Phase 2 IDs', () => {
    expect(isPhase2DamageState('shock_damage')).toBe(true);
    expect(isPhase2DamageState('rust_fused_fasteners')).toBe(true);
  });

  test('isPhase2DamageState returns false for Phase 1 IDs', () => {
    expect(isPhase2DamageState('water_ingress')).toBe(false);
    expect(isPhase2DamageState('oxidation')).toBe(false);
    expect(isPhase2DamageState('crystal_crazing')).toBe(false);
  });

  test('isPhase2DamageState returns false for null/unknown', () => {
    expect(isPhase2DamageState(null)).toBe(false);
    expect(isPhase2DamageState('unknown_state')).toBe(false);
  });

  test('getAllPhase2DamageStateDescriptors returns 2 entries', () => {
    const descriptors = getAllPhase2DamageStateDescriptors();
    expect(descriptors).toHaveLength(2);
    expect(descriptors.every(d => d && d.id)).toBe(true);
  });

  test('PHASE2_DEFAULT_WEIGHTS has entries for both Phase 2 states', () => {
    expect(PHASE2_DEFAULT_WEIGHTS.shock_damage).toBeGreaterThan(0);
    expect(PHASE2_DEFAULT_WEIGHTS.rust_fused_fasteners).toBeGreaterThan(0);
  });
});

// ─── AC4: External cues visible at intake view (before opening movement) ─────

describe('Phase2DamageStates — AC4: external cues identifiable at intake', () => {
  test.each(PHASE2_DAMAGE_STATES)(
    'getPhase2VisualCues("%s") returns non-null with externalCues array',
    (stateId) => {
      const cues = getPhase2VisualCues(stateId);
      expect(cues).not.toBeNull();
      expect(Array.isArray(cues.externalCues)).toBe(true);
      expect(cues.externalCues.length).toBeGreaterThan(0);
    }
  );

  test('shock_damage externalCues include visible case deformation', () => {
    const cues = getPhase2VisualCues('shock_damage');
    const allCues = cues.externalCues.join(' ').toLowerCase();
    expect(allCues).toMatch(/dent|deform/);
  });

  test('shock_damage externalCues include bent hands visible through crystal', () => {
    const cues = getPhase2VisualCues('shock_damage');
    const allCues = cues.externalCues.join(' ').toLowerCase();
    expect(allCues).toMatch(/hand|bent/);
  });

  test('rust_fused_fasteners externalCues include rust staining at fastener heads', () => {
    const cues = getPhase2VisualCues('rust_fused_fasteners');
    const allCues = cues.externalCues.join(' ').toLowerCase();
    expect(allCues).toMatch(/rust|corrosi/);
  });

  test.each(PHASE2_DAMAGE_STATES)(
    'getPhase2VisualCues("%s") has a non-empty diagnosticSignature',
    (stateId) => {
      const cues = getPhase2VisualCues(stateId);
      expect(typeof cues.diagnosticSignature).toBe('string');
      expect(cues.diagnosticSignature.length).toBeGreaterThan(20);
    }
  );

  test.each(PHASE2_DAMAGE_STATES)(
    'getPhase2VisualCues("%s") has a thumbnail-worthy beforeDescription',
    (stateId) => {
      const cues = getPhase2VisualCues(stateId);
      expect(typeof cues.thumbnailDescription).toBe('string');
      expect(cues.thumbnailDescription.length).toBeGreaterThan(30);
    }
  );

  test('getPhase2VisualCues returns null for unknown state', () => {
    expect(getPhase2VisualCues('not_a_state')).toBeNull();
  });
});

// ─── AC1: Shock Damage repair path (bent-hand + component repositioning) ─────

describe('Phase2DamageStates — AC1: Shock Damage repair path', () => {
  test('shock_damage repair path contains bent-hand straightening step', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.shock_damage;
    expect(cues.repairPath).toContain('use_bent_hand_straightening_tool');
  });

  test('shock_damage repair path contains component repositioning step', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.shock_damage;
    expect(cues.repairPath).toContain('reposition_all_displaced_components');
  });

  test('shock_damage repair path contains balance staff replacement', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.shock_damage;
    expect(cues.repairPath).toContain('replace_cracked_balance_staff');
  });

  test('shock_damage repair path contains timing regulation', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.shock_damage;
    expect(cues.repairPath).toContain('run_timing_regulation');
  });

  test('shock_damage repair path has at least 4 steps (full no-softlock path)', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.shock_damage;
    expect(cues.repairPath.length).toBeGreaterThanOrEqual(4);
  });

  test('shock_damage requiredPartIds includes bent-hand-straightening-tool', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.shock_damage;
    expect(cues.requiredPartIds).toContain('bent-hand-straightening-tool');
  });
});

// ─── AC2: Rust-Fused Fasteners repair path (penetrant → extractor sequence) ──

describe('Phase2DamageStates — AC2: Rust-Fused Fasteners repair path', () => {
  test('rust_fused_fasteners repair path contains penetrant application step', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.rust_fused_fasteners;
    expect(cues.repairPath).toContain('apply_penetrant_to_fused_fasteners');
  });

  test('rust_fused_fasteners repair path contains fastener extractor step', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.rust_fused_fasteners;
    expect(cues.repairPath).toContain('use_fastener_extractor_tool');
  });

  test('rust_fused_fasteners repair path contains standard disassembly step after extraction', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.rust_fused_fasteners;
    expect(cues.repairPath).toContain('complete_standard_disassembly');
  });

  test('penetrant step comes before extractor step in repair path', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.rust_fused_fasteners;
    const penetrantIdx = cues.repairPath.indexOf('apply_penetrant_to_fused_fasteners');
    const extractorIdx = cues.repairPath.indexOf('use_fastener_extractor_tool');
    expect(penetrantIdx).toBeGreaterThanOrEqual(0);
    expect(extractorIdx).toBeGreaterThan(penetrantIdx);
  });

  test('rust_fused_fasteners repair path has at least 4 steps (full no-softlock path)', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.rust_fused_fasteners;
    expect(cues.repairPath.length).toBeGreaterThanOrEqual(4);
  });

  test('rust_fused_fasteners requiredPartIds includes penetrant-applicator', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.rust_fused_fasteners;
    expect(cues.requiredPartIds).toContain('penetrant-applicator');
  });

  test('rust_fused_fasteners requiredPartIds includes fastener-extractor', () => {
    const cues = PHASE2_DAMAGE_STATE_CUES.rust_fused_fasteners;
    expect(cues.requiredPartIds).toContain('fastener-extractor');
  });
});

// ─── ALL_DAMAGE_STATE_VISUAL_CUES merges Phase 1 and Phase 2 ─────────────────

describe('WatchIntake — ALL_DAMAGE_STATE_VISUAL_CUES includes Phase 1 + Phase 2', () => {
  test('ALL_DAMAGE_STATE_VISUAL_CUES contains all Phase 1 states', () => {
    for (const id of PHASE1_DAMAGE_STATES) {
      expect(ALL_DAMAGE_STATE_VISUAL_CUES[id]).toBeDefined();
    }
  });

  test('ALL_DAMAGE_STATE_VISUAL_CUES contains both Phase 2 states', () => {
    expect(ALL_DAMAGE_STATE_VISUAL_CUES['shock_damage']).toBeDefined();
    expect(ALL_DAMAGE_STATE_VISUAL_CUES['rust_fused_fasteners']).toBeDefined();
  });

  test('Phase 1 entries in ALL_DAMAGE_STATE_VISUAL_CUES are unmodified (regression)', () => {
    // Phase 1 entry must be identical reference to original DAMAGE_STATE_VISUAL_CUES
    expect(ALL_DAMAGE_STATE_VISUAL_CUES.water_ingress).toStrictEqual(DAMAGE_STATE_VISUAL_CUES.water_ingress);
    expect(ALL_DAMAGE_STATE_VISUAL_CUES.oxidation).toStrictEqual(DAMAGE_STATE_VISUAL_CUES.oxidation);
    expect(ALL_DAMAGE_STATE_VISUAL_CUES.crystal_crazing).toStrictEqual(DAMAGE_STATE_VISUAL_CUES.crystal_crazing);
  });
});

// ─── WatchIntake.getVisualCues: works for Phase 2 states ─────────────────────

describe('WatchIntake — getVisualCues supports Phase 2 states', () => {
  const intake = new WatchIntake();

  test.each(PHASE2_DAMAGE_STATES)(
    'getVisualCues("%s") returns non-null with externalCues',
    (stateId) => {
      const cues = intake.getVisualCues(stateId);
      expect(cues).not.toBeNull();
      expect(Array.isArray(cues.externalCues)).toBe(true);
      expect(cues.externalCues.length).toBeGreaterThan(0);
    }
  );

  test.each(PHASE2_DAMAGE_STATES)(
    'getRepairPath("%s") returns non-empty array for Phase 2 states',
    (stateId) => {
      const path = intake.getRepairPath(stateId);
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBeGreaterThan(0);
    }
  );

  test.each(PHASE2_DAMAGE_STATES)(
    'getRequiredPartIds("%s") returns non-empty array for Phase 2 states',
    (stateId) => {
      const parts = intake.getRequiredPartIds(stateId);
      expect(Array.isArray(parts)).toBe(true);
      expect(parts.length).toBeGreaterThan(0);
    }
  );
});

// ─── AC7 (Test Scenario 7): Phase 2 pool integration — additive alongside Phase 1 ──

describe('WatchIntake — AC7/Scenario 7: Phase 2 states in damage pool (additive)', () => {
  test('with PHASE2_INTAKE_CONFIG, assignDamageState can return Phase 2 states', () => {
    // Drive every intake call to return a damage state (intakeRate=1.0 equivalent)
    // and cycle through all weights to ensure Phase 2 states appear
    const seenStates = new Set();
    // Use PHASE2_INTAKE_CONFIG but force all intake checks to trigger damage state
    const intake = new WatchIntake(
      { intakeRate: 1.0, weights: PHASE2_INTAKE_CONFIG.weights },
      sequenceRng([0.0, 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95])
    );
    for (let i = 0; i < 60; i++) {
      const s = intake.assignDamageState();
      if (s) seenStates.add(s);
    }
    expect(seenStates.has('shock_damage')).toBe(true);
    expect(seenStates.has('rust_fused_fasteners')).toBe(true);
  });

  test('Phase 1 states still appear when Phase 2 weights are in config (additive)', () => {
    const seenStates = new Set();
    const intake = new WatchIntake(
      { intakeRate: 1.0, weights: PHASE2_INTAKE_CONFIG.weights },
      sequenceRng([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
    );
    for (let i = 0; i < 50; i++) {
      const s = intake.assignDamageState();
      if (s) seenStates.add(s);
    }
    expect(seenStates.has('water_ingress')).toBe(true);
    expect(seenStates.has('oxidation')).toBe(true);
    expect(seenStates.has('crystal_crazing')).toBe(true);
  });

  test('default config does NOT include Phase 2 states (Phase 1-only deployment guard)', () => {
    // Default weights only have Phase 1 states — Phase 2 must not leak into Phase 1 builds
    expect(DEFAULT_INTAKE_CONFIG.weights.shock_damage).toBeUndefined();
    expect(DEFAULT_INTAKE_CONFIG.weights.rust_fused_fasteners).toBeUndefined();
  });

  test('PHASE2_INTAKE_CONFIG is a valid config with 5 damage state weights', () => {
    const weightKeys = Object.keys(PHASE2_INTAKE_CONFIG.weights);
    expect(weightKeys).toHaveLength(5);
    expect(weightKeys).toContain('water_ingress');
    expect(weightKeys).toContain('shock_damage');
    expect(weightKeys).toContain('rust_fused_fasteners');
  });
});

// ─── AC8 (Test Scenario 8): Phase 1 states unaffected after Phase 2 code ships ─

describe('WatchIntake — AC8/Scenario 8: Phase 1 regression after Phase 2 code ships', () => {
  const intake = new WatchIntake(); // Phase 1-only config

  test.each(PHASE1_DAMAGE_STATES)('Phase 1 state "%s" still has valid externalCues', (id) => {
    const cues = intake.getVisualCues(id);
    expect(cues).not.toBeNull();
    expect(cues.externalCues.length).toBeGreaterThan(0);
  });

  test.each(PHASE1_DAMAGE_STATES)('Phase 1 state "%s" still has valid repair path', (id) => {
    expect(intake.getRepairPath(id).length).toBeGreaterThan(0);
  });

  test.each(PHASE1_DAMAGE_STATES)('Phase 1 state "%s" still has required part IDs', (id) => {
    expect(intake.getRequiredPartIds(id).length).toBeGreaterThan(0);
  });

  test('Phase 1-only config assignDamageState never returns Phase 2 states', () => {
    const intake2 = new WatchIntake(DEFAULT_INTAKE_CONFIG, fixedRng(0.0));
    const results = new Set();
    for (let i = 0; i < 200; i++) {
      results.add(intake2.assignDamageState());
    }
    expect(results.has('shock_damage')).toBe(false);
    expect(results.has('rust_fused_fasteners')).toBe(false);
  });
});

// ─── AC9 (Test Scenario 9): Standard wear unaffected ─────────────────────────

describe('WatchIntake — AC9/Scenario 9: standard wear unaffected after Phase 2 ships', () => {
  const intake = new WatchIntake(PHASE2_INTAKE_CONFIG);

  test('null damage state still returns empty repair path', () => {
    expect(intake.getRepairPath(null)).toEqual([]);
  });

  test('null damage state still returns empty required parts', () => {
    expect(intake.getRequiredPartIds(null)).toEqual([]);
  });

  test('null damage state still returns null visual cues', () => {
    expect(intake.getVisualCues(null)).toBeNull();
  });
});
