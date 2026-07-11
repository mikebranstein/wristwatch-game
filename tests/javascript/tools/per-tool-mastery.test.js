/**
 * Tests for Issue #297 — Per-Tool Mastery Progression: Core Engine (2–3 Tools, Tier 1–5)
 *
 * Covers all 5 Acceptance Criteria and all 10 Test Scenarios:
 *
 * AC1: Accuracy-weighted gain — zero retries = full gain; ≥2 retries = proportional reduction.
 * AC2: Functional rewards at correct tiers — Tier 3+ time reduction, Tier 5 error margin.
 * AC3: Fast first milestone — Tier 1 reachable in 5–10 accurate uses per session.
 * AC4: Save backward compatibility — pre-feature save (null tool_proficiency) loads cleanly.
 * AC5: ToolPanel display accuracy — designated tools show bar; out-of-scope tools show null.
 *
 * Scenario 1:  Happy path — accurate use, proficiency advances.
 * Scenario 2:  Accuracy penalty — retries reduce gain proportionally.
 * Scenario 3:  Tier 1 fast milestone — 5–10 accurate uses reaches Apprentice.
 * Scenario 4:  Tier 3 functional reward — operation time measurably reduced vs baseline.
 * Scenario 5:  Tier 5 functional reward — error margin narrows vs baseline.
 * Scenario 6:  Save backward compatibility — pre-feature save loads; all tools default Tier 0.
 * Scenario 7:  ToolPanel — in-scope tools only get proficiency bar; others return null.
 * Scenario 8:  ToolPanel — real-time accuracy; bar reflects latest proficiency state.
 * Scenario 9:  Edge case — Tier 5 ceiling; no overflow, no crash.
 * Scenario 10: Regression — MultiStepOperationTracker retry counter does not break existing logic.
 */

'use strict';

const {
  ProficiencyEngine,
  TIER_NAMES,
  TIER_THRESHOLDS,
  MAX_TIER,
  DESIGNATED_TOOLS,
  ACCURACY_FLOOR,
  RETRY_PENALTY_PER_EVENT,
  TIME_MODIFIER_TIER_3,
  TIME_MODIFIER_TIER_4,
  ERROR_MARGIN_MODIFIER_TIER_5,
} = require('../../../javascript/tools/ProficiencyEngine');

const { MultiStepOperationTracker } = require('../../../javascript/tools/MultiStepOperationTracker');
const { ToolPanel } = require('../../../javascript/tools/ToolPanel');
const { PlayerSaveState } = require('../../../javascript/state/PlayerSaveState');

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Create a fresh ProficiencyEngine with no saved state (new player). */
function makeEngine(savedState = null) {
  return new ProficiencyEngine(savedState);
}

