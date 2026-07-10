/**
 * Tests for SurfaceConditionShader — Issue #152
 *
 * AC1 — visual change perceptible within first 20% of interaction
 * AC2 — fully polished state at 100%; no artefacts; blendFactor clamped to 1.0
 * AC6 — partial progress on abandonment produces defined state; no crash
 */

const { SurfaceConditionShader, PERCEPTIBLE_THRESHOLD } =
  require('../../src/cosmetic/SurfaceConditionShader');

function makeShader(overrides = {}) {
  return new SurfaceConditionShader(
    overrides.renderSurface || jest.fn(),
    overrides.clearSurface  || jest.fn()
  );
}

describe('SurfaceConditionShader — constructor validation', () => {
  test('throws if renderSurface is not a function', () => {
    expect(() => new SurfaceConditionShader(null, jest.fn())).toThrow();
  });

  test('throws if clearSurface is not a function', () => {
    expect(() => new SurfaceConditionShader(jest.fn(), null)).toThrow();
  });
});

// ── AC1: visual change perceptible within 20% ─────────────────────────────

describe('AC1 — visual change perceptible within first 20% of interaction', () => {
  test('renderSurface is called immediately on init with blendFactor=0.0', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    expect(renderSurface).toHaveBeenCalledWith('worn.png', 'polished.png', 0.0);
  });

  test('renderSurface is called when applyProgress is called with 10% progress', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    renderSurface.mockClear();

    shader.applyProgress(0.10);
    expect(renderSurface).toHaveBeenCalledWith('worn.png', 'polished.png', 0.10);
  });

  test('renderSurface is called when applyProgress is called with 20% progress', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    renderSurface.mockClear();

    shader.applyProgress(0.20);
    expect(renderSurface).toHaveBeenCalledWith('worn.png', 'polished.png', 0.20);
  });

  test('blendFactor passed to renderSurface matches progress at 20%', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(0.20);

    const callArgs = renderSurface.mock.calls[renderSurface.mock.calls.length - 1];
    const blendFactor = callArgs[2];
    expect(blendFactor).toBeCloseTo(0.20, 5);
  });

  test('getProgress() returns 0.20 after applyProgress(0.20)', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(0.20);
    expect(shader.getProgress()).toBeCloseTo(0.20, 5);
  });

  test('getConditionState() returns "partial" after first 20% progress', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(0.20);
    expect(shader.getConditionState()).toBe('partial');
  });
});

// ── AC2: fully polished state at 100%; no artefacts ───────────────────────

describe('AC2 — fully polished at 100%; blendFactor clamped; no artefacts', () => {
  test('renderSurface receives blendFactor=1.0 when applyProgress(1.0) is called', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    renderSurface.mockClear();

    shader.applyProgress(1.0);
    expect(renderSurface).toHaveBeenCalledWith('worn.png', 'polished.png', 1.0);
  });

  test('blendFactor is clamped to 1.0 for progress > 1.0 (no overshoot artefact)', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');

    shader.applyProgress(1.5); // overshoot
    const callArgs = renderSurface.mock.calls[renderSurface.mock.calls.length - 1];
    expect(callArgs[2]).toBe(1.0); // must be exactly 1.0
  });

  test('blendFactor is clamped to 0.0 for progress < 0.0 (no underflow artefact)', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');

    shader.applyProgress(-0.5); // underflow
    const callArgs = renderSurface.mock.calls[renderSurface.mock.calls.length - 1];
    expect(callArgs[2]).toBe(0.0);
  });

  test('wornTexture is always passed as first arg (never null at 100%)', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(1.0);

    const callArgs = renderSurface.mock.calls[renderSurface.mock.calls.length - 1];
    expect(callArgs[0]).toBe('worn.png');
    expect(callArgs[1]).toBe('polished.png');
  });

  test('isFullyPolished() returns true after applyProgress(1.0)', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(1.0);
    expect(shader.isFullyPolished()).toBe(true);
  });

  test('getConditionState() returns "polished" at 100%', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(1.0);
    expect(shader.getConditionState()).toBe('polished');
  });
});

// ── AC6: partial progress on abandonment ──────────────────────────────────

describe('AC6 — partial polish abandonment produces defined state; no crash', () => {
  test('applyProgress(0.60) does not throw', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    expect(() => shader.applyProgress(0.60)).not.toThrow();
  });

  test('getProgress() returns 0.60 after applyProgress(0.60)', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(0.60);
    expect(shader.getProgress()).toBeCloseTo(0.60, 5);
  });

  test('getConditionState() returns "partial" at 60%', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(0.60);
    expect(shader.getConditionState()).toBe('partial');
  });

  test('renderSurface is called with blendFactor=0.60 on partial progress', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    renderSurface.mockClear();

    shader.applyProgress(0.60);
    const callArgs = renderSurface.mock.calls[renderSurface.mock.calls.length - 1];
    expect(callArgs[2]).toBeCloseTo(0.60, 5);
  });

  test('forceRender() re-renders current partial state without crash', () => {
    const renderSurface = jest.fn();
    const shader = makeShader({ renderSurface });
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(0.45);
    renderSurface.mockClear();

    shader.forceRender();
    expect(renderSurface).toHaveBeenCalledWith('worn.png', 'polished.png', 0.45);
  });
});

// ── init/reset ────────────────────────────────────────────────────────────

describe('SurfaceConditionShader — init and reset', () => {
  test('applyProgress() throws if init() has not been called', () => {
    const shader = makeShader();
    expect(() => shader.applyProgress(0.5)).toThrow();
  });

  test('reset() calls clearSurface and resets progress to 0', () => {
    const clearSurface = jest.fn();
    const shader = makeShader({ clearSurface });
    shader.init('worn.png', 'polished.png');
    shader.applyProgress(0.5);
    shader.reset();

    expect(clearSurface).toHaveBeenCalled();
    // After reset applyProgress should throw (not initialised)
    expect(() => shader.applyProgress(0.1)).toThrow();
  });

  test('getConditionState() returns "worn" before any progress', () => {
    const shader = makeShader();
    shader.init('worn.png', 'polished.png');
    expect(shader.getConditionState()).toBe('worn');
  });
});
