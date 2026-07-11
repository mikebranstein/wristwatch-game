'use strict';
const { CollectionGallery } = require('./CollectionGallery');

/**
 * WorkshopHubNav — Workshop hub navigation and persistent HUD display.
 *
 * Issue #145 — Workshop Economy MVP:
 *   getLedgerHudViewModel() added: reads ledger balance from save state for the
 *   persistent HUD display. Stateless read-only consumer — no writes here.
 *   When no economy fields are present (pre-feature save), returns safe zero defaults.
 */
class WorkshopHubNav {
  constructor({ saveState, onNavigation = null }) {
    this._saveState = saveState;
    this._onNavigation = onNavigation;
    this._gallery = new CollectionGallery({ saveState });
  }

  openCollectionGallery() {
    if (this._onNavigation) this._onNavigation('collection_gallery');
    return this._gallery.open();
  }

  closeCollectionGallery() {
    this._gallery.close();
    if (this._onNavigation) this._onNavigation('workshop_hub');
  }

  getHubNavViewModel() {
    return { buttons: [{ id: 'collection_gallery', label: 'Collection Gallery', enabled: true }] };
  }

  /**
   * Issue #145: Returns the persistent HUD ledger view-model.
   * Reads ledger balance and cozy mode state directly from save state (read-only).
   * Safe for pre-economy saves: all fields default to 0 / false.
   *
   * @returns {{ balance: number, incomeTotal: number, partsCostTotal: number, cosyMode: boolean }}
   */
  getLedgerHudViewModel() {
    return {
      balance:        this._saveState.get('ledger_balance')          || 0,
      incomeTotal:    this._saveState.get('ledger_income_total')      || 0,
      partsCostTotal: this._saveState.get('ledger_parts_cost_total')  || 0,
      cosyMode:       this._saveState.get('cozy_mode_enabled')        || false,
    };
  }

  getGallery() { return this._gallery; }
}

module.exports = { WorkshopHubNav };