/** Perform N accurate uses (retryCount=0) on a tool. */
function doAccurateUses(engine, toolId, count) {
  for (let i = 0; i < count; i++) {
    engine.recordToolUse(toolId, 0);
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TOOL_A = 'fine-tip-tweezers';
const TOOL_B = 'flat-blade-screwdriver';
const TOOL_C = 'spring-bar-tool';
// Issue #307 — 5 new designated tools
const TOOL_D = 'cross-tip-screwdriver';
const TOOL_E = 'case-knife';
const TOOL_F = 'movement-holder';
const TOOL_G = 'hand-setting-tool';
const TOOL_H = 'dust-blower';
// NON_DESIGNATED: a tool ID that is not in ToolRegistry and never will be
const NON_DESIGNATED = 'wrench';

// ─── ProficiencyEngine — basics ────────────────────────────────────────────────

describe('ProficiencyEngine — designated tool set', () => {
  test('Issue #307: all 8 tools are now designated', () => {
    const engine = makeEngine();
    expect(engine.getDesignatedToolIds()).toHaveLength(8);
  });

  test('designated tools include all 3 original Phase-1 tools', () => {
    const engine = makeEngine();
    const ids = engine.getDesignatedToolIds();
    expect(ids).toContain(TOOL_A);
    expect(ids).toContain(TOOL_B);
    expect(ids).toContain(TOOL_C);
  });

  test('Issue #307: designated tools include all 5 new Phase-2 tools', () => {
    const engine = makeEngine();
    const ids = engine.getDesignatedToolIds();
    expect(ids).toContain(TOOL_D);
    expect(ids).toContain(TOOL_E);
    expect(ids).toContain(TOOL_F);
    expect(ids).toContain(TOOL_G);
    expect(ids).toContain(TOOL_H);
  });

  test('isDesignatedTool returns true for all 8 designated tools', () => {
    const engine = makeEngine();
    for (const toolId of [TOOL_A, TOOL_B, TOOL_C, TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      expect(engine.isDesignatedTool(toolId)).toBe(true);
    }
  });

  test('isDesignatedTool returns false for unknown/out-of-scope tools', () => {
    const engine = makeEngine();
    expect(engine.isDesignatedTool(NON_DESIGNATED)).toBe(false);
    expect(engine.isDesignatedTool('unknown-tool')).toBe(false);
    expect(engine.isDesignatedTool('')).toBe(false);
  });

  test('new engine: all designated tools start at Tier 0 with 0 points', () => {
    const engine = makeEngine();
    for (const toolId of [TOOL_A, TOOL_B, TOOL_C, TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      const p = engine.getProficiency(toolId);
      expect(p).not.toBeNull();
      expect(p.tier).toBe(0);
      expect(p.points).toBe(0);
      // Issue #307: tier 0 is now unnamed (empty string), not 'Novice'
      expect(p.tierName).toBe('');
      expect(p.isMaxTier).toBe(false);
    }
  });

  test('getProficiency returns null for non-designated tools', () => {
    const engine = makeEngine();
    expect(engine.getProficiency(NON_DESIGNATED)).toBeNull();
    expect(engine.getProficiency('unknown-tool')).toBeNull();
  });
});

// ─── AC1 / Scenario 1 & 2 — Accuracy-weighted gain ───────────────────────────

describe('AC1 / Scenario 1 — Happy path: accurate use advances proficiency', () => {
  test('zero retries: full gain applied (accuracyMultiplier = 1.0)', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_A, 0);
    expect(result).not.toBeNull();
    expect(result.accuracyMultiplier).toBe(1.0);
    expect(result.pointsGained).toBeCloseTo(DESIGNATED_TOOLS[TOOL_A].baseGain * 1.0);
  });

  test('accurate use increases totalPoints on the tool', () => {
    const engine = makeEngine();
    engine.recordToolUse(TOOL_A, 0);
    const p = engine.getProficiency(TOOL_A);
    expect(p.points).toBeGreaterThan(0);
  });

  test('multiple accurate uses accumulate points monotonically', () => {
    const engine = makeEngine();
    let lastPoints = 0;
    for (let i = 1; i <= 5; i++) {
      engine.recordToolUse(TOOL_A, 0);
      const p = engine.getProficiency(TOOL_A);
      expect(p.points).toBeGreaterThan(lastPoints);
      lastPoints = p.points;
    }
  });

  test('recordToolUse returns null for non-designated tool', () => {
    const engine = makeEngine();
    expect(engine.recordToolUse(NON_DESIGNATED, 0)).toBeNull();
  });

  test('proficiency state does not change for non-designated tool use', () => {
    const engine = makeEngine();
    engine.recordToolUse(NON_DESIGNATED, 0);
    // tool_a should be unaffected
    const p = engine.getProficiency(TOOL_A);
    expect(p.points).toBe(0);
  });
});

describe('AC1 / Scenario 2 — Accuracy penalty: retries reduce gain proportionally', () => {
  test('1 retry reduces gain: accuracyMultiplier = 1 - 0.4 = 0.6', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_A, 1);
    const expectedMultiplier = 1.0 - 1 * RETRY_PENALTY_PER_EVENT;
    expect(result.accuracyMultiplier).toBeCloseTo(expectedMultiplier);
  });

  test('2 retries: accuracyMultiplier = 1 - 0.8 = 0.2 (floor)', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_A, 2);
    expect(result.accuracyMultiplier).toBeCloseTo(ACCURACY_FLOOR);
  });

  test('3 retries: accuracyMultiplier still clamped at ACCURACY_FLOOR', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_A, 3);
    expect(result.accuracyMultiplier).toBeCloseTo(ACCURACY_FLOOR);
    expect(result.accuracyMultiplier).toBeGreaterThanOrEqual(ACCURACY_FLOOR);
  });

  test('high retry count: gain never drops below baseGain * ACCURACY_FLOOR', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_A, 100);
    const minExpected = DESIGNATED_TOOLS[TOOL_A].baseGain * ACCURACY_FLOOR;
    expect(result.pointsGained).toBeCloseTo(minExpected);
  });

  test('zero-retry gain is greater than 2-retry gain (AC1 proportional reduction)', () => {
    const engineAccurate = makeEngine();
    const engineSloppy   = makeEngine();
    const accurate = engineAccurate.recordToolUse(TOOL_A, 0);
    const sloppy   = engineSloppy.recordToolUse(TOOL_A, 2);
    expect(accurate.pointsGained).toBeGreaterThan(sloppy.pointsGained);
  });

  test('Scenario 2: 3 operations with retries advance proficiency more slowly than 3 accurate', () => {
    const engineAccurate = makeEngine();
    const engineSloppy   = makeEngine();
    doAccurateUses(engineAccurate, TOOL_A, 3);
    for (let i = 0; i < 3; i++) engineSloppy.recordToolUse(TOOL_A, 3);
    const pA = engineAccurate.getProficiency(TOOL_A);
    const pS = engineSloppy.getProficiency(TOOL_A);
    expect(pA.points).toBeGreaterThan(pS.points);
  });
});

// ─── AC3 / Scenario 3 — Fast first milestone ─────────────────────────────────

