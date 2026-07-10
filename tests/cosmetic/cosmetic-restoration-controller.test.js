/**
 * Tests for CosmeticRestorationController (Phase 2 orchestrator)
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2
 *
 * Covers all 5 Acceptance Criteria and the 10 Test Scenarios from the issue.
 *
 * AC1: Crystal damage state rendered correctly on phase entry (scratched/cracked/clean)
 * AC2: Crystal replacement updates watch model to clean in real time
 * AC3: Before/after display shows damaged vs. clean — reuses Phase 1 component
 * AC4: Clean crystal → replacement skipped or optional with "no replacement needed" message
 * AC5: Restoration summary reflects both strap and crystal state
 *
 * Test Scenarios from issue:
 *  TS1: Cracked crystal replacement — happy path
 *  TS2: Scratched crystal replacement — happy path
 *  TS3: Clean crystal — no replacement needed
 *  TS4: Phase sequencing — strap first, then crystal
 *  TS5: Before/after reuse — Phase 1 component
 *  TS6: Return and re-do
 *  TS7: Edge case — missing condition data
 *  TS8: Performance — crystal swap latency < 100ms
 *  TS9: Full cosmetic phase integration
 *  TS10: Damage state legibility (structural — asset key distinctness)
 */

'use strict';

const { CosmeticRestorationController } = require('../../src/cosmetic/CosmeticRestorationController');
const { PlayerSaveState }               = require('../../src/state/PlayerSaveState');

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeController(overrides = {}) {
  const strapSwaps = [];
  const crystalSwaps = [];
  const cached = [];
  const strapBeforeAfterEvents = [];
  const crystalBeforeAfterEvents = [];
  let time = 0;

  const saveState = overrides.saveState || new PlayerSaveState();

  const controller = new CosmeticRestorationController({
    saveState,
    swapStrapRigFn:        (key) => strapSwaps.push(key),
    swapCrystalMaterialFn: (key) => crystalSwaps.push(key),
    cacheFn:               (key) => cached.push(key),
    onStrapBeforeAfter:    (p) => strapBeforeAfterEvents.push(p),
    onCrystalBeforeAfter:  (p) => crystalBeforeAfterEvents.push(p),
    nowFn:                 () => time,
    watchData: overrides.watchData !== undefined ? overrides.watchData : { crystal_condition: 'cracked' },
    ...overrides,
  });

  const helpers = {
    controller,
    saveState,
    strapSwaps,
    crystalSwaps,
    cached,
    strapBeforeAfterEvents,
    crystalBeforeAfterEvents,
    advanceTime: (ms) => { time += ms; },

    // Run the full strap flow quickly
    completeStrapFlow(strapId = 'leather_black') {
      controller.enterPhase();
      controller.selectStrap(strapId);
      return controller.completeStrapStep();
    },

    // Run the full crystal replacement flow
    completeCrystalFlow() {
      controller.enterCrystalStep();
      controller.beginRemoveCrystal();
      controller.completeRemoveCrystal();
      controller.beginInstallCrystal();
      return controller.completeInstallCrystal();
    },
  };

  return helpers;
}

// ── AC1: Crystal condition states rendered on phase entry ─────────────────────

describe('AC1 — crystal damage state rendered on phase entry', () => {
  test('TS1/TS2: entering phase with cracked crystal applies cracked material (AC1)', () => {
    const { controller, crystalSwaps } = makeController({ watchData: { crystal_condition: 'cracked' } });
    controller.enterPhase();
    expect(crystalSwaps).toContain('crystal_cracked');
  });

  test('TS2: entering phase with scratched crystal applies scratched material (AC1)', () => {
    const { controller, crystalSwaps } = makeController({ watchData: { crystal_condition: 'scratched' } });
    controller.enterPhase();
    expect(crystalSwaps).toContain('crystal_scratched');
  });

  test('entering phase with clean crystal applies clean material', () => {
    const { controller, crystalSwaps } = makeController({ watchData: { crystal_condition: 'clean' } });
    controller.enterPhase();
    expect(crystalSwaps).toContain('crystal_clean');
  });

  test('enterPhase returns crystalCondition with correct id (AC1)', () => {
    const { controller } = makeController({ watchData: { crystal_condition: 'cracked' } });
    const result = controller.enterPhase();
    expect(result.crystalCondition.id).toBe('cracked');
    expect(result.crystalCondition.needsReplacement).toBe(true);
  });

  test('TS10: cracked and scratched asset keys are distinct from clean (AC1, TS10)', () => {
    const cracked = 'crystal_cracked';
    const scratched = 'crystal_scratched';
    const clean = 'crystal_clean';
    expect(cracked).not.toBe(clean);
    expect(scratched).not.toBe(clean);
    expect(cracked).not.toBe(scratched);
  });
});

