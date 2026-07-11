/**
 * Tests for fault-hints.js — Issue #292: magnetism_fault entry (AC2, AC3)
 *
 * AC2: magnetism_fault has a unique symptom profile ("running fast, no visible
 *      mechanical damage") distinct from gains_time and mainspring_failure.
 * AC3: magnetism_fault hint ladder has tier1, tier2, tier3 content that
 *      progressively escalates toward the demagnetizer solution.
 */

'use strict';

const { FAULT_HINTS, getHintsForFault, getAllFaultIds } = require('../../../src/data/fault-hints');

// ─── AC2 — magnetism_fault entry exists and has correct structure ─────────────

describe('AC2 — fault-hints: magnetism_fault entry exists with correct structure', () => {
  test('magnetism_fault key exists in FAULT_HINTS', () => {
    expect(FAULT_HINTS).toHaveProperty('magnetism_fault');
  });

  test('getHintsForFault returns non-null for magnetism_fault', () => {
    expect(getHintsForFault('magnetism_fault')).not.toBeNull();
  });

  test('magnetism_fault hint object has fault_id == "magnetism_fault"', () => {
    const hint = getHintsForFault('magnetism_fault');
    expect(hint.fault_id).toBe('magnetism_fault');
  });

  test('magnetism_fault has a non-empty tier1 string', () => {
    const hint = getHintsForFault('magnetism_fault');
    expect(typeof hint.tier1).toBe('string');
    expect(hint.tier1.length).toBeGreaterThan(0);
  });

  test('magnetism_fault has a non-empty tier2 string', () => {
    const hint = getHintsForFault('magnetism_fault');
    expect(typeof hint.tier2).toBe('string');
    expect(hint.tier2.length).toBeGreaterThan(0);
  });

  test('magnetism_fault has a non-empty tier3 string', () => {
    const hint = getHintsForFault('magnetism_fault');
    expect(typeof hint.tier3).toBe('string');
    expect(hint.tier3.length).toBeGreaterThan(0);
  });

  test('magnetism_fault is included in getAllFaultIds()', () => {
    expect(getAllFaultIds()).toContain('magnetism_fault');
  });
});

// ─── AC2 — Symptom uniqueness (Test Scenario 6) ───────────────────────────────

describe('AC2 — fault-hints: magnetism_fault symptom text is distinct from gains_time & mainspring_failure', () => {
  test('magnetism_fault tier1 mentions running fast and no visible damage', () => {
    const hint = getHintsForFault('magnetism_fault');
    const t1Lower = hint.tier1.toLowerCase();
    expect(t1Lower).toMatch(/running fast|fast/);
    expect(t1Lower).toMatch(/no visible|no.*visible|leaves no visible/);
  });

  test('magnetism_fault tier1 is distinct from balance_wheel_fault tier1', () => {
    const magnetism = getHintsForFault('magnetism_fault');
    const balanceWheel = getHintsForFault('balance_wheel_fault');
    expect(magnetism.tier1).not.toBe(balanceWheel.tier1);
  });

  test('magnetism_fault tier1 is distinct from mainspring_failure tier1', () => {
    const magnetism = getHintsForFault('magnetism_fault');
    const mainspring = getHintsForFault('mainspring_failure');
    expect(magnetism.tier1).not.toBe(mainspring.tier1);
  });

  test('all fault tier1 texts are unique (no duplicate hint copy across faults)', () => {
    const allIds = getAllFaultIds();
    const tier1Texts = allIds.map(id => getHintsForFault(id).tier1);
    const uniqueTier1Texts = new Set(tier1Texts);
    expect(uniqueTier1Texts.size).toBe(tier1Texts.length);
  });
});

// ─── AC3 — Progressive hint ladder for magnetism_fault ───────────────────────

describe('AC3 — fault-hints: magnetism_fault progressive hint ladder escalates to demagnetizer', () => {
  test('tier2 mentions compass test or magnetism as the diagnostic cue', () => {
    const hint = getHintsForFault('magnetism_fault');
    const t2Lower = hint.tier2.toLowerCase();
    expect(t2Lower).toMatch(/compass|magnetis|hairspring/);
  });

  test('tier3 mentions demagnetizer as the confirmed repair tool', () => {
    const hint = getHintsForFault('magnetism_fault');
    const t3Lower = hint.tier3.toLowerCase();
    expect(t3Lower).toMatch(/demagnetiz/);
  });

  test('tier3 is more detailed than tier1 (explicit repair instruction)', () => {
    const hint = getHintsForFault('magnetism_fault');
    expect(hint.tier3.length).toBeGreaterThan(hint.tier1.length);
  });

  test('tier1, tier2, tier3 are all different strings (progressive escalation)', () => {
    const hint = getHintsForFault('magnetism_fault');
    expect(hint.tier1).not.toBe(hint.tier2);
    expect(hint.tier2).not.toBe(hint.tier3);
    expect(hint.tier1).not.toBe(hint.tier3);
  });
});

// ─── Regression — existing faults unaffected ─────────────────────────────────

describe('fault-hints: existing faults are unaffected by magnetism_fault addition (regression)', () => {
  const existingFaults = [
    'mainspring_failure',
    'escapement_fault',
    'balance_wheel_fault',
    'crown_stem_fault',
    'cannon_pinion_slip',
    'date_mechanism_fault',
    'water_ingress_damage',
    'oxidation_tarnish_damage',
    'crystal_crazing_damage',
  ];

  test.each(existingFaults)('existing fault "%s" still returns a valid hint object', (faultId) => {
    const hint = getHintsForFault(faultId);
    expect(hint).not.toBeNull();
    expect(hint.fault_id).toBe(faultId);
    expect(hint.tier1.length).toBeGreaterThan(0);
    expect(hint.tier2.length).toBeGreaterThan(0);
    expect(hint.tier3.length).toBeGreaterThan(0);
  });
});
