/**
 * Tests for PreExistingDamageRegistry.js — Issue #149 Phase 2
 *
 * Acceptance Criteria covered:
 *   AC3: Pre-existing damage flags appear as line items with estimated cost
 *        impact in scope negotiation; player must make scope decision before
 *        proceeding.
 *
 * Also covers:
 *   - Flagging and unflagging findings
 *   - Idempotent flagging (duplicate ID updates, not duplicates)
 *   - Cost delta accumulation
 *   - Querying flagged findings
 */

'use strict';

const { PreExistingDamageRegistry } = require('../../../javascript/intake/PreExistingDamageRegistry');

// ─── Basic flagging ───────────────────────────────────────────────────────────

describe('PreExistingDamageRegistry — AC3: basic flagging', () => {
  test('isFlagged() returns false before any findings are flagged', () => {
    const reg = new PreExistingDamageRegistry();
    expect(reg.isFlagged('crown_wind_broken_001')).toBe(false);
  });

  test('flagFinding() returns the created finding object', () => {
    const reg = new PreExistingDamageRegistry();
    const finding = reg.flagFinding('crown_wind_broken_001', 'crown_wind', 'Broken mainspring', 'broken', 50);
    expect(finding.findingId).toBe('crown_wind_broken_001');
    expect(finding.sourceTestId).toBe('crown_wind');
    expect(finding.label).toBe('Broken mainspring');
    expect(finding.result).toBe('broken');
    expect(finding.costDelta).toBe(50);
    expect(finding.flaggedByPlayer).toBe(true);
  });

  test('isFlagged() returns true after flagFinding()', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('crown_wind_broken_001', 'crown_wind', 'Broken mainspring', 'broken', 50);
    expect(reg.isFlagged('crown_wind_broken_001')).toBe(true);
  });

  test('count() increments after each new finding', () => {
    const reg = new PreExistingDamageRegistry();
    expect(reg.count()).toBe(0);
    reg.flagFinding('a', 'crown_wind', 'A', 'broken', 10);
    expect(reg.count()).toBe(1);
    reg.flagFinding('b', 'audible_tick', 'B', 'silent', 20);
    expect(reg.count()).toBe(2);
  });

  test('hasFindings() is false with no findings', () => {
    const reg = new PreExistingDamageRegistry();
    expect(reg.hasFindings()).toBe(false);
  });

  test('hasFindings() is true after first flagging', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('a', 'crown_wind', 'A', 'stiff', 5);
    expect(reg.hasFindings()).toBe(true);
  });
});

// ─── AC3: getAllFlaggedFindings for scope negotiation line items ───────────────

describe('PreExistingDamageRegistry — AC3: getAllFlaggedFindings for line items', () => {
  test('getAllFlaggedFindings() returns empty array when nothing is flagged', () => {
    const reg = new PreExistingDamageRegistry();
    expect(reg.getAllFlaggedFindings()).toEqual([]);
  });

  test('getAllFlaggedFindings() returns all flagged findings as array', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('f1', 'crown_wind', 'Broken mainspring', 'broken', 50);
    reg.flagFinding('f2', 'audible_tick', 'Silent movement', 'silent', 80);
    const findings = reg.getAllFlaggedFindings();
    expect(findings).toHaveLength(2);
    const ids = findings.map(f => f.findingId);
    expect(ids).toContain('f1');
    expect(ids).toContain('f2');
  });

  test('each finding in getAllFlaggedFindings() has required line-item fields', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('f1', 'crown_wind', 'Broken mainspring', 'broken', 50);
    const [finding] = reg.getAllFlaggedFindings();
    expect(finding).toHaveProperty('findingId');
    expect(finding).toHaveProperty('label');
    expect(finding).toHaveProperty('costDelta');
    expect(finding).toHaveProperty('sourceTestId');
    expect(finding).toHaveProperty('result');
  });
});

// ─── Cost delta accumulation ──────────────────────────────────────────────────

describe('PreExistingDamageRegistry — cost delta accumulation', () => {
  test('getTotalCostDelta() returns 0 with no findings', () => {
    const reg = new PreExistingDamageRegistry();
    expect(reg.getTotalCostDelta()).toBe(0);
  });

  test('getTotalCostDelta() sums all finding costDeltas', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('f1', 'crown_wind', 'A', 'broken', 50);
    reg.flagFinding('f2', 'audible_tick', 'B', 'silent', 80);
    reg.flagFinding('f3', 'water_resistance', 'C', 'seal_failed', 30);
    expect(reg.getTotalCostDelta()).toBe(160);
  });

  test('flagFinding() throws for negative costDelta', () => {
    const reg = new PreExistingDamageRegistry();
    expect(() => reg.flagFinding('f1', 'crown_wind', 'A', 'broken', -5)).toThrow(/costDelta must be a non-negative/i);
  });

  test('flagFinding() accepts zero costDelta', () => {
    const reg = new PreExistingDamageRegistry();
    const finding = reg.flagFinding('f1', 'crown_wind', 'A', 'broken', 0);
    expect(finding.costDelta).toBe(0);
  });
});

// ─── Idempotent flagging ──────────────────────────────────────────────────────

describe('PreExistingDamageRegistry — idempotent flagging (no duplicates)', () => {
  test('flagging same ID twice updates the entry, does not duplicate', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('f1', 'crown_wind', 'Original', 'broken', 50);
    reg.flagFinding('f1', 'crown_wind', 'Updated', 'broken', 75);
    expect(reg.count()).toBe(1);
    const [finding] = reg.getAllFlaggedFindings();
    expect(finding.label).toBe('Updated');
    expect(finding.costDelta).toBe(75);
  });
});

// ─── Unflagging ───────────────────────────────────────────────────────────────

describe('PreExistingDamageRegistry — unflagFinding()', () => {
  test('unflagFinding() removes the finding and returns true', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('f1', 'crown_wind', 'A', 'broken', 50);
    const removed = reg.unflagFinding('f1');
    expect(removed).toBe(true);
    expect(reg.isFlagged('f1')).toBe(false);
    expect(reg.count()).toBe(0);
  });

  test('unflagFinding() returns false for unknown ID', () => {
    const reg = new PreExistingDamageRegistry();
    expect(reg.unflagFinding('nonexistent')).toBe(false);
  });

  test('getTotalCostDelta() recalculates after unflagging', () => {
    const reg = new PreExistingDamageRegistry();
    reg.flagFinding('f1', 'crown_wind', 'A', 'broken', 50);
    reg.flagFinding('f2', 'audible_tick', 'B', 'silent', 80);
    reg.unflagFinding('f1');
    expect(reg.getTotalCostDelta()).toBe(80);
  });
});
