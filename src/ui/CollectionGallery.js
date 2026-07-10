'use strict';
const PAGE_SIZE = 10;
const EMPTY_STATE_MESSAGE = 'Your collection is empty — restore your first watch to begin!';
class CollectionGallery {
  constructor({ saveState }) {
    this._saveState = saveState;
    this._isOpen = false;
    this._currentPage = 0;
    this._entries = [];
  }
  open() { this._isOpen = true; this._currentPage = 0; this._entries = this._loadSortedEntries(); return this._buildViewModel(0); }
  close() { this._isOpen = false; this._currentPage = 0; this._entries = []; }
  refresh() { this._currentPage = 0; this._entries = this._loadSortedEntries(); return this._buildViewModel(0); }
  getPage(pageIndex) {
    const totalPages = Math.max(1, Math.ceil(this._entries.length / PAGE_SIZE));
    if (pageIndex < 0 || pageIndex >= totalPages) throw new RangeError('Page ' + pageIndex + ' out of range');
    this._currentPage = pageIndex;
    return this._buildViewModel(pageIndex);
  }
  isOpen() { return this._isOpen; }
  getCurrentPage() { return this._currentPage; }
  getTotalEntries() { return this._entries.length; }
  static get PAGE_SIZE() { return PAGE_SIZE; }
  _loadSortedEntries() {
    const raw = this._saveState.getCompletedWatches() || [];
    return raw.slice().sort((a, b) => {
      const da = a.completion_date || a.completionDate || '';
      const db = b.completion_date || b.completionDate || '';
      if (da < db) return 1;
      if (da > db) return -1;
      return 0;
    });
  }
  _buildViewModel(pageIndex) {
    const isEmpty = this._entries.length === 0;
    const totalPages = isEmpty ? 1 : Math.ceil(this._entries.length / PAGE_SIZE);
    const pageSlice = this._entries.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
    return {
      isEmpty,
      emptyMessage: isEmpty ? EMPTY_STATE_MESSAGE : null,
      totalEntries: this._entries.length,
      currentPage: pageIndex,
      totalPages,
      pageSize: PAGE_SIZE,
      hasNextPage: (pageIndex + 1) < totalPages,
      hasPreviousPage: pageIndex > 0,
      entries: pageSlice.map(e => ({
        watch_name: e.watch_name || e.watchName || '',
        client_name: e.client_name || e.clientName || '',
        completion_date: e.completion_date || e.completionDate || '',
        portrait_asset_key: e.portrait_asset_key || e.portraitAssetKey || '',
        fallback_portrait: !(e.portrait_asset_key || e.portraitAssetKey)
      })),
      hasHudOverlay: false,
      hasDebugOverlay: false,
      hasTutorialPrompt: false
    };
  }
}
module.exports = { CollectionGallery, PAGE_SIZE, EMPTY_STATE_MESSAGE };