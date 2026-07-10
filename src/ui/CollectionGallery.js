'use strict';

const PAGE_SIZE = 10;
const EMPTY_STATE_MESSAGE = 'Your collection is empty — restore your first watch to begin!';

class CollectionGallery {
  constructor({ saveState }) {
    this._saveState = saveState;
    this._isOpen = false;
    this._currentPage = 0;
  }

  open() {
    this._isOpen = true;
    this._currentPage = 0;
    return this._buildViewModel(this._currentPage);
  }

  close() {
    this._isOpen = false;
  }

  refresh() {
    return this._buildViewModel(this._currentPage);
  }

  getPage(pageIndex) {
    this._currentPage = Math.max(0, pageIndex || 0);
    return this._buildViewModel(this._currentPage);
  }

  _loadSortedEntries() {
    const entries = this._saveState.getCompletedWatches();
    return [...entries].sort((left, right) => {
      const leftTime = Date.parse(left.completion_date);
      const rightTime = Date.parse(right.completion_date);
      if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return String(right.completion_date || '').localeCompare(String(left.completion_date || ''));
    });
  }

  _buildViewModel(pageIndex) {
    const entries = this._loadSortedEntries();
    const totalEntries = entries.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
    const currentPage = Math.min(Math.max(0, pageIndex || 0), totalPages - 1);
    const pageEntries = entries
      .slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
      .map((entry) => ({
        watch_name: entry.watch_name,
        client_name: entry.client_name,
        completion_date: entry.completion_date,
        portrait_asset_key: entry.portrait_asset_key,
        fallback_portrait: !entry.portrait_asset_key,
      }));

    this._currentPage = currentPage;

    return {
      isEmpty: totalEntries === 0,
      emptyMessage: EMPTY_STATE_MESSAGE,
      totalEntries,
      currentPage,
      totalPages,
      pageSize: PAGE_SIZE,
      hasNextPage: currentPage < totalPages - 1,
      hasPreviousPage: currentPage > 0,
      entries: pageEntries,
      hasHudOverlay: false,
      hasDebugOverlay: false,
      hasTutorialPrompt: false,
    };
  }
}

module.exports = { CollectionGallery, PAGE_SIZE, EMPTY_STATE_MESSAGE };
