/**
 * Tests for BeforeAfterComparison.js — Issue #81 Phase 1, AC5
 *
 * Acceptance Criterion 5:
 *   Given a player completes the restoration of any Phase 1 damage-state watch,
 *   when the completion screen is shown,
 *   then a side-by-side or animated before/after visual comparison is displayed
 *   that highlights the transformation contrast.
 *
 * Also covers:
 *   - Standard wear (null damage state) returns null — no comparison shown
 *   - All 3 Phase 1 types return non-null payloads with required fields
 *   - beforeDescription is thumbnail-worthy (non-trivial length)
 *   - repairStepsCompleted is captured in payload
 *   - displayMode defaults to 'side_by_side'
 *   - shouldShowComparison() returns correct values
 */

'use strict';

const {
  BeforeAfterComparison,
  AFTER_DESCRIPTIONS,
} = require('../../src/completion/BeforeAfterComparison');

const { PHASE1_DAMAGE_STATES } = require('../../src/intake/WatchIntake');

// ─── AC5: buildPayload for all Phase 1 damage states ──────────────────────────

describe('BeforeAfterComparison — AC5: buildPayload returns non-null for all Phase 1 damage states', () => {
  const comp = new BeforeAfterComparison();

  test.each(PHASE1_DAMAGE_STATES)('buildPayload("%s", ...) returns a non-null payload', (stateId) => {
    const payload = comp.buildPayload(stateId, []);
    expect(payload).not.toBeNull();
  });

  test.each(PHASE1_DAMAGE_STATES)('payload for "%s" has damageStateId field', (stateId) => {
    const payload = comp.buildPayload(stateId, []);
    expect(payload.damageStateId).toBe(stateId);
  });

  test.each(PHASE1_DAMAGE_STATES)('payload for "%s" has non-empty damageStateLabel', (stateId) => {
    const payload = comp.buildPayload(stateId, []);
    expect(typeof payload.damageStateLabel).toBe('string');
    expect(payload.damageStateLabel.length).toBeGreaterThan(0);
  });

  test.each(PHASE1_DAMAGE_STATES)('payload for "%s" has a non-empty beforeDescription', (stateId) => {
    const payload = comp.buildPayload(stateId, []);
    expect(typeof payload.beforeDescription).toBe('string');
    expect(payload.beforeDescription.length).toBeGreaterThan(20); // must be visually descriptive
  });

  test.each(PHASE1_DAMAGE_STATES)('payload for "%s" has a non-empty afterDescription', (stateId) => {
    const payload = comp.buildPayload(stateId, []);
    expect(typeof payload.afterDescription).toBe('string');
    expect(payload.afterDescription.length).toBeGreaterThan(0);
  });

  test.each(PHASE1_DAMAGE_STATES)('payload for "%s" has beforeCues array with ≥1 entry', (stateId) => {
    const payload = comp.buildPayload(stateId, []);
    expect(Array.isArray(payload.beforeCues)).toBe(true);
    expect(payload.beforeCues.length).toBeGreaterThan(0);
  });

  test.each(PHASE1_DAMAGE_STATES)('payload for "%s" defaults to side_by_side displayMode', (stateId) => {
    const payload = comp.buildPayload(stateId, []);
    expect(payload.displayMode).toBe('side_by_side');
  });
});

// ─── AC5: animated_reveal display mode ────────────────────────────────────────

describe('BeforeAfterComparison — AC5: animated_reveal display mode', () => {
  const comp = new BeforeAfterComparison();

  test('buildPayload with animated_reveal mode returns animated_reveal in payload', () => {
    const payload = comp.buildPayload('water_ingress', [], 'animated_reveal');
    expect(payload.displayMode).toBe('animated_reveal');
  });

  test('buildPayload with unknown mode falls back to side_by_side', () => {
    const payload = comp.buildPayload('oxidation', [], 'unknown_mode');
    expect(payload.displayMode).toBe('side_by_side');
  });
});

// ─── AC5: repairStepsCompleted captured in payload ────────────────────────────

describe('BeforeAfterComparison — AC5: repairStepsCompleted captured', () => {
  const comp = new BeforeAfterComparison();

  test('water_ingress payload captures all repair steps completed', () => {
    const steps = ['apply_corrosion_cleaning_tool', 'replace_crown_and_gasket', 'apply_crystal_defogging_solution'];
    const payload = comp.buildPayload('water_ingress', steps);
    expect(payload.repairStepsCompleted).toEqual(steps);
  });

  test('repairStepsCompleted in payload is a copy (no reference aliasing)', () => {
    const steps = ['step_1', 'step_2'];
    const payload = comp.buildPayload('oxidation', steps);
    steps.push('step_3');
    expect(payload.repairStepsCompleted).toHaveLength(2); // original length preserved
  });
});

// ─── Standard wear: null returns null (additive feature) ─────────────────────

describe('BeforeAfterComparison — standard wear (null damage state) returns null', () => {
  const comp = new BeforeAfterComparison();

  test('buildPayload(null) returns null — no comparison for standard wear', () => {
    expect(comp.buildPayload(null, [])).toBeNull();
  });

  test('buildPayload with undefined damage state returns null', () => {
    expect(comp.buildPayload(undefined, [])).toBeNull();
  });

  test('shouldShowComparison(null) returns false', () => {
    expect(comp.shouldShowComparison(null)).toBe(false);
  });

  test('shouldShowComparison("water_ingress") returns true', () => {
    expect(comp.shouldShowComparison('water_ingress')).toBe(true);
  });

  test('shouldShowComparison("oxidation") returns true', () => {
    expect(comp.shouldShowComparison('oxidation')).toBe(true);
  });

  test('shouldShowComparison("crystal_crazing") returns true', () => {
    expect(comp.shouldShowComparison('crystal_crazing')).toBe(true);
  });

  test('shouldShowComparison("shock_damage") returns false (Phase 2, not yet in scope)', () => {
    expect(comp.shouldShowComparison('shock_damage')).toBe(false);
  });
});

// ─── AFTER_DESCRIPTIONS completeness ─────────────────────────────────────────

describe('BeforeAfterComparison — AFTER_DESCRIPTIONS authored for all Phase 1 states', () => {
  test.each(PHASE1_DAMAGE_STATES)('AFTER_DESCRIPTIONS has an entry for "%s"', (stateId) => {
    expect(typeof AFTER_DESCRIPTIONS[stateId]).toBe('string');
    expect(AFTER_DESCRIPTIONS[stateId].length).toBeGreaterThan(20);
  });
});
