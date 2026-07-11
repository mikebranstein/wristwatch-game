/**
 * Tests for ScopeNegotiationScreen.js — Issue #149 Phase 2
 *
 * Acceptance Criteria covered:
 *   AC3: All pre-existing damage flags appear as line items with estimated cost
 *        impact; player must make a scope decision before proceeding.
 *   AC4: When player accepts negotiated scope, job reward reflects adjusted
 *        pricing and client trust score (via #77) updates based on negotiation.
 *   AC5: Client-declined items are marked "client declined — do not repair"
 *        and excluded from QA pass/fail criteria.
 *
 * Also covers:
 *   - TS2: Client declines extra scope → item marked, excluded from QA
 *   - TS5: Decline job → partial intake fee, no penalty
 *   - TS7: #77 unavailable → neutral (0.5) trust modifier, no crash
 *   - TS6: #77 available with trust score → modifier applied
 *   - isDecisionRequired() gate
 */

'use strict';

const { PreExistingDamageRegistry } = require('../../../src/intake/PreExistingDamageRegistry');
const {
  ScopeNegotiationScreen,
  SCOPE_DECISIONS,
  PARTIAL_INTAKE_FEE,
} = require('../../../src/intake/ScopeNegotiationScreen');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRegistry(...findings) {
  const reg = new PreExistingDamageRegistry();
  for (const [id, testId, label, result, cost] of findings) {
    reg.flagFinding(id, testId, label, result, cost);
  }
  return reg;
}

// ─── AC3: Line items and decision gate ───────────────────────────────────────

describe('ScopeNegotiationScreen — AC3: line items and decision gate', () => {
  test('buildLineItems() returns one item per flagged finding', () => {
    const reg = makeRegistry(
      ['f1', 'crown_wind', 'Broken mainspring', 'broken', 50],
      ['f2', 'audible_tick', 'Silent movement', 'silent', 80],
    );
    const screen = new ScopeNegotiationScreen(reg, 200);
    const items = screen.buildLineItems();
    expect(items).toHaveLength(2);
  });

  test('each line item has findingId, label, costDelta, and status=pending', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'Broken mainspring', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200);
    const [item] = screen.buildLineItems();
    expect(item.findingId).toBe('f1');
    expect(item.label).toBe('Broken mainspring');
    expect(item.costDelta).toBe(50);
    expect(item.status).toBe('pending');
  });

  test('isDecisionRequired() is true before any decision is made (AC3)', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    expect(screen.isDecisionRequired()).toBe(true);
  });

  test('isDecisionRequired() is false after acceptFullScope()', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.acceptFullScope();
    expect(screen.isDecisionRequired()).toBe(false);
  });

  test('isDecisionRequired() is false after applyClientDecisions()', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.applyClientDecisions([{ findingId: 'f1', clientDecision: 'approved' }]);
    expect(screen.isDecisionRequired()).toBe(false);
  });

  test('isDecisionRequired() is false after declineJob()', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.declineJob();
    expect(screen.isDecisionRequired()).toBe(false);
  });

  test('constructor throws if registry is missing', () => {
    expect(() => new ScopeNegotiationScreen(null, 100)).toThrow(/registry is required/i);
  });

  test('constructor throws for negative baseJobEstimate', () => {
    const reg = new PreExistingDamageRegistry();
    expect(() => new ScopeNegotiationScreen(reg, -10)).toThrow(/non-negative number/i);
  });
});

// ─── AC4: Accept full scope — pricing and trust modifier ─────────────────────

describe('ScopeNegotiationScreen — AC4: acceptFullScope() pricing and trust', () => {
  test('acceptFullScope() returns ACCEPT_FULL_SCOPE decision', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.acceptFullScope();
    expect(result.decision).toBe(SCOPE_DECISIONS.ACCEPT_FULL_SCOPE);
  });

  test('acceptFullScope() returns correct adjustedEstimate (AC4)', () => {
    const reg = makeRegistry(
      ['f1', 'crown_wind', 'A', 'broken', 50],
      ['f2', 'audible_tick', 'B', 'silent', 80],
    );
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.acceptFullScope();
    expect(result.totalCostDelta).toBe(130);
    expect(result.adjustedEstimate).toBe(330);
  });

  test('acceptFullScope() returns empty declinedItems (AC4)', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.acceptFullScope();
    expect(result.declinedItems).toEqual([]);
  });

  test('acceptFullScope() all line items have clientDecision=approved', () => {
    const reg = makeRegistry(
      ['f1', 'crown_wind', 'A', 'broken', 50],
      ['f2', 'audible_tick', 'B', 'silent', 80],
    );
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.acceptFullScope();
    for (const item of result.lineItems) {
      expect(item.clientDecision).toBe('approved');
      expect(item.excludeFromQA).toBe(false);
    }
  });

  test('acceptFullScope() with #77 trust score reports it in result (AC4)', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200, { trustScore: 0.8 });
    const result = screen.acceptFullScope();
    expect(result.trustModifier).toBe(0.8);
    expect(result.clientProvenanceAvailable).toBe(true);
  });
});

