/**
 * Tests for FunctionalTestPanel.js — Issue #149 Phase 2
 *
 * Acceptance Criteria covered:
 *   AC1: After MVP checklist, 3-5 functional test tools appear in intake UI,
 *        accessible before disassembly begins.
 *   AC2: Crown wind test result (stiff / normal / broken) recorded on job card
 *        as a functional finding.
 *
 * Also covers:
 *   - Test panel gating: tests unavailable before checklist complete
 *   - All 5 test IDs are discoverable
 *   - Keyboard accessibility metadata present on each test definition
 *   - Unknown testId throws a clear error
 *   - Deterministic result selection via injectable RNG
 */

'use strict';

const {
  FunctionalTestPanel,
  FUNCTIONAL_TEST_IDS,
  FUNCTIONAL_TEST_DEFINITIONS,
} = require('../../src/intake/FunctionalTestPanel');

// ─── Deterministic RNG helpers ────────────────────────────────────────────────

const fixedRng = (value) => () => value;
const sequenceRng = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

// ─── AC1: Test panel availability ────────────────────────────────────────────

describe('FunctionalTestPanel — AC1: panel availability after MVP checklist', () => {
  test('panel is NOT available before checklist is complete', () => {
    const panel = new FunctionalTestPanel();
    expect(panel.isAvailable()).toBe(false);
  });

  test('panel IS available after markChecklistComplete()', () => {
    const panel = new FunctionalTestPanel();
    panel.markChecklistComplete();
    expect(panel.isAvailable()).toBe(true);
  });

  test('runTest() throws if checklist not yet complete', () => {
    const panel = new FunctionalTestPanel();
    expect(() => panel.runTest('crown_wind')).toThrow(/MVP checklist must be completed/i);
  });

  test('runTest() succeeds after markChecklistComplete()', () => {
    const panel = new FunctionalTestPanel({}, fixedRng(0.0));
    panel.markChecklistComplete();
    const result = panel.runTest('crown_wind');
    expect(result).toBeDefined();
    expect(result.testId).toBe('crown_wind');
  });
});

// ─── AC1: Test discovery — all 5 tests accessible ────────────────────────────

