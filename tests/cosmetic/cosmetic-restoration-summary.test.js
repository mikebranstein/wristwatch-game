/**
 * Tests for CosmeticRestorationSummary — Issue #152
 *
 * AC5 — all three cosmetic phases are reflected correctly in the final summary;
 *        restoration marked 'Cosmetically Restored' only when all three complete.
 * AC9 — summary shows: new strap, clean crystal, polished case; no missing states.
 */

const { CosmeticRestorationSummary, PHASES, STATUS_LABELS } =
  require('../../src/cosmetic/CosmeticRestorationSummary');

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
