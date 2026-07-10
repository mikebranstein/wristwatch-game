/**
 * LedgerManager — Workshop Economy MVP (Issue #145)
 *
 * Manages the persistent workshop ledger: income earned, parts costs spent,
 * and the resulting net balance. Ledger updates are written at the
 * delivery-completion boundary (consistent with DeliveryHandler save-flush
 * pattern) and are atomically flushed into PlayerSaveState.
 *
 * Cozy Mode: when cozy_mode_enabled is true, income is recorded for display
 * but parts_cost deductions are NOT applied to the balance (display-only mode).
 *
 * Save-state fields (additive, backward-compatible — Issue #145):
 *   ledger_income_total   {number}  Total gross income from all completed jobs (0 default)
 *   ledger_parts_cost_total {number} Total parts costs across all jobs (0 default)
 *   ledger_balance        {number}  Net balance (income − parts costs, 0 default)
 *   cozy_mode_enabled     {boolean} Cozy Mode toggle state (false default)
 *
 * Acceptance criteria covered:
 *   AC1 — Ledger balance updated at delivery completion with pricing tier + parts cost.
 *   AC2 — Totals correctly aggregated; persisted across sessions.
 *   AC4 — Cozy Mode: cost deductions hidden/suppressed; toggle persists.
 */

'use strict';

/**
 * Pricing tier revenue table (fixed values for MVP — non-goal: dynamic pricing).
 * @type {{ [tier: string]: number }}
 */
const PRICING_TIERS = {
  simple_service:    50,
  complex_service:  120,
  full_restoration: 200,
};

class LedgerManager {
  /**
   * @param {Object} saveState  PlayerSaveState-compatible object with get/set API.
   */
  constructor(saveState) {
    if (!saveState || typeof saveState.get !== 'function' || typeof saveState.set !== 'function') {
      throw new Error('LedgerManager: saveState must implement get(key) and set(key, value).');
    }
    this._save = saveState;
  }

  // ---------------------------------------------------------------------------
  // Read accessors
  // ---------------------------------------------------------------------------

  /** Total gross income earned across all completed jobs. @returns {number} */
  get incomeTotal() {
    return this._save.get('ledger_income_total') || 0;
  }

  /** Total parts costs spent across all completed jobs. @returns {number} */
  get partsCostTotal() {
    return this._save.get('ledger_parts_cost_total') || 0;
  }

  /** Current net balance (income minus parts costs). @returns {number} */
  get balance() {
    return this._save.get('ledger_balance') || 0;
  }

  /** Whether Cozy Mode is currently enabled. @returns {boolean} */
  get cosyModeEnabled() {
    return this._save.get('cozy_mode_enabled') || false;
  }

  // ---------------------------------------------------------------------------
  // Ledger mutation — called at delivery completion boundary (AC1)
  // ---------------------------------------------------------------------------

  /**
   * Record a completed job in the ledger.
   *
   * Atomically updates ledger_income_total, ledger_parts_cost_total, and
   * ledger_balance in the save state. When Cozy Mode is enabled, parts costs
   * are tracked for display but NOT deducted from the balance (AC4).
   *
   * @param {string} pricingTier  One of 'simple_service' | 'complex_service' | 'full_restoration'
   * @param {number} partsCost    Total cost of parts consumed during this job (≥0)
   * @returns {{ revenue: number, partsCost: number, netIncome: number, newBalance: number }}
   */
  recordJobCompletion(pricingTier, partsCost = 0) {
    const revenue = LedgerManager.revenueForTier(pricingTier);
    const cozy    = this.cosyModeEnabled;

    const newIncomeTotal    = this.incomeTotal + revenue;
    const newPartsCostTotal = this.partsCostTotal + partsCost;
    // In Cozy Mode: parts cost is not deducted — balance increases by full revenue.
    const effectiveDeduction = cozy ? 0 : partsCost;
    const newBalance         = this.balance + revenue - effectiveDeduction;
    const netIncome          = revenue - effectiveDeduction;

    // Atomic write: all three fields updated together (Design mitigation — ledger atomicity)
    this._save.set('ledger_income_total',    newIncomeTotal);
    this._save.set('ledger_parts_cost_total', newPartsCostTotal);
    this._save.set('ledger_balance',          newBalance);

    return { revenue, partsCost, netIncome, newBalance };
  }

  /**
   * Deduct a purchase from the ledger balance (upgrade shop purchase).
   * Does NOT apply if balance is insufficient — caller must check canAfford() first.
   * AC3: balance deduction for upgrade purchases.
   *
   * @param {number} cost  Amount to deduct (must be > 0)
   * @returns {number} New balance after deduction
   * @throws {Error} If cost exceeds current balance
   */
  deductUpgradePurchase(cost) {
    if (cost <= 0) throw new Error('LedgerManager: upgrade cost must be positive.');
    if (!this.canAfford(cost)) {
      throw new Error(`LedgerManager: insufficient balance (${this.balance}) for cost ${cost}.`);
    }
    const newBalance = this.balance - cost;
    this._save.set('ledger_balance', newBalance);
    return newBalance;
  }

  /**
   * Returns true if the current balance covers the given cost. AC5.
   * @param {number} cost
   * @returns {boolean}
   */
  canAfford(cost) {
    return this.balance >= cost;
  }

  /**
   * Returns a summary view-model for HUD display.
   * @returns {{ incomeTotal: number, partsCostTotal: number, balance: number, cosyMode: boolean }}
   */
  getLedgerViewModel() {
    return {
      incomeTotal:    this.incomeTotal,
      partsCostTotal: this.partsCostTotal,
      balance:        this.balance,
      cosyMode:       this.cosyModeEnabled,
    };
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the revenue for a given pricing tier.
   * @param {string} tier
   * @returns {number}
   * @throws {Error} if tier is not recognised
   */
  static revenueForTier(tier) {
    if (!Object.prototype.hasOwnProperty.call(PRICING_TIERS, tier)) {
      throw new Error(`LedgerManager: unknown pricing tier '${tier}'. Expected one of: ${Object.keys(PRICING_TIERS).join(', ')}`);
    }
    return PRICING_TIERS[tier];
  }

  /** Exposes the pricing tier table for UI display. @returns {Object} */
  static getPricingTiers() {
    return { ...PRICING_TIERS };
  }
}

module.exports = { LedgerManager, PRICING_TIERS };
