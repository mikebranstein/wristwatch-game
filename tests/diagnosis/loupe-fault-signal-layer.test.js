/**
 * Tests: LoupeFaultSignalLayer — Issue #117 AC1, AC2 (architecture isolation)
 *
 * Verifies that:
 *   - Known fault types return the correct signal config per component (AC1)
 *   - Null/missing fault types return null — no false signal (AC2)
 *   - Each signal is scoped to its specific componentId (AC7 multi-fault)
 *   - Result is null for components whose fault type is absent from the allowlist
 *
 * Run with: npm test
 */

const { LoupeFaultSignalLayer } = require('../../src/diagnosis/LoupeFaultSignalLayer');

describe('LoupeFaultSignalLayer — AC1: abnormal components return signal', () => {
  let layer;
  beforeEach(() => { layer = new LoupeFaultSignalLayer(); });

  test('worn pivot component returns a signal with correct variant', () => {
    const signal = layer.getSignalForComponent('pivot-1', 'worn_pivot');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('faint_amber_tint');
  });

  test('cracked jewel component returns hairline_crack_overlay signal', () => {
    const signal = layer.getSignalForComponent('jewel-1', 'cracked_jewel');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('hairline_crack_overlay');
  });

  test('dried lubricant component returns dried_lubricant_haze signal', () => {
    const signal = layer.getSignalForComponent('mainplate-1', 'dried_lubricant');
    expect(signal).not.toBeNull();
    expect(signal.variant).toBe('dried_lubricant_haze');
  });

  test('signal result includes the componentId', () => {
    const signal = layer.getSignalForComponent('balance-wheel-1', 'balance_wheel_fault');
    expect(signal.componentId).toBe('balance-wheel-1');
  });

  test('signal result includes a description string', () => {
    const signal = layer.getSignalForComponent('mainspring-1', 'mainspring_failure');
    expect(typeof signal.description).toBe('string');
    expect(signal.description.length).toBeGreaterThan(0);
  });
});

describe('LoupeFaultSignalLayer — AC2: healthy/unknown components return null', () => {
  let layer;
  beforeEach(() => { layer = new LoupeFaultSignalLayer(); });

  test('null faultTypeId returns null — no signal on healthy component', () => {
    expect(layer.getSignalForComponent('healthy-pivot', null)).toBeNull();
  });

  test('undefined faultTypeId returns null', () => {
    expect(layer.getSignalForComponent('healthy-jewel', undefined)).toBeNull();
  });

  test('empty string faultTypeId returns null', () => {
    expect(layer.getSignalForComponent('healthy-wheel', '')).toBeNull();
  });

  test('fault type not in allowlist returns null', () => {
    expect(layer.getSignalForComponent('comp-1', 'not_a_real_fault')).toBeNull();
  });
});

describe('LoupeFaultSignalLayer — AC7: multi-fault component isolation', () => {
  let layer;
  beforeEach(() => { layer = new LoupeFaultSignalLayer(); });

  test('two different faulty components return independent signals with correct componentIds', () => {
    const sig1 = layer.getSignalForComponent('pivot-1', 'worn_pivot');
    const sig2 = layer.getSignalForComponent('jewel-1', 'cracked_jewel');

    expect(sig1.componentId).toBe('pivot-1');
    expect(sig2.componentId).toBe('jewel-1');
    expect(sig1.variant).not.toBe(sig2.variant);
  });

  test('healthy component alongside faulty components still returns null', () => {
    layer.getSignalForComponent('faulty-1', 'worn_pivot');
    const healthy = layer.getSignalForComponent('healthy-1', null);
    expect(healthy).toBeNull();
  });
});