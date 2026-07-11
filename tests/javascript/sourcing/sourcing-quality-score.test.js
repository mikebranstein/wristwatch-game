/**
 * Tests: SourcingScreen Phase 2 — Sourcing Quality Score (Issue #255, AC2)
 *
 * Covers:
 *   - Tier 1 (simple_service): all PartCondition values pass
 *   - Tier 2 (complex_service): Used-Fair fails, Used-Good passes, New passes
 *   - Tier 3 (full_restoration): New passes; Used-Good and Used-Fair both fail
 *   - 60% mixed sourcing result (AC2 test scenario)
 *   - null return when zero graded parts sourced (phase-gate exclusion)
 *   - Backward compatibility: existing onPartSourced(partId) callers unaffected
 *   - conditionGrade defaults to null when omitted (no second argument)
 *   - getSourcedPartsWithCondition() returns correct array
 *   - Phase 1 regression: existing tests are unaffected
 *
 * Run with: npm test
 */

'use strict';

const { SourcingScreen, CONDITION_ORDER, SOURCING_THRESHOLD } = require('../../../javascript/sourcing/SourcingScreen');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const noop = () => {};
const makeOpts = (overrides = {}) => ({
  instrumentationHook: noop,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Backward compatibility: existing onPartSourced API unchanged
// ---------------------------------------------------------------------------

describe('SourcingScreen — Issue #255 backward compatibility', () => {
  it('onPartSourced(partId) with no conditionGrade still adds part to Set', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('mainspring');
    expect(screen.getSourcedParts().has('mainspring')).toBe(true);
  });

  it('onPartSourced(partId) with no conditionGrade does NOT add to sourced-with-condition list', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('mainspring');
    expect(screen.getSourcedPartsWithCondition()).toHaveLength(0);
  });

  it('computeSourcingQualityScore returns null when no graded parts sourced', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('mainspring');       // no grade
    screen.onPartSourced('balance-wheel');    // no grade
    expect(screen.computeSourcingQualityScore('complex_service')).toBeNull();
  });

  it('computeSourcingQualityScore returns null when screen is freshly constructed (no parts at all)', () => {
    const screen = new SourcingScreen(makeOpts());
    expect(screen.computeSourcingQualityScore('simple_service')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tier 1 (simple_service): all conditions pass
// ---------------------------------------------------------------------------

describe('SourcingScreen — AC2: Tier 1 (simple_service) sourcing quality', () => {
  it('Used-Fair passes for Tier 1', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Fair');
    expect(screen.computeSourcingQualityScore('simple_service')).toBe(100);
  });

  it('Used-Good passes for Tier 1', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Good');
    expect(screen.computeSourcingQualityScore('simple_service')).toBe(100);
  });

  it('New passes for Tier 1', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'New');
    expect(screen.computeSourcingQualityScore('simple_service')).toBe(100);
  });

  it('All mixed conditions all pass for Tier 1 → score = 100%', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Fair');
    screen.onPartSourced('part-2', 'Used-Good');
    screen.onPartSourced('part-3', 'New');
    expect(screen.computeSourcingQualityScore('simple_service')).toBeCloseTo(100, 5);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 (complex_service): Used-Good or New pass; Used-Fair fails
// ---------------------------------------------------------------------------

describe('SourcingScreen — AC2: Tier 2 (complex_service) sourcing quality', () => {
  it('Used-Fair fails for Tier 2', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Fair');
    expect(screen.computeSourcingQualityScore('complex_service')).toBe(0);
  });

  it('Used-Good passes for Tier 2', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Good');
    expect(screen.computeSourcingQualityScore('complex_service')).toBe(100);
  });

  it('New passes for Tier 2', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'New');
    expect(screen.computeSourcingQualityScore('complex_service')).toBe(100);
  });

  it('AC2 test scenario: poor sourcing — all Used-Fair on Tier 2 → score = 0%', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Fair');
    screen.onPartSourced('part-2', 'Used-Fair');
    screen.onPartSourced('part-3', 'Used-Fair');
    expect(screen.computeSourcingQualityScore('complex_service')).toBe(0);
  });

  it('AC2 test scenario: mixed sourcing — 3 of 5 at or above threshold → score = 60%', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Good');   // pass
    screen.onPartSourced('part-2', 'New');          // pass
    screen.onPartSourced('part-3', 'Used-Good');   // pass
    screen.onPartSourced('part-4', 'Used-Fair');   // fail
    screen.onPartSourced('part-5', 'Used-Fair');   // fail
    expect(screen.computeSourcingQualityScore('complex_service')).toBeCloseTo(60, 5);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 (full_restoration): New only
// ---------------------------------------------------------------------------

describe('SourcingScreen — AC2: Tier 3 (full_restoration) sourcing quality', () => {
  it('New passes for Tier 3', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'New');
    expect(screen.computeSourcingQualityScore('full_restoration')).toBe(100);
  });

  it('Used-Good fails for Tier 3', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Good');
    expect(screen.computeSourcingQualityScore('full_restoration')).toBe(0);
  });

  it('Used-Fair fails for Tier 3', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Fair');
    expect(screen.computeSourcingQualityScore('full_restoration')).toBe(0);
  });

  it('AC2 test scenario: all New parts on Tier 3 → score = 100%', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'New');
    screen.onPartSourced('part-2', 'New');
    screen.onPartSourced('part-3', 'New');
    expect(screen.computeSourcingQualityScore('full_restoration')).toBeCloseTo(100, 5);
  });

  it('AC2 test scenario: mixed Used-Good and Used-Fair on Tier 3 → score = 0%', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Good');
    screen.onPartSourced('part-2', 'Used-Fair');
    screen.onPartSourced('part-3', 'Used-Good');
    expect(screen.computeSourcingQualityScore('full_restoration')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSourcedPartsWithCondition accessor
// ---------------------------------------------------------------------------

describe('SourcingScreen — getSourcedPartsWithCondition accessor', () => {
  it('returns empty array when no graded parts sourced', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1');  // no grade
    expect(screen.getSourcedPartsWithCondition()).toEqual([]);
  });

  it('returns correct array of {partId, conditionGrade} objects', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'New');
    screen.onPartSourced('part-2', 'Used-Good');
    screen.onPartSourced('part-3');  // no grade — excluded from condition list
    const list = screen.getSourcedPartsWithCondition();
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ partId: 'part-1', conditionGrade: 'New' });
    expect(list[1]).toEqual({ partId: 'part-2', conditionGrade: 'Used-Good' });
  });

  it('returns a copy (immutable accessor)', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'New');
    const copy = screen.getSourcedPartsWithCondition();
    copy.push({ partId: 'injected', conditionGrade: 'New' });
    expect(screen.getSourcedPartsWithCondition()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unknown grade handling (defensive)
// ---------------------------------------------------------------------------

describe('SourcingScreen — defensive: unknown conditionGrade', () => {
  it('unknown grade string fails on Tier 2 (not in CONDITION_ORDER)', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Unknown-Grade');
    expect(screen.computeSourcingQualityScore('complex_service')).toBe(0);
  });

  it('unknown grade string fails on Tier 3', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Grade-A');  // non-existent
    expect(screen.computeSourcingQualityScore('full_restoration')).toBe(0);
  });

  it('unknown pricing tier treated as Tier 1 (all pass)', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-1', 'Used-Fair');
    expect(screen.computeSourcingQualityScore('unknown_tier')).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// CONDITION_ORDER and SOURCING_THRESHOLD exports
// ---------------------------------------------------------------------------

describe('SourcingScreen — exports', () => {
  it('CONDITION_ORDER is ascending quality: Used-Fair < Used-Good < New', () => {
    expect(CONDITION_ORDER).toEqual(['Used-Fair', 'Used-Good', 'New']);
    const fairIdx = CONDITION_ORDER.indexOf('Used-Fair');
    const goodIdx = CONDITION_ORDER.indexOf('Used-Good');
    const newIdx  = CONDITION_ORDER.indexOf('New');
    expect(fairIdx).toBeLessThan(goodIdx);
    expect(goodIdx).toBeLessThan(newIdx);
  });

  it('SOURCING_THRESHOLD is null for Tier 1 (all pass)', () => {
    expect(SOURCING_THRESHOLD.simple_service).toBeNull();
  });

  it('SOURCING_THRESHOLD is Used-Good for Tier 2', () => {
    expect(SOURCING_THRESHOLD.complex_service).toBe('Used-Good');
  });

  it('SOURCING_THRESHOLD is New for Tier 3', () => {
    expect(SOURCING_THRESHOLD.full_restoration).toBe('New');
  });
});

// ---------------------------------------------------------------------------
// Phase 1 regression: existing SourcingScreen behaviour unchanged
// ---------------------------------------------------------------------------

describe('SourcingScreen — Phase 1 regression (Issue #255 AC5)', () => {
  it('constructs without errors (unchanged)', () => {
    expect(() => new SourcingScreen(makeOpts())).not.toThrow();
  });

  it('onPartSourced without conditionGrade still tracks to sourced Set (unchanged)', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('crown');
    screen.onPartSourced('mainspring');
    expect(screen.getSourcedParts().size).toBe(2);
  });

  it('onPartUnSourced still removes from set (unchanged)', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('crown');
    screen.onPartUnSourced('crown');
    expect(screen.getSourcedParts().has('crown')).toBe(false);
  });

  it('completeSourcing still calls autosaveHook (unchanged)', async () => {
    const hook = jest.fn().mockResolvedValue(undefined);
    const screen = new SourcingScreen(makeOpts({ autosaveHook: hook }));
    await screen.completeSourcing();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith('sourcing');
  });

  it('telemetry still emits sourcing_part_placed on onPartSourced (unchanged)', () => {
    const events = [];
    const screen = new SourcingScreen(makeOpts({
      instrumentationHook: (e, p) => events.push({ e, p }),
    }));
    screen.onPartSourced('balance-wheel', 'New');
    expect(events.some(ev => ev.e === 'sourcing_part_placed')).toBe(true);
  });
});
