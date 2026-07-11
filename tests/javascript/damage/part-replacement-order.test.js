/**
 * Tests: PartReplacementOrder — Issue #148
 *
 * AC2: A replacement order is confirmed, the restoration enters awaiting-replacement
 *      state, and all other valid restoration actions remain available.
 * AC3: For the first 3 restorations, cost ≤5% of restoration value and delay ≤30 seconds.
 * AC4: On successful installation, restoration can complete with cost penalty applied.
 * Test Scenario 7: Save and resume — snapshotting and fromSnapshot() restores order state.
 *
 * Run with: npm test
 */

'use strict';

jest.useFakeTimers();

const {
  PartReplacementOrder,
  ORDER_STATE,
  computeReplacementCost,
  computeReplacementDelaySecs,
} = require('../../../src/damage/PartReplacementOrder');

function makeOrder({
  partId = 'part-001',
  restorationId = 'rest-001',
  restorationValue = 1000,
  restorationNumber = 1,
  onArrival = jest.fn(),
} = {}) {
  return new PartReplacementOrder({ partId, restorationId, restorationValue, restorationNumber, onArrival });
}

afterEach(() => {
  jest.clearAllTimers();
});

// ─── AC3: Early-game cost ≤5% ─────────────────────────────────────────────────

describe('computeReplacementCost — AC3: early-game ≤5%', () => {
  test('restoration #1: cost is ≤5% of restoration value', () => {
    const cost = computeReplacementCost(1000, 1);
    expect(cost).toBeLessThanOrEqual(50); // 5% of 1000
  });

  test('restoration #2: cost is ≤5% of restoration value', () => {
    const cost = computeReplacementCost(2000, 2);
    expect(cost).toBeLessThanOrEqual(100);
  });

  test('restoration #3: cost is ≤5% of restoration value', () => {
    const cost = computeReplacementCost(500, 3);
    expect(cost).toBeLessThanOrEqual(25);
  });

  test('restoration #4 (post-early-game): cost is higher than 5%', () => {
    const cost = computeReplacementCost(1000, 4);
    expect(cost).toBeGreaterThan(50);
  });

  test('early-game cost is exactly floor(value * 0.05)', () => {
    expect(computeReplacementCost(1000, 1)).toBe(50);
    expect(computeReplacementCost(333, 1)).toBe(16); // floor(333*0.05) = floor(16.65) = 16
  });
});

// ─── AC3: Early-game delay ≤30 seconds ───────────────────────────────────────