describe('AC3 / Scenario 3 — Fast first milestone: Tier 1 in 5–10 accurate uses', () => {
  test('Tier 1 is reachable within 10 accurate uses on a fresh engine', () => {
    const engine = makeEngine();
    let tier1ReachedAt = null;
    for (let i = 1; i <= 10; i++) {
      const result = engine.recordToolUse(TOOL_A, 0);
      if (result.tierAfter >= 1 && tier1ReachedAt === null) {
        tier1ReachedAt = i;
      }
    }
    expect(tier1ReachedAt).not.toBeNull();
    expect(tier1ReachedAt).toBeLessThanOrEqual(10);
  });

  test('Tier 1 requires at least 1 accurate use (cannot reach in 0 uses)', () => {
    const engine = makeEngine();
    const p = engine.getProficiency(TOOL_A);
    expect(p.tier).toBe(0);
  });

  test('after reaching Tier 1, tierName is "Apprentice"', () => {
    const engine = makeEngine();
    doAccurateUses(engine, TOOL_A, 10);
    const p = engine.getProficiency(TOOL_A);
    if (p.tier >= 1) {
      expect(p.tierName).toBe(TIER_NAMES[1]);
    }
  });

  test('Tier 1 transition visible: tierAfter increments from 0 to 1 during recorded use', () => {
    const engine = makeEngine();
    let transitionSeen = false;
    for (let i = 0; i < 10; i++) {
      const result = engine.recordToolUse(TOOL_A, 0);
      if (result.tierBefore === 0 && result.tierAfter === 1) {
        transitionSeen = true;
        break;
      }
    }
    expect(transitionSeen).toBe(true);
  });

  test('fast milestone works for all 8 designated tools independently', () => {
    for (const toolId of [TOOL_A, TOOL_B, TOOL_C, TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      const engine = makeEngine();
      doAccurateUses(engine, toolId, 10);
      const p = engine.getProficiency(toolId);
      expect(p.tier).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── AC2 / Scenarios 4 & 5 — Functional rewards ──────────────────────────────

describe('AC2 / Scenario 4 — Tier 3 functional reward: operation time reduction', () => {
  test('getTimeModifier returns 1.0 at Tier 0 (no reduction)', () => {
    const engine = makeEngine();
    expect(engine.getTimeModifier(TOOL_A)).toBe(1.0);
  });

  test('getTimeModifier returns 1.0 at Tier 1', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 1);
    expect(engine.getTimeModifier(TOOL_A)).toBe(1.0);
  });

  test('getTimeModifier returns 1.0 at Tier 2', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 2);
    expect(engine.getTimeModifier(TOOL_A)).toBe(1.0);
  });

  test('getTimeModifier returns TIME_MODIFIER_TIER_3 at Tier 3 (measurable reduction vs baseline)', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 3);
    const modifier = engine.getTimeModifier(TOOL_A);
    expect(modifier).toBe(TIME_MODIFIER_TIER_3);
    expect(modifier).toBeLessThan(1.0); // must be less than baseline
  });

  test('Tier 3 time modifier is 0.80 (20% reduction — AC2 spec)', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 3);
    expect(engine.getTimeModifier(TOOL_A)).toBeCloseTo(0.80);
  });

  test('getTimeModifier at Tier 4 is deeper reduction than Tier 3', () => {
    const engine3 = makeEngine();
    const engine4 = makeEngine();
    engine3.injectProficiency(TOOL_A, 3);
    engine4.injectProficiency(TOOL_A, 4);
    expect(engine4.getTimeModifier(TOOL_A)).toBeLessThan(engine3.getTimeModifier(TOOL_A));
  });

  test('Tier 4 time modifier is 0.70 (30% reduction — AC2 spec)', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 4);
    expect(engine.getTimeModifier(TOOL_A)).toBeCloseTo(0.70);
  });

  test('time modifier is measurably reduced: simulated 100ms base operation', () => {
    const baseTime = 100; // ms
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 3);

    const start = Date.now();
    const modifier = engine.getTimeModifier(TOOL_A); // O(1) lookup
    const elapsed = Date.now() - start;

    const reducedTime = baseTime * modifier;
    expect(reducedTime).toBeLessThan(baseTime);
    expect(reducedTime).toBeCloseTo(80); // 20% reduction
    // Performance budget: modifier lookup must complete in ≤8ms
    expect(elapsed).toBeLessThan(8);
    console.log(`[Scenario 4] Tier 3 modifier lookup: ${elapsed}ms (budget ≤8ms) ✓; baseTime=${baseTime}ms → reducedTime=${reducedTime}ms`);
  });

  test('getTimeModifier returns 1.0 for non-designated tools', () => {
    const engine = makeEngine();
    expect(engine.getTimeModifier(NON_DESIGNATED)).toBe(1.0);
  });
});

describe('AC2 / Scenario 5 — Tier 5 functional reward: error margin narrows', () => {
  test('getErrorMarginModifier returns 1.0 at Tier 0 (no narrowing)', () => {
    const engine = makeEngine();
    expect(engine.getErrorMarginModifier(TOOL_A)).toBe(1.0);
  });

  test('getErrorMarginModifier returns 1.0 at Tier 1–4', () => {
    for (const tier of [1, 2, 3, 4]) {
      const engine = makeEngine();
      engine.injectProficiency(TOOL_A, tier);
      expect(engine.getErrorMarginModifier(TOOL_A)).toBe(1.0);
    }
  });

  test('getErrorMarginModifier returns ERROR_MARGIN_MODIFIER_TIER_5 at Tier 5', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 5);
    const modifier = engine.getErrorMarginModifier(TOOL_A);
    expect(modifier).toBe(ERROR_MARGIN_MODIFIER_TIER_5);
    expect(modifier).toBeLessThan(1.0); // narrows, not widens
  });

  test('Tier 5 error margin modifier is 0.75 (25% tighter tolerance — AC2 spec)', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 5);
    expect(engine.getErrorMarginModifier(TOOL_A)).toBeCloseTo(0.75);
  });

  test('Tier 5 error margin: simulated 10-unit base tolerance narrows to 7.5', () => {
    const baseTolerance = 10;
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 5);
    const tightenedTolerance = baseTolerance * engine.getErrorMarginModifier(TOOL_A);
    expect(tightenedTolerance).toBeCloseTo(7.5);
    expect(tightenedTolerance).toBeLessThan(baseTolerance); // functional, not cosmetic
  });

  test('getErrorMarginModifier returns 1.0 for non-designated tools', () => {
    const engine = makeEngine();
    expect(engine.getErrorMarginModifier(NON_DESIGNATED)).toBe(1.0);
  });

  test('time modifier at Tier 5 is same as Tier 4 (error margin is Tier 5 reward, not extra time)', () => {
    const engine4 = makeEngine();
    const engine5 = makeEngine();
    engine4.injectProficiency(TOOL_A, 4);
    engine5.injectProficiency(TOOL_A, 5);
    expect(engine5.getTimeModifier(TOOL_A)).toBe(engine4.getTimeModifier(TOOL_A));
  });
});

