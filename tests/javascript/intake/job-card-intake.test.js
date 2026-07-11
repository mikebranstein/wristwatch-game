/**
 * Tests for JobCardIntake.js — Issue #149 Phase 2
 *
 * Acceptance Criteria covered:
 *   AC2: Crown wind test result recorded on job card as a functional finding.
 *   AC4: Job reward reflects adjusted pricing delta; client approval state recorded.
 *   AC5: Client-declined items marked and excluded from QA criteria.
 *
 * Also covers:
 *   - Recording findings from all functional tests
 *   - Scope decision application and retrieval
 *   - Serialisation (toJSON)
 *   - Edge cases: invalid inputs
 */

'use strict';

const { JobCardIntake } = require('../../../javascript/intake/JobCardIntake');

// ─── AC2: Recording functional findings ──────────────────────────────────────

describe('JobCardIntake — AC2: recording functional test findings', () => {
  test('recordFunctionalFinding() returns the stored finding', () => {
    const card = new JobCardIntake();
    const finding = card.recordFunctionalFinding('crown_wind', 'broken', true);
    expect(finding.testId).toBe('crown_wind');
    expect(finding.result).toBe('broken');
    expect(finding.isFinding).toBe(true);
    expect(finding.flaggedPreExisting).toBe(false);
  });

  test('getFunctionalFinding() retrieves crown_wind result (AC2)', () => {
    const card = new JobCardIntake();
    card.recordFunctionalFinding('crown_wind', 'broken', true);
    const finding = card.getFunctionalFinding('crown_wind');
    expect(finding).not.toBeNull();
    expect(finding.result).toBe('broken');
    expect(finding.testId).toBe('crown_wind');
    expect(finding.isFinding).toBe(true);
  });

  test('getFunctionalFinding() returns null for unrecorded test', () => {
    const card = new JobCardIntake();
    expect(card.getFunctionalFinding('crown_wind')).toBeNull();
  });

  test('recordFunctionalFinding() with flaggedPreExisting=true stores the flag', () => {
    const card = new JobCardIntake();
    const finding = card.recordFunctionalFinding('crown_wind', 'broken', true, true);
    expect(finding.flaggedPreExisting).toBe(true);
  });

  test('getFunctionalFindings() returns all recorded findings', () => {
    const card = new JobCardIntake();
    card.recordFunctionalFinding('crown_wind', 'broken', true);
    card.recordFunctionalFinding('audible_tick', 'silent', true);
    card.recordFunctionalFinding('visual_shake', 'rotor_free', false);
    const findings = card.getFunctionalFindings();
    expect(findings).toHaveLength(3);
  });

  test('getFunctionalFindings() returns empty array if none recorded', () => {
    const card = new JobCardIntake();
    expect(card.getFunctionalFindings()).toEqual([]);
  });

  test('recording crown_wind with result "normal" is not a finding', () => {
    const card = new JobCardIntake();
    card.recordFunctionalFinding('crown_wind', 'normal', false);
    const finding = card.getFunctionalFinding('crown_wind');
    expect(finding.isFinding).toBe(false);
  });

  test('recordFunctionalFinding() throws for empty testId', () => {
    const card = new JobCardIntake();
    expect(() => card.recordFunctionalFinding('', 'broken', true)).toThrow(/testId/i);
  });

  test('recordFunctionalFinding() throws for empty result', () => {
    const card = new JobCardIntake();
    expect(() => card.recordFunctionalFinding('crown_wind', '', true)).toThrow(/result/i);
  });
});

// ─── AC4: Scope decision and pricing delta ────────────────────────────────────

describe('JobCardIntake — AC4: scope decision and adjusted pricing', () => {
  test('getScopeDecision() returns null before any decision is applied', () => {
    const card = new JobCardIntake();
    expect(card.getScopeDecision()).toBeNull();
  });

  test('applyScopeDecision() records ACCEPT_FULL_SCOPE correctly', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('ACCEPT_FULL_SCOPE', 130, [], true);
    expect(card.getScopeDecision()).toBe('ACCEPT_FULL_SCOPE');
    expect(card.getPricingDelta()).toBe(130);
    expect(card.isClientApproved()).toBe(true);
  });

  test('getPricingDelta() reflects adjusted pricing (AC4)', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('ACCEPT_FULL_SCOPE', 130, [], true);
    expect(card.getPricingDelta()).toBe(130);
  });

  test('getPricingDelta() is 0 before any scope decision', () => {
    const card = new JobCardIntake();
    expect(card.getPricingDelta()).toBe(0);
  });

  test('isClientApproved() tracks client approval state', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('REDUCED_SCOPE', 50, ['crystal'], true);
    expect(card.isClientApproved()).toBe(true);
  });

  test('isClientApproved() is null before scope decision', () => {
    const card = new JobCardIntake();
    expect(card.isClientApproved()).toBeNull();
  });

  test('applyScopeDecision() throws for invalid scopeDecision', () => {
    const card = new JobCardIntake();
    expect(() => card.applyScopeDecision('INVALID_SCOPE', 0, [], true)).toThrow(/invalid scopeDecision/i);
  });

  test('applyScopeDecision() throws for non-numeric pricingDelta', () => {
    const card = new JobCardIntake();
    expect(() => card.applyScopeDecision('ACCEPT_FULL_SCOPE', 'lots', [], true)).toThrow(/pricingDelta/i);
  });
});

