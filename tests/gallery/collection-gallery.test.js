/**
 * Tests: CollectionGallery — Issue #127 Workshop Collection Gallery MVP
 *
 * Covers acceptance criteria and test scenarios from the feature request:
 *   AC1  — Gallery populates on delivery (open() shows new entry immediately)
 *   AC2  — All completed watches visible (N watches → N entries in gallery)
 *   AC3  — Gallery accessible (open() returns valid view-model within the call)
 *   AC4  — Screenshot-friendly: view-model has no debug/HUD/tutorial fields
 *   AC5  — Empty state handled gracefully (friendly placeholder message)
 *   TS8  — Delivery trigger timing: immediate visibility without reload
 *   TS9  — Large collection scroll: 20+ entries, virtual scroll, pagination
 *   TS10 — Missing thumbnail fallback: broken resolver → null, no crash
 *
 * Run with: npm test
 */

'use strict';

const { CollectionGallery, PAGE_SIZE, EMPTY_STATE_MESSAGE } = require('../../src/gallery/CollectionGallery');
const { PlayerSaveState }                                   = require('../../src/state/PlayerSaveState');
const { DeliveryHandler }                                   = require('../../src/gallery/DeliveryHandler');

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeSaveState(initial = {}) {
  return new PlayerSaveState(initial);
}

function makeGallery(saveState, overrides = {}) {
  return new CollectionGallery({ saveState, ...overrides });
}

function makeWatchEntry(n) {
  return {
    watchId:          `watch-${n}`,
    watchName:        `Watch ${n}`,
    clientName:       `Client ${n}`,
    completionDate:   `2026-07-${String(n).padStart(2, '0')}`,
    portraitAssetKey: `portraits/watch-${n}.png`,
  };
}

function deliverWatches(saveState, count) {
  const handler = new DeliveryHandler({ saveState });
  for (let i = 1; i <= count; i++) {
    handler.completeDelivery(makeWatchEntry(i));
  }
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('CollectionGallery — construction', () => {
  it('constructs without errors', () => {
    const saveState = makeSaveState();
    expect(() => makeGallery(saveState)).not.toThrow();
  });

  it('accepts an optional resolvePortrait function', () => {
    const saveState = makeSaveState();
    const resolver  = (key) => `/assets/${key}`;
    expect(() => makeGallery(saveState, { resolvePortrait: resolver })).not.toThrow();
  });
});

// ── AC5: Empty state ──────────────────────────────────────────────────────────

describe('CollectionGallery — AC5: empty state', () => {
  it('isEmpty() returns true for a fresh save with no deliveries', () => {
    const gallery = makeGallery(makeSaveState());
    gallery.open();
    expect(gallery.isEmpty()).toBe(true);
  });

  it('open() view-model includes emptyMessage for zero deliveries', () => {
    const gallery = makeGallery(makeSaveState());
    const vm      = gallery.open();
    expect(vm.isEmpty).toBe(true);
    expect(vm.emptyMessage).toBe(EMPTY_STATE_MESSAGE);
    expect(vm.emptyMessage).toContain('restore your first watch');
  });

  it('open() view-model has no entries array items for empty gallery', () => {
    const gallery = makeGallery(makeSaveState());
    const vm      = gallery.open();
    expect(vm.entries).toHaveLength(0);
  });

  it('emptyMessage is null when entries exist', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 1);
    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    expect(vm.emptyMessage).toBeNull();
  });
});

// ── AC3: Accessibility / open-close ──────────────────────────────────────────

describe('CollectionGallery — AC3: gallery accessibility', () => {
  it('open() returns a valid view-model synchronously', () => {
    const gallery = makeGallery(makeSaveState());
    const vm      = gallery.open();
    expect(vm).toBeDefined();
    expect(vm).toHaveProperty('isEmpty');
    expect(vm).toHaveProperty('entries');
    expect(vm).toHaveProperty('totalPages');
  });

  it('isOpen() is true after open()', () => {
    const gallery = makeGallery(makeSaveState());
    gallery.open();
    expect(gallery.isOpen()).toBe(true);
  });

  it('isOpen() is false after close()', () => {
    const gallery = makeGallery(makeSaveState());
    gallery.open();
    gallery.close();
    expect(gallery.isOpen()).toBe(false);
  });

  it('can open, close, and re-open without UI state corruption (Test Scenario 5)', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 2);
    const gallery = makeGallery(saveState);

    const vm1 = gallery.open();
    gallery.close();
    const vm2 = gallery.open();

    expect(vm1.totalEntries).toBe(vm2.totalEntries);
    expect(vm2.entries).toHaveLength(2);
  });
});

