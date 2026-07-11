/**
 * Tests: DeliveryHandler — Issue #127 Workshop Collection Gallery MVP
 *
 * Covers:
 *   AC1  — Gallery populates on delivery (entry appended to completed_watches in memory)
 *   AC1  — In-session immediate update (Test Scenario 8: no reload required)
 *   AC2  — All completed watches persisted (multiple deliveries)
 *   Save — saveAsync called with updated snapshot after each delivery
 *   Telemetry — watch_delivered event emitted
 *
 * Run with: npm test
 */

'use strict';

const { DeliveryHandler } = require('../../../javascript/gallery/DeliveryHandler');
const { PlayerSaveState } = require('../../../javascript/state/PlayerSaveState');

const noop = () => {};

function makeSaveState(initial = {}) {
  return new PlayerSaveState(initial);
}

function makeHandler(overrides = {}) {
  return new DeliveryHandler({
    saveState: makeSaveState(),
    ...overrides,
  });
}

const SAMPLE_DELIVERY = {
  watchId:          'watch-seiko-001',
  watchName:        'Seiko 5 Sports',
  clientName:       'Alice Barber',
  completionDate:   '2026-07-10',
  portraitAssetKey: 'portraits/seiko-5-sports-delivered.png',
};

// ── Construction ──────────────────────────────────────────────────────────────

describe('DeliveryHandler — construction', () => {
  it('constructs without errors', () => {
    expect(() => makeHandler()).not.toThrow();
  });

  it('accepts saveAsync and instrumentationHook in constructor', () => {
    const saveAsync = jest.fn();
    const hook      = jest.fn();
    expect(() => makeHandler({ saveAsync, instrumentationHook: hook })).not.toThrow();
  });
});

// ── AC1: entry appended to completed_watches ──────────────────────────────────

describe('DeliveryHandler — AC1: gallery populates on delivery', () => {
  it('appends entry to completed_watches in memory on completeDelivery', () => {
    const saveState = makeSaveState();
    const handler   = new DeliveryHandler({ saveState });

    handler.completeDelivery(SAMPLE_DELIVERY);

    const watches = saveState.getCompletedWatches();
    expect(watches).toHaveLength(1);
    expect(watches[0].watchName).toBe('Seiko 5 Sports');
    expect(watches[0].clientName).toBe('Alice Barber');
    expect(watches[0].completionDate).toBe('2026-07-10');
    expect(watches[0].portraitAssetKey).toBe('portraits/seiko-5-sports-delivered.png');
  });

  it('returns the normalised entry', () => {
    const handler = makeHandler();
    const entry   = handler.completeDelivery(SAMPLE_DELIVERY);
    expect(entry.watchId).toBe('watch-seiko-001');
    expect(entry.watchName).toBe('Seiko 5 Sports');
  });

  it('defaults portraitAssetKey to null when not provided', () => {
    const handler = makeHandler();
    const entry   = handler.completeDelivery({
      watchId:        'watch-x',
      watchName:      'Omega Speedmaster',
      clientName:     'Bob',
      completionDate: '2026-07-11',
    });
    expect(entry.portraitAssetKey).toBeNull();
  });
});

// ── Test Scenario 8: immediate in-session update ──────────────────────────────

describe('DeliveryHandler — Test Scenario 8: immediate in-session update', () => {
  it('gallery entry is available immediately after delivery without session reload', () => {
    const saveState = makeSaveState();
    const handler   = new DeliveryHandler({ saveState });

    // Zero entries before delivery
    expect(saveState.getCompletedWatches()).toHaveLength(0);

    handler.completeDelivery(SAMPLE_DELIVERY);

    // Entry available immediately in same session — no reload required
    expect(saveState.getCompletedWatches()).toHaveLength(1);
    expect(saveState.getCompletedWatches()[0].watchName).toBe('Seiko 5 Sports');
  });
});

// ── AC2: multiple deliveries across sessions ──────────────────────────────────

