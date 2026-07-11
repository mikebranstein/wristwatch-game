/**
 * Tests for WatchIntake.js — Issue #81 Phase 1, AC1
 *
 * Acceptance Criterion 1:
 *   Given a player is at the watch intake screen,
 *   when a new watch is presented,
 *   then at least 1 of the 3 Phase 1 damage states can appear with visible
 *   external cues distinguishable before full disassembly — at a rate of ≥20%
 *   of watches after feature launch.
 *
 * Also covers:
 *   - AC2 (water_ingress repair path)
 *   - AC3 (oxidation repair path)
 *   - AC4 (crystal_crazing repair path)
 *   - Conditional tool availability (corrosion cleaning tool only for water_ingress)
 *   - Standard wear unaffected when damage state is null
 *   - Randomisation: distribution across all 3 types confirmed
 */

'use strict';

const {
  WatchIntake,
  PHASE1_DAMAGE_STATES,
  DAMAGE_STATE_VISUAL_CUES,
  DEFAULT_INTAKE_CONFIG,
} = require('../../../src/intake/WatchIntake');

// ─── Deterministic RNG helpers ────────────────────────────────────────────────

/** Always returns the same value */
const fixedRng = (value) => () => value;

/** Returns values from a fixed sequence, cycling */
const sequenceRng = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

// ─── AC1: Intake rate ≥ 20% ───────────────────────────────────────────────────

describe('WatchIntake — AC1: damage state intake rate', () => {
  test('default intake rate is 0.25 (25%), satisfying the ≥20% AC1 requirement', () => {
    expect(DEFAULT_INTAKE_CONFIG.intakeRate).toBeGreaterThanOrEqual(0.20);
    expect(DEFAULT_INTAKE_CONFIG.intakeRate).toBe(0.25);
  });

  test('assignDamageState() returns null when RNG roll ≥ intakeRate (standard wear)', () => {
    const intake = new WatchIntake(DEFAULT_INTAKE_CONFIG, fixedRng(0.9));
    expect(intake.assignDamageState()).toBeNull();
  });

  test('assignDamageState() returns a non-null damage state when RNG roll < intakeRate', () => {
    const intake = new WatchIntake(DEFAULT_INTAKE_CONFIG, fixedRng(0.0));
    expect(intake.assignDamageState()).not.toBeNull();
  });

  test('over 100 samples with default config ≥20% are non-null (probabilistic)', () => {
    let callCount = 0;
    // Controlled RNG: every 4th call triggers damage state (25%)
    const rng = sequenceRng([0.1, 0.9, 0.9, 0.9]); // 1 in 4 = 25%
    const intake = new WatchIntake(DEFAULT_INTAKE_CONFIG, rng);
    let damaged = 0;
    const SAMPLES = 100;
    for (let i = 0; i < SAMPLES; i++) {
      if (intake.assignDamageState() !== null) damaged++;
    }
    expect(damaged / SAMPLES).toBeGreaterThanOrEqual(0.20);
  });

  test('all 3 Phase 1 damage types can be assigned (distribution randomisation confirmed)', () => {
    // Each assignDamageState call uses 2 RNG calls: (1) intake check, (2) weight selection.
    // With intakeRate=1.0 all intake checks pass (any value < 1.0).
    // Weight selection with equal weights [1,1,1] and total=3:
    //   roll = rng() * 3; roll<1 → water_ingress; 1≤roll<2 → oxidation; roll≥2 → crystal_crazing
    // Sequence: [intake, weight, intake, weight, intake, weight] pairs
    //   0.0, 0.10 → roll=0.3 → water_ingress
    //   0.0, 0.50 → roll=1.5 → oxidation
    //   0.0, 0.80 → roll=2.4 → crystal_crazing
    const rng = sequenceRng([0.0, 0.10, 0.0, 0.50, 0.0, 0.80]);
    const intake = new WatchIntake({ intakeRate: 1.0, weights: { water_ingress: 1, oxidation: 1, crystal_crazing: 1 } }, rng);
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      const state = intake.assignDamageState();
      if (state) seen.add(state);
    }
    expect(seen.size).toBe(3);
    expect(seen.has('water_ingress')).toBe(true);
    expect(seen.has('oxidation')).toBe(true);
    expect(seen.has('crystal_crazing')).toBe(true);
  });
});

// ─── AC1: Visual cues available before disassembly ───────────────────────────

describe('WatchIntake — AC1: visual cues for each Phase 1 damage state', () => {
  test.each(PHASE1_DAMAGE_STATES)('getVisualCues("%s") returns non-null with externalCues', (stateId) => {
    const intake = new WatchIntake();
    const cues = intake.getVisualCues(stateId);
    expect(cues).not.toBeNull();
    expect(Array.isArray(cues.externalCues)).toBe(true);
    expect(cues.externalCues.length).toBeGreaterThan(0);
  });

  test('getVisualCues(null) returns null for standard wear', () => {
    const intake = new WatchIntake();
    expect(intake.getVisualCues(null)).toBeNull();
  });

  test('getVisualCues returns a diagnosticSignature for each Phase 1 state', () => {
    const intake = new WatchIntake();
    for (const stateId of PHASE1_DAMAGE_STATES) {
      const cues = intake.getVisualCues(stateId);
      expect(typeof cues.diagnosticSignature).toBe('string');
      expect(cues.diagnosticSignature.length).toBeGreaterThan(0);
    }
  });
});

// ─── AC2: Water Ingress repair path ──────────────────────────────────────────