// ─── AC5: Client-declined items excluded from QA ──────────────────────────────

describe('JobCardIntake — AC5: client-declined items excluded from QA', () => {
  test('getClientDeclinedFindingIds() returns declined IDs (AC5)', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('REDUCED_SCOPE', 50, ['crystal_finding_001'], true);
    const declined = card.getClientDeclinedFindingIds();
    expect(declined).toContain('crystal_finding_001');
  });

  test('isFindingDeclined() returns true for a declined finding (AC5)', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('REDUCED_SCOPE', 50, ['crystal_finding_001'], true);
    expect(card.isFindingDeclined('crystal_finding_001')).toBe(true);
  });

  test('isFindingDeclined() returns false for an approved finding', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('REDUCED_SCOPE', 50, ['crystal_finding_001'], true);
    expect(card.isFindingDeclined('mainspring_finding_002')).toBe(false);
  });

  test('getClientDeclinedFindingIds() returns empty array for ACCEPT_FULL_SCOPE', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('ACCEPT_FULL_SCOPE', 130, [], true);
    expect(card.getClientDeclinedFindingIds()).toEqual([]);
  });

  test('getClientDeclinedFindingIds() returns all IDs for DECLINE_JOB', () => {
    const card = new JobCardIntake();
    card.applyScopeDecision('DECLINE_JOB', 0, ['f1', 'f2', 'f3'], false);
    const declined = card.getClientDeclinedFindingIds();
    expect(declined).toHaveLength(3);
    expect(declined).toContain('f1');
    expect(declined).toContain('f2');
    expect(declined).toContain('f3');
  });
});

// ─── Serialisation ────────────────────────────────────────────────────────────

describe('JobCardIntake — toJSON() serialisation', () => {
  test('toJSON() returns all required fields', () => {
    const card = new JobCardIntake();
    const json = card.toJSON();
    expect(json).toHaveProperty('functionalFindings');
    expect(json).toHaveProperty('scopeDecision');
    expect(json).toHaveProperty('pricingDelta');
    expect(json).toHaveProperty('clientDeclinedFindingIds');
    expect(json).toHaveProperty('clientApproved');
  });

  test('toJSON() reflects recorded findings and scope decision', () => {
    const card = new JobCardIntake();
    card.recordFunctionalFinding('crown_wind', 'broken', true, true);
    card.applyScopeDecision('ACCEPT_FULL_SCOPE', 130, [], true);
    const json = card.toJSON();
    expect(json.functionalFindings).toHaveLength(1);
    expect(json.functionalFindings[0].testId).toBe('crown_wind');
    expect(json.scopeDecision).toBe('ACCEPT_FULL_SCOPE');
    expect(json.pricingDelta).toBe(130);
    expect(json.clientApproved).toBe(true);
  });

  test('toJSON() output is JSON-serialisable (no circular references)', () => {
    const card = new JobCardIntake();
    card.recordFunctionalFinding('crown_wind', 'broken', true);
    card.applyScopeDecision('REDUCED_SCOPE', 50, ['f1'], true);
    expect(() => JSON.stringify(card.toJSON())).not.toThrow();
  });
});

// ─── End-to-end integration: AC2 + AC4 + AC5 combined ────────────────────────

describe('JobCardIntake — combined AC2 + AC4 + AC5 end-to-end', () => {
  test('full Phase 2 intake flow: record tests → apply scope → verify QA exclusions', () => {
    const card = new JobCardIntake();

    // Record functional test findings (AC2)
    card.recordFunctionalFinding('crown_wind', 'broken', true, true);
    card.recordFunctionalFinding('audible_tick', 'ticking', false, false);
    card.recordFunctionalFinding('visual_shake', 'rotor_free', false, false);

    // Apply scope decision: mainspring approved, crystal declined (AC4, AC5)
    card.applyScopeDecision('REDUCED_SCOPE', 50, ['crystal_finding_001'], true);

    // Verify
    expect(card.getFunctionalFinding('crown_wind').result).toBe('broken');
    expect(card.getScopeDecision()).toBe('REDUCED_SCOPE');
    expect(card.getPricingDelta()).toBe(50);
    expect(card.isFindingDeclined('crystal_finding_001')).toBe(true);
    expect(card.isFindingDeclined('mainspring_finding_002')).toBe(false);
    expect(card.isClientApproved()).toBe(true);
  });
});
