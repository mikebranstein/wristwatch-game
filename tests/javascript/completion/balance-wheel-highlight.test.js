/**
 * Tests for BalanceWheelHighlight (Issue #114, Phase 2)
 *
 * Acceptance criteria covered:
 *   AC2 — activate() fires the highlight activate command.
 *   AC2 — deactivate() fires the highlight deactivate command.
 *   AC4 — re-wind suppression: highlight does NOT activate on re-wind
 *          (gated by FirstTickCinematicSequence — tested separately).
 *
 * Idempotency guards (AC5-adjacent):
 *   — double-activate fires hook exactly once.
 *   — double-deactivate fires hook exactly once.
 */

const {
  BalanceWheelHighlight,
  HIGHLIGHT_STATE,
  HIGHLIGHT_COMMANDS,
} = require('../../../src/completion/BalanceWheelHighlight');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHighlight(opts = {}) {
  const highlightHook = jest.fn();
  const highlight = new BalanceWheelHighlight({ highlightHook, ...opts });
  return { highlight, highlightHook };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('BalanceWheelHighlight — construction', () => {
  test('constructs successfully with required options', () => {
    expect(() => makeHighlight()).not.toThrow();
  });

  test('throws if highlightHook is not a function', () => {
    expect(() => new BalanceWheelHighlight({ highlightHook: 'bad' })).toThrow(
      'BalanceWheelHighlight requires a highlightHook function.'
    );
  });

  test('initial state is INACTIVE', () => {
    const { highlight } = makeHighlight();
    expect(highlight.getState()).toBe(HIGHLIGHT_STATE.INACTIVE);
  });

  test('isActive() is false initially', () => {
    const { highlight } = makeHighlight();
    expect(highlight.isActive()).toBe(false);
  });
});

// ─── activate() — AC2 ────────────────────────────────────────────────────────

describe('BalanceWheelHighlight — activate() (AC2)', () => {
  test('fires ACTIVATE command on first call', () => {
    const { highlight, highlightHook } = makeHighlight();
    highlight.activate();
    expect(highlightHook).toHaveBeenCalledWith(HIGHLIGHT_COMMANDS.ACTIVATE);
  });

  test('state transitions to ACTIVE after activate()', () => {
    const { highlight } = makeHighlight();
    highlight.activate();
    expect(highlight.getState()).toBe(HIGHLIGHT_STATE.ACTIVE);
  });

  test('isActive() returns true after activate()', () => {
    const { highlight } = makeHighlight();
    highlight.activate();
    expect(highlight.isActive()).toBe(true);
  });

  test('activate() is idempotent — hook fires exactly once for double-call', () => {
    const { highlight, highlightHook } = makeHighlight();
    highlight.activate();
    highlight.activate(); // second call
    const activateCalls = highlightHook.mock.calls.filter(
      (c) => c[0] === HIGHLIGHT_COMMANDS.ACTIVATE
    );
    expect(activateCalls).toHaveLength(1);
  });
});

// ─── deactivate() — AC2 ──────────────────────────────────────────────────────

describe('BalanceWheelHighlight — deactivate() (AC2)', () => {
  test('fires DEACTIVATE command after activate()', () => {
    const { highlight, highlightHook } = makeHighlight();
    highlight.activate();
    highlightHook.mockClear();
    highlight.deactivate();
    expect(highlightHook).toHaveBeenCalledWith(HIGHLIGHT_COMMANDS.DEACTIVATE);
  });

  test('state transitions to INACTIVE after deactivate()', () => {
    const { highlight } = makeHighlight();
    highlight.activate();
    highlight.deactivate();
    expect(highlight.getState()).toBe(HIGHLIGHT_STATE.INACTIVE);
  });

  test('isActive() returns false after deactivate()', () => {
    const { highlight } = makeHighlight();
    highlight.activate();
    highlight.deactivate();
    expect(highlight.isActive()).toBe(false);
  });

  test('deactivate() is idempotent — no-op if already INACTIVE', () => {
    const { highlight, highlightHook } = makeHighlight();
    highlight.deactivate(); // already INACTIVE
    expect(highlightHook).not.toHaveBeenCalled();
  });

  test('deactivate() is idempotent — hook fires once for double-call', () => {
    const { highlight, highlightHook } = makeHighlight();
    highlight.activate();
    highlightHook.mockClear();
    highlight.deactivate();
    highlight.deactivate();
    const deactivateCalls = highlightHook.mock.calls.filter(
      (c) => c[0] === HIGHLIGHT_COMMANDS.DEACTIVATE
    );
    expect(deactivateCalls).toHaveLength(1);
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('BalanceWheelHighlight — reset()', () => {
  test('reset() sets state to INACTIVE without firing hook', () => {
    const { highlight, highlightHook } = makeHighlight();
    highlight.activate();
    highlightHook.mockClear();
    highlight.reset();
    expect(highlight.getState()).toBe(HIGHLIGHT_STATE.INACTIVE);
    expect(highlightHook).not.toHaveBeenCalled();
  });

  test('after reset(), activate() fires again', () => {
    const { highlight, highlightHook } = makeHighlight();
    highlight.activate();
    highlight.deactivate();
    highlight.reset();
    highlightHook.mockClear();
    highlight.activate();
    expect(highlightHook).toHaveBeenCalledWith(HIGHLIGHT_COMMANDS.ACTIVATE);
  });
});
