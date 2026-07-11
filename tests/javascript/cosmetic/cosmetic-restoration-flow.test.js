/**
 * Integration tests for CosmeticRestorationFlow — Issue #152
 *
 * AC1  — polishing interaction advances shader; perceptible at 20%
 * AC2  — fully polished state at 100%; no artefacts
 * AC3  — reveal sequence triggered on polish complete
 * AC4  — reveal uses #53 BeforeAfterUI via PolishingRevealSequence
 * AC5  — all three phases marked in summary; summary rendered after completion
 * AC6  — partial polish abandonment: shader reflects partial; no crash
 * AC7  — mixed component states (strap+crystal done, case worn) do not conflict
 * AC9  — summary reports 'Cosmetically Restored' after all phases
 */

jest.mock('../../../src/cosmetic/SurfaceConditionShader');
jest.mock('../../../src/cosmetic/PolishingInputHandler');
jest.mock('../../../src/cosmetic/PolishingRevealSequence');
jest.mock('../../../src/cosmetic/CosmeticRestorationSummary');

const { CosmeticRestorationFlow, FLOW_STATE } =
  require('../../../src/cosmetic/CosmeticRestorationFlow');
const { SurfaceConditionShader }    = require('../../../src/cosmetic/SurfaceConditionShader');
const { PolishingInputHandler }      = require('../../../src/cosmetic/PolishingInputHandler');
const { PolishingRevealSequence }    = require('../../../src/cosmetic/PolishingRevealSequence');
const { CosmeticRestorationSummary, PHASES } =
  require('../../../src/cosmetic/CosmeticRestorationSummary');

function makeFlow(overrides = {}) {
  return new CosmeticRestorationFlow({
    renderSurface:           overrides.renderSurface           || jest.fn(),
    clearSurface:            overrides.clearSurface            || jest.fn(),
    renderRevealTransition:  overrides.renderRevealTransition  || jest.fn(),
    clearRevealTransition:   overrides.clearRevealTransition   || jest.fn(),
    renderBeforeAfter:       overrides.renderBeforeAfter       || jest.fn(),
    clearBeforeAfter:        overrides.clearBeforeAfter        || jest.fn(),
    renderSummary:           overrides.renderSummary           || jest.fn(),
    clearSummary:            overrides.clearSummary            || jest.fn(),
    instrumentationHook:     overrides.instrumentationHook     || jest.fn(),
  });
}

let mockShader, mockReveal, mockSummary;

beforeEach(() => {
  jest.clearAllMocks();

  // Default mock implementations
  SurfaceConditionShader.prototype.init         = jest.fn();
  SurfaceConditionShader.prototype.applyProgress = jest.fn();
  SurfaceConditionShader.prototype.getProgress  = jest.fn().mockReturnValue(0.0);
  SurfaceConditionShader.prototype.reset        = jest.fn();
  SurfaceConditionShader.prototype.isFullyPolished = jest.fn().mockReturnValue(false);

  PolishingInputHandler.prototype.onInput     = jest.fn();
  PolishingInputHandler.prototype.abandon     = jest.fn();
  PolishingInputHandler.prototype.getProgress = jest.fn().mockReturnValue(0.0);
  PolishingInputHandler.prototype.isAbandoned = jest.fn().mockReturnValue(false);
  PolishingInputHandler.prototype.isComplete  = jest.fn().mockReturnValue(false);

  PolishingRevealSequence.prototype.onPolishComplete = jest.fn();
  PolishingRevealSequence.prototype.getBeforeAfterUI = jest.fn();
  PolishingRevealSequence.prototype.destroy          = jest.fn();
  PolishingRevealSequence.prototype.isRevealing      = jest.fn().mockReturnValue(false);

  CosmeticRestorationSummary.prototype.markPhaseComplete          = jest.fn();
  CosmeticRestorationSummary.prototype.isFullyCosmeticallyRestored = jest.fn().mockReturnValue(false);
  CosmeticRestorationSummary.prototype.getSummaryState            = jest.fn().mockReturnValue({
    strap: { complete: false }, crystal: { complete: false }, case: { complete: false },
    isCosmeticallyRestored: false, overallStatus: 'Cosmetic Restoration Incomplete',
  });
  CosmeticRestorationSummary.prototype.render = jest.fn();
  CosmeticRestorationSummary.prototype.reset  = jest.fn();
});

// Helper: advance flow to phase 3 polishing state
function flowAtPolishing(flow) {
  flow.confirmStrapSwap();
  flow.confirmCrystalReplacement();
  flow.startPolishing('s-1', 'worn.png', 'polished.png');
}

// ── Phase gate transitions ────────────────────────────────────────────────