// ── AC1 + TS8: Delivery → immediate gallery visibility ────────────────────────

describe('CollectionGallery — AC1 + Test Scenario 8: immediate delivery visibility', () => {
  it('entry is visible in gallery immediately after delivery without session reload', () => {
    const saveState = makeSaveState();
    const handler   = new DeliveryHandler({ saveState });
    const gallery   = makeGallery(saveState);

    handler.completeDelivery(makeWatchEntry(1));

    // Open gallery in same session — no reload needed
    const vm = gallery.open();
    expect(vm.isEmpty).toBe(false);
    expect(vm.totalEntries).toBe(1);
    expect(vm.entries[0].watchName).toBe('Watch 1');
  });

  it('entry includes correct name, client, and completion date (AC1)', () => {
    const saveState = makeSaveState();
    const handler   = new DeliveryHandler({ saveState });

    handler.completeDelivery({
      watchId:          'seiko-001',
      watchName:        'Seiko 5 Sports',
      clientName:       'Alice Barber',
      completionDate:   '2026-07-10',
      portraitAssetKey: 'portraits/seiko-5.png',
    });

    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    const entry   = vm.entries[0];

    expect(entry.watchName).toBe('Seiko 5 Sports');
    expect(entry.clientName).toBe('Alice Barber');
    expect(entry.completionDate).toBe('2026-07-10');
  });
});

// ── AC2: All watches visible ──────────────────────────────────────────────────

describe('CollectionGallery — AC2: all completed watches visible', () => {
  it('5 delivered watches → 5 entries in gallery (single page)', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 5);
    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    expect(vm.totalEntries).toBe(5);
  });

  it('entries from a pre-existing save (simulating cross-session persistence) are all present', () => {
    const priorWatches = [
      makeWatchEntry(1),
      makeWatchEntry(2),
    ];
    const saveState = makeSaveState({ completed_watches: priorWatches });
    const handler   = new DeliveryHandler({ saveState });
    handler.completeDelivery(makeWatchEntry(3));

    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    expect(vm.totalEntries).toBe(3);
  });

  it('gallery entries are ordered most-recent-first (reverse delivery order)', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 3);
    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    // Delivered Watch 1, 2, 3 → displayed 3, 2, 1
    expect(vm.entries[0].watchName).toBe('Watch 3');
    expect(vm.entries[1].watchName).toBe('Watch 2');
    expect(vm.entries[2].watchName).toBe('Watch 1');
  });
});

// ── AC4: Screenshot-friendly — no debug/HUD fields ────────────────────────────

describe('CollectionGallery — AC4: screenshot-friendly view-model', () => {
  const FORBIDDEN_FIELDS = [
    'debugOverlay', 'tutorialPrompt', 'hudElement', 'hud',
    'debugInfo', 'tutorialState', 'devOverlay',
  ];

  it('view-model root has no debug/HUD/tutorial properties', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 1);
    const gallery = makeGallery(saveState);
    const vm      = gallery.open();

    for (const field of FORBIDDEN_FIELDS) {
      expect(vm).not.toHaveProperty(field);
    }
  });

  it('individual entry view-models have no debug/HUD/tutorial properties', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 1);
    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    const entry   = vm.entries[0];

    for (const field of FORBIDDEN_FIELDS) {
      expect(entry).not.toHaveProperty(field);
    }
  });
});

// ── TS9: Large collection — virtual scroll / pagination ───────────────────────