// ─── AC5: Client-declined items ───────────────────────────────────────────────

describe('ScopeNegotiationScreen — AC5: client-declined items excluded from QA', () => {
  test('applyClientDecisions() marks declined items with jobCardNote (AC5)', () => {
    const reg = makeRegistry(
      ['crystal', 'visual', 'Scratched crystal', 'scratched', 25],
    );
    const screen = new ScopeNegotiationScreen(reg, 100);
    const result = screen.applyClientDecisions([
      { findingId: 'crystal', clientDecision: 'declined' },
    ]);
    const declinedItem = result.lineItems.find(i => i.findingId === 'crystal');
    expect(declinedItem.clientDecision).toBe('declined');
    expect(declinedItem.excludeFromQA).toBe(true);
    expect(declinedItem.jobCardNote).toBe('client declined — do not repair');
  });

  test('getDeclinedItems() returns only declined items (AC5)', () => {
    const reg = makeRegistry(
      ['crystal', 'visual', 'Scratched crystal', 'scratched', 25],
      ['mainspring', 'crown_wind', 'Broken mainspring', 'broken', 50],
    );
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.applyClientDecisions([
      { findingId: 'crystal', clientDecision: 'declined' },
      { findingId: 'mainspring', clientDecision: 'approved' },
    ]);
    const declined = screen.getDeclinedItems();
    expect(declined).toHaveLength(1);
    expect(declined[0].findingId).toBe('crystal');
    expect(declined[0].excludeFromQA).toBe(true);
    expect(declined[0].jobCardNote).toBe('client declined — do not repair');
  });

  test('getApprovedItems() returns only approved items', () => {
    const reg = makeRegistry(
      ['crystal', 'visual', 'Scratched crystal', 'scratched', 25],
      ['mainspring', 'crown_wind', 'Broken mainspring', 'broken', 50],
    );
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.applyClientDecisions([
      { findingId: 'crystal', clientDecision: 'declined' },
      { findingId: 'mainspring', clientDecision: 'approved' },
    ]);
    const approved = screen.getApprovedItems();
    expect(approved).toHaveLength(1);
    expect(approved[0].findingId).toBe('mainspring');
    expect(approved[0].excludeFromQA).toBe(false);
  });

  test('applyClientDecisions() adjustedEstimate excludes declined items (AC4)', () => {
    // Only approved items add to cost
    const reg = makeRegistry(
      ['crystal', 'visual', 'Scratched crystal', 'scratched', 25],
      ['mainspring', 'crown_wind', 'Broken mainspring', 'broken', 50],
    );
    const screen = new ScopeNegotiationScreen(reg, 100);
    const result = screen.applyClientDecisions([
      { findingId: 'crystal', clientDecision: 'declined' },
      { findingId: 'mainspring', clientDecision: 'approved' },
    ]);
    expect(result.totalCostDelta).toBe(50);
    expect(result.adjustedEstimate).toBe(150);
  });

  test('getDeclinedItems() returns empty array when full scope accepted', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.acceptFullScope();
    expect(screen.getDeclinedItems()).toEqual([]);
  });

  test('applyClientDecisions() throws for invalid clientDecision value', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    expect(() =>
      screen.applyClientDecisions([{ findingId: 'f1', clientDecision: 'maybe' }])
    ).toThrow(/invalid clientDecision/i);
  });

  test('applyClientDecisions() throws for empty array', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    expect(() => screen.applyClientDecisions([])).toThrow(/non-empty array/i);
  });
});

// ─── TS5: Decline job ─────────────────────────────────────────────────────────