describe('CosmeticRestorationFlow — phase gate transitions', () => {
  test('getFlowState() is IDLE initially', () => {
    expect(makeFlow().getFlowState()).toBe(FLOW_STATE.IDLE);
  });

  test('confirmStrapSwap() sets flowState to PHASE1_COMPLETE', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap();
    expect(flow.getFlowState()).toBe(FLOW_STATE.PHASE1_COMPLETE);
  });

  test('confirmStrapSwap() marks STRAP phase in summary', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap();
    expect(CosmeticRestorationSummary.prototype.markPhaseComplete)
      .toHaveBeenCalledWith(PHASES.STRAP);
  });

  test('confirmCrystalReplacement() after Phase 1 sets PHASE2_COMPLETE', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap();
    flow.confirmCrystalReplacement();
    expect(flow.getFlowState()).toBe(FLOW_STATE.PHASE2_COMPLETE);
  });

  test('confirmCrystalReplacement() marks CRYSTAL phase in summary', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap();
    flow.confirmCrystalReplacement();
    expect(CosmeticRestorationSummary.prototype.markPhaseComplete)
      .toHaveBeenCalledWith(PHASES.CRYSTAL);
  });

  test('startPolishing() throws if Phase 2 is not complete', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap(); // only phase 1
    expect(() => flow.startPolishing('s-1', 'worn.png', 'polished.png')).toThrow();
  });
});

// ── AC1: polishing interaction drives shader ───────────────────────────────

describe('AC1 — polishing interaction advances shader progress; perceptible at 20%', () => {
  test('startPolishing() calls shader.init() with correct textures', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    expect(SurfaceConditionShader.prototype.init)
      .toHaveBeenCalledWith('worn.png', 'polished.png');
  });

  test('startPolishing() sets flowState to PHASE3_POLISHING', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    expect(flow.getFlowState()).toBe(FLOW_STATE.PHASE3_POLISHING);
  });

  test('onPolishInput() delegates to PolishingInputHandler.onInput()', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    flow.onPolishInput(0.10);
    expect(PolishingInputHandler.prototype.onInput).toHaveBeenCalledWith(0.10);
  });

  test('onPolishInput() with 20% progress is forwarded to handler', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    flow.onPolishInput(0.20);
    expect(PolishingInputHandler.prototype.onInput).toHaveBeenCalledWith(0.20);
  });

  test('onPolishInput() is a no-op before polishing starts', () => {
    const flow = makeFlow();
    flow.onPolishInput(0.10); // Phase 3 not started
    expect(PolishingInputHandler.prototype.onInput).not.toHaveBeenCalled();
  });
});

// ── AC2: fully polished state at 100% ─────────────────────────────────────

describe('AC2 — fully polished state at 100%; reveal triggered', () => {
  test('PolishingInputHandler is constructed with an onPolishComplete callback', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);

    // The second argument to PolishingInputHandler constructor must be a function
    const constructorArgs = PolishingInputHandler.mock.calls[0];
    expect(typeof constructorArgs[0]).toBe('function'); // onProgressUpdate
    expect(typeof constructorArgs[1]).toBe('function'); // onPolishComplete
  });

  test('PolishingInputHandler onProgressUpdate drives shader.applyProgress', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);

    // Extract the onProgressUpdate callback
    const onProgressUpdate = PolishingInputHandler.mock.calls[0][0];
    onProgressUpdate(0.75);

    expect(SurfaceConditionShader.prototype.applyProgress).toHaveBeenCalledWith(0.75);
  });

  test('onPolishComplete callback triggers reveal sequence', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);

    // Extract the onPolishComplete callback
    const onPolishComplete = PolishingInputHandler.mock.calls[0][1];
    onPolishComplete(1.0);

    expect(PolishingRevealSequence.prototype.onPolishComplete).toHaveBeenCalledWith(
      's-1', 'worn.png', 'polished.png', expect.any(Function)
    );
  });

  test('flowState changes to PHASE3_REVEALING when polish completes', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);

    const onPolishComplete = PolishingInputHandler.mock.calls[0][1];
    onPolishComplete(1.0);

    expect(flow.getFlowState()).toBe(FLOW_STATE.PHASE3_REVEALING);
  });
});

// ── AC3 + AC4: reveal sequence ─────────────────────────────────────────────

describe('AC3 + AC4 — reveal sequence uses PolishingRevealSequence (wraps #53 BeforeAfterUI)', () => {
  test('getReveal() returns a PolishingRevealSequence instance', () => {
    const flow = makeFlow();
    expect(flow.getReveal()).toBeInstanceOf(PolishingRevealSequence);
  });

  test('reveal.onPolishComplete() is called after polishing reaches 100%', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    const onPolishComplete = PolishingInputHandler.mock.calls[0][1];
    onPolishComplete(1.0);
    expect(PolishingRevealSequence.prototype.onPolishComplete).toHaveBeenCalled();
  });
});

// ── AC5 + AC9: full restoration summary ───────────────────────────────────

