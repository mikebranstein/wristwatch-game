const { PlayerSaveState }  = require('../../src/state/PlayerSaveState');
const { DeliveryHandler }  = require('../../src/completion/DeliveryHandler');
const { CollectionGallery, PAGE_SIZE, EMPTY_STATE_MESSAGE } = require('../../src/ui/CollectionGallery');
const { WorkshopHubNav }   = require('../../src/ui/WorkshopHubNav');

function makeEntry(o) {
  return Object.assign({ watch_name: 'Seiko 5 SNK809', client_name: 'Alice', completion_date: '2026-07-10', portrait_asset_key: 'portraits/seiko' }, o || {});
}
function makeSaveStateWith(entries) {
  const s = new PlayerSaveState();
  entries.forEach(e => s.recordWatchDelivery(e));
  return s;
}

describe('AC5 empty state', function() {
  test('new save shows empty-state message', function() {
    const vm = new CollectionGallery({ saveState: new PlayerSaveState() }).open();
    expect(vm.isEmpty).toBe(true);
    expect(vm.emptyMessage).toBe(EMPTY_STATE_MESSAGE);
    expect(vm.entries).toEqual([]);
  });
  test('totalPages = 1 on empty', function() {
    expect(new CollectionGallery({ saveState: new PlayerSaveState() }).open().totalPages).toBe(1);
  });
  test('pre-feature save without completed_watches no crash', function() {
    var s = new PlayerSaveState({ tutorial_first_fault_seen: true });
    expect(function() { new CollectionGallery({ saveState: s }).open(); }).not.toThrow();
  });
});

describe('AC1 gallery populates on delivery', function() {
  test('deliver one watch shows correct data', function() {
    var s = new PlayerSaveState();
    new DeliveryHandler({ saveState: s }).handleDelivery(makeEntry());
    var vm = new CollectionGallery({ saveState: s }).open();
    expect(vm.isEmpty).toBe(false);
    expect(vm.entries[0].watch_name).toBe('Seiko 5 SNK809');
    expect(vm.entries[0].client_name).toBe('Alice');
  });
  test('Scenario 8 refresh after mid-session delivery', function() {
    var s = new PlayerSaveState();
    var g = new CollectionGallery({ saveState: s });
    expect(g.open().isEmpty).toBe(true);
    new DeliveryHandler({ saveState: s }).handleDelivery(makeEntry({ watch_name: 'Omega' }));
    expect(g.refresh().entries[0].watch_name).toBe('Omega');
  });
  test('DeliveryHandler returns entry', function() {
    var result = new DeliveryHandler({ saveState: new PlayerSaveState() }).handleDelivery(makeEntry({ watch_name: 'Rolex' }));
    expect(result.watch_name).toBe('Rolex');
  });
  test('DeliveryHandler fires saveAsyncFn', function() {
    var snaps = [];
    new DeliveryHandler({ saveState: new PlayerSaveState(), saveAsyncFn: function(s) { snaps.push(s); } }).handleDelivery(makeEntry());
    expect(snaps[0].completed_watches).toHaveLength(1);
  });
  test('DeliveryHandler fires onDelivered', function() {
    var delivered = [];
    new DeliveryHandler({ saveState: new PlayerSaveState(), onDelivered: function(e) { delivered.push(e); } }).handleDelivery(makeEntry({ watch_name: 'Tudor' }));
    expect(delivered[0].watch_name).toBe('Tudor');
  });
});

describe('AC2 all completed watches visible', function() {
  test('5 watches shows all 5', function() {
    var watches = ['A','B','C','D','E'].map(function(n,i) { return makeEntry({ watch_name: n, completion_date: '2026-0' + (i+1) + '-01' }); });
    expect(new CollectionGallery({ saveState: makeSaveStateWith(watches) }).open().totalEntries).toBe(5);
  });
  test('entries sorted most-recent-first', function() {
    var s = makeSaveStateWith([makeEntry({ watch_name: 'Oldest', completion_date: '2026-01-01' }), makeEntry({ watch_name: 'Newest', completion_date: '2026-07-01' })]);
    expect(new CollectionGallery({ saveState: s }).open().entries[0].watch_name).toBe('Newest');
  });
  test('Scenario 4 save snapshot round-trip', function() {
    var s1 = new PlayerSaveState();
    var h = new DeliveryHandler({ saveState: s1 });
    h.handleDelivery(makeEntry({ watch_name: 'W1' }));
    h.handleDelivery(makeEntry({ watch_name: 'W2' }));
    var s2 = new PlayerSaveState(s1.snapshot());
    var vm = new CollectionGallery({ saveState: s2 }).open();
    expect(vm.totalEntries).toBe(2);
    expect(vm.entries.map(function(e) { return e.watch_name; })).toContain('W1');
  });
});

