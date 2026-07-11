/**
 * UpgradeShop — Workshop Economy MVP (Issue #145)
 *
 * Manages the two tool upgrades and one workspace upgrade available in the
 * Workshop Economy MVP. Handles purchase validation, idempotency guard
 * (AC3: upgrade cannot be purchased a second time), and the locked/fully-
 * upgraded display states (AC5: insufficient balance shows locked state).
 *
 * Upgrade catalogue (fixed for MVP — non-goal: full upgrade tree):
 *   precision_tweezers  — Tool upgrade: reduces accidental component damage risk
 *   magnification       — Tool upgrade: clearer part placement guides during restoration
 *   lighting_improvement — Workspace upgrade: better visual state indicators on movement components
 *
 * Save-state fields (additive, backward-compatible — Issue #145):
 *   workshop_upgrades  {string[]}  List of purchased upgrade IDs ([] default)
 *
 * Acceptance criteria covered:
 *   AC3 — Purchase flow: balance deducted, upgrade applied, cannot re-purchase.
 *   AC5 — Insufficient balance: locked state shown, no negative balance.
 */

'use strict';

/**
 * Upgrade catalogue: id → { label, cost, type, description }
 */
const UPGRADE_CATALOGUE = {
  precision_tweezers: {
    id:          'precision_tweezers',
    label:       'Precision Tweezers',
    cost:        80,
    type:        'tool',
    description: 'Reduces accidental component damage risk during restoration.',
  },
  magnification: {
    id:          'magnification',
    label:       'Magnification Upgrade',
    cost:        120,
    type:        'tool',
    description: 'Provides clearer part placement guides during restoration.',
  },
  lighting_improvement: {
    id:          'lighting_improvement',
    label:       'Lighting Improvement',
    cost:        100,
    type:        'workspace',
    description: 'Better visual state indicators on movement components.',
  },
};

const ALL_UPGRADE_IDS = Object.keys(UPGRADE_CATALOGUE);

class UpgradeShop {
  /**
   * @param {Object}        saveState      PlayerSaveState-compatible object with get/set API.
   * @param {LedgerManager} ledgerManager  LedgerManager instance for balance read/deduct.
   */
  constructor(saveState, ledgerManager) {
    if (!saveState || typeof saveState.get !== 'function' || typeof saveState.set !== 'function') {
      throw new Error('UpgradeShop: saveState must implement get(key) and set(key, value).');
    }
    if (!ledgerManager || typeof ledgerManager.canAfford !== 'function') {
      throw new Error('UpgradeShop: ledgerManager must be a LedgerManager instance.');
    }
    this._save    = saveState;
    this._ledger  = ledgerManager;
  }

  // ---------------------------------------------------------------------------
  // Read accessors
  // ---------------------------------------------------------------------------

  /**
   * Returns the array of purchased upgrade IDs.
   * @returns {string[]}
   */
  get purchasedUpgrades() {
    const stored = this._save.get('workshop_upgrades');
    return Array.isArray(stored) ? [...stored] : [];
  }

  /**
   * Returns true if the given upgrade has already been purchased. AC3 idempotency guard.
   * @param {string} upgradeId
   * @returns {boolean}
   */
  isOwned(upgradeId) {
    return this.purchasedUpgrades.includes(upgradeId);
  }

  /**
   * Returns true if ALL upgrades have been purchased (Scenario 4).
   * @returns {boolean}
   */
  get isFullyUpgraded() {
    const owned = this.purchasedUpgrades;
    return ALL_UPGRADE_IDS.every(id => owned.includes(id));
  }

  // ---------------------------------------------------------------------------
  // Shop view-model — drives UI rendering (AC3, AC5)
  // ---------------------------------------------------------------------------

  /**
   * Returns a view-model for the upgrade shop UI.
   * Each entry includes: id, label, cost, type, description, owned, affordable, locked.
   *
   * AC5: locked = true when owned OR balance insufficient (no purchase possible).
   * AC3: owned = true when already purchased; these show as "Owned" in UI.
   *
   * @returns {{ upgrades: Object[], fullyUpgraded: boolean, balance: number }}
   */
  getShopViewModel() {
    const balance = this._ledger.balance;
    const upgrades = ALL_UPGRADE_IDS.map(id => {
      const def    = UPGRADE_CATALOGUE[id];
      const owned  = this.isOwned(id);
      const affordable = !owned && balance >= def.cost;
      return {
        ...def,
        owned,
        affordable,
        locked:          owned || !affordable,   // AC5: locked when unaffordable or already owned
        balanceRequired: owned ? 0 : Math.max(0, def.cost - balance),
      };
    });

    return {
      upgrades,
      fullyUpgraded: this.isFullyUpgraded,
      balance,
    };
  }

  // ---------------------------------------------------------------------------
  // Purchase (AC3, AC5)
  // ---------------------------------------------------------------------------

  /**
   * Attempt to purchase an upgrade.
   *
   * Guards:
   *   - Unknown upgradeId → throws Error
   *   - Already owned (AC3 idempotency) → returns { success: false, reason: 'already_owned' }
   *   - Insufficient balance (AC5) → returns { success: false, reason: 'insufficient_balance', needed: X }
   *   - Otherwise: deducts balance, records purchase, returns { success: true, newBalance: X }
   *
   * @param {string} upgradeId
   * @returns {{ success: boolean, reason?: string, needed?: number, newBalance?: number, upgrade?: Object }}
   */
  purchase(upgradeId) {
    const def = UPGRADE_CATALOGUE[upgradeId];
    if (!def) {
      throw new Error(`UpgradeShop: unknown upgrade '${upgradeId}'. Expected one of: ${ALL_UPGRADE_IDS.join(', ')}`);
    }

    // AC3: idempotency guard — cannot purchase a second time
    if (this.isOwned(upgradeId)) {
      return { success: false, reason: 'already_owned' };
    }

    // AC5: insufficient balance guard
    if (!this._ledger.canAfford(def.cost)) {
      const needed = def.cost - this._ledger.balance;
      return { success: false, reason: 'insufficient_balance', needed };
    }

    // Deduct from ledger balance
    const newBalance = this._ledger.deductUpgradePurchase(def.cost);

    // Record purchase in save state
    const owned = this.purchasedUpgrades;
    owned.push(upgradeId);
    this._save.set('workshop_upgrades', owned);

    return { success: true, newBalance, upgrade: { ...def } };
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /** Returns the full upgrade catalogue (read-only copy). */
  static getCatalogue() {
    return { ...UPGRADE_CATALOGUE };
  }

  /** Returns all upgrade IDs. */
  static getAllUpgradeIds() {
    return [...ALL_UPGRADE_IDS];
  }
}

module.exports = { UpgradeShop, UPGRADE_CATALOGUE, ALL_UPGRADE_IDS };
