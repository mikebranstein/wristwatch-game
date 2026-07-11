'use strict';

const fs = require('fs');
const path = require('path');

const ZOOM_MIN = 1.0;
const ZOOM_MAX = 2.0;

const sanitizeFileSegment = (value) => String(value || 'watch')
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
  .replace(/\s+/g, '-');

class GalleryDetailView {
  constructor({ saveState, screenshotDirFn = null }) {
    this._saveState = saveState;
    this._screenshotDirFn = screenshotDirFn;
    this._isOpen = false;
    this._watchEntry = null;
    this._zoomLevel = ZOOM_MIN;
    this._beforeAfterState = 'after';
  }

  openDetail(watchEntry) {
    this._isOpen = true;
    this._watchEntry = watchEntry;
    this._zoomLevel = ZOOM_MIN;
    this._beforeAfterState = 'after';
    return this._buildViewModel();
  }

  closeDetail() {
    this._isOpen = false;
    this._watchEntry = null;
    this._zoomLevel = ZOOM_MIN;
    this._beforeAfterState = 'after';
  }

  setZoomLevel(level) {
    const numericLevel = Number(level);
    if (Number.isNaN(numericLevel)) {
      this._zoomLevel = ZOOM_MIN;
      return this._zoomLevel;
    }
    this._zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, numericLevel));
    return this._zoomLevel;
  }

  getZoomLevel() {
    return this._zoomLevel;
  }

  toggleBeforeAfter() {
    if (!this._hasBeforeAfterData()) {
      return this._beforeAfterState;
    }
    this._beforeAfterState = this._beforeAfterState === 'after' ? 'before' : 'after';
    return this._beforeAfterState;
  }

  getBeforeAfterState() {
    return this._beforeAfterState;
  }

  getStatistics() {
    const entries = this._saveState.getCompletedWatches();
    const watchCounts = new Map();
    const clientCounts = new Map();

    for (const entry of entries) {
      watchCounts.set(entry.watch_name, (watchCounts.get(entry.watch_name) || 0) + 1);
      clientCounts.set(entry.client_name, (clientCounts.get(entry.client_name) || 0) + 1);
    }

    return {
      total_watches_restored: entries.length,
      rarest_watch: pickByCount(watchCounts, 'lowest'),
      favourite_client: pickByCount(clientCounts, 'highest'),
      total_restoration_time_ms: null,
    };
  }

  exportScreenshot(watchEntry) {
    if (!this._screenshotDirFn) {
      return { success: false, path: null, error: 'screenshots_dir_unavailable' };
    }

    try {
      const screenshotDir = this._screenshotDirFn();
      const fileName = `${sanitizeFileSegment(watchEntry.watch_name)}-${sanitizeFileSegment(watchEntry.completion_date)}.png`;
      const targetPath = path.join(screenshotDir, fileName);
      fs.mkdirSync(screenshotDir, { recursive: true });
      const overlay = [
        'PNG EXPORT PLACEHOLDER',
        `watch_name=${watchEntry.watch_name}`,
        `client_name=${watchEntry.client_name}`,
        `completion_date=${watchEntry.completion_date}`,
      ].join('\n');
      fs.writeFileSync(targetPath, Buffer.from(overlay, 'utf8'));
      return { success: true, path: targetPath, error: null };
    } catch (error) {
      return { success: false, path: null, error: 'permission_denied' };
    }
  }

  isOpen() {
    return this._isOpen;
  }

  _hasBeforeAfterData() {
    return Boolean(this._watchEntry && this._watchEntry.before_portrait_url);
  }

  _buildViewModel() {
    const entry = this._watchEntry || {};
    const hasBeforeAfterData = this._hasBeforeAfterData();

    return {
      isOpen: this._isOpen,
      watch_name: entry.watch_name,
      client_name: entry.client_name,
      completion_date: entry.completion_date,
      portrait_asset_key: entry.portrait_asset_key,
      before_portrait_url: entry.before_portrait_url ?? null,
      has_before_after_data: hasBeforeAfterData,
      before_after_placeholder: !hasBeforeAfterData,
      zoom_level: this._zoomLevel,
      zoom_min: ZOOM_MIN,
      zoom_max: ZOOM_MAX,
      before_after_state: this._beforeAfterState,
      share_available: true,
    };
  }
}

function pickByCount(counts, mode) {
  if (counts.size === 0) return null;

  const sortedEntries = [...counts.entries()].sort((left, right) => {
    if (left[1] === right[1]) {
      return String(left[0]).localeCompare(String(right[0]));
    }
    return mode === 'highest' ? right[1] - left[1] : left[1] - right[1];
  });

  return sortedEntries[0][0];
}

module.exports = { GalleryDetailView, ZOOM_MIN, ZOOM_MAX };