describe('AC3 gallery accessible from hub', function() {
  test('WorkshopHubNav.openCollectionGallery returns view model', function() {
    expect(function() { new WorkshopHubNav({ saveState: new PlayerSaveState() }).openCollectionGallery(); }).not.toThrow();
  });
  test('openCollectionGallery opens gallery fires onNavigation', function() {
    var logs = [];
    var nav = new WorkshopHubNav({ saveState: new PlayerSaveState(), onNavigation: function(s) { logs.push(s); } });
    nav.openCollectionGallery();
    expect(nav.getGallery().isOpen()).toBe(true);
    expect(logs).toContain('collection_gallery');
  });
  test('Scenario 5 open close reopen no state corruption', function() {
    var s = makeSaveStateWith([makeEntry(), makeEntry({ watch_name: 'Omega' })]);
    var nav = new WorkshopHubNav({ saveState: s });
    nav.openCollectionGallery();
    nav.closeCollectionGallery();
    var vm = nav.openCollectionGallery();
    expect(vm.totalEntries).toBe(2);
    expect(vm.currentPage).toBe(0);
  });
  test('getHubNavViewModel includes collection gallery button', function() {
    var btn = new WorkshopHubNav({ saveState: new PlayerSaveState() }).getHubNavViewModel().buttons.find(function(b) { return b.id === 'collection_gallery'; });
    expect(btn).toBeDefined();
    expect(btn.enabled).toBe(true);
  });
  test('openCollectionGallery is synchronous', function() {
    var start = Date.now();
    new WorkshopHubNav({ saveState: new PlayerSaveState() }).openCollectionGallery();
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe('AC4 screenshot friendly', function() {
  test('no HUD overlay', function() {
    expect(new CollectionGallery({ saveState: makeSaveStateWith([makeEntry()]) }).open().hasHudOverlay).toBe(false);
  });
  test('no debug overlay', function() {
    expect(new CollectionGallery({ saveState: makeSaveStateWith([makeEntry()]) }).open().hasDebugOverlay).toBe(false);
  });
  test('no tutorial prompt', function() {
    expect(new CollectionGallery({ saveState: makeSaveStateWith([makeEntry()]) }).open().hasTutorialPrompt).toBe(false);
  });
  test('AC4 holds on empty state', function() {
    var vm = new CollectionGallery({ saveState: new PlayerSaveState() }).open();
    expect(vm.hasHudOverlay).toBe(false);
    expect(vm.hasDebugOverlay).toBe(false);
    expect(vm.hasTutorialPrompt).toBe(false);
  });
});

describe('Scenario 9 large collection pagination', function() {
  test('20 entries split into correct pages', function() {
    var entries = Array.from({ length: 20 }, function() { return makeEntry(); });
    var vm = new CollectionGallery({ saveState: makeSaveStateWith(entries) }).open();
    expect(vm.totalEntries).toBe(20);
    expect(vm.totalPages).toBe(Math.ceil(20 / PAGE_SIZE));
    expect(vm.entries).toHaveLength(PAGE_SIZE);
  });
  test('getPage(1) returns second page', function() {
    var entries = Array.from({ length: 15 }, function() { return makeEntry(); });
    var g = new CollectionGallery({ saveState: makeSaveStateWith(entries) });
    g.open();
    var p2 = g.getPage(1);
    expect(p2.entries).toHaveLength(15 - PAGE_SIZE);
    expect(p2.hasPreviousPage).toBe(true);
  });
  test('getPage throws RangeError for out of bounds', function() {
    var g = new CollectionGallery({ saveState: makeSaveStateWith([makeEntry()]) });
    g.open();
    expect(function() { g.getPage(99); }).toThrow(RangeError);
  });
  test('hasNextPage hasPreviousPage correct', function() {
    var entries = Array.from({ length: PAGE_SIZE + 1 }, function() { return makeEntry(); });
    var g = new CollectionGallery({ saveState: makeSaveStateWith(entries) });
    expect(g.open().hasNextPage).toBe(true);
    expect(g.getPage(1).hasNextPage).toBe(false);
  });
});

describe('Scenario 10 missing thumbnail fallback', function() {
  test('empty portrait sets fallback true', function() {
    expect(new CollectionGallery({ saveState: makeSaveStateWith([makeEntry({ portrait_asset_key: '' })]) }).open().entries[0].fallback_portrait).toBe(true);
  });
  test('null portrait does not crash', function() {
    expect(function() { new CollectionGallery({ saveState: makeSaveStateWith([makeEntry({ portrait_asset_key: null })]) }).open(); }).not.toThrow();
  });
  test('valid portrait sets fallback false', function() {
    expect(new CollectionGallery({ saveState: makeSaveStateWith([makeEntry()]) }).open().entries[0].fallback_portrait).toBe(false);
  });
});

describe('PlayerSaveState completed_watches', function() {
  test('defaults to empty array', function() {
    var s = new PlayerSaveState();
    expect(s.get('completed_watches')).toEqual([]);
    expect(s.getCompletedWatches()).toEqual([]);
  });
  test('pre-feature save gets empty array', function() {
    expect(new PlayerSaveState({ tutorial_first_fault_seen: true }).getCompletedWatches()).toEqual([]);
  });
  test('recordWatchDelivery adds entry', function() {
    var s = new PlayerSaveState();
    s.recordWatchDelivery(makeEntry());
    expect(s.getCompletedWatches()).toHaveLength(1);
  });
  test('recordWatchDelivery accumulates', function() {
    var s = new PlayerSaveState();
    s.recordWatchDelivery(makeEntry());
    s.recordWatchDelivery(makeEntry());
    expect(s.getCompletedWatches()).toHaveLength(2);
  });
  test('getCompletedWatches returns copy', function() {
    var s = new PlayerSaveState();
    s.recordWatchDelivery(makeEntry());
    s.getCompletedWatches().push({ x: 1 });
    expect(s.getCompletedWatches()).toHaveLength(1);
  });
  test('snapshot includes completed_watches', function() {
    var s = new PlayerSaveState();
    s.recordWatchDelivery(makeEntry({ watch_name: 'Seiko' }));
    expect(s.snapshot().completed_watches[0].watch_name).toBe('Seiko');
  });
  test('existing fields preserved', function() {
    var s = new PlayerSaveState({ tutorial_first_fault_seen: true });
    s.recordWatchDelivery(makeEntry());
    expect(s.snapshot().tutorial_first_fault_seen).toBe(true);
  });
});