// ─── AC4 / Scenario 6 — Save backward compatibility ──────────────────────────

describe('AC4 / Scenario 6 — Save backward compatibility', () => {
  test('PlayerSaveState DEFAULT_SAVE has tool_proficiency set to null', () => {
    const saveState = new PlayerSaveState();
    expect(saveState.get('tool_proficiency')).toBeNull();
  });

  test('PlayerSaveState loaded from pre-feature save (no tool_proficiency key) defaults to null', () => {
    // Pre-feature save: does not have tool_proficiency
    const preFRSave = {
      tutorial_tool_switching_seen: true,
      workshop_upgrades: ['precision_tweezers'],
      ledger_balance: 250,
    };
    const saveState = new PlayerSaveState(preFRSave);
    expect(saveState.getToolProficiency()).toBeNull();
  });

  test('ProficiencyEngine with null savedState: all designated tools default to Tier 0', () => {
    const engine = new ProficiencyEngine(null);
    for (const toolId of [TOOL_A, TOOL_B, TOOL_C]) {
      const p = engine.getProficiency(toolId);
      expect(p.tier).toBe(0);
      expect(p.points).toBe(0);
    }
  });

  test('ProficiencyEngine init from null does not throw', () => {
    expect(() => new ProficiencyEngine(null)).not.toThrow();
  });

  test('ProficiencyEngine init from undefined does not throw', () => {
    expect(() => new ProficiencyEngine(undefined)).not.toThrow();
  });

  test('first tool use after null-state load accumulates proficiency correctly', () => {
    const engine = new ProficiencyEngine(null);
    const before = engine.getProficiency(TOOL_A);
    expect(before.tier).toBe(0);
    expect(before.points).toBe(0);
    engine.recordToolUse(TOOL_A, 0);
    const after = engine.getProficiency(TOOL_A);
    expect(after.points).toBeGreaterThan(0);
  });

  test('pre-feature save: all existing save fields survive load unmodified', () => {
    const preSave = {
      workshop_upgrades: ['grease_applicator'],
      ledger_balance: 500,
      completed_watches: [],
      tutorial_tool_switching_seen: true,
    };
    const saveState = new PlayerSaveState(preSave);
    expect(saveState.get('workshop_upgrades')).toEqual(['grease_applicator']);
    expect(saveState.get('ledger_balance')).toBe(500);
    expect(saveState.get('tutorial_tool_switching_seen')).toBe(true);
    // tool_proficiency absent in pre-save → should default to null
    expect(saveState.getToolProficiency()).toBeNull();
  });

  test('save round-trip: serialize and reload preserves proficiency state', () => {
    const engine = makeEngine();
    doAccurateUses(engine, TOOL_A, 6); // should reach Tier 1
    const saveState = new PlayerSaveState();
    saveState.setToolProficiency(engine.serialize());
    // Simulate game reload
    const snapshot = saveState.snapshot();
    const reloadedSave = new PlayerSaveState(snapshot);
    const reloadedEngine = new ProficiencyEngine(reloadedSave.getToolProficiency());
    const p = reloadedEngine.getProficiency(TOOL_A);
    expect(p.tier).toBe(engine.getProficiency(TOOL_A).tier);
    expect(p.points).toBeCloseTo(engine.getProficiency(TOOL_A).points);
  });
});

// ─── AC5 / Scenarios 7 & 8 — ToolPanel display ───────────────────────────────

