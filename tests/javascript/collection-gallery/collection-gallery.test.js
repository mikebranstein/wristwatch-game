'use strict';

const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');
const { DeliveryHandler } = require('../../../src/completion/DeliveryHandler');
const { CollectionGallery, PAGE_SIZE, EMPTY_STATE_MESSAGE } = require('../../../src/ui/CollectionGallery');
const { WorkshopHubNav } = require('../../../src/ui/WorkshopHubNav');

const makeEntry = (overrides = {}) => ({
  watch_name: 'Omega Seamaster',
  client_name: 'Alice',
  completion_date: '2026-07-10',
  portrait_asset_key: 'portraits/omega-seamaster.png',
  before_portrait_url: null,
  ...overrides,
});

const makeSaveStateWithWatches = (entries) => {
  const saveState = new PlayerSaveState();
  entries.forEach((entry) => saveState.appendCompletedWatch(entry));
  return saveState;
};

describe('CollectionGallery — Issue #127 MVP', () => {
  test('AC5: empty gallery shows empty-state messaging', () => {
    const gallery = new CollectionGallery({ saveState: new PlayerSaveState() });

    expect(gallery.open()).toEqual(expect.objectContaining({
      isEmpty: true,
      emptyMessage: EMPTY_STATE_MESSAGE,
      totalEntries: 0,
      entries: [],
    }));
  });

  test('AC1: delivery handler appends delivered watches for gallery display', () => {
    const saveState = new PlayerSaveState();
    const saveSnapshots = [];
    const deliveries = [];
    const handler = new DeliveryHandler({
      saveState,
      saveAsyncFn: (snapshot) => saveSnapshots.push(snapshot),
      onDelivered: (entry) => deliveries.push(entry),
    });

    const entry = handler.handleDelivery(makeEntry());
    const gallery = new CollectionGallery({ saveState });
    const vm = gallery.open();

    expect(entry.watch_name).toBe('Omega Seamaster');
    expect(vm.totalEntries).toBe(1);
    expect(vm.entries[0]).toEqual(expect.objectContaining({
      watch_name: 'Omega Seamaster',
      client_name: 'Alice',
      portrait_asset_key: 'portraits/omega-seamaster.png',
      fallback_portrait: false,
    }));
    expect(saveSnapshots).toHaveLength(1);
    expect(deliveries).toEqual([entry]);
  });

  test('AC2: all completed watches are visible through pagination', () => {
    const entries = Array.from({ length: 12 }, (_, index) => makeEntry({
      watch_name: `Watch ${index + 1}`,
      completion_date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    }));
    const gallery = new CollectionGallery({ saveState: makeSaveStateWithWatches(entries) });

    const firstPage = gallery.open();
    const secondPage = gallery.getPage(1);

    expect(firstPage.entries).toHaveLength(PAGE_SIZE);
    expect(secondPage.entries).toHaveLength(2);
    expect(firstPage.totalEntries).toBe(12);
  });

  test('AC3: workshop hub nav opens and closes the collection gallery', () => {
    const navEvents = [];
    const nav = new WorkshopHubNav({
      saveState: makeSaveStateWithWatches([makeEntry()]),
      onNavigation: (event) => navEvents.push(event),
    });

    const hubVm = nav.getHubNavViewModel();
    const galleryVm = nav.openCollectionGallery();
    nav.closeCollectionGallery();

    expect(hubVm.buttons).toEqual([{ id: 'collection_gallery', label: 'Collection Gallery', enabled: true }]);
    expect(galleryVm.isEmpty).toBe(false);
    expect(navEvents).toEqual(['collection_gallery', 'workshop_hub']);
  });

  test('AC4: gallery view model stays screenshot-friendly without HUD/debug/tutorial overlays', () => {
    const gallery = new CollectionGallery({ saveState: makeSaveStateWithWatches([makeEntry()]) });

    expect(gallery.open()).toEqual(expect.objectContaining({
      hasHudOverlay: false,
      hasDebugOverlay: false,
      hasTutorialPrompt: false,
    }));
  });

  test('sorts watches most-recent-first by completion date', () => {
    const gallery = new CollectionGallery({
      saveState: makeSaveStateWithWatches([
        makeEntry({ watch_name: 'Earlier', completion_date: '2026-07-08' }),
        makeEntry({ watch_name: 'Latest', completion_date: '2026-07-10' }),
        makeEntry({ watch_name: 'Middle', completion_date: '2026-07-09' }),
      ]),
    });

    expect(gallery.open().entries.map((entry) => entry.watch_name)).toEqual(['Latest', 'Middle', 'Earlier']);
  });

  test('Scenario 9: paginates 20+ watches with next/previous flags', () => {
    const entries = Array.from({ length: 21 }, (_, index) => makeEntry({
      watch_name: `Watch ${index + 1}`,
      completion_date: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
    }));
    const gallery = new CollectionGallery({ saveState: makeSaveStateWithWatches(entries) });

    const page0 = gallery.open();
    const page1 = gallery.getPage(1);
    const page2 = gallery.getPage(2);

    expect(page0.hasPreviousPage).toBe(false);
    expect(page0.hasNextPage).toBe(true);
    expect(page1.hasPreviousPage).toBe(true);
    expect(page1.hasNextPage).toBe(true);
    expect(page2.hasPreviousPage).toBe(true);
    expect(page2.hasNextPage).toBe(false);
    expect(page2.entries).toHaveLength(1);
  });

  test('Scenario 10: missing thumbnail uses fallback portrait flag', () => {
    const gallery = new CollectionGallery({
      saveState: makeSaveStateWithWatches([
        makeEntry({ watch_name: 'No Portrait', portrait_asset_key: null }),
      ]),
    });

    expect(gallery.open().entries[0]).toEqual(expect.objectContaining({
      watch_name: 'No Portrait',
      portrait_asset_key: null,
      fallback_portrait: true,
    }));
  });
});
