/**
 * DeliveryHandler — delivery-completion boundary for the Collection Gallery.
 * Issue #127 — Workshop Collection Gallery MVP
 *
 * Issue #145 — Workshop Economy MVP:
 *   handleDelivery() payload extended with `pricing_tier` and `parts_cost`.
 *   When a LedgerManager is provided, the ledger is updated atomically at this
 *   delivery-completion boundary (consistent with the existing save-flush pattern).
 *   If no LedgerManager is supplied, economy fields are silently ignored for
 *   backward-compatibility with pre-economy integration points.
 *
 * Issue #254 — Cosmetic Grade Modifier:
 *   handleDelivery() payload extended with optional `cosmetic_grade` field.
 *   When present and a valid grade, it is passed to LedgerManager.recordJobCompletion()
 *   (grade multiplier applied to full_restoration tier only) and a client
 *   satisfaction_message is appended to the delivery entry.
 *   Backward-compatible: callers omitting cosmetic_grade receive no message and no
 *   multiplier, consistent with prior behavior (AC5, Scenario 8).
 */
'use strict';

/**
 * Client satisfaction messages keyed by cosmetic grade (Issue #254, AC5).
 * Only populated on the delivery entry when cosmetic_grade is present and recognised.
 */
const SATISFACTION_MESSAGES = {
  mirror:   'The mirror polish is exceptional — exactly as I hoped.',
  good:     'The case finish looks great. I\'m very pleased.',
  adequate: 'It\'s functional, but the case finish is just adequate.',
};

class DeliveryHandler {
  /**
   * @param {Object}         opts
   * @param {Object}         opts.saveState       PlayerSaveState-compatible object
   * @param {Function|null}  opts.saveAsyncFn     Optional async save callback
   * @param {Function|null}  opts.onDelivered     Optional delivery notification callback
   * @param {Object|null}    opts.ledgerManager   Issue #145: LedgerManager instance (optional, backward-compat)
   */
  constructor({ saveState, saveAsyncFn = null, onDelivered = null, ledgerManager = null }) {
    this._saveState    = saveState;
    this._saveAsyncFn  = saveAsyncFn;
    this._onDelivered  = onDelivered;
    this._ledger       = ledgerManager;  // Issue #145: null-safe (backward-compat)
  }

  /**
   * Handle a completed job delivery.
   *
   * Issue #145 extension: if `pricing_tier` and `parts_cost` are provided (and a
   * LedgerManager was supplied at construction), the ledger is updated atomically
   * before the save flush so that ledger totals and balance are always consistent.
   *
   * Issue #254 extension: optional `cosmetic_grade` payload field ('adequate'|'good'|'mirror').
   * When present, it is forwarded to LedgerManager.recordJobCompletion() (grade multiplier
   * for full_restoration tier) and a `satisfaction_message` is added to the delivery entry.
   * Backward-compatible: omitting `cosmetic_grade` produces no satisfaction_message and no
   * grade multiplier — existing callers unaffected (AC5, Scenario 8).
   *
   * @param {Object}  payload
   * @param {string}  payload.watch_name
   * @param {string}  payload.client_name
   * @param {string}  payload.completion_date
   * @param {string}  payload.portrait_asset_key
   * @param {string}  [payload.before_portrait_url]
   * @param {string}  [payload.pricing_tier]    Issue #145: 'simple_service'|'complex_service'|'full_restoration'
   * @param {number}  [payload.parts_cost]      Issue #145: total parts cost for this job (≥0)
   * @param {string}  [payload.cosmetic_grade]  Issue #254: 'adequate'|'good'|'mirror' (optional)
   * @returns {Object} The delivery entry (collection gallery record + economy summary)
   */
  handleDelivery({
    watch_name,
    client_name,
    completion_date,
    portrait_asset_key,
    before_portrait_url = null,
    pricing_tier        = null,   // Issue #145
    parts_cost          = 0,      // Issue #145
    cosmetic_grade      = null,   // Issue #254
  }) {
    const entry = { watch_name, client_name, completion_date, portrait_asset_key, before_portrait_url };

    // Issue #145 / #254: update ledger at delivery boundary if economy is wired up.
    // Issue #254: cosmetic_grade forwarded to recordJobCompletion for grade multiplier.
    // Atomic: ledger totals + balance are always written together before the save flush.
    let economySummary = null;
    if (this._ledger && pricing_tier) {
      economySummary = this._ledger.recordJobCompletion(pricing_tier, parts_cost, cosmetic_grade);
      entry.pricing_tier   = pricing_tier;
      entry.parts_cost     = parts_cost;
      entry.net_income     = economySummary.netIncome;
      entry.ledger_balance = economySummary.newBalance;
    }

    // Issue #254 (AC5): add satisfaction_message only when cosmetic_grade is present
    // and recognised. No cosmetic restoration → no satisfaction_message field.
    if (cosmetic_grade && SATISFACTION_MESSAGES[cosmetic_grade]) {
      entry.satisfaction_message = SATISFACTION_MESSAGES[cosmetic_grade];
    }

    this._saveState.appendCompletedWatch(entry);
    if (this._saveAsyncFn) this._saveAsyncFn(this._saveState.snapshot());
    if (this._onDelivered) this._onDelivered(entry);
    return entry;
  }

  getSaveState() { return this._saveState; }

  /** Issue #145: convenience accessor for the ledger manager. */
  getLedger() { return this._ledger; }
}

module.exports = { DeliveryHandler };