describe('CollectionGallery — Test Scenario 9: large collection virtual scroll', () => {
  it('25 delivered watches → totalEntries is 25', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 25);
    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    expect(vm.totalEntries).toBe(25);
  });

  it('25 watches → 3 pages of PAGE_SIZE entries', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 25);
    const gallery = makeGallery(saveState);
    gallery.open();
    // ceil(25 / 10) = 3
    expect(gallery.getTotalPages()).toBe(3);
  });

  it('first page has PAGE_SIZE entries when collection > PAGE_SIZE', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 25);
    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    expect(vm.entries).toHaveLength(PAGE_SIZE);
  });

  it('last page has remaining entries (25 mod PAGE_SIZE = 5)', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 25);
    const gallery = makeGallery(saveState);
    gallery.open();
    const vm = gallery.goToPage(2); // 0-indexed, page 3 = index 2
    expect(vm.entries).toHaveLength(5);
  });

  it('goToPage navigates to requested page', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 25);
    const gallery = makeGallery(saveState);
    gallery.open();
    const vm = gallery.goToPage(1);
    expect(vm.currentPage).toBe(1);
    expect(vm.entries).toHaveLength(PAGE_SIZE);
  });

  it('nextPage / prevPage navigate correctly', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 25);
    const gallery = makeGallery(saveState);
    gallery.open();

    gallery.nextPage();
    expect(gallery.getCurrentPage()).toBe(1);

    gallery.nextPage();
    expect(gallery.getCurrentPage()).toBe(2);

    gallery.prevPage();
    expect(gallery.getCurrentPage()).toBe(1);
  });

  it('nextPage does not exceed last page', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 5);
    const gallery = makeGallery(saveState);
    gallery.open();
    gallery.nextPage(); // no-op (only 1 page)
    expect(gallery.getCurrentPage()).toBe(0);
  });

  it('prevPage does not go below page 0', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 5);
    const gallery = makeGallery(saveState);
    gallery.open();
    gallery.prevPage(); // no-op
    expect(gallery.getCurrentPage()).toBe(0);
  });

  it('goToPage throws RangeError on out-of-bounds index', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 5);
    const gallery = makeGallery(saveState);
    gallery.open();
    expect(() => gallery.goToPage(99)).toThrow(RangeError);
  });

  it('all 20+ entries are accessible across pages with no overflow', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 22);
    const gallery   = makeGallery(saveState);
    gallery.open();

    let totalSeen = 0;
    for (let p = 0; p < gallery.getTotalPages(); p++) {
      const vm = gallery.goToPage(p);
      totalSeen += vm.entries.length;
    }
    expect(totalSeen).toBe(22);
  });
});

// ── TS10: Missing thumbnail fallback ──────────────────────────────────────────

describe('CollectionGallery — Test Scenario 10: missing thumbnail fallback', () => {
  it('portrait resolvePortrait returning null produces null portraitPath', () => {
    const saveState  = makeSaveState();
    const handler    = new DeliveryHandler({ saveState });
    handler.completeDelivery({
      ...makeWatchEntry(1),
      portraitAssetKey: 'portraits/missing.png',
    });

    const gallery = makeGallery(saveState, { resolvePortrait: () => null });
    const vm      = gallery.open();
    expect(vm.entries[0].portraitPath).toBeNull();
  });

  it('throwing resolvePortrait returns null without crashing (Test Scenario 10)', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 1);

    const gallery = makeGallery(saveState, {
      resolvePortrait: () => { throw new Error('Asset not found'); },
    });

    expect(() => gallery.open()).not.toThrow();
    const vm = gallery.open();
    expect(vm.entries[0].portraitPath).toBeNull();
  });

  it('null portraitAssetKey produces null portraitPath', () => {
    const saveState = makeSaveState();
    const handler   = new DeliveryHandler({ saveState });
    handler.completeDelivery({ ...makeWatchEntry(1), portraitAssetKey: null });

    const gallery = makeGallery(saveState);
    const vm      = gallery.open();
    expect(vm.entries[0].portraitPath).toBeNull();
  });

  it('gallery entry still displays when portrait fails (no crash, entry present)', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 1);

    const gallery = makeGallery(saveState, {
      resolvePortrait: () => { throw new Error('Disk error'); },
    });
    const vm = gallery.open();

    expect(vm.entries).toHaveLength(1);
    expect(vm.entries[0].watchName).toBe('Watch 1');
    expect(vm.entries[0].portraitPath).toBeNull();
  });
});

// ── Portrait resolution ───────────────────────────────────────────────────────

describe('CollectionGallery — portrait resolution', () => {
  it('resolves portrait path via injected resolvePortrait', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 1);

    const gallery = makeGallery(saveState, {
      resolvePortrait: (key) => `/resolved/${key}`,
    });
    const vm = gallery.open();
    expect(vm.entries[0].portraitPath).toBe('/resolved/portraits/watch-1.png');
  });

  it('uses assetKey as identity path when no resolvePortrait injected', () => {
    const saveState = makeSaveState();
    deliverWatches(saveState, 1);

    const gallery = makeGallery(saveState); // no resolver
    const vm      = gallery.open();
    expect(vm.entries[0].portraitPath).toBe('portraits/watch-1.png');
  });
});
