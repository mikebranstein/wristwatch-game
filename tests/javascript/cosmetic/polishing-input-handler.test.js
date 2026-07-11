/**
 * Tests for PolishingInputHandler — Issue #152
 *
 * AC1  — polishing interaction advances progress; perceptible at 20%
 * AC6  — partial polish abandonment: no crash; partial state available
 * AC8  — performance: handler is O(1) per event (no heavy allocations in hot path)
 */

const { PolishingInputHandler, MAX_DELTA_PER_EVENT, MIN_DELTA } =
  require('../../../javascript/cosmetic/PolishingInputHandler');

function makeHandler(overrides = {}) {
  const onProgressUpdate = overrides.onProgressUpdate || jest.fn();
  const onPolishComplete = overrides.onPolishComplete  || null;
  return {
    handler: new PolishingInputHandler(onProgressUpdate, onPolishComplete),
    onProgressUpdate,
  };
}

describe('PolishingInputHandler — constructor validation', () => {
  test('throws if onProgressUpdate is not a function', () => {
    expect(() => new PolishingInputHandler(null)).toThrow();
  });

  test('does not throw with only onProgressUpdate provided', () => {
    expect(() => new PolishingInputHandler(jest.fn())).not.toThrow();
  });
});

// ── AC1: polishing interaction advances progress ───────────────────────────

describe('AC1 — polishing interaction advances progress; perceptible at 20%', () => {
  test('onInput() advances progress from 0 toward 1', () => {
    const { handler } = makeHandler();
    handler.onInput(0.10);
    expect(handler.getProgress()).toBeCloseTo(0.10, 5);
  });

  test('onProgressUpdate callback is called after each input event', () => {
    const onProgressUpdate = jest.fn();
    const handler = new PolishingInputHandler(onProgressUpdate);
    handler.onInput(0.10);
    expect(onProgressUpdate).toHaveBeenCalledWith(expect.closeTo(0.10, 5));
  });

  test('progress accumulates across multiple input events', () => {
    const { handler } = makeHandler();
    handler.onInput(0.10);
    handler.onInput(0.10);
    handler.onInput(0.05);
    expect(handler.getProgress()).toBeCloseTo(0.25, 5);
  });

  test('onProgressUpdate is called with accumulated progress after each event', () => {
    const onProgressUpdate = jest.fn();
    const handler = new PolishingInputHandler(onProgressUpdate);
    handler.onInput(0.10);
    handler.onInput(0.10);

    const calls = onProgressUpdate.mock.calls;
    expect(calls[0][0]).toBeCloseTo(0.10, 5);
    expect(calls[1][0]).toBeCloseTo(0.20, 5);
  });

  test('20% progress fires onProgressUpdate with value ≥ 0.20', () => {
    const onProgressUpdate = jest.fn();
    const handler = new PolishingInputHandler(onProgressUpdate);
    handler.onInput(0.10);
    handler.onInput(0.10);

    const lastProgress = onProgressUpdate.mock.calls.at(-1)[0];
    expect(lastProgress).toBeGreaterThanOrEqual(0.20);
  });

  test('getInputEventCount() increments on each onInput call', () => {
    const { handler } = makeHandler();
    handler.onInput(0.10);
    handler.onInput(0.05);
    expect(handler.getInputEventCount()).toBe(2);
  });
});

// ── Progress completion ────────────────────────────────────────────────────

describe('PolishingInputHandler — progress completion', () => {
  test('isComplete() is false before reaching 100%', () => {
    const { handler } = makeHandler();
    handler.onInput(0.50);
    expect(handler.isComplete()).toBe(false);
  });

  test('isComplete() is true when progress reaches 1.0', () => {
    const onPolishComplete = jest.fn();
    const handler = new PolishingInputHandler(jest.fn(), onPolishComplete);
    // Feed enough events to hit 100%
    for (let i = 0; i < 10; i++) handler.onInput(0.10);
    expect(handler.isComplete()).toBe(true);
  });

  test('onPolishComplete callback fires exactly once at 100%', () => {
    const onPolishComplete = jest.fn();
    const handler = new PolishingInputHandler(jest.fn(), onPolishComplete);
    for (let i = 0; i < 10; i++) handler.onInput(0.10);
    // Extra events after 100%
    handler.onInput(0.10);
    handler.onInput(0.10);
    expect(onPolishComplete).toHaveBeenCalledTimes(1);
  });

  test('progress is clamped to 1.0 even when inputs sum > 1.0', () => {
    const { handler } = makeHandler();
    for (let i = 0; i < 20; i++) handler.onInput(0.10);
    expect(handler.getProgress()).toBe(1.0);
  });

  test('onInput() is ignored after isComplete()', () => {
    const onProgressUpdate = jest.fn();
    const handler = new PolishingInputHandler(onProgressUpdate);
    for (let i = 0; i < 10; i++) handler.onInput(0.10);
    const callCountAtComplete = onProgressUpdate.mock.calls.length;

    handler.onInput(0.10); // should be ignored
    expect(onProgressUpdate.mock.calls.length).toBe(callCountAtComplete);
  });

  test('delta is clamped to MAX_DELTA_PER_EVENT', () => {
    const { handler } = makeHandler();
    handler.onInput(MAX_DELTA_PER_EVENT + 0.50); // overshoot delta
    expect(handler.getProgress()).toBeCloseTo(MAX_DELTA_PER_EVENT, 5);
  });

  test('delta below MIN_DELTA is applied at MIN_DELTA floor', () => {
    const { handler } = makeHandler();
    handler.onInput(0.00001); // below MIN_DELTA
    expect(handler.getProgress()).toBeCloseTo(MIN_DELTA, 5);
  });
});