describe('ScopeNegotiationScreen — TS5: decline job returns partial fee, no penalty', () => {
  test('declineJob() returns DECLINE_JOB decision', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.declineJob();
    expect(result.decision).toBe(SCOPE_DECISIONS.DECLINE_JOB);
  });

  test('declineJob() returns partial intake fee', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.declineJob();
    expect(result.partialIntakeFee).toBe(PARTIAL_INTAKE_FEE);
  });

  test('declineJob() penalty is false (no penalty for declining — TS5)', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.declineJob();
    expect(result.penalty).toBe(false);
  });

  test('declineJob() all line items are job_declined', () => {
    const reg = makeRegistry(
      ['f1', 'crown_wind', 'A', 'broken', 50],
      ['f2', 'audible_tick', 'B', 'silent', 80],
    );
    const screen = new ScopeNegotiationScreen(reg, 200);
    const result = screen.declineJob();
    for (const item of result.lineItems) {
      expect(item.clientDecision).toBe('job_declined');
      expect(item.excludeFromQA).toBe(true);
    }
  });

  test('getDeclinedItems() after declineJob() returns all findings', () => {
    const reg = makeRegistry(
      ['f1', 'crown_wind', 'A', 'broken', 50],
      ['f2', 'audible_tick', 'B', 'silent', 80],
    );
    const screen = new ScopeNegotiationScreen(reg, 200);
    screen.declineJob();
    const declined = screen.getDeclinedItems();
    expect(declined).toHaveLength(2);
    for (const d of declined) {
      expect(d.jobCardNote).toBe('client declined — do not repair');
    }
  });
});

// ─── TS7: #77 graceful fallback ───────────────────────────────────────────────

describe('ScopeNegotiationScreen — TS7: #77 unavailable → neutral fallback, no crash', () => {
  test('getClientTrustModifier() returns 0.5 (neutral) when #77 is null', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100, null);
    expect(screen.getClientTrustModifier()).toBe(0.5);
  });

  test('getClientTrustModifier() returns 0.5 (neutral) when #77 is undefined', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100, undefined);
    expect(screen.getClientTrustModifier()).toBe(0.5);
  });

  test('isClientProvenanceAvailable() is false when #77 is null', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100, null);
    expect(screen.isClientProvenanceAvailable()).toBe(false);
  });

  test('acceptFullScope() with no #77 data does NOT throw (graceful fallback — TS7)', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 50]);
    const screen = new ScopeNegotiationScreen(reg, 200, null);
    expect(() => screen.acceptFullScope()).not.toThrow();
    const result = screen.acceptFullScope();
    expect(result.trustModifier).toBe(0.5);
    expect(result.clientProvenanceAvailable).toBe(false);
  });
});

// ─── TS6: #77 integration — trust score applied ───────────────────────────────

describe('ScopeNegotiationScreen — TS6: #77 trust score applied when available', () => {
  test('getClientTrustModifier() returns #77 trustScore when available', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100, { trustScore: 0.9 });
    expect(screen.getClientTrustModifier()).toBe(0.9);
  });

  test('isClientProvenanceAvailable() is true when #77 trustScore is provided', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100, { trustScore: 0.7 });
    expect(screen.isClientProvenanceAvailable()).toBe(true);
  });

  test('getClientTrustModifier() clamps values above 1 to 1.0', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100, { trustScore: 1.5 });
    expect(screen.getClientTrustModifier()).toBe(1.0);
  });

  test('getClientTrustModifier() clamps values below 0 to 0', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100, { trustScore: -0.3 });
    expect(screen.getClientTrustModifier()).toBe(0);
  });
});

// ─── getDecision() ────────────────────────────────────────────────────────────

describe('ScopeNegotiationScreen — getDecision() tracks the applied decision', () => {
  test('getDecision() returns null before any decision', () => {
    const reg = new PreExistingDamageRegistry();
    const screen = new ScopeNegotiationScreen(reg, 100);
    expect(screen.getDecision()).toBeNull();
  });

  test('getDecision() returns ACCEPT_FULL_SCOPE after acceptFullScope()', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.acceptFullScope();
    expect(screen.getDecision()).toBe(SCOPE_DECISIONS.ACCEPT_FULL_SCOPE);
  });

  test('getDecision() returns REDUCED_SCOPE after applyClientDecisions()', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.applyClientDecisions([{ findingId: 'f1', clientDecision: 'approved' }]);
    expect(screen.getDecision()).toBe(SCOPE_DECISIONS.REDUCED_SCOPE);
  });

  test('getDecision() returns DECLINE_JOB after declineJob()', () => {
    const reg = makeRegistry(['f1', 'crown_wind', 'A', 'broken', 10]);
    const screen = new ScopeNegotiationScreen(reg, 100);
    screen.declineJob();
    expect(screen.getDecision()).toBe(SCOPE_DECISIONS.DECLINE_JOB);
  });
});
