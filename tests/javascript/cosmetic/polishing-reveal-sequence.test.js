/**
 * Tests for PolishingRevealSequence — Issue #152
 *
 * AC3 — before/after reveal is first-class and deliberately paced (not instant cut)
 * AC4 — reuses #53 BeforeAfterUI and ClipSequencePacer; no duplicate component
 */

jest.mock('../../../src/cleaning/BeforeAfterUI');
jest.mock('../../../src/cleaning/ClipSequencePacer');
jest.mock('../../../src/telemetry/TelemetryEmitter');

const { PolishingRevealSequence, POLISHING_REVEAL_EVENTS, TRANSITION_DURATION_MS } =
  require('../../../src/cosmetic/PolishingRevealSequence');
const { BeforeAfterUI }    = require('../../../src/cleaning/BeforeAfterUI');
const { ClipSequencePacer } = require('../../../src/cleaning/ClipSequencePacer');
const { TelemetryEmitter } = require('../../../src/telemetry/TelemetryEmitter');

// ── Fake timer implementation for synchronous test control ───────────────

function makeFakeTimers() {
  const pending = [];
  return {
    setTimeout: (fn, delay) => { pending.push({ fn, delay }); return pending.length - 1; },
    clearTimeout: (id) => { if (pending[id]) pending[id].fn = null; },
    flushAll: () => {
      const sorted = [...pending].filter(e => e.fn).sort((a, b) => a.delay - b.delay);
      for (const { fn } of sorted) fn && fn();
    },
    flushUpTo: (maxDelay) => {
      const sorted = [...pending].filter(e => e.fn && e.delay <= maxDelay).sort((a, b) => a.delay - b.delay);
      for (const { fn } of sorted) fn && fn();
    },
    pending,
  };
}

function makeRevealSequence(overrides = {}) {
  const timers = overrides.timers || makeFakeTimers();
  const seq = new PolishingRevealSequence({
    renderRevealTransition: overrides.renderRevealTransition || jest.fn(),
    clearRevealTransition:  overrides.clearRevealTransition  || jest.fn(),
    renderBeforeAfter:      overrides.renderBeforeAfter      || jest.fn(),
    clearBeforeAfter:       overrides.clearBeforeAfter       || jest.fn(),
    instrumentationHook:    overrides.instrumentationHook    || jest.fn(),
    phaseDurations:         overrides.phaseDurations         || {},
    timerImpl: {
      setTimeout:   timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    },
  });
  return { seq, timers };
}

let mockBeforeAfterUI, mockClipSequencePacer, mockTelemetry;

beforeEach(() => {
  jest.clearAllMocks();

  // Default mock behaviours
  BeforeAfterUI.prototype.isVisible = jest.fn().mockReturnValue(false);
  BeforeAfterUI.prototype.show      = jest.fn();
  BeforeAfterUI.prototype.dismiss   = jest.fn();
  BeforeAfterUI.prototype.destroy   = jest.fn();

  ClipSequencePacer.prototype.computeSequenceTiming = jest.fn().mockReturnValue({
    totalDurationS: 22, clipInDurationS: 3, cinematicMoveDurationS: 3,
    coreRevealDurationS: 5, beforeAfterDurationS: 6, clipOutDurationS: 5,
  });

  TelemetryEmitter.prototype.emit = jest.fn();
});

// ── AC4: reuses #53 BeforeAfterUI and ClipSequencePacer ───────────────────

describe('AC4 — reuses #53 BeforeAfterUI and ClipSequencePacer (no duplicate component)', () => {
  test('getBeforeAfterUI() returns an instance of BeforeAfterUI from src/cleaning/', () => {
    const { seq } = makeRevealSequence();
    expect(seq.getBeforeAfterUI()).toBeInstanceOf(BeforeAfterUI);
  });

  test('getPacer() returns an instance of ClipSequencePacer from src/cleaning/', () => {
    const { seq } = makeRevealSequence();
    expect(seq.getPacer()).toBeInstanceOf(ClipSequencePacer);
  });

  test('ClipSequencePacer.computeSequenceTiming() is called on reveal start', () => {
    const { seq, timers } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    expect(ClipSequencePacer.prototype.computeSequenceTiming).toHaveBeenCalled();
  });

  test('BeforeAfterUI.show() is called with worn and polished textures after transition', () => {
    const { seq, timers } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');

    // Flush all timers to complete the transition and trigger BeforeAfterUI.show()
    timers.flushAll();

    expect(BeforeAfterUI.prototype.show).toHaveBeenCalledWith(
      'worn.png', 'polished.png', '16:9', expect.any(Function)
    );
  });
});

// ── AC3: reveal is deliberately paced (not instant cut) ───────────────────