// ── AC6: partial polish abandonment ───────────────────────────────────────

describe('AC6 — partial polish abandonment; no crash; partial state available', () => {
  test('abandon() does not throw', () => {
    const { handler } = makeHandler();
    handler.onInput(0.30);
    expect(() => handler.abandon()).not.toThrow();
  });

  test('isAbandoned() is true after abandon()', () => {
    const { handler } = makeHandler();
    handler.onInput(0.30);
    handler.abandon();
    expect(handler.isAbandoned()).toBe(true);
  });

  test('getProgress() returns partial state after abandon()', () => {
    const { handler } = makeHandler();
    // Use 0.15 (= MAX_DELTA_PER_EVENT) twice → cumulative 0.30
    handler.onInput(0.15);
    handler.onInput(0.15);
    handler.abandon();
    expect(handler.getProgress()).toBeCloseTo(0.30, 5);
  });

  test('onProgressUpdate is called on abandon() to reflect final partial state', () => {
    const onProgressUpdate = jest.fn();
    const handler = new PolishingInputHandler(onProgressUpdate);
    handler.onInput(0.15);
    const callsBeforeAbandon = onProgressUpdate.mock.calls.length;
    handler.abandon();
    expect(onProgressUpdate.mock.calls.length).toBe(callsBeforeAbandon + 1);
    expect(onProgressUpdate.mock.calls.at(-1)[0]).toBeCloseTo(0.15, 5);
  });

  test('onInput() is ignored after abandon()', () => {
    const { handler, onProgressUpdate } = makeHandler();
    handler.onInput(0.30);
    handler.abandon();
    const callsAfterAbandon = onProgressUpdate.mock.calls.length;

    handler.onInput(0.10); // should be ignored
    expect(onProgressUpdate.mock.calls.length).toBe(callsAfterAbandon);
  });

  test('abandon() on a complete handler is a no-op', () => {
    const { handler } = makeHandler();
    for (let i = 0; i < 10; i++) handler.onInput(0.10);
    expect(() => handler.abandon()).not.toThrow();
    expect(handler.isAbandoned()).toBe(false); // complete, not abandoned
  });
});

// ── AC8: performance — O(1) per input event ───────────────────────────────

describe('AC8 — performance: handler processes 100 rapid inputs without error', () => {
  test('100 rapid input events complete without throwing', () => {
    const { handler } = makeHandler();
    expect(() => {
      for (let i = 0; i < 100; i++) {
        handler.onInput(0.01);
      }
    }).not.toThrow();
  });

  test('progress is valid (0–1) after 100 rapid input events', () => {
    const { handler } = makeHandler();
    for (let i = 0; i < 100; i++) handler.onInput(0.01);
    expect(handler.getProgress()).toBeGreaterThanOrEqual(0.0);
    expect(handler.getProgress()).toBeLessThanOrEqual(1.0);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────

describe('PolishingInputHandler — reset', () => {
  test('reset() restores progress to 0', () => {
    const { handler } = makeHandler();
    handler.onInput(0.50);
    handler.reset();
    expect(handler.getProgress()).toBe(0.0);
  });

  test('reset() allows a new polishing session to start', () => {
    const onPolishComplete = jest.fn();
    const handler = new PolishingInputHandler(jest.fn(), onPolishComplete);
    for (let i = 0; i < 10; i++) handler.onInput(0.10);
    handler.reset();

    // New session: should complete again
    for (let i = 0; i < 10; i++) handler.onInput(0.10);
    expect(onPolishComplete).toHaveBeenCalledTimes(2);
  });
});