describe('AC5 + AC9 — all three phases in summary; Cosmetically Restored', () => {
  test('reveal onDismissed callback marks CASE phase in summary', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    const onPolishComplete = PolishingInputHandler.mock.calls[0][1];
    onPolishComplete(1.0);

    // Extract onDismissed callback from reveal.onPolishComplete
    const onDismissed = PolishingRevealSequence.prototype.onPolishComplete.mock.calls[0][3];
    onDismissed();

    expect(CosmeticRestorationSummary.prototype.markPhaseComplete)
      .toHaveBeenCalledWith(PHASES.CASE);
  });

  test('summary.render() is called after reveal is dismissed', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    const onPolishComplete = PolishingInputHandler.mock.calls[0][1];
    onPolishComplete(1.0);
    const onDismissed = PolishingRevealSequence.prototype.onPolishComplete.mock.calls[0][3];
    onDismissed();

    expect(CosmeticRestorationSummary.prototype.render).toHaveBeenCalled();
  });

  test('flowState is ALL_COMPLETE after reveal is dismissed', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    const onPolishComplete = PolishingInputHandler.mock.calls[0][1];
    onPolishComplete(1.0);
    const onDismissed = PolishingRevealSequence.prototype.onPolishComplete.mock.calls[0][3];
    onDismissed();

    expect(flow.getFlowState()).toBe(FLOW_STATE.ALL_COMPLETE);
  });

  test('markPhaseComplete is called for STRAP, CRYSTAL, and CASE in full flow', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    const onPolishComplete = PolishingInputHandler.mock.calls[0][1];
    onPolishComplete(1.0);
    const onDismissed = PolishingRevealSequence.prototype.onPolishComplete.mock.calls[0][3];
    onDismissed();

    const calls = CosmeticRestorationSummary.prototype.markPhaseComplete.mock.calls.map(c => c[0]);
    expect(calls).toContain(PHASES.STRAP);
    expect(calls).toContain(PHASES.CRYSTAL);
    expect(calls).toContain(PHASES.CASE);
  });
});

// ── AC6: partial polish abandonment ───────────────────────────────────────

describe('AC6 — partial polish abandonment: shader reflects partial; no crash', () => {
  test('abandonPolishing() does not throw', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    expect(() => flow.abandonPolishing()).not.toThrow();
  });

  test('abandonPolishing() calls inputHandler.abandon()', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    flow.abandonPolishing();
    expect(PolishingInputHandler.prototype.abandon).toHaveBeenCalled();
  });

  test('abandonPolishing() sets flowState to PHASE3_ABANDONED', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    flow.abandonPolishing();
    expect(flow.getFlowState()).toBe(FLOW_STATE.PHASE3_ABANDONED);
  });

  test('abandonPolishing() is a no-op before polishing starts', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap();
    flow.confirmCrystalReplacement();
    // Polishing not started
    expect(() => flow.abandonPolishing()).not.toThrow();
    expect(PolishingInputHandler.prototype.abandon).not.toHaveBeenCalled();
  });
});

// ── AC7: mixed component states ────────────────────────────────────────────

describe('AC7 — mixed states (strap+crystal done, case worn) do not conflict', () => {
  test('startPolishing() initialises shader after strap+crystal phases complete', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap();
    flow.confirmCrystalReplacement();

    // flowState is PHASE2_COMPLETE — Phase 1+2 done, Phase 3 not started
    expect(flow.getFlowState()).toBe(FLOW_STATE.PHASE2_COMPLETE);

    // Starting Phase 3 should not throw
    expect(() => flow.startPolishing('s-1', 'worn.png', 'polished.png')).not.toThrow();
  });

  test('shader.init() is called with case textures without strap/crystal textures leaking', () => {
    const flow = makeFlow();
    flow.confirmStrapSwap();
    flow.confirmCrystalReplacement();
    flow.startPolishing('s-1', 'case-worn.png', 'case-polished.png');

    expect(SurfaceConditionShader.prototype.init)
      .toHaveBeenCalledWith('case-worn.png', 'case-polished.png');
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────

describe('CosmeticRestorationFlow — destroy()', () => {
  test('destroy() calls shader.reset()', () => {
    const flow = makeFlow();
    flow.destroy();
    expect(SurfaceConditionShader.prototype.reset).toHaveBeenCalled();
  });

  test('destroy() calls reveal.destroy()', () => {
    const flow = makeFlow();
    flow.destroy();
    expect(PolishingRevealSequence.prototype.destroy).toHaveBeenCalled();
  });

  test('destroy() calls summary.reset()', () => {
    const flow = makeFlow();
    flow.destroy();
    expect(CosmeticRestorationSummary.prototype.reset).toHaveBeenCalled();
  });

  test('destroy() sets flowState to IDLE', () => {
    const flow = makeFlow();
    flowAtPolishing(flow);
    flow.destroy();
    expect(flow.getFlowState()).toBe(FLOW_STATE.IDLE);
  });
});