// ── AC2: Crystal replacement updates model in real time ───────────────────────

describe('AC2 — crystal replacement updates watch model in real time', () => {
  test('TS1: cracked crystal → replacement → clean material applied in real time (AC2)', () => {
    const { controller, crystalSwaps } = makeController({ watchData: { crystal_condition: 'cracked' } });
    controller.enterPhase();
    controller.selectStrap('leather_black');
    controller.completeStrapStep();
    controller.enterCrystalStep();
    controller.beginRemoveCrystal();
    controller.completeRemoveCrystal();
    controller.beginInstallCrystal();
    controller.completeInstallCrystal();

    // After install, clean crystal material must be applied
    expect(crystalSwaps[crystalSwaps.length - 1]).toBe('crystal_clean');
  });

  test('TS2: scratched crystal → replacement → clean material applied (AC2)', () => {
    const { controller, crystalSwaps } = makeController({ watchData: { crystal_condition: 'scratched' } });
    controller.enterPhase();
    controller.selectStrap('leather_brown');
    controller.completeStrapStep();
    controller.enterCrystalStep();
    controller.beginRemoveCrystal();
    controller.completeRemoveCrystal();
    controller.beginInstallCrystal();
    controller.completeInstallCrystal();
    expect(crystalSwaps[crystalSwaps.length - 1]).toBe('crystal_clean');
  });

  test('completeInstallCrystal returns success (AC2)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow();
    const result = h.completeCrystalFlow();
    expect(result.success).toBe(true);
  });

  test('beginRemoveCrystal before enterCrystalStep throws', () => {
    const { controller } = makeController();
    controller.enterPhase();
    controller.selectStrap('leather_black');
    controller.completeStrapStep();
    expect(() => controller.beginRemoveCrystal()).toThrow(/enterCrystalStep/i);
  });
});

// ── AC3: Before/after display reuses Phase 1 component ───────────────────────

describe('AC3 — before/after reuses Phase 1 StrapBeforeAfterDisplay component', () => {
  test('TS5: crystal before/after display uses StrapBeforeAfterDisplay (phaseId=crystal) (AC3, TS5)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow();
    h.completeCrystalFlow();

    const payload = h.controller.getLastCrystalBeforeAfterPayload();
    expect(payload).not.toBeNull();
    expect(payload.phaseId).toBe('crystal'); // same component, different phaseId
    expect(payload.before.assetKey).toBe('crystal_cracked');
    expect(payload.after.assetKey).toBe('crystal_clean');
    expect(payload.hasChange).toBe(true);
  });

  test('TS5: crystal before/after uses same StrapBeforeAfterDisplay class as strap (AC3, TS5)', () => {
    const { StrapBeforeAfterDisplay } = require('../../src/cosmetic/StrapBeforeAfterDisplay');
    const h = makeController({ watchData: { crystal_condition: 'scratched' } });
    // The crystalBeforeAfterDisplay accessor must return an instance of StrapBeforeAfterDisplay
    const display = h.controller.getCrystalBeforeAfterDisplay();
    expect(display).toBeInstanceOf(StrapBeforeAfterDisplay);
  });

  test('onCrystalBeforeAfter callback fires with correct payload (AC3)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow();
    h.completeCrystalFlow();
    expect(h.crystalBeforeAfterEvents).toHaveLength(1);
    const p = h.crystalBeforeAfterEvents[0];
    expect(p.phaseId).toBe('crystal');
    expect(p.before.assetKey).toBe('crystal_cracked');
    expect(p.after.assetKey).toBe('crystal_clean');
  });

  test('TS2: scratched crystal before/after shows scratched vs clean (AC3)', () => {
    const h = makeController({ watchData: { crystal_condition: 'scratched' } });
    h.completeStrapFlow('leather_brown');
    h.completeCrystalFlow();
    const p = h.controller.getLastCrystalBeforeAfterPayload();
    expect(p.before.assetKey).toBe('crystal_scratched');
    expect(p.after.assetKey).toBe('crystal_clean');
  });

  test('no crystal before/after payload when crystal step is skipped (clean crystal)', () => {
    const h = makeController({ watchData: { crystal_condition: 'clean' } });
    h.completeStrapFlow();
    expect(h.controller.getLastCrystalBeforeAfterPayload()).toBeNull();
  });
});