describe('computeReplacementDelaySecs — AC3: early-game ≤30s', () => {
  test('restoration #1: delay is ≤30 seconds', () => {
    expect(computeReplacementDelaySecs(1)).toBeLessThanOrEqual(30);
  });

  test('restoration #2: delay is ≤30 seconds', () => {
    expect(computeReplacementDelaySecs(2)).toBeLessThanOrEqual(30);
  });

  test('restoration #3: delay is ≤30 seconds', () => {
    expect(computeReplacementDelaySecs(3)).toBeLessThanOrEqual(30);
  });

  test('restoration #4 (post-early-game): delay is longer than 30 seconds', () => {
    expect(computeReplacementDelaySecs(4)).toBeGreaterThan(30);
  });
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('PartReplacementOrder — constructor', () => {
  test('initial state is pending', () => {
    const o = makeOrder();
    expect(o.getState()).toBe(ORDER_STATE.PENDING);
    o.dispose();
  });

  test('cost is computed from restoration value and number', () => {
    const o = makeOrder({ restorationValue: 1000, restorationNumber: 1 });
    expect(o.cost).toBe(50);
    o.dispose();
  });

  test('delaySecs is ≤30 for early-game', () => {
    const o = makeOrder({ restorationNumber: 1 });
    expect(o.delaySecs).toBeLessThanOrEqual(30);
    o.dispose();
  });

  test('throws on missing partId', () => {
    expect(() => new PartReplacementOrder({
      partId: '', restorationId: 'r1', restorationValue: 100, restorationNumber: 1,
    })).toThrow();
  });

  test('throws on invalid restorationValue', () => {
    expect(() => new PartReplacementOrder({
      partId: 'p1', restorationId: 'r1', restorationValue: -1, restorationNumber: 1,
    })).toThrow();
  });
});

// ─── AC2: simulateArrival() → isReadyToInstall() ─────────────────────────────

describe('PartReplacementOrder — AC2: awaiting-replacement / arrival', () => {
  test('isReadyToInstall() is false when still pending', () => {
    const o = makeOrder();
    expect(o.isReadyToInstall()).toBe(false);
    o.dispose();
  });

  test('isReadyToInstall() is true after simulateArrival()', () => {
    const o = makeOrder();
    o.simulateArrival();
    expect(o.isReadyToInstall()).toBe(true);
    o.dispose();
  });

  test('state is "arrived" after simulateArrival()', () => {
    const o = makeOrder();
    o.simulateArrival();
    expect(o.getState()).toBe(ORDER_STATE.ARRIVED);
    o.dispose();
  });

  test('onArrival callback fires on simulateArrival()', () => {
    const onArrival = jest.fn();
    const o = makeOrder({ onArrival });
    o.simulateArrival();
    expect(onArrival).toHaveBeenCalledWith('part-001', 'rest-001');
    o.dispose();
  });

  test('onArrival callback fires when real timer elapses (fake timers)', () => {
    const onArrival = jest.fn();
    const o = makeOrder({ restorationNumber: 1, onArrival }); // delaySecs = 15
    expect(onArrival).not.toHaveBeenCalled();
    jest.advanceTimersByTime(16_000);
    expect(onArrival).toHaveBeenCalledTimes(1);
    o.dispose();
  });
});

// ─── AC4: install() — cost penalty applied ────────────────────────────────────

describe('PartReplacementOrder — AC4: install()', () => {
  test('install() returns costPenalty and installedAt', () => {
    const o = makeOrder({ restorationValue: 1000, restorationNumber: 1 });
    o.simulateArrival();
    const result = o.install();
    expect(result.costPenalty).toBe(50);
    expect(typeof result.installedAt).toBe('number');
    o.dispose();
  });

  test('state is "installed" after install()', () => {
    const o = makeOrder();
    o.simulateArrival();
    o.install();
    expect(o.getState()).toBe(ORDER_STATE.INSTALLED);
    o.dispose();
  });

  test('install() throws when order is still pending', () => {
    const o = makeOrder();
    expect(() => o.install()).toThrow('Cannot install');
    o.dispose();
  });
});

// ─── Test Scenario 7: Save/load — snapshot() and fromSnapshot() ──────────────

describe('PartReplacementOrder — Test Scenario 7: snapshot/fromSnapshot', () => {
  test('snapshot() returns all required fields', () => {
    const o = makeOrder({ restorationValue: 800, restorationNumber: 2 });
    const snap = o.snapshot();
    expect(snap).toMatchObject({
      partId:            'part-001',
      restorationId:     'rest-001',
      restorationValue:  800,
      restorationNumber: 2,
      state:             'pending',
    });
    expect(typeof snap.orderedAt).toBe('number');
    o.dispose();
  });

  test('fromSnapshot() restores pending order state', () => {
    const o = makeOrder({ restorationNumber: 2 });
    const snap = o.snapshot();
    o.dispose();

    const restored = PartReplacementOrder.fromSnapshot(snap);
    expect(restored.getState()).toBe(ORDER_STATE.PENDING);
    expect(restored.partId).toBe('part-001');
    restored.dispose();
  });

  test('fromSnapshot() restores arrived order — already arrived, skip re-scheduling', () => {
    const o = makeOrder();
    o.simulateArrival();
    const snap = o.snapshot();
    o.dispose();

    const restored = PartReplacementOrder.fromSnapshot(snap);
    expect(restored.getState()).toBe(ORDER_STATE.ARRIVED);
    expect(restored.isReadyToInstall()).toBe(true);
    restored.dispose();
  });

  test('fromSnapshot() restores installed order', () => {
    const o = makeOrder();
    o.simulateArrival();
    o.install();
    const snap = o.snapshot();
    o.dispose();

    const restored = PartReplacementOrder.fromSnapshot(snap);
    expect(restored.getState()).toBe(ORDER_STATE.INSTALLED);
    restored.dispose();
  });
});