describe('DeliveryHandler — AC2: multiple deliveries', () => {
  it('appends multiple entries in order', () => {
    const saveState = makeSaveState();
    const handler   = new DeliveryHandler({ saveState });

    handler.completeDelivery({ ...SAMPLE_DELIVERY, watchId: 'w1', watchName: 'Watch One',   completionDate: '2026-07-01' });
    handler.completeDelivery({ ...SAMPLE_DELIVERY, watchId: 'w2', watchName: 'Watch Two',   completionDate: '2026-07-05' });
    handler.completeDelivery({ ...SAMPLE_DELIVERY, watchId: 'w3', watchName: 'Watch Three', completionDate: '2026-07-10' });

    const watches = saveState.getCompletedWatches();
    expect(watches).toHaveLength(3);
    expect(watches[0].watchName).toBe('Watch One');
    expect(watches[2].watchName).toBe('Watch Three');
  });

  it('preserves existing completed_watches when restoring from saved state', () => {
    // Simulate a pre-existing save with 2 entries (loaded from disk)
    const existingWatches = [
      { watchId: 'w-old-1', watchName: 'Old Watch', clientName: 'Charlie', completionDate: '2026-06-01', portraitAssetKey: null },
    ];
    const saveState = makeSaveState({ completed_watches: existingWatches });
    const handler   = new DeliveryHandler({ saveState });

    handler.completeDelivery(SAMPLE_DELIVERY);

    const watches = saveState.getCompletedWatches();
    expect(watches).toHaveLength(2);
    expect(watches[0].watchName).toBe('Old Watch');
    expect(watches[1].watchName).toBe('Seiko 5 Sports');
  });
});

// ── saveAsync called with updated snapshot ────────────────────────────────────

describe('DeliveryHandler — saveAsync persistence', () => {
  it('calls saveAsync with updated snapshot on completeDelivery', () => {
    const saveAsync = jest.fn();
    const saveState = makeSaveState();
    const handler   = new DeliveryHandler({ saveState, saveAsync });

    handler.completeDelivery(SAMPLE_DELIVERY);

    expect(saveAsync).toHaveBeenCalledTimes(1);
    const snapshot = saveAsync.mock.calls[0][0];
    expect(snapshot.completed_watches).toHaveLength(1);
    expect(snapshot.completed_watches[0].watchName).toBe('Seiko 5 Sports');
  });

  it('does not throw when saveAsync is not provided', () => {
    const handler = makeHandler({ saveAsync: null });
    expect(() => handler.completeDelivery(SAMPLE_DELIVERY)).not.toThrow();
  });
});

// ── Telemetry ─────────────────────────────────────────────────────────────────

describe('DeliveryHandler — telemetry', () => {
  it('emits watch_delivered event on completeDelivery', () => {
    const events = [];
    const handler = makeHandler({ instrumentationHook: (e, p) => events.push({ e, p }) });

    handler.completeDelivery(SAMPLE_DELIVERY);

    const delivered = events.find(ev => ev.e === 'watch_delivered');
    expect(delivered).toBeDefined();
    expect(delivered.p.watchName).toBe('Seiko 5 Sports');
    expect(delivered.p.clientName).toBe('Alice Barber');
  });

  it('includes hasPortrait=true when portraitAssetKey is set', () => {
    const events = [];
    const handler = makeHandler({ instrumentationHook: (e, p) => events.push({ e, p }) });

    handler.completeDelivery(SAMPLE_DELIVERY);

    const delivered = events.find(ev => ev.e === 'watch_delivered');
    expect(delivered.p.hasPortrait).toBe(true);
  });

  it('includes hasPortrait=false when portraitAssetKey is null', () => {
    const events = [];
    const handler = makeHandler({ instrumentationHook: (e, p) => events.push({ e, p }) });

    handler.completeDelivery({ ...SAMPLE_DELIVERY, portraitAssetKey: null });

    const delivered = events.find(ev => ev.e === 'watch_delivered');
    expect(delivered.p.hasPortrait).toBe(false);
  });

  it('does not throw when instrumentationHook is not provided', () => {
    const handler = makeHandler({ instrumentationHook: null });
    expect(() => handler.completeDelivery(SAMPLE_DELIVERY)).not.toThrow();
  });
});