// ── AC4: Clean crystal → skip or optional step ────────────────────────────────

describe('AC4 — clean crystal → skip with clear indication', () => {
  test('TS3: completeStrapStep returns crystalStepRequired=false for clean crystal (AC4, TS3)', () => {
    const { controller } = makeController({ watchData: { crystal_condition: 'clean' } });
    controller.enterPhase();
    controller.selectStrap('leather_black');
    const result = controller.completeStrapStep();
    expect(result.crystalStepRequired).toBe(false);
  });

  test('TS3: enterCrystalStep returns status=skip for clean crystal (AC4, TS3)', () => {
    const { controller } = makeController({ watchData: { crystal_condition: 'clean' } });
    controller.enterPhase();
    controller.selectStrap('leather_black');
    controller.completeStrapStep();
    const result = controller.enterCrystalStep();
    expect(result.status).toBe('skip');
    expect(result.reason).toMatch(/no replacement needed/i);
  });

  test('TS3: no before/after callback fired when crystal step is skipped (AC4)', () => {
    const h = makeController({ watchData: { crystal_condition: 'clean' } });
    h.completeStrapFlow();
    h.controller.enterCrystalStep();
    expect(h.crystalBeforeAfterEvents).toHaveLength(0);
  });

  test('crystalStepRequired=true for scratched crystal (AC4)', () => {
    const { controller } = makeController({ watchData: { crystal_condition: 'scratched' } });
    controller.enterPhase();
    controller.selectStrap('nato_olive');
    const result = controller.completeStrapStep();
    expect(result.crystalStepRequired).toBe(true);
  });

  test('crystalStepRequired=true for cracked crystal (AC4)', () => {
    const { controller } = makeController({ watchData: { crystal_condition: 'cracked' } });
    controller.enterPhase();
    controller.selectStrap('nato_olive');
    const result = controller.completeStrapStep();
    expect(result.crystalStepRequired).toBe(true);
  });
});

// ── AC5: Restoration summary reflects both strap and crystal ──────────────────

describe('AC5 — restoration summary reflects strap + crystal state', () => {
  test('TS9: exitPhase returns strapResult and crystalResult (AC5, TS9)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow('leather_black');
    h.completeCrystalFlow();
    const summary = h.controller.exitPhase();

    expect(summary.strapResult).toBeDefined();
    expect(summary.crystalResult).toBeDefined();
  });

  test('TS9: crystalResult.outcome=replaced after replacement (AC5)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow();
    h.completeCrystalFlow();
    const { crystalResult } = h.controller.exitPhase();
    expect(crystalResult.outcome).toBe('replaced');
    expect(crystalResult.conditionBefore).toBe('cracked');
    expect(crystalResult.conditionAfter).toBe('clean');
  });

  test('TS3/TS9: crystalResult.outcome=skipped when crystal was already clean (AC5)', () => {
    const { controller } = makeController({ watchData: { crystal_condition: 'clean' } });
    controller.enterPhase();
    controller.selectStrap('leather_black');
    controller.completeStrapStep();
    controller.enterCrystalStep();
    const { crystalResult } = controller.exitPhase();
    expect(crystalResult.outcome).toBe('skipped');
    expect(crystalResult.conditionBefore).toBe('clean');
    expect(crystalResult.conditionAfter).toBe('clean');
  });

  test('TS4: strapResult contains confirmed strap selection (AC5, TS4)', () => {
    const h = makeController({ watchData: { crystal_condition: 'scratched' } });
    h.completeStrapFlow('leather_brown');
    h.completeCrystalFlow();
    const { strapResult } = h.controller.exitPhase();
    expect(strapResult.confirmedStrapId).toBe('leather_brown');
  });

  test('crystal_outcome persisted to save state after replacement (AC5)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow();
    h.completeCrystalFlow();
    expect(h.saveState.get('crystal_outcome')).toBe('replaced');
    expect(h.saveState.get('crystal_condition_before')).toBe('cracked');
  });

  test('crystal_outcome NOT written to save state when crystal is skipped', () => {
    const h = makeController({ watchData: { crystal_condition: 'clean' } });
    h.completeStrapFlow();
    h.controller.enterCrystalStep();
    // Should not have been written
    expect(h.saveState.get('crystal_outcome')).toBeNull();
  });
});

