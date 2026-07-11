/**
 * Tests for CosmeticRestorationSummary — Issue #152
 *
 * AC5 — all three cosmetic phases are reflected correctly in the final summary;
 *        restoration marked 'Cosmetically Restored' only when all three complete.
 * AC9 — summary shows: new strap, clean crystal, polished case; no missing states.
 */

const { CosmeticRestorationSummary, PHASES, STATUS_LABELS } =
  require('../../../src/cosmetic/CosmeticRestorationSummary');

function makeSummary(overrides = {}) {
  return new CosmeticRestorationSummary(
    overrides.renderSummary || jest.fn(),
    overrides.clearSummary  || jest.fn()
  );
}

describe('CosmeticRestorationSummary — constructor validation', () => {
  test('throws if renderSummary is not a function', () => {
    expect(() => new CosmeticRestorationSummary(null, jest.fn())).toThrow();
  });

  test('throws if clearSummary is not a function', () => {
    expect(() => new CosmeticRestorationSummary(jest.fn(), null)).toThrow();
  });
});

// ── Initial state ─────────────────────────────────────────────────────────

describe('CosmeticRestorationSummary — initial state', () => {
  test('no phases are complete initially', () => {
    const summary = makeSummary();
    const state = summary.getSummaryState();
    expect(state.strap.complete).toBe(false);
    expect(state.crystal.complete).toBe(false);
    expect(state.case.complete).toBe(false);
  });

  test('isFullyCosmeticallyRestored() returns false initially', () => {
    const summary = makeSummary();
    expect(summary.isFullyCosmeticallyRestored()).toBe(false);
  });

  test('overallStatus is INCOMPLETE initially', () => {
    const summary = makeSummary();
    const state = summary.getSummaryState();
    expect(state.overallStatus).toBe(STATUS_LABELS.INCOMPLETE);
  });
});

// ── AC5: phases reflected correctly ───────────────────────────────────────

describe('AC5 — all three phases reflected correctly in summary', () => {
  test('markPhaseComplete(STRAP) sets strap.complete to true', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    expect(summary.getSummaryState().strap.complete).toBe(true);
  });

  test('markPhaseComplete(CRYSTAL) sets crystal.complete to true', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.CRYSTAL);
    expect(summary.getSummaryState().crystal.complete).toBe(true);
  });

  test('markPhaseComplete(CASE) sets case.complete to true', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.CASE);
    expect(summary.getSummaryState().case.complete).toBe(true);
  });

  test('isFullyCosmeticallyRestored() remains false until all three phases complete', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    expect(summary.isFullyCosmeticallyRestored()).toBe(false);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    expect(summary.isFullyCosmeticallyRestored()).toBe(false);
  });

  test('isFullyCosmeticallyRestored() returns true when all three phases complete', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE);
    expect(summary.isFullyCosmeticallyRestored()).toBe(true);
  });

  test('markPhaseComplete is idempotent — marking a phase twice does not throw', () => {
    const summary = makeSummary();
    expect(() => {
      summary.markPhaseComplete(PHASES.STRAP);
      summary.markPhaseComplete(PHASES.STRAP);
    }).not.toThrow();
  });

  test('markPhaseComplete throws for unknown phase', () => {
    const summary = makeSummary();
    expect(() => summary.markPhaseComplete('unknown-phase')).toThrow();
  });
});

// ── AC9: summary display labels ───────────────────────────────────────────

describe('AC9 — summary shows correct labels for all three restored phases', () => {
  function allCompleted() {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE);
    return summary;
  }

  test('strap displayLabel is "New Strap" when Phase 1 is complete', () => {
    const summary = allCompleted();
    expect(summary.getSummaryState().strap.displayLabel).toBe('New Strap');
  });

  test('crystal displayLabel is "Clean Crystal" when Phase 2 is complete', () => {
    const summary = allCompleted();
    expect(summary.getSummaryState().crystal.displayLabel).toBe('Clean Crystal');
  });

  test('case displayLabel is "Polished Case" when Phase 3 is complete', () => {
    const summary = allCompleted();
    expect(summary.getSummaryState().case.displayLabel).toBe('Polished Case');
  });

  test('overallStatus is "Cosmetically Restored" when all three phases complete (AC9)', () => {
    const summary = allCompleted();
    expect(summary.getSummaryState().overallStatus).toBe(STATUS_LABELS.COMPLETE);
  });

  test('isCosmeticallyRestored is true in getSummaryState() after all three phases', () => {
    const summary = allCompleted();
    expect(summary.getSummaryState().isCosmeticallyRestored).toBe(true);
  });

  test('getSummaryState() contains all three phase keys', () => {
    const summary = makeSummary();
    const state = summary.getSummaryState();
    expect(state).toHaveProperty('strap');
    expect(state).toHaveProperty('crystal');
    expect(state).toHaveProperty('case');
  });

  test('render() calls renderSummary with the summary state object', () => {
    const renderSummary = jest.fn();
    const summary = new CosmeticRestorationSummary(renderSummary, jest.fn());
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE);
    summary.render();

    expect(renderSummary).toHaveBeenCalledTimes(1);
    const renderedState = renderSummary.mock.calls[0][0];
    expect(renderedState.isCosmeticallyRestored).toBe(true);
    expect(renderedState.overallStatus).toBe(STATUS_LABELS.COMPLETE);
  });

  test('render() passes all three completed phase states to renderSummary', () => {
    const renderSummary = jest.fn();
    const summary = new CosmeticRestorationSummary(renderSummary, jest.fn());
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE);
    summary.render();

    const renderedState = renderSummary.mock.calls[0][0];
    expect(renderedState.strap.complete).toBe(true);
    expect(renderedState.crystal.complete).toBe(true);
    expect(renderedState.case.complete).toBe(true);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────

describe('CosmeticRestorationSummary — reset', () => {
  test('reset() calls clearSummary', () => {
    const clearSummary = jest.fn();
    const summary = new CosmeticRestorationSummary(jest.fn(), clearSummary);
    summary.reset();
    expect(clearSummary).toHaveBeenCalled();
  });

  test('reset() clears all phase states', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE);
    summary.reset();

    const state = summary.getSummaryState();
    expect(state.strap.complete).toBe(false);
    expect(state.crystal.complete).toBe(false);
    expect(state.case.complete).toBe(false);
    expect(state.isCosmeticallyRestored).toBe(false);
  });
});