describe('AC5 / Scenario 7 — ToolPanel: in-scope tools show bar, others show null', () => {
  test('getProficiencyBarData returns null when no engine attached', () => {
    const panel = new ToolPanel();
    expect(panel.getProficiencyBarData(TOOL_A)).toBeNull();
  });

  test('getProficiencyBarData returns null for out-of-scope tool even with engine', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);
    // Only truly unknown/non-registry tools should return null
    expect(panel.getProficiencyBarData(NON_DESIGNATED)).toBeNull();
    expect(panel.getProficiencyBarData('unknown-tool')).toBeNull();
    // Issue #307: all 5 previously out-of-scope tools are now designated — they must return bar data
    expect(panel.getProficiencyBarData(TOOL_D)).not.toBeNull(); // cross-tip-screwdriver
    expect(panel.getProficiencyBarData(TOOL_E)).not.toBeNull(); // case-knife
    expect(panel.getProficiencyBarData(TOOL_F)).not.toBeNull(); // movement-holder
    expect(panel.getProficiencyBarData(TOOL_G)).not.toBeNull(); // hand-setting-tool
    expect(panel.getProficiencyBarData(TOOL_H)).not.toBeNull(); // dust-blower
  });

  test('getProficiencyBarData returns bar data for all 8 designated tools when engine is set', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);
    for (const toolId of [TOOL_A, TOOL_B, TOOL_C, TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      const bar = panel.getProficiencyBarData(toolId);
      expect(bar).not.toBeNull();
      expect(typeof bar.tier).toBe('number');
      expect(typeof bar.tierName).toBe('string');
      expect(typeof bar.progressFraction).toBe('number');
      expect(typeof bar.isMaxTier).toBe('boolean');
      expect(typeof bar.label).toBe('string');
    }
  });

  test('getAllProficiencyBarData: all 8 designated tools have non-null bar', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);
    const all = panel.getAllProficiencyBarData();
    const allDesignated = [TOOL_A, TOOL_B, TOOL_C, TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H];
    for (const entry of all) {
      if (allDesignated.includes(entry.id)) {
        expect(entry.proficiencyBar).not.toBeNull();
      } else {
        expect(entry.proficiencyBar).toBeNull();
      }
    }
  });

  test('proficiency bar has progressFraction between 0 and 1', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);
    const bar = panel.getProficiencyBarData(TOOL_A);
    expect(bar.progressFraction).toBeGreaterThanOrEqual(0);
    expect(bar.progressFraction).toBeLessThanOrEqual(1);
  });

  test('fresh engine: progressFraction is 0 for Tier 0 with no points', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);
    const bar = panel.getProficiencyBarData(TOOL_A);
    expect(bar.progressFraction).toBeCloseTo(0);
    expect(bar.tier).toBe(0);
  });
});

describe('AC5 / Scenario 8 — ToolPanel: real-time accuracy after mid-session proficiency gain', () => {
  test('bar reflects updated proficiency after earning points mid-session', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);

    const barBefore = panel.getProficiencyBarData(TOOL_A);
    expect(barBefore.progressFraction).toBeCloseTo(0);

    // Earn proficiency mid-session
    doAccurateUses(engine, TOOL_A, 3);

    const barAfter = panel.getProficiencyBarData(TOOL_A);
    expect(barAfter.progressFraction).toBeGreaterThan(barBefore.progressFraction);
  });

  test('bar reflects tier advance after reaching Tier 1 threshold', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);

    const barBefore = panel.getProficiencyBarData(TOOL_A);
    expect(barBefore.tier).toBe(0);

    doAccurateUses(engine, TOOL_A, 10); // enough to reach Tier 1

    const barAfter = panel.getProficiencyBarData(TOOL_A);
    expect(barAfter.tier).toBeGreaterThanOrEqual(1);
    expect(barAfter.tierName).not.toBe('Novice');
  });

  test('panel does not cache stale proficiency — no re-query needed', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    panel.setProficiencyEngine(engine);

    engine.injectProficiency(TOOL_A, 3);
    const bar = panel.getProficiencyBarData(TOOL_A);
    expect(bar.tier).toBe(3);
  });
});

// ─── Scenario 9 — Tier 5 ceiling ─────────────────────────────────────────────

describe('Scenario 9 — Edge case: Tier 5 ceiling (no overflow, no crash)', () => {
  test('injectProficiency at Tier 5: tier is 5, not higher', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, MAX_TIER);
    const p = engine.getProficiency(TOOL_A);
    expect(p.tier).toBe(MAX_TIER);
    expect(p.isMaxTier).toBe(true);
  });

  test('recording more tool uses at Tier 5 does not increase tier beyond 5', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, MAX_TIER);
    doAccurateUses(engine, TOOL_A, 10);
    const p = engine.getProficiency(TOOL_A);
    expect(p.tier).toBe(MAX_TIER);
  });

  test('bar at Tier 5 shows isMaxTier = true and progressFraction = 1.0', () => {
    const panel = new ToolPanel();
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, MAX_TIER);
    panel.setProficiencyEngine(engine);
    const bar = panel.getProficiencyBarData(TOOL_A);
    expect(bar.isMaxTier).toBe(true);
    expect(bar.progressFraction).toBe(1.0);
  });

  test('Tier 5 tierName is "Grand Maître" (Issue #307 vocabulary rename)', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, MAX_TIER);
    const p = engine.getProficiency(TOOL_A);
    expect(p.tierName).toBe('Grand Maître');
  });

  test('at Tier 5: pointsToNextTier is null (no next tier)', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, MAX_TIER);
    const p = engine.getProficiency(TOOL_A);
    expect(p.pointsToNextTier).toBeNull();
  });

  test('recording tool use at Tier 5 does not throw (no integer overflow)', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, MAX_TIER);
    expect(() => doAccurateUses(engine, TOOL_A, 10)).not.toThrow();
  });
});

// ─── Scenario 10 — Regression: MultiStepOperationTracker ─────────────────────

