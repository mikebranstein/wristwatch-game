/**
 * Tests: LoupeViewport — Issue #117 AC1, AC2, AC3 (A/B gate), AC7 (multi-fault)
 *
 * AC1: abnormal component viewed through active loupe in treatment arm → signal rendered
 * AC2: signal absent when loupe is inactive, healthy component, or other tool viewport
 * AC3 (A/B arm gate): control arm → no signal; treatment arm → signal rendered
 * AC7: multiple components each receive independent signals; no bleed between them
 *
 * Test Scenarios covered:
 *   Scenario 1  — happy path: loupe active + treatment + fault → signal
 *   Scenario 2  — healthy component + loupe active + treatment → no signal
 *   Scenario 3  — loupe NOT active → no signal even if treatment + fault
 *   Scenario 5  — control arm → loupe shows no signals
 *   Scenario 6  — treatment arm → loupe signals visible
 *   Scenario 7  — multiple faults → each independent signal, no bleed
 *
 * Run with: npm test
 */

const { LoupeViewport } = require('../../src/diagnosis/LoupeViewport');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeViewport() {
  const rendered = [];
  const cleared = [];
  const renderSignalOverlay = (signal) => rendered.push(signal);
  const clearSignalOverlay  = () => cleared.push(true);
  const viewport = new LoupeViewport({ renderSignalOverlay, clearSignalOverlay });
  return { viewport, rendered, cleared };
}

// ── Constructor guard ──────────────────────────────────────────────────────────

describe('LoupeViewport — constructor guards', () => {
  test('throws if renderSignalOverlay is not a function', () => {
    expect(() => new LoupeViewport({
      renderSignalOverlay: null,
      clearSignalOverlay: jest.fn(),
    })).toThrow();
  });

  test('throws if clearSignalOverlay is not a function', () => {
    expect(() => new LoupeViewport({
      renderSignalOverlay: jest.fn(),
      clearSignalOverlay: 'nope',
    })).toThrow();
  });
});

// ── AC1 & Scenario 1: happy path ──────────────────────────────────────────────

describe('LoupeViewport — AC1 Scenario 1: treatment arm + active loupe + fault → signal', () => {
  test('signal is returned for a faulty component in treatment arm', () => {
    const { viewport } = makeViewport();
    viewport.activate();
    const signal = viewport.inspectComponent('pivot-1', 'worn_pivot', 'treatment');
    expect(signal).not.toBeNull();
    expect(signal.componentId).toBe('pivot-1');
    expect(signal.variant).toBe('faint_amber_tint');
  });

  test('renderSignalOverlay hook is called with the signal data', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    viewport.inspectComponent('jewel-1', 'cracked_jewel', 'treatment');
    expect(rendered).toHaveLength(1);
    expect(rendered[0].componentId).toBe('jewel-1');
    expect(rendered[0].variant).toBe('hairline_crack_overlay');
  });
});

// ── AC2 & Scenario 2: healthy component → no signal ──────────────────────────

describe('LoupeViewport — AC2 Scenario 2: healthy component → no signal', () => {
  test('healthy component (null faultTypeId) returns null even with active loupe + treatment', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    const signal = viewport.inspectComponent('healthy-pivot', null, 'treatment');
    expect(signal).toBeNull();
    expect(rendered).toHaveLength(0);
  });

  test('component with unknown fault type returns null', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    const signal = viewport.inspectComponent('comp-1', 'not_a_real_fault', 'treatment');
    expect(signal).toBeNull();
    expect(rendered).toHaveLength(0);
  });
});

// ── AC2 & Scenario 3: loupe NOT active → no signal ───────────────────────────

describe('LoupeViewport — AC2 Scenario 3: loupe inactive → no signal', () => {
  test('inspectComponent returns null when loupe is not active', () => {
    const { viewport, rendered } = makeViewport();
    // Do NOT call activate()
    const signal = viewport.inspectComponent('pivot-1', 'worn_pivot', 'treatment');
    expect(signal).toBeNull();
    expect(rendered).toHaveLength(0);
  });

  test('inspectComponent returns null after deactivate()', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    viewport.deactivate();
    const signal = viewport.inspectComponent('pivot-1', 'worn_pivot', 'treatment');
    expect(signal).toBeNull();
    expect(rendered).toHaveLength(0);
  });

  test('deactivate calls clearSignalOverlay', () => {
    const { viewport, cleared } = makeViewport();
    viewport.activate();
    viewport.deactivate();
    expect(cleared).toHaveLength(1);
  });
});

// ── AC3 & Scenario 5: control arm → no signal ────────────────────────────────

describe('LoupeViewport — AC3 Scenario 5: control arm → no signals', () => {
  test('control arm: faulty component returns null (no signal)', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    const signal = viewport.inspectComponent('pivot-1', 'worn_pivot', 'control');
    expect(signal).toBeNull();
    expect(rendered).toHaveLength(0);
  });

  test('control arm: renderSignalOverlay is never called', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    viewport.inspectComponent('jewel-1', 'cracked_jewel', 'control');
    viewport.inspectComponent('wheel-1', 'worn_wheel', 'control');
    expect(rendered).toHaveLength(0);
  });
});

// ── AC3 & Scenario 6: treatment arm → signals visible ────────────────────────

describe('LoupeViewport — AC3 Scenario 6: treatment arm → signals visible', () => {
  test('treatment arm: faulty component returns a signal', () => {
    const { viewport } = makeViewport();
    viewport.activate();
    const signal = viewport.inspectComponent('mainspring-1', 'mainspring_failure', 'treatment');
    expect(signal).not.toBeNull();
  });

  test('treatment arm: renderSignalOverlay is called for each faulty component', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    viewport.inspectComponent('mainspring-1', 'mainspring_failure', 'treatment');
    viewport.inspectComponent('balance-1', 'balance_wheel_fault', 'treatment');
    expect(rendered).toHaveLength(2);
  });
});

// ── AC7 & Scenario 7: multiple faults — independent signals ──────────────────

describe('LoupeViewport — Scenario 7: multiple faults → independent signals, no bleed', () => {
  test('two faulty components each produce independent signals with their own componentId', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    const sig1 = viewport.inspectComponent('pivot-1', 'worn_pivot', 'treatment');
    const sig2 = viewport.inspectComponent('jewel-1', 'cracked_jewel', 'treatment');

    expect(sig1.componentId).toBe('pivot-1');
    expect(sig2.componentId).toBe('jewel-1');
    expect(rendered[0].componentId).toBe('pivot-1');
    expect(rendered[1].componentId).toBe('jewel-1');
  });

  test('healthy component alongside faulty components does not receive a signal', () => {
    const { viewport, rendered } = makeViewport();
    viewport.activate();
    viewport.inspectComponent('faulty-1', 'worn_pivot', 'treatment');
    const healthySig = viewport.inspectComponent('healthy-1', null, 'treatment');
    expect(healthySig).toBeNull();
    expect(rendered).toHaveLength(1); // only the faulty component rendered
  });
});

// ── isActive accessor ─────────────────────────────────────────────────────────

describe('LoupeViewport — isActive()', () => {
  test('isActive returns false before activate()', () => {
    const { viewport } = makeViewport();
    expect(viewport.isActive()).toBe(false);
  });

  test('isActive returns true after activate()', () => {
    const { viewport } = makeViewport();
    viewport.activate();
    expect(viewport.isActive()).toBe(true);
  });

  test('isActive returns false after deactivate()', () => {
    const { viewport } = makeViewport();
    viewport.activate();
    viewport.deactivate();
    expect(viewport.isActive()).toBe(false);
  });
});