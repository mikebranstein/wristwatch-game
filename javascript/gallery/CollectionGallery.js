/**
 * CollectionGallery — read-only scrollable gallery of completed watch restorations.
 *
 * Issue #127 — Workshop Collection Gallery MVP:
 *
 * Responsibilities:
 *   - Read completed_watches from PlayerSaveState at open time and build a
 *     view-model that the UI layer can render (AC2, AC3).
 *   - Render watch name, client name, completion date, and portrait thumbnail.
 *   - Display a friendly empty-state message for players with zero deliveries (AC5).
 *   - Guard against missing portrait assets: resolvePortrait failures return null
 *     rather than propagating exceptions (Test Scenario 10 — missing thumbnail fallback).
 *   - Implement virtual/paginated scroll for collections of 20+ entries to avoid
 *     UI overflow or performance degradation (Test Scenario 9, AC: scroll).
 *   - Present a clean view-model with no debug overlays or HUD properties (AC4).
 *
 * Design pattern mirrors ReassemblyScreen / SourcingScreen: accepts injected
 * dependencies at construction time; all domain logic is self-contained.
 *
 * Resolution targets: layout is built from relative entry counts, not fixed pixel
 * positions, so 1920×1080 and 2560×1440 are handled by the UI render layer
 * consuming the view-model.
 */

'use strict';

/** Number of entries rendered per page (virtual scroll chunk size). */
const PAGE_SIZE = 10;

/** Empty-state message shown when no watches have been delivered yet (AC5). */
const EMPTY_STATE_MESSAGE =
  'Your collection is empty — restore your first watch to begin!';

class CollectionGallery {
  /**
   * @param {Object}   opts
   * @param {Object}   opts.saveState         — PlayerSaveState instance
   * @param {Function} [opts.resolvePortrait]  — (assetKey: string) => string|null
   *                                             Maps asset key → resolved path/URL.
   *                                             Failures are caught; null returned as fallback.
   */
  constructor({ saveState, resolvePortrait = null }) {
    this._saveState       = saveState;
    this._resolvePortrait = resolvePortrait;

    this._entries     = [];   // loaded on open(); reverse-chronological
    this._currentPage = 0;
    this._isOpen      = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Open the gallery and load entries from save state.
   *
   * Entries are ordered most-recent-first (reverse delivery order) so that
   * the player's latest restoration is always visible at the top.
   * Reads completed_watches at open time — any deliveries made in the same
   * session are immediately visible without a reload (AC1, Test Scenario 8).
   *
   * @returns {Object} Initial view-model (page 0).
   */
  open() {
    const raw = this._saveState.getCompletedWatches();
    // Reverse chronological: last delivered is first in gallery
    this._entries = [...raw].reverse();
    this._currentPage = 0;
    this._isOpen = true;
    return this._buildViewModel();
  }

  /**
   * Close the gallery and reset internal state.
   * Safe to call even if already closed (idempotent).
   */
  close() {
    this._isOpen      = false;
    this._entries     = [];
    this._currentPage = 0;
  }

  // ── Navigation (virtual scroll / pagination) ──────────────────────────────

  /**
   * Navigate to a specific page.
   * Virtual-scroll approach: only PAGE_SIZE entries are materialised per call,
   * so collections of 20+ entries never render a flat list (Test Scenario 9).
   *
   * @param {number} pageIndex  — zero-based page index
   * @returns {Object} View-model for the requested page.
   * @throws {RangeError} When pageIndex is out of bounds.
   */
  goToPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= this.getTotalPages()) {
      throw new RangeError(
        `Page index ${pageIndex} is out of range (0–${this.getTotalPages() - 1}).`
      );
    }
    this._currentPage = pageIndex;
    return this._buildViewModel();
  }

  /**
   * Navigate to the next page.  No-ops if already on the last page.
   * @returns {Object} Updated view-model.
   */
  nextPage() {
    if (this._currentPage < this.getTotalPages() - 1) {
      this._currentPage += 1;
    }
    return this._buildViewModel();
  }

  /**
   * Navigate to the previous page.  No-ops if already on the first page.
   * @returns {Object} Updated view-model.
   */
  prevPage() {
    if (this._currentPage > 0) {
      this._currentPage -= 1;
    }
    return this._buildViewModel();
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {boolean} True when the gallery screen is open. */
  isOpen() { return this._isOpen; }

  /** @returns {boolean} True when no watches have been delivered. */
  isEmpty() { return this._entries.length === 0; }

  /** @returns {string} Friendly message for the empty state (AC5). */
  getEmptyStateMessage() { return EMPTY_STATE_MESSAGE; }

  /** @returns {number} Total number of completed watch entries. */
  getTotalEntries() { return this._entries.length; }

  /**
   * Total number of pages (minimum 1 so UI always renders a valid page index).
   * @returns {number}
   */
  getTotalPages() {
    return Math.max(1, Math.ceil(this._entries.length / PAGE_SIZE));
  }

  /** @returns {number} Current zero-based page index. */
  getCurrentPage() { return this._currentPage; }

  /** @returns {number} PAGE_SIZE constant (for test introspection). */
  getPageSize() { return PAGE_SIZE; }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Build the current page view-model.
   *
   * The view-model is clean of debug overlays, tutorial prompts, and unrelated
   * HUD fields (AC4 — screenshot-friendly layout contract).
   *
   * @returns {Object}
   */
  _buildViewModel() {
    const start   = this._currentPage * PAGE_SIZE;
    const slice   = this._entries.slice(start, start + PAGE_SIZE);
    const entries = slice.map(e => this._toViewEntry(e));

    return {
      isEmpty:      this.isEmpty(),
      emptyMessage: this.isEmpty() ? EMPTY_STATE_MESSAGE : null,
      totalEntries: this._entries.length,
      totalPages:   this.getTotalPages(),
      currentPage:  this._currentPage,
      hasNextPage:  this._currentPage < this.getTotalPages() - 1,
      hasPrevPage:  this._currentPage > 0,
      entries,
    };
  }

  /**
   * Convert a raw save-entry to a display-ready view entry.
   * Handles both camelCase (JS) and snake_case (Python/JSON) field names for
   * robustness across serialisation round-trips.
   *
   * @param {Object} entry
   * @returns {Object}
   */
  _toViewEntry(entry) {
    const assetKey = entry.portraitAssetKey ?? entry.portrait_asset_key ?? null;
    return {
      watchName:        entry.watchName   ?? entry.watch_name   ?? 'Unknown Watch',
      clientName:       entry.clientName  ?? entry.client_name  ?? 'Unknown Client',
      completionDate:   entry.completionDate ?? entry.completion_date ?? null,
      portraitAssetKey: assetKey,
      // portraitPath: safe resolution — null on failure (Test Scenario 10 fallback)
      portraitPath:     this._safeResolvePortrait(assetKey),
    };
  }

  /**
   * Resolve a portrait asset key to a path/URL, returning null on any failure.
   * Ensures a missing or broken asset never crashes the gallery (Test Scenario 10).
   *
   * @param {string|null} assetKey
   * @returns {string|null}
   */
  _safeResolvePortrait(assetKey) {
    if (!assetKey) return null;
    if (!this._resolvePortrait) return assetKey;   // identity fallback
    try {
      return this._resolvePortrait(assetKey) ?? null;
    } catch (_) {
      return null;  // broken resolver → placeholder, not a crash
    }
  }
}

module.exports = { CollectionGallery, PAGE_SIZE, EMPTY_STATE_MESSAGE };