describe('Scenario 10 — Regression: MultiStepOperationTracker retry counter', () => {
  const makeSequence = () => new MultiStepOperationTracker({
    'case-disassembly': [
      { stepIndex: 1, requiredTool: 'spring-bar-tool',      description: 'remove spring bars' },
      { stepIndex: 2, requiredTool: 'case-knife',           description: 'open snap-back case' },
      { stepIndex: 3, requiredTool: 'flat-blade-screwdriver', description: 'remove movement screw' },
    ],
  });

  test('existing advanceStep behavior unchanged: correct tool advances', () => {
    const tracker = makeSequence();
    const r = tracker.advanceStep('case-disassembly', 'spring-bar-tool');
    expect(r.advanced).toBe(true);
    expect(r.currentStep).toBe(1);
  });

  test('existing advanceStep behavior unchanged: wrong tool is blocked', () => {
    const tracker = makeSequence();
    const r = tracker.advanceStep('case-disassembly', 'case-knife');
    expect(r.advanced).toBe(false);
    expect(r.completed).toBe(false);
  });

  test('getRetryCount starts at 0 for a fresh sequence', () => {
    const tracker = makeSequence();
    expect(tracker.getRetryCount('case-disassembly')).toBe(0);
  });

  test('getRetryCount increments on wrong-tool attempts', () => {
    const tracker = makeSequence();
    tracker.advanceStep('case-disassembly', 'case-knife');    // wrong
    tracker.advanceStep('case-disassembly', 'dust-blower');  // wrong
    expect(tracker.getRetryCount('case-disassembly')).toBe(2);
  });

  test('getRetryCount does not increment on correct-tool advances', () => {
    const tracker = makeSequence();
    tracker.advanceStep('case-disassembly', 'spring-bar-tool'); // correct
    expect(tracker.getRetryCount('case-disassembly')).toBe(0);
  });

  test('resetRetryCount resets count to 0', () => {
    const tracker = makeSequence();
    tracker.advanceStep('case-disassembly', 'case-knife'); // wrong
    expect(tracker.getRetryCount('case-disassembly')).toBe(1);
    tracker.resetRetryCount('case-disassembly');
    expect(tracker.getRetryCount('case-disassembly')).toBe(0);
  });

  test('resetSequence resets both progress AND retry count', () => {
    const tracker = makeSequence();
    tracker.advanceStep('case-disassembly', 'spring-bar-tool'); // correct
    tracker.advanceStep('case-disassembly', 'case-knife');      // wrong — retry++
    tracker.resetSequence('case-disassembly');
    expect(tracker.getRetryCount('case-disassembly')).toBe(0);
    expect(tracker.getProgress('case-disassembly').currentStep).toBe(0);
  });

  test('getRetryCount returns 0 for unknown sequence (no crash)', () => {
    const tracker = makeSequence();
    expect(tracker.getRetryCount('nonexistent')).toBe(0);
  });

  test('full sequence with mixed correct/wrong: retry count matches wrong attempts only', () => {
    const tracker = makeSequence();
    tracker.advanceStep('case-disassembly', 'dust-blower');     // wrong → retry count = 1
    tracker.advanceStep('case-disassembly', 'spring-bar-tool'); // correct → step 1 done
    tracker.advanceStep('case-disassembly', 'dust-blower');     // wrong → retry count = 2
    tracker.advanceStep('case-disassembly', 'case-knife');      // correct → step 2 done
    tracker.advanceStep('case-disassembly', 'flat-blade-screwdriver'); // correct → complete
    expect(tracker.getRetryCount('case-disassembly')).toBe(2);
    expect(tracker.isComplete('case-disassembly')).toBe(true);
  });

  test('proficiency engine integration: retry count from MSOT feeds accuracy calculation', () => {
    const tracker = makeSequence();
    // Simulate 2 wrong-tool attempts before getting it right
    tracker.advanceStep('case-disassembly', 'case-knife');     // wrong
    tracker.advanceStep('case-disassembly', 'dust-blower');   // wrong
    tracker.advanceStep('case-disassembly', 'spring-bar-tool'); // correct
    const retries = tracker.getRetryCount('case-disassembly');
    expect(retries).toBe(2);

    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_C, retries); // spring-bar-tool is TOOL_C
    // With 2 retries, accuracy floor kicks in (0.2)
    expect(result.accuracyMultiplier).toBeCloseTo(ACCURACY_FLOOR);
    expect(result.pointsGained).toBeLessThan(DESIGNATED_TOOLS[TOOL_C].baseGain);
  });
});

// ─── Serialisation ────────────────────────────────────────────────────────────

describe('ProficiencyEngine — serialisation', () => {
  test('serialize returns object with all 8 designated tool entries', () => {
    const engine = makeEngine();
    const s = engine.serialize();
    expect(s).toHaveProperty(TOOL_A);
    expect(s).toHaveProperty(TOOL_B);
    expect(s).toHaveProperty(TOOL_C);
    expect(s).toHaveProperty(TOOL_D);
    expect(s).toHaveProperty(TOOL_E);
    expect(s).toHaveProperty(TOOL_F);
    expect(s).toHaveProperty(TOOL_G);
    expect(s).toHaveProperty(TOOL_H);
  });

  test('each serialised entry has tier and points', () => {
    const engine = makeEngine();
    const s = engine.serialize();
    for (const entry of Object.values(s)) {
      expect(typeof entry.tier).toBe('number');
      expect(typeof entry.points).toBe('number');
    }
  });

  test('serialize captures earned proficiency accurately', () => {
    const engine = makeEngine();
    doAccurateUses(engine, TOOL_A, 5);
    const s = engine.serialize();
    expect(s[TOOL_A].points).toBeGreaterThan(0);
  });

  test('deserialization from serialized state restores tier and points exactly', () => {
    const engine1 = makeEngine();
    doAccurateUses(engine1, TOOL_A, 8);
    engine1.injectProficiency(TOOL_B, 3);

    const s = engine1.serialize();
    const engine2 = new ProficiencyEngine(s);

    expect(engine2.getProficiency(TOOL_A).tier).toBe(engine1.getProficiency(TOOL_A).tier);
    expect(engine2.getProficiency(TOOL_A).points).toBeCloseTo(engine1.getProficiency(TOOL_A).points);
    expect(engine2.getProficiency(TOOL_B).tier).toBe(3);
  });
});

