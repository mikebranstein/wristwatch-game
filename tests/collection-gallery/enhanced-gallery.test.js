'use strict';

const fs = require('fs');
const path = require('path');
const { PlayerSaveState } = require('../../src/state/PlayerSaveState');
const { GalleryDetailView } = require('../../src/ui/GalleryDetailView');

const makeEntry = (overrides = {}) => ({
  watch_name: 'Rolex Oyster',
  client_name: 'Morgan',
  completion_date: '2026-07-10',
  portrait_asset_key: 'portraits/rolex-oyster.png',
  before_portrait_url: 'portraits/rolex-oyster-before.png',
  ...overrides,
});

const makeSaveState = (entries) => {
  const saveState = new PlayerSaveState();
  entries.forEach((entry) => saveState.appendCompletedWatch(entry));
  return saveState;
};

describe('GalleryDetailView — Issue #129 enhanced showcase', () => {
  test('AC1: openDetail exposes zoom capability and default state', () => {
    const detail = new GalleryDetailView({ saveState: makeSaveState([makeEntry()]) });

    expect(detail.openDetail(makeEntry())).toEqual(expect.objectContaining({
      isOpen: true,
      zoom_level: 1.0,
      zoom_min: 1.0,
      zoom_max: 2.0,
      before_after_state: 'after',
      share_available: true,
    }));
  });

  test('AC1: setZoomLevel clamps within allowed zoom range', () => {
    const detail = new GalleryDetailView({ saveState: makeSaveState([makeEntry()]) });
    detail.openDetail(makeEntry());

    expect(detail.setZoomLevel(0.5)).toBe(1.0);
    expect(detail.setZoomLevel(1.5)).toBe(1.5);
    expect(detail.setZoomLevel(5.0)).toBe(2.0);
    expect(detail.getZoomLevel()).toBe(2.0);
  });

  test('AC2: toggleBeforeAfter switches to before state when before data exists', () => {
    const entry = makeEntry();
    const detail = new GalleryDetailView({ saveState: makeSaveState([entry]) });
    const vm = detail.openDetail(entry);

    expect(vm.has_before_after_data).toBe(true);
    expect(detail.toggleBeforeAfter()).toBe('before');
    expect(detail.getBeforeAfterState()).toBe('before');
    expect(detail.toggleBeforeAfter()).toBe('after');
  });

  test('AC2: has_before_after_data is true when before portrait data exists', () => {
    const detail = new GalleryDetailView({ saveState: makeSaveState([makeEntry()]) });

    expect(detail.openDetail(makeEntry()).has_before_after_data).toBe(true);
  });

  test('AC3: getStatistics returns total watches restored count', () => {
    const detail = new GalleryDetailView({
      saveState: makeSaveState([makeEntry(), makeEntry({ watch_name: 'Cartier Tank' })]),
    });

    expect(detail.getStatistics().total_watches_restored).toBe(2);
  });

  test('AC3: getStatistics returns favourite client based on delivery count', () => {
    const detail = new GalleryDetailView({
      saveState: makeSaveState([
        makeEntry({ client_name: 'Alex' }),
        makeEntry({ watch_name: 'Cartier Tank', client_name: 'Alex' }),
        makeEntry({ watch_name: 'Omega Constellation', client_name: 'Jamie' }),
      ]),
    });

    expect(detail.getStatistics().favourite_client).toBe('Alex');
  });

  test('AC4: exportScreenshot succeeds when screenshot directory is available', () => {
    const workspaceDir = path.join(process.cwd(), 'test-output-gallery');
    const entry = makeEntry();
    const detail = new GalleryDetailView({
      saveState: makeSaveState([entry]),
      screenshotDirFn: () => workspaceDir,
    });

    const result = detail.exportScreenshot(entry);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      error: null,
    }));
    expect(fs.existsSync(result.path)).toBe(true);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  test('AC4: exportScreenshot reports unavailable screenshot directory when no provider exists', () => {
    const detail = new GalleryDetailView({ saveState: makeSaveState([makeEntry()]) });

    expect(detail.exportScreenshot(makeEntry())).toEqual({
      success: false,
      path: null,
      error: 'screenshots_dir_unavailable',
    });
  });

  test('AC5: missing before/after data shows placeholder state', () => {
    const entry = makeEntry({ before_portrait_url: null });
    const detail = new GalleryDetailView({ saveState: makeSaveState([entry]) });

    expect(detail.openDetail(entry)).toEqual(expect.objectContaining({
      has_before_after_data: false,
      before_after_placeholder: true,
    }));
  });

  test('AC5: toggleBeforeAfter is a no-op when before data is missing', () => {
    const entry = makeEntry({ before_portrait_url: null });
    const detail = new GalleryDetailView({ saveState: makeSaveState([entry]) });
    detail.openDetail(entry);

    expect(detail.toggleBeforeAfter()).toBe('after');
    expect(detail.getBeforeAfterState()).toBe('after');
  });
});