describe('AC3 — before/after reveal is deliberately paced; not an instant cut', () => {
  test('renderRevealTransition is called with progress=0.0 at the start', () => {
    const renderRevealTransition = jest.fn();
    const { seq, timers } = makeRevealSequence({ renderRevealTransition });
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');

    // Flush only the first timer step (delay=0)
    timers.flushUpTo(0);
    expect(renderRevealTransition).toHaveBeenCalledWith('worn.png', 'polished.png', 0);
  });

  test('renderRevealTransition is called with progress=1.0 at the end of transition', () => {
    const renderRevealTransition = jest.fn();
    const { seq, timers } = makeRevealSequence({ renderRevealTransition });
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    timers.flushAll();

    const allCalls = renderRevealTransition.mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    expect(lastCall[2]).toBe(1); // final step progress = TRANSITION_STEPS/TRANSITION_STEPS = 1
  });

  test('renderRevealTransition is called multiple times (not a single-frame cut)', () => {
    const renderRevealTransition = jest.fn();
    const { seq, timers } = makeRevealSequence({ renderRevealTransition });
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    timers.flushAll();

    // Must be called more than once to be "deliberately paced"
    expect(renderRevealTransition.mock.calls.length).toBeGreaterThan(1);
  });

  test('BeforeAfterUI.show() is NOT called immediately on onPolishComplete() (transition plays first)', () => {
    const { seq } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    // Without flushing timers, BeforeAfterUI should not have been shown yet
    expect(BeforeAfterUI.prototype.show).not.toHaveBeenCalled();
  });

  test('TRANSITION_DURATION_MS is positive (reveal has meaningful duration)', () => {
    expect(TRANSITION_DURATION_MS).toBeGreaterThan(0);
  });
});

// ── Telemetry events ──────────────────────────────────────────────────────

describe('PolishingRevealSequence — telemetry events', () => {
  test('POLISHING_REVEAL_STARTED fires on onPolishComplete()', () => {
    const { seq, timers } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    expect(TelemetryEmitter.prototype.emit).toHaveBeenCalledWith(
      POLISHING_REVEAL_EVENTS.POLISHING_REVEAL_STARTED,
      expect.objectContaining({ sessionId: 's-1' })
    );
  });

  test('POLISHING_REVEAL_BEAT fires after transition completes', () => {
    const { seq, timers } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    timers.flushAll();
    expect(TelemetryEmitter.prototype.emit).toHaveBeenCalledWith(
      POLISHING_REVEAL_EVENTS.POLISHING_REVEAL_BEAT,
      expect.objectContaining({ sessionId: 's-1' })
    );
  });
});

// ── isRevealing() guard ───────────────────────────────────────────────────

describe('PolishingRevealSequence — isRevealing() concurrency guard', () => {
  test('isRevealing() is true while reveal is active', () => {
    const { seq } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    expect(seq.isRevealing()).toBe(true);
  });

  test('second onPolishComplete() while revealing is ignored', () => {
    const renderRevealTransition = jest.fn();
    const { seq } = makeRevealSequence({ renderRevealTransition });
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    const callsAfterFirst = renderRevealTransition.mock.calls.length;

    seq.onPolishComplete('s-2', 'worn2.png', 'polished2.png');
    // No additional renderRevealTransition calls from the ignored trigger
    expect(renderRevealTransition.mock.calls.length).toBe(callsAfterFirst);
  });
});

// ── dismiss() ─────────────────────────────────────────────────────────────

describe('PolishingRevealSequence — dismiss()', () => {
  test('dismiss() calls BeforeAfterUI.dismiss() when panel is visible', () => {
    const { seq, timers } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    timers.flushAll();

    // Simulate panel being visible
    BeforeAfterUI.prototype.isVisible.mockReturnValue(true);
    seq.dismiss();
    expect(BeforeAfterUI.prototype.dismiss).toHaveBeenCalled();
  });

  test('dismiss() is a no-op when panel is not visible', () => {
    const { seq } = makeRevealSequence();
    BeforeAfterUI.prototype.isVisible.mockReturnValue(false);
    seq.dismiss();
    expect(BeforeAfterUI.prototype.dismiss).not.toHaveBeenCalled();
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────

describe('PolishingRevealSequence — destroy()', () => {
  test('destroy() calls BeforeAfterUI.destroy()', () => {
    const { seq } = makeRevealSequence();
    seq.destroy();
    expect(BeforeAfterUI.prototype.destroy).toHaveBeenCalled();
  });

  test('destroy() resets isRevealing to false', () => {
    const { seq } = makeRevealSequence();
    seq.onPolishComplete('s-1', 'worn.png', 'polished.png');
    seq.destroy();
    expect(seq.isRevealing()).toBe(false);
  });
});
