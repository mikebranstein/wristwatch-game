/**
 * Tests for Phase 2 damage-state hints in damage-state-hints.js — Issue #84.
 *
 * Covers hint content for shock_damage_fault and rust_fused_fasteners_fault.
 * Validates all 3 tiers are present and contain relevant guidance.
 * Regression: Phase 1 hints unaffected.
 */

'use strict';

const {
  DAMAGE_STATE_HINTS,
  getDamageStateHints,
  getAllDamageStateFaultIds,
} = require('../../../javascript/data/damage-state-hints');

const PHASE1_FAULT_IDS = ['water_ingress_damage', 'oxidation_tarnish_damage', 'crystal_crazing_damage'];
const PHASE2_FAULT_IDS = ['shock_damage_fault', 'rust_fused_fasteners_fault'];

// ─── Phase 2 hints present ────────────────────────────────────────────────────

describe('damage-state-hints — Phase 2 hint entries exist', () => {
  test('shock_damage_fault hint is defined', () => {
    expect(DAMAGE_STATE_HINTS.shock_damage_fault).toBeDefined();
  });

  test('rust_fused_fasteners_fault hint is defined', () => {
    expect(DAMAGE_STATE_HINTS.rust_fused_fasteners_fault).toBeDefined();
  });

  test('getAllDamageStateFaultIds includes both Phase 2 fault IDs', () => {
    const ids = getAllDamageStateFaultIds();
    expect(ids).toContain('shock_damage_fault');
    expect(ids).toContain('rust_fused_fasteners_fault');
  });

  test('getAllDamageStateFaultIds includes all Phase 1 fault IDs (regression)', () => {
    const ids = getAllDamageStateFaultIds();
    for (const id of PHASE1_FAULT_IDS) {
      expect(ids).toContain(id);
    }
  });
});

// ─── Phase 2 hint tier content ────────────────────────────────────────────────

describe('damage-state-hints — Phase 2 hint tiers all present and non-empty', () => {
  test.each(PHASE2_FAULT_IDS)('"%s" has all 3 tiers', (faultId) => {
    const hint = getDamageStateHints(faultId);
    expect(hint).not.toBeNull();
    expect(typeof hint.tier1).toBe('string');
    expect(hint.tier1.length).toBeGreaterThan(10);
    expect(typeof hint.tier2).toBe('string');
    expect(hint.tier2.length).toBeGreaterThan(10);
    expect(typeof hint.tier3).toBe('string');
    expect(hint.tier3.length).toBeGreaterThan(10);
  });

  test('shock_damage tier1 is subtle nudge (no explicit tool spoiler)', () => {
    const hint = getDamageStateHints('shock_damage_fault');
    expect(hint.tier1.length).toBeLessThan(200); // tier1 is brief
  });

  test('shock_damage tier3 mentions bent-hand straightening tool', () => {
    const hint = getDamageStateHints('shock_damage_fault');
    expect(hint.tier3.toLowerCase()).toMatch(/straighten|bent.hand/);
  });

  test('shock_damage tier3 mentions component repositioning', () => {
    const hint = getDamageStateHints('shock_damage_fault');
    expect(hint.tier3.toLowerCase()).toMatch(/reposition|component/);
  });

  test('rust_fused_fasteners tier3 mentions penetrant applicator', () => {
    const hint = getDamageStateHints('rust_fused_fasteners_fault');
    expect(hint.tier3.toLowerCase()).toMatch(/penetrant/);
  });

  test('rust_fused_fasteners tier3 mentions fastener extractor', () => {
    const hint = getDamageStateHints('rust_fused_fasteners_fault');
    expect(hint.tier3.toLowerCase()).toMatch(/extractor|extract/);
  });

  test('rust_fused_fasteners tier2 explains WHY standard tools fail (discoverability)', () => {
    const hint = getDamageStateHints('rust_fused_fasteners_fault');
    expect(hint.tier2.toLowerCase()).toMatch(/rust|corrode|bond/);
  });
});

// ─── Phase 1 regression ───────────────────────────────────────────────────────

describe('damage-state-hints — Phase 1 hints unaffected after Phase 2 additions', () => {
  test.each(PHASE1_FAULT_IDS)('"%s" still has all 3 tiers intact', (faultId) => {
    const hint = getDamageStateHints(faultId);
    expect(hint).not.toBeNull();
    expect(typeof hint.tier1).toBe('string');
    expect(hint.tier1.length).toBeGreaterThan(0);
    expect(typeof hint.tier2).toBe('string');
    expect(hint.tier2.length).toBeGreaterThan(0);
    expect(typeof hint.tier3).toBe('string');
    expect(hint.tier3.length).toBeGreaterThan(0);
  });
});

// ─── getDamageStateHints null-safety ─────────────────────────────────────────

describe('damage-state-hints — getDamageStateHints null-safety', () => {
  test('returns null for unknown fault ID', () => {
    expect(getDamageStateHints('nonexistent_fault')).toBeNull();
  });
});