// ─── PlayerSaveState integration ─────────────────────────────────────────────

describe('PlayerSaveState — tool_proficiency integration', () => {
  test('getToolProficiency returns null for new save state', () => {
    const save = new PlayerSaveState();
    expect(save.getToolProficiency()).toBeNull();
  });

  test('setToolProficiency persists the proficiency snapshot', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 2);
    const save = new PlayerSaveState();
    save.setToolProficiency(engine.serialize());
    const restored = save.getToolProficiency();
    expect(restored).not.toBeNull();
    expect(restored[TOOL_A].tier).toBe(2);
  });

  test('snapshot() includes tool_proficiency when set', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 1);
    const save = new PlayerSaveState();
    save.setToolProficiency(engine.serialize());
    const snap = save.snapshot();
    expect(snap.tool_proficiency).not.toBeNull();
    expect(snap.tool_proficiency[TOOL_A].tier).toBe(1);
  });

  test('no existing save fields are corrupted by adding tool_proficiency', () => {
    const save = new PlayerSaveState({
      workshop_upgrades: ['precision_tweezers'],
      ledger_balance: 300,
    });
    const engine = makeEngine();
    save.setToolProficiency(engine.serialize());
    // Existing fields must be unaffected
    expect(save.get('workshop_upgrades')).toEqual(['precision_tweezers']);
    expect(save.get('ledger_balance')).toBe(300);
  });
});

// ─── Issue #307 — 5 New Designated Tools ────────────────────────────────────

describe('Issue #307 — 5 new designated tools: proficiency tracking', () => {
  test('cross-tip-screwdriver earns proficiency on accurate use', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_D, 0);
    expect(result).not.toBeNull();
    expect(result.pointsGained).toBeCloseTo(DESIGNATED_TOOLS[TOOL_D].baseGain);
  });

  test('case-knife earns proficiency on accurate use', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_E, 0);
    expect(result).not.toBeNull();
    expect(result.pointsGained).toBeCloseTo(DESIGNATED_TOOLS[TOOL_E].baseGain);
  });

  test('movement-holder earns proficiency on accurate use', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_F, 0);
    expect(result).not.toBeNull();
    expect(result.pointsGained).toBeCloseTo(DESIGNATED_TOOLS[TOOL_F].baseGain);
  });

  test('hand-setting-tool earns proficiency on accurate use', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_G, 0);
    expect(result).not.toBeNull();
    expect(result.pointsGained).toBeCloseTo(DESIGNATED_TOOLS[TOOL_G].baseGain);
  });

  test('dust-blower earns proficiency on accurate use', () => {
    const engine = makeEngine();
    const result = engine.recordToolUse(TOOL_H, 0);
    expect(result).not.toBeNull();
    expect(result.pointsGained).toBeCloseTo(DESIGNATED_TOOLS[TOOL_H].baseGain);
  });

  test('all 5 new tools reach Tier 1 within 10 accurate uses', () => {
    for (const toolId of [TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      const engine = makeEngine();
      doAccurateUses(engine, toolId, 10);
      const p = engine.getProficiency(toolId);
      expect(p.tier).toBeGreaterThanOrEqual(1);
    }
  });

  test('all 5 new tools have Tier 3 time modifier applied', () => {
    for (const toolId of [TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      const engine = makeEngine();
      engine.injectProficiency(toolId, 3);
      expect(engine.getTimeModifier(toolId)).toBe(TIME_MODIFIER_TIER_3);
    }
  });

  test('all 5 new tools have Tier 5 error margin modifier applied', () => {
    for (const toolId of [TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      const engine = makeEngine();
      engine.injectProficiency(toolId, 5);
      expect(engine.getErrorMarginModifier(toolId)).toBe(ERROR_MARGIN_MODIFIER_TIER_5);
    }
  });

  test('5 new tools track proficiency independently of original 3 tools', () => {
    const engine = makeEngine();
    doAccurateUses(engine, TOOL_D, 10); // cross-tip-screwdriver reaches Tier 1
    // Original tools must be unaffected
    expect(engine.getProficiency(TOOL_A).points).toBe(0);
    expect(engine.getProficiency(TOOL_B).points).toBe(0);
    expect(engine.getProficiency(TOOL_C).points).toBe(0);
    // New tools other than TOOL_D must be unaffected
    expect(engine.getProficiency(TOOL_E).points).toBe(0);
    expect(engine.getProficiency(TOOL_H).points).toBe(0);
  });

  test('serialize captures proficiency for all 8 tools after gaining on new tools', () => {
    const engine = makeEngine();
    doAccurateUses(engine, TOOL_D, 5);
    doAccurateUses(engine, TOOL_F, 6);
    const s = engine.serialize();
    expect(s[TOOL_D].points).toBeGreaterThan(0);
    expect(s[TOOL_F].points).toBeGreaterThan(0);
    expect(s[TOOL_A].points).toBe(0); // unaffected
  });

  test('injectProficiency works on all 5 new tools without throwing', () => {
    const engine = makeEngine();
    for (const toolId of [TOOL_D, TOOL_E, TOOL_F, TOOL_G, TOOL_H]) {
      expect(() => engine.injectProficiency(toolId, 3)).not.toThrow();
      expect(engine.getProficiency(toolId).tier).toBe(3);
    }
  });
});

// ─── Issue #307 — TIER_NAMES vocabulary rename ───────────────────────────────

describe('Issue #307 — TIER_NAMES global vocabulary rename', () => {
  test('TIER_NAMES[0] is empty string (unnamed tier 0)', () => {
    expect(TIER_NAMES[0]).toBe('');
  });

  test('TIER_NAMES[1] is "Apprentice"', () => {
    expect(TIER_NAMES[1]).toBe('Apprentice');
  });

  test('TIER_NAMES[2] is "Journeyman"', () => {
    expect(TIER_NAMES[2]).toBe('Journeyman');
  });

  test('TIER_NAMES[3] is "Craftsman" (was "Expert" in #297)', () => {
    expect(TIER_NAMES[3]).toBe('Craftsman');
  });

  test('TIER_NAMES[4] is "Master" (was "Artisan" in #297)', () => {
    expect(TIER_NAMES[4]).toBe('Master');
  });

  test('TIER_NAMES[5] is "Grand Maître" (was "Master" in #297)', () => {
    expect(TIER_NAMES[5]).toBe('Grand Maître');
  });

  test('tier 0 getProficiency().tierName is "" (empty string, not "Novice")', () => {
    const engine = makeEngine();
    const p = engine.getProficiency(TOOL_A);
    expect(p.tierName).toBe('');
    expect(p.tierName).not.toBe('Novice');
  });

  test('tier 3 getProficiency().tierName is "Craftsman" (not "Expert")', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 3);
    expect(engine.getProficiency(TOOL_A).tierName).toBe('Craftsman');
  });

  test('tier 4 getProficiency().tierName is "Master" (not "Artisan")', () => {
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 4);
    expect(engine.getProficiency(TOOL_A).tierName).toBe('Master');
  });

  test('getProficiencyBarData label at tier 0 includes "no proficiency earned"', () => {
    const engine = makeEngine();
    const bar = engine.getProficiencyBarData(TOOL_A);
    expect(bar.label).toContain('no proficiency earned');
  });

  test('getProficiencyBarData tierName at tier 0 is "" (empty string)', () => {
    const engine = makeEngine();
    const bar = engine.getProficiencyBarData(TOOL_A);
    expect(bar.tierName).toBe('');
  });
});