describe('WatchIntake — AC2: Water Ingress repair path', () => {
  const intake = new WatchIntake();

  test('water_ingress repair path contains corrosion cleaning step', () => {
    const path = intake.getRepairPath('water_ingress');
    expect(path).toContain('apply_corrosion_cleaning_tool');
  });

  test('water_ingress repair path contains crown replacement step', () => {
    const path = intake.getRepairPath('water_ingress');
    expect(path).toContain('replace_crown_and_gasket');
  });

  test('water_ingress repair path contains crystal defogging step', () => {
    const path = intake.getRepairPath('water_ingress');
    expect(path).toContain('apply_crystal_defogging_solution');
  });

  test('water_ingress repair path has at least 3 steps (full path end-to-end, no softlock)', () => {
    const path = intake.getRepairPath('water_ingress');
    expect(path.length).toBeGreaterThanOrEqual(3);
  });

  test('water_ingress required parts include corrosion-cleaning-tool (conditional availability — AC2)', () => {
    const parts = intake.getRequiredPartIds('water_ingress');
    expect(parts).toContain('corrosion-cleaning-tool');
  });

  test('water_ingress required parts include gasket-universal', () => {
    const parts = intake.getRequiredPartIds('water_ingress');
    expect(parts).toContain('gasket-universal');
  });

  test('water_ingress required parts include crystal-defogging-solution', () => {
    const parts = intake.getRequiredPartIds('water_ingress');
    expect(parts).toContain('crystal-defogging-solution');
  });

  test('standard wear watch (null) has empty required parts list (corrosion tool absent — AC2)', () => {
    const parts = intake.getRequiredPartIds(null);
    expect(parts).not.toContain('corrosion-cleaning-tool');
    expect(parts).toHaveLength(0);
  });
});

// ─── AC3: Oxidation / Tarnish repair path ────────────────────────────────────

describe('WatchIntake — AC3: Oxidation/Tarnish repair path', () => {
  const intake = new WatchIntake();

  test('oxidation repair path contains case polishing step', () => {
    expect(intake.getRepairPath('oxidation')).toContain('polish_case_exterior');
  });

  test('oxidation repair path contains dial restore step', () => {
    expect(intake.getRepairPath('oxidation')).toContain('restore_dial_surface');
  });

  test('oxidation repair path contains full movement cleaning step', () => {
    expect(intake.getRepairPath('oxidation')).toContain('full_movement_cleaning');
  });

  test('oxidation repair path contains lubrication step', () => {
    expect(intake.getRepairPath('oxidation')).toContain('apply_fresh_lubrication');
  });

  test('oxidation repair path has at least 4 steps (full path, no softlock)', () => {
    expect(intake.getRepairPath('oxidation').length).toBeGreaterThanOrEqual(4);
  });

  test('oxidation required parts include case-polish-compound', () => {
    expect(intake.getRequiredPartIds('oxidation')).toContain('case-polish-compound');
  });

  test('oxidation required parts include dial-restoration-kit', () => {
    expect(intake.getRequiredPartIds('oxidation')).toContain('dial-restoration-kit');
  });
});

// ─── AC4: Crystal Crazing repair path ────────────────────────────────────────

describe('WatchIntake — AC4: Crystal Crazing repair path', () => {
  const intake = new WatchIntake();

  test('crystal_crazing repair path contains crystal replacement step', () => {
    expect(intake.getRepairPath('crystal_crazing')).toContain('replace_crystal');
  });

  test('crystal_crazing repair path contains dial enamel repair step', () => {
    expect(intake.getRepairPath('crystal_crazing')).toContain('repair_dial_enamel');
  });

  test('crystal_crazing repair path contains timing regulation check step', () => {
    expect(intake.getRepairPath('crystal_crazing')).toContain('run_timing_regulation_check');
  });

  test('crystal_crazing repair path has at least 3 steps (full path, no softlock)', () => {
    expect(intake.getRepairPath('crystal_crazing').length).toBeGreaterThanOrEqual(3);
  });

  test('crystal_crazing required parts include crystal-mineral-universal', () => {
    expect(intake.getRequiredPartIds('crystal_crazing')).toContain('crystal-mineral-universal');
  });

  test('crystal_crazing required parts include dial-enamel-repair-tool', () => {
    expect(intake.getRequiredPartIds('crystal_crazing')).toContain('dial-enamel-repair-tool');
  });
});

// ─── Thumbnail-worthy "before" visual (content creator use case) ──────────────

describe('WatchIntake — thumbnail-worthy before descriptions for all Phase 1 states', () => {
  const intake = new WatchIntake();

  test.each(PHASE1_DAMAGE_STATES)('getVisualCues("%s") has a non-empty thumbnailDescription', (stateId) => {
    const cues = intake.getVisualCues(stateId);
    expect(typeof cues.thumbnailDescription).toBe('string');
    expect(cues.thumbnailDescription.length).toBeGreaterThan(20); // must be descriptive
  });
});

// ─── Standard wear unaffected (regression — Test Scenario 5) ─────────────────

describe('WatchIntake — standard wear (null damage state) preserves existing paths', () => {
  const intake = new WatchIntake();

  test('null damage state returns empty repair path', () => {
    expect(intake.getRepairPath(null)).toEqual([]);
  });

  test('null damage state returns empty required parts', () => {
    expect(intake.getRequiredPartIds(null)).toEqual([]);
  });

  test('null damage state returns null visual cues', () => {
    expect(intake.getVisualCues(null)).toBeNull();
  });
});