// ── Issue #254: AC4 — cosmeticGrade field in getSummaryState() ────────────

describe('AC4 (Issue #254) — cosmeticGrade derived from phase completion + case polish quality', () => {

  // ── Scenario 3: Adequate — not all phases complete ────────────────────────

  test('AC4 / Scenario 3 — not all phases complete → cosmeticGrade is "adequate"', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    // CASE not complete
    expect(summary.getSummaryState().cosmeticGrade).toBe('adequate');
  });

  test('AC4 — no phases complete → cosmeticGrade is "adequate"', () => {
    const summary = makeSummary();
    expect(summary.getSummaryState().cosmeticGrade).toBe('adequate');
  });

  test('AC4 — only one phase complete → cosmeticGrade is "adequate"', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.CASE, 'mirror');  // case only, not all three
    expect(summary.getSummaryState().cosmeticGrade).toBe('adequate');
  });

  // ── Scenario 2: Good — all phases complete, no mirror quality ─────────────

  test('AC4 / Scenario 2 — all three phases complete, no polish quality → cosmeticGrade is "good"', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE);  // no polishQuality
    expect(summary.getSummaryState().cosmeticGrade).toBe('good');
  });

  test('AC4 — all phases complete, polishQuality "good" → cosmeticGrade is "good"', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE, 'good');
    expect(summary.getSummaryState().cosmeticGrade).toBe('good');
  });

  // ── Scenario 1: Mirror — all phases complete + mirror quality ─────────────

  test('AC4 / Scenario 1 — all three phases complete + polishQuality "mirror" → cosmeticGrade is "mirror"', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE, 'mirror');
    expect(summary.getSummaryState().cosmeticGrade).toBe('mirror');
  });

  // ── Existing fields unchanged ─────────────────────────────────────────────

  test('AC4 — existing fields (overallStatus, isCosmeticallyRestored, phase states) unchanged', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE, 'mirror');
    const state = summary.getSummaryState();

    // Existing fields still present and correct
    expect(state.overallStatus).toBe(STATUS_LABELS.COMPLETE);
    expect(state.isCosmeticallyRestored).toBe(true);
    expect(state.strap.complete).toBe(true);
    expect(state.crystal.complete).toBe(true);
    expect(state.case.complete).toBe(true);

    // New field present
    expect(state.cosmeticGrade).toBe('mirror');
  });

  // ── markPhaseComplete backward-compatibility ──────────────────────────────

  test('AC4 — markPhaseComplete(PHASES.CASE) without quality param still works (backward-compat)', () => {
    const summary = makeSummary();
    expect(() => summary.markPhaseComplete(PHASES.CASE)).not.toThrow();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    expect(summary.getSummaryState().cosmeticGrade).toBe('good');  // all complete, no mirror
  });

  test('AC4 — polishQuality on STRAP/CRYSTAL phases is ignored (completion-only tracking)', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP, 'mirror');    // quality ignored on non-CASE
    summary.markPhaseComplete(PHASES.CRYSTAL, 'mirror');  // quality ignored on non-CASE
    summary.markPhaseComplete(PHASES.CASE);               // no quality on CASE
    expect(summary.getSummaryState().cosmeticGrade).toBe('good');  // not mirror — only CASE quality counts
  });

  // ── reset clears polish quality ───────────────────────────────────────────

  test('AC4 — reset() clears _casePolishQuality; cosmeticGrade returns to "adequate" after reset', () => {
    const summary = makeSummary();
    summary.markPhaseComplete(PHASES.STRAP);
    summary.markPhaseComplete(PHASES.CRYSTAL);
    summary.markPhaseComplete(PHASES.CASE, 'mirror');
    expect(summary.getSummaryState().cosmeticGrade).toBe('mirror');

    summary.reset();
    // After reset: no phases complete, no quality → adequate
    expect(summary.getSummaryState().cosmeticGrade).toBe('adequate');
  });
});