describe('FunctionalTestPanel — AC1: all 5 functional tests are defined', () => {
  test('FUNCTIONAL_TEST_IDS contains exactly 5 entries', () => {
    expect(FUNCTIONAL_TEST_IDS).toHaveLength(5);
  });

  test('all 5 required test IDs are present', () => {
    expect(FUNCTIONAL_TEST_IDS).toContain('crown_wind');
    expect(FUNCTIONAL_TEST_IDS).toContain('audible_tick');
    expect(FUNCTIONAL_TEST_IDS).toContain('pusher_crown_func');
    expect(FUNCTIONAL_TEST_IDS).toContain('visual_shake');
    expect(FUNCTIONAL_TEST_IDS).toContain('water_resistance');
  });

  test('getAllTestDefinitions() returns all 5 definitions', () => {
    const panel = new FunctionalTestPanel();
    const defs = panel.getAllTestDefinitions();
    expect(defs).toHaveLength(5);
  });

  test('each definition has id, label, description, and possibleResults', () => {
    const panel = new FunctionalTestPanel();
    for (const def of panel.getAllTestDefinitions()) {
      expect(typeof def.id).toBe('string');
      expect(typeof def.label).toBe('string');
      expect(typeof def.description).toBe('string');
      expect(Array.isArray(def.possibleResults)).toBe(true);
      expect(def.possibleResults.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('getTestDefinition() returns correct definition for each ID', () => {
    const panel = new FunctionalTestPanel();
    for (const id of FUNCTIONAL_TEST_IDS) {
      const def = panel.getTestDefinition(id);
      expect(def).not.toBeNull();
      expect(def.id).toBe(id);
    }
  });

  test('getTestDefinition() returns null for unknown ID', () => {
    const panel = new FunctionalTestPanel();
    expect(panel.getTestDefinition('not_a_real_test')).toBeNull();
  });
});

// ─── AC1: Accessibility — keyboard navigation metadata ───────────────────────

describe('FunctionalTestPanel — AC1: accessibility metadata for keyboard navigation', () => {
  test.each(FUNCTIONAL_TEST_IDS)(
    'definition for "%s" has a non-empty accessibilityHint',
    (testId) => {
      const def = FUNCTIONAL_TEST_DEFINITIONS[testId];
      expect(typeof def.accessibilityHint).toBe('string');
      expect(def.accessibilityHint.length).toBeGreaterThan(0);
    }
  );
});

// ─── AC2: Crown wind test result recorded ─────────────────────────────────────

describe('FunctionalTestPanel — AC2: crown wind test results', () => {
  test('crown_wind result "stiff" is returned when RNG selects it', () => {
    // weights: { stiff:1, normal:5, broken:1 } total=7; roll<1/7 → stiff
    // fixedRng(0.0) → roll = 0.0 * 7 = 0.0 → 0.0 - 1 ≤ 0 → stiff
    const panel = new FunctionalTestPanel({}, fixedRng(0.0));
    panel.markChecklistComplete();
    const res = panel.runTest('crown_wind');
    expect(res.result).toBe('stiff');
    expect(res.testId).toBe('crown_wind');
  });

  test('crown_wind result "broken" is within possible results', () => {
    const def = FUNCTIONAL_TEST_DEFINITIONS['crown_wind'];
    expect(def.possibleResults).toContain('broken');
  });

  test('crown_wind result "normal" is within possible results', () => {
    const def = FUNCTIONAL_TEST_DEFINITIONS['crown_wind'];
    expect(def.possibleResults).toContain('normal');
  });

  test('crown_wind result "stiff" is a finding (isFinding=true)', () => {
    const panel = new FunctionalTestPanel({}, fixedRng(0.0));
    panel.markChecklistComplete();
    const res = panel.runTest('crown_wind');
    expect(res.result).toBe('stiff');
    expect(res.isFinding).toBe(true);
    expect(res.suggestPreExistingFlag).toBe(true);
  });

  test('crown_wind result "normal" is NOT a finding (isFinding=false)', () => {
    // With weights { stiff:1, normal:5, broken:1 }, total=7
    // roll = 0.5 * 7 = 3.5; 3.5 - 1 = 2.5 (>0, not stiff), 2.5 - 5 = -2.5 (≤0 → normal)
    const panel = new FunctionalTestPanel({}, fixedRng(0.5));
    panel.markChecklistComplete();
    const res = panel.runTest('crown_wind');
    expect(res.result).toBe('normal');
    expect(res.isFinding).toBe(false);
    expect(res.suggestPreExistingFlag).toBe(false);
  });

  test('runTest() for crown_wind returns all required fields for job card recording', () => {
    const panel = new FunctionalTestPanel({}, fixedRng(0.0));
    panel.markChecklistComplete();
    const res = panel.runTest('crown_wind');
    expect(res).toHaveProperty('testId');
    expect(res).toHaveProperty('result');
    expect(res).toHaveProperty('isFinding');
    expect(res).toHaveProperty('suggestPreExistingFlag');
    expect(res).toHaveProperty('label');
  });
});

// ─── All tests: valid result strings ─────────────────────────────────────────

describe('FunctionalTestPanel — all tests return valid result strings', () => {
  test.each(FUNCTIONAL_TEST_IDS)('runTest("%s") returns a result in possibleResults', (testId) => {
    const panel = new FunctionalTestPanel({}, fixedRng(0.0));
    panel.markChecklistComplete();
    const res = panel.runTest(testId);
    const def = FUNCTIONAL_TEST_DEFINITIONS[testId];
    expect(def.possibleResults).toContain(res.result);
  });

  test('runTest() throws for unknown testId', () => {
    const panel = new FunctionalTestPanel();
    panel.markChecklistComplete();
    expect(() => panel.runTest('fake_test')).toThrow(/unknown test id/i);
  });
});

// ─── Deterministic distribution: all results reachable ───────────────────────

describe('FunctionalTestPanel — deterministic: all crown_wind results reachable', () => {
  test('all 3 crown_wind results can be produced via controlled RNG', () => {
    // weights: { stiff:1, normal:5, broken:1 }, total=7
    // roll=0.0*7=0: 0-1=-1 ≤0 → stiff
    // roll=0.5*7=3.5: 3.5-1=2.5, 2.5-5=-2.5 ≤0 → normal
    // roll=0.99*7=6.93: 6.93-1=5.93, 5.93-5=0.93, 0.93-1=-0.07 ≤0 → broken
    const rng = sequenceRng([0.0, 0.5, 0.99]);
    const panel = new FunctionalTestPanel({}, rng);
    panel.markChecklistComplete();
    const results = [
      panel.runTest('crown_wind').result,
      panel.runTest('crown_wind').result,
      panel.runTest('crown_wind').result,
    ];
    expect(results).toContain('stiff');
    expect(results).toContain('normal');
    expect(results).toContain('broken');
  });
});