// ─── Issue #307 — Vocabulary migration notice flag ───────────────────────────

describe('Issue #307 — tool_proficiency_vocabulary_updated one-time notice flag', () => {
  test('DEFAULT_SAVE has tool_proficiency_vocabulary_updated = false', () => {
    const save = new PlayerSaveState();
    expect(save.get('tool_proficiency_vocabulary_updated')).toBe(false);
  });

  test('pre-#307 saves without the flag receive false default on load', () => {
    const preSave = {
      tool_proficiency: null,
      workshop_upgrades: [],
      tutorial_tool_switching_seen: true,
    };
    const save = new PlayerSaveState(preSave);
    expect(save.get('tool_proficiency_vocabulary_updated')).toBe(false);
  });

  test('flag can be set to true (marks notice as shown)', () => {
    const save = new PlayerSaveState();
    expect(save.get('tool_proficiency_vocabulary_updated')).toBe(false);
    save.set('tool_proficiency_vocabulary_updated', true);
    expect(save.get('tool_proficiency_vocabulary_updated')).toBe(true);
  });

  test('flag persists through snapshot/reload cycle', () => {
    const save = new PlayerSaveState();
    save.set('tool_proficiency_vocabulary_updated', true);
    const snap = save.snapshot();
    const reloaded = new PlayerSaveState(snap);
    expect(reloaded.get('tool_proficiency_vocabulary_updated')).toBe(true);
  });

  test('flag is independent of tool_proficiency field', () => {
    const save = new PlayerSaveState();
    const engine = makeEngine();
    engine.injectProficiency(TOOL_A, 2);
    save.setToolProficiency(engine.serialize());
    // Proficiency set but notice flag still false (not yet acknowledged)
    expect(save.get('tool_proficiency_vocabulary_updated')).toBe(false);
    save.set('tool_proficiency_vocabulary_updated', true);
    // Proficiency state must be unaffected
    expect(save.getToolProficiency()[TOOL_A].tier).toBe(2);
  });

  test('setting flag does not corrupt other save fields', () => {
    const save = new PlayerSaveState({
      workshop_upgrades: ['precision_tweezers'],
      ledger_balance: 500,
    });
    save.set('tool_proficiency_vocabulary_updated', true);
    expect(save.get('workshop_upgrades')).toEqual(['precision_tweezers']);
    expect(save.get('ledger_balance')).toBe(500);
  });
});