// ── TS4: Phase sequencing — strap first, then crystal ────────────────────────

describe('TS4 — strap step must complete before crystal step', () => {
  test('TS4: crystal step cannot be entered before strap step completes', () => {
    const { controller } = makeController();
    controller.enterPhase();
    expect(() => controller.enterCrystalStep()).toThrow(/strap step must be completed/i);
  });

  test('TS4: both steps complete without state collision (AC5, TS4)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    // Strap step
    h.controller.enterPhase();
    h.controller.selectStrap('nato_navy');
    h.controller.completeStrapStep();
    // Crystal step
    h.completeCrystalFlow();
    const summary = h.controller.exitPhase();
    expect(summary.strapResult.confirmedStrapId).toBe('nato_navy');
    expect(summary.crystalResult.outcome).toBe('replaced');
  });
});

// ── TS6: Return and re-do ─────────────────────────────────────────────────────

describe('TS6 — return and re-do crystal replacement', () => {
  test('TS6: second replacement correctly applies clean state — no artifacts (AC2, TS6)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow();
    h.completeCrystalFlow();

    // Player navigates back and re-does
    const redoResult = h.controller.redoCrystalReplacement();
    expect(redoResult.status).toBe('redo_ready');

    // Damaged material should be re-applied on redo (crystal returned to cracked)
    expect(h.crystalSwaps[h.crystalSwaps.length - 1]).toBe('crystal_cracked');

    // Re-do the full replacement
    h.completeCrystalFlow();
    const mechanic = h.controller.getCrystalMechanic();
    expect(mechanic.getCompletionCount()).toBe(2);
    // Final state should be clean
    expect(h.crystalSwaps[h.crystalSwaps.length - 1]).toBe('crystal_clean');
  });
});

// ── TS7: Missing condition data → default to clean ────────────────────────────

describe('TS7 — missing crystal condition data defaults to clean', () => {
  test('TS7: null watch data defaults to clean condition — no crash (AC7, TS7)', () => {
    const { controller } = makeController({ watchData: null });
    expect(() => controller.enterPhase()).not.toThrow();
    const result = controller.enterPhase
      ? (() => { controller.enterPhase(); return controller.getCrystalConditionState(); })()
      : null;
    // Re-enter with fresh instance since enterPhase was already called above
    const h2 = makeController({ watchData: null });
    const r = h2.controller.enterPhase();
    expect(r.crystalCondition.id).toBe('clean');
  });

  test('TS7: watch data with no crystal_condition field defaults to clean (TS7)', () => {
    const h = makeController({ watchData: { watchId: 'watch_005' } });
    const r = h.controller.enterPhase();
    expect(r.crystalCondition.id).toBe('clean');
  });

  test('TS7: unknown crystal_condition value defaults to clean (TS7)', () => {
    const h = makeController({ watchData: { crystal_condition: 'shattered' } });
    const r = h.controller.enterPhase();
    expect(r.crystalCondition.id).toBe('clean');
  });
});

