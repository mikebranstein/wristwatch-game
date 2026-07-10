/**
 * Tests for LoupeViewportRenderer — Issue #117 Scaffolded Fault-Signal System
 *
 * Covers:
 *   AC1 — signal visible when loupe is active on a damaged component
 *   AC2 — signal absent when loupe is inactive, component is healthy, or fault is unknown
 *   AC2 — signal is isolated per component (no bleed between adjacent components)
 */

const { LoupeViewportRenderer } = require('../../src/diagnosis/LoupeViewportRenderer');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRenderer() {
  const renderOverlay = jest.fn();
  const clearOverlay = jest.fn();
  const renderer = new LoupeViewportRenderer(renderOverlay, clearOverlay);
  return { renderer, renderOverlay, clearOverlay };
}

// ─── Constructor validation ───────────────────────────────────────────────────

describe('LoupeViewportRenderer — constructor validation', () => {
  test('throws when renderOverlay is not a function', () => {
    expect(() => new LoupeViewportRenderer('not-a-fn', jest.fn())).toThrow();
  });

  test('throws when clearOverlay is not a function', () => {
    expect(() => new LoupeViewportRenderer(jest.fn(), 'not-a-fn')).toThrow();
  });

  test('constructs successfully with valid functions', () => {
    expect(() => new LoupeViewportRenderer(jest.fn(), jest.fn())).not.toThrow();
  });
});

// ─── AC1: signal visible when loupe is active on a damaged component ──────────

describe('LoupeViewportRenderer — AC1: signal shown through loupe on damaged component', () => {
  test('renderComponent returns signalApplied:true for a known fault type when loupe is active', () => {
    const { renderer } = makeRenderer();
    renderer.activateLoupe();
    const result = renderer.renderComponent('balance-wheel', 'balance_wheel_fault');
    expect(result.signalApplied).toBe(true);
  });

  test('renderOverlay is called with componentId and the correct variant', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    renderer.renderComponent('balance-wheel', 'balance_wheel_fault');
    expect(renderOverlay).toHaveBeenCalledWith('balance-wheel', 'faint-tint');
  });

  test('result object includes componentId and variant when signal is applied', () => {
    const { renderer } = makeRenderer();
    renderer.activateLoupe();
    const result = renderer.renderComponent('mainspring', 'mainspring_failure');
    expect(result).toEqual({ signalApplied: true, componentId: 'mainspring', variant: 'faint-tint' });
  });

  test('texture-overlay variant applied for dried_lubricant fault', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    renderer.renderComponent('gear-pivot', 'dried_lubricant');
    expect(renderOverlay).toHaveBeenCalledWith('gear-pivot', 'texture-overlay');
  });

  test('material-differentiation variant applied for cracked_jewel fault', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    renderer.renderComponent('jewel-bearing', 'cracked_jewel');
    expect(renderOverlay).toHaveBeenCalledWith('jewel-bearing', 'material-differentiation');
  });
});

// ─── AC2: signal absent when loupe is inactive (loupe-exclusivity) ────────────

describe('LoupeViewportRenderer — AC2: no signal when loupe is inactive', () => {
  test('renderComponent returns signalApplied:false when loupe is NOT active', () => {
    const { renderer } = makeRenderer();
    // loupe not activated
    const result = renderer.renderComponent('balance-wheel', 'balance_wheel_fault');
    expect(result.signalApplied).toBe(false);
  });

  test('renderOverlay is NOT called when loupe is inactive', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.renderComponent('balance-wheel', 'balance_wheel_fault');
    expect(renderOverlay).not.toHaveBeenCalled();
  });

  test('renderComponent returns signalApplied:false after deactivating loupe', () => {
    const { renderer } = makeRenderer();
    renderer.activateLoupe();
    renderer.deactivateLoupe();
    const result = renderer.renderComponent('balance-wheel', 'balance_wheel_fault');
    expect(result.signalApplied).toBe(false);
  });

  test('clearOverlay is called when loupe is deactivated', () => {
    const { renderer, clearOverlay } = makeRenderer();
    renderer.activateLoupe();
    renderer.deactivateLoupe();
    expect(clearOverlay).toHaveBeenCalled();
  });
});

// ─── AC2: no false signal on healthy components ───────────────────────────────

describe('LoupeViewportRenderer — AC2: no false signal on healthy components', () => {
  test('null faultType → signalApplied:false even when loupe is active', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    const result = renderer.renderComponent('healthy-part', null);
    expect(result.signalApplied).toBe(false);
    expect(renderOverlay).not.toHaveBeenCalled();
  });

  test('undefined faultType → signalApplied:false', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    const result = renderer.renderComponent('healthy-part', undefined);
    expect(result.signalApplied).toBe(false);
    expect(renderOverlay).not.toHaveBeenCalled();
  });

  test('empty string faultType → signalApplied:false', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    const result = renderer.renderComponent('healthy-part', '');
    expect(result.signalApplied).toBe(false);
    expect(renderOverlay).not.toHaveBeenCalled();
  });

  test('unknown fault type not on allowlist → signalApplied:false', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    const result = renderer.renderComponent('future-part', 'future_fault_type_v3');
    expect(result.signalApplied).toBe(false);
    expect(renderOverlay).not.toHaveBeenCalled();
  });
});

// ─── AC2: per-component isolation — no signal bleed between components ─────────

describe('LoupeViewportRenderer — AC2: signal isolated per component (no bleed)', () => {
  test('two damaged components each receive their own renderOverlay call', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    renderer.renderComponent('component-A', 'mainspring_failure');
    renderer.renderComponent('component-B', 'cracked_jewel');
    expect(renderOverlay).toHaveBeenCalledTimes(2);
    expect(renderOverlay).toHaveBeenNthCalledWith(1, 'component-A', 'faint-tint');
    expect(renderOverlay).toHaveBeenNthCalledWith(2, 'component-B', 'material-differentiation');
  });

  test('healthy component between two damaged ones does not trigger renderOverlay', () => {
    const { renderer, renderOverlay } = makeRenderer();
    renderer.activateLoupe();
    renderer.renderComponent('damaged-A', 'worn_pivot');
    renderer.renderComponent('healthy-B', null);           // healthy — no signal
    renderer.renderComponent('damaged-C', 'dried_lubricant');
    expect(renderOverlay).toHaveBeenCalledTimes(2);
    expect(renderOverlay).toHaveBeenCalledWith('damaged-A', 'faint-tint');
    expect(renderOverlay).toHaveBeenCalledWith('damaged-C', 'texture-overlay');
  });
});

// ─── Loupe state accessors ────────────────────────────────────────────────────

describe('LoupeViewportRenderer — isLoupeActive state tracking', () => {
  test('isLoupeActive returns false by default', () => {
    const { renderer } = makeRenderer();
    expect(renderer.isLoupeActive()).toBe(false);
  });

  test('isLoupeActive returns true after activateLoupe()', () => {
    const { renderer } = makeRenderer();
    renderer.activateLoupe();
    expect(renderer.isLoupeActive()).toBe(true);
  });

  test('isLoupeActive returns false after deactivateLoupe()', () => {
    const { renderer } = makeRenderer();
    renderer.activateLoupe();
    renderer.deactivateLoupe();
    expect(renderer.isLoupeActive()).toBe(false);
  });
});