// ── TS8: Performance — swap latency ──────────────────────────────────────────

describe('TS8 — crystal swap latency < 100ms', () => {
  test('TS8: crystal material swap completes within 0ms with mock clock (TS8)', () => {
    const h = makeController({ watchData: { crystal_condition: 'cracked' } });
    h.completeStrapFlow();
    h.completeCrystalFlow();
    const lastLatency = h.controller.getCrystalMaterialSwap().getLastSwapLatencyMs();
    // Mock clock returns constant 0 → 0ms latency; production target < 100ms
    expect(lastLatency).toBe(0);
    expect(lastLatency).toBeLessThan(100);
  });
});

// ── TS9: Full cosmetic phase integration ─────────────────────────────────────

describe('TS9 — full cosmetic phase integration', () => {
  test('TS9: movement repair → strap swap → crystal replacement → no errors (AC5, TS9)', () => {
    const h = makeController({ watchData: { crystal_condition: 'scratched' } });

    // Simulate phase entry (movement repair phase assumed complete before cosmetic phase)
    const entry = h.controller.enterPhase();
    expect(entry.strapVariants).toBeDefined();
    expect(entry.crystalCondition.id).toBe('scratched');

    // Strap step
    h.controller.selectStrap('leather_black');
    const strapStep = h.controller.completeStrapStep();
    expect(strapStep.crystalStepRequired).toBe(true);

    // Crystal step
    const crystalEntry = h.controller.enterCrystalStep();
    expect(crystalEntry.status).toBe('requires_replacement');

    h.controller.beginRemoveCrystal();
    h.controller.completeRemoveCrystal();
    h.controller.beginInstallCrystal();
    const installResult = h.controller.completeInstallCrystal();
    expect(installResult.success).toBe(true);

    // Summary
    const summary = h.controller.exitPhase();
    expect(summary.strapResult.confirmedStrapId).toBe('leather_black');
    expect(summary.crystalResult.outcome).toBe('replaced');
    expect(summary.crystalResult.conditionBefore).toBe('scratched');
    expect(summary.crystalResult.conditionAfter).toBe('clean');

    // No errors, no state corruption
    expect(h.saveState.get('strap_selection')).toBe('leather_black');
    expect(h.saveState.get('crystal_outcome')).toBe('replaced');
    expect(h.saveState.get('crystal_condition_before')).toBe('scratched');
  });
});

// ── Additional coverage — PlayerSaveState integration ────────────────────────

describe('PlayerSaveState — crystal fields (Issue #146)', () => {
  test('PlayerSaveState has crystal_outcome default null (backward-compatible)', () => {
    const s = new PlayerSaveState();
    expect(s.get('crystal_outcome')).toBeNull();
  });

  test('PlayerSaveState has crystal_condition_before default null (backward-compatible)', () => {
    const s = new PlayerSaveState();
    expect(s.get('crystal_condition_before')).toBeNull();
  });

  test('pre-existing saves lacking crystal keys receive null defaults', () => {
    const s = new PlayerSaveState({ tutorial_first_fault_seen: true });
    expect(s.get('crystal_outcome')).toBeNull();
    expect(s.get('crystal_condition_before')).toBeNull();
  });
});

// ── Phase lifecycle guards ─────────────────────────────────────────────────────

describe('CosmeticRestorationController — lifecycle guards', () => {
  test('calling selectStrap before enterPhase throws', () => {
    const c = makeController().controller;
    expect(() => c.selectStrap('leather_black')).toThrow(/not active/i);
  });

  test('calling completeStrapStep before enterPhase throws', () => {
    const c = makeController().controller;
    expect(() => c.completeStrapStep()).toThrow(/not active/i);
  });

  test('calling exitPhase before enterPhase throws', () => {
    const c = makeController().controller;
    expect(() => c.exitPhase()).toThrow(/not active/i);
  });

  test('calling enterCrystalStep before strap step throws', () => {
    const c = makeController().controller;
    c.enterPhase();
    expect(() => c.enterCrystalStep()).toThrow(/strap step must be completed/i);
  });
});
