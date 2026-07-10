/**
 * DamageRecoveryController — orchestrates the full damage recovery loop.
 *
 * Issue #148 — In-Repair Part Damage Recovery — Core System
 *
 * Wires together:
 *   - DamageEventDetector       (broken visual state + event detection)
 *   - DamageRecoveryPrompt      (recovery prompt UI within 1 second — AC1)
 *   - PartReplacementOrder      (ordering mechanic + awaiting-replacement state — AC2/AC3)
 *   - TelemetryEmitter          (damage event telemetry — AC5)
 *   - PlayerSaveState           (damage and awaiting-replacement fields — Test Scenario 7)
 *
 * Game state machine (new states alongside existing restoration states):
 *   'active'                — normal restoration in progress
 *   'awaiting_replacement'  — one or more replacement orders outstanding (AC2)
 *   'blocked'               — player declined recovery (Test Scenario 2)
 *   'completed'             — all replacements installed; restoration can complete (AC4)
 *
 * Design constraints observed:
 *   - Non-Goal: does NOT modify save/load core logic (#93) — only adds new serialisable fields
 *   - Non-Goal: does NOT implement full Part-Sourcing supplier network (#4) — defers to that feature
 *   - Non-Goal: Phase 2 severity tier logic is explicitly NOT included
 */

'use strict';

const { DamageEventDetector } = require('./DamageEventDetector');
const { DamageRecoveryPrompt } = require('./DamageRecoveryPrompt');
const { PartReplacementOrder }  = require('./PartReplacementOrder');

const RESTORATION_DAMAGE_STATE = {
  ACTIVE:               'active',
  AWAITING_REPLACEMENT: 'awaiting_replacement',
  BLOCKED:              'blocked',
  COMPLETED:            'completed',
};

class DamageRecoveryController {
  /**
   * @param {Object} params
   * @param {Object}   params.telemetryEmitter   TelemetryEmitter instance (for AC5 events)
   * @param {Object}   params.saveState          PlayerSaveState instance (for save/load compat)
   * @param {string}   params.restorationId      Current restoration session ID
   * @param {number}   params.restorationValue   Total value of this restoration job
   * @param {number}   params.restorationNumber  1-based index (used for early-game calibration)
   */
  constructor({
    telemetryEmitter,
    saveState,
    restorationId,
    restorationValue,
    restorationNumber,
  }) {
    if (!telemetryEmitter) throw new Error('telemetryEmitter is required.');
    if (!saveState)        throw new Error('saveState is required.');
    if (!restorationId)    throw new Error('restorationId is required.');

    this._telemetry        = telemetryEmitter;
    this._saveState        = saveState;
    this._restorationId    = restorationId;
    this._restorationValue = restorationValue;
    this._restorationNumber = restorationNumber;

    this._state     = RESTORATION_DAMAGE_STATE.ACTIVE;
    this._orders    = new Map(); // partId → PartReplacementOrder
    this._totalCostPenalty = 0;

    // Wire sub-components
    this._detector = new DamageEventDetector((damageEvent) => {
      this._handleDamageDetected(damageEvent);
    });

    this._prompt = new DamageRecoveryPrompt({
      onOrder:   (partId, restorationId) => this._handleOrderConfirmed(partId, restorationId),
      onDecline: (partId, restorationId) => this._handleOrderDeclined(partId, restorationId),
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Trigger a damage event for the given part (called by game mechanics on
   * over-torque, drop, snap, etc.).
   *
   * @param {string} eventType   'over_torque' | 'drop' | 'snap'
   * @param {string} partId
   * @param {{ isCriticalPath?: boolean, currentBalance?: number }} options
   */
  triggerDamage(eventType, partId, options = {}) {
    return this._detector.registerDamageEvent(eventType, partId, this._restorationId);
  }

  /**
   * Returns the visible prompt data for the UI to render (AC1).
   * @returns {{ state, context, message }|null}
   */
  getPromptData() {
    if (this._prompt.getState() !== 'visible') return null;
    return {
      state:   this._prompt.getState(),
      context: this._prompt.getCurrentContext(),
    };
  }

  /**
   * Player confirms ordering a replacement for the current prompt.
   * Transitions to awaiting_replacement state (AC2).
   */
  playerConfirmsOrder() {
    return this._prompt.confirmOrder();
  }

  /**
   * Player declines the recovery for the current prompt.
   * Restoration enters blocked state (Test Scenario 2).
   */
  playerDeclinesOrder() {
    return this._prompt.declineOrder();
  }

  /**
   * Simulate replacement arrival (for testing and early-game ≤30s scenarios — AC3).
   * @param {string} partId
   */
  simulateReplacementArrival(partId) {
    const order = this._orders.get(partId);
    if (!order) throw new Error(`No order found for partId "${partId}".`);
    order.simulateArrival();
  }

  /**
   * Player installs a replacement part that has arrived (AC4).
   * Returns cost penalty; caller applies it to restoration score.
   *
   * @param {string} partId
   * @returns {{ costPenalty: number, installedAt: number }}
   */
  installReplacement(partId) {
    const order = this._orders.get(partId);
    if (!order) throw new Error(`No order found for partId "${partId}".`);
    if (!order.isReadyToInstall()) {
      throw new Error(`Replacement for part "${partId}" has not arrived yet.`);
    }

    const result = order.install();
    this._totalCostPenalty += result.costPenalty;

    // Clear the broken state on the detector
    this._detector.clearDamage(partId);

    // Re-evaluate restoration state (may become completed if all orders installed)
    this._refreshRestorationState();

    // Persist updated damage state to save state
    this._persistDamageState();

    return result;
  }

  /**
   * Returns the current restoration damage state.
   * @returns {'active'|'awaiting_replacement'|'blocked'|'completed'}
   */
  getRestorationState() {
    return this._state;
  }

  /**
   * Returns all active replacement orders (for UI display in awaiting-replacement state).
   * @returns {Array<{ partId, orderState, cost, delaySecs }>}
   */
  getActiveOrders() {
    const result = [];
    for (const [partId, order] of this._orders) {
      const snap = order.snapshot();
      if (snap.state !== 'installed' && snap.state !== 'cancelled') {
        result.push({ partId, orderState: snap.state, cost: snap.cost, delaySecs: snap.delaySecs });
      }
    }
    return result;
  }

  /**
   * Returns the total accumulated cost penalty across all replacements.
   * @returns {number}
   */
  getTotalCostPenalty() {
    return this._totalCostPenalty;
  }

  /**
   * Returns the visual state of a part (broken / installed / missing) — AC1.
   * @param {string} partId
   * @returns {'broken'|'installed'|'missing'}
   */
  getPartVisualState(partId) {
    return this._detector.getPartState(partId);
  }

  /**
   * Returns a serialisable snapshot of all damage/order state for save/load (#93 compat).
   * @returns {Object}
   */
  snapshotForSave() {
    const orders = {};
    for (const [partId, order] of this._orders) {
      orders[partId] = order.snapshot();
    }
    return {
      restorationDamageState: this._state,
      totalCostPenalty:       this._totalCostPenalty,
      damagedPartIds:         this._detector.getDamagedPartIds(),
      orders,
    };
  }

  /**
   * Dispose all timers (important for test teardown).
   */
  dispose() {
    for (const order of this._orders.values()) {
      order.dispose();
    }
    this._orders.clear();
  }

  // ─── Private handlers ────────────────────────────────────────────────────────

  /** Called by DamageEventDetector when a damage event fires. */
  _handleDamageDetected(damageEvent) {
    const { partId, restorationId, eventType } = damageEvent;

    // Emit telemetry (AC5) — partial payload; playerChoice emitted later on prompt interaction
    this._telemetry.partDamaged(partId, restorationId, eventType);

    // Determine replacement cost for this part (needed for insufficient-funds display)
    const { PartReplacementOrder: PRO, computeReplacementCost } =
      require('./PartReplacementOrder');
    const cost = computeReplacementCost(this._restorationValue, this._restorationNumber);

    const currentBalance = this._saveState.get('player_currency') || 0;
    const isCriticalPath = this._saveState.get(`part_critical_path_${partId}`) || false;

    // Show recovery prompt (AC1: within 1 second — detector fires this synchronously)
    this._prompt.show(damageEvent, {
      isCriticalPath,
      currentBalance,
      replacementCost: cost,
    });

    // Transition to awaiting_replacement if not already blocked
    if (this._state === RESTORATION_DAMAGE_STATE.ACTIVE) {
      this._state = RESTORATION_DAMAGE_STATE.AWAITING_REPLACEMENT;
    }

    // Persist
    this._persistDamageState();
  }

  /** Called when player confirms ordering a replacement. */
  _handleOrderConfirmed(partId, restorationId) {
    // Create the replacement order
    const order = new PartReplacementOrder({
      partId,
      restorationId,
      restorationValue:  this._restorationValue,
      restorationNumber: this._restorationNumber,
      onArrival: (pid, rid) => {
        // Re-persist when order arrives (state change)
        this._persistDamageState();
      },
    });
    this._orders.set(partId, order);

    // Emit telemetry with playerChoice = 'ordered' (AC5)
    this._telemetry.partDamageRecoveryChosen(partId, restorationId, 'ordered');

    // Persist
    this._persistDamageState();

    // Reset prompt (ready for next damage event)
    this._prompt.reset();
  }

  /** Called when player declines the recovery. */
  _handleOrderDeclined(partId, restorationId) {
    // Emit telemetry with playerChoice = 'declined' (AC5)
    this._telemetry.partDamageRecoveryChosen(partId, restorationId, 'declined');

    // Transition to blocked (Test Scenario 2)
    this._state = RESTORATION_DAMAGE_STATE.BLOCKED;

    // Persist
    this._persistDamageState();

    // Reset prompt
    this._prompt.reset();
  }

  /** Re-evaluates the restoration state based on outstanding orders. */
  _refreshRestorationState() {
    if (this._state === RESTORATION_DAMAGE_STATE.BLOCKED) return;

    const activeOrders = this.getActiveOrders();
    if (activeOrders.length === 0 && this._detector.getDamagedPartIds().length === 0) {
      this._state = RESTORATION_DAMAGE_STATE.ACTIVE;
    } else {
      this._state = RESTORATION_DAMAGE_STATE.AWAITING_REPLACEMENT;
    }
  }

  /** Persists the current damage/order snapshot into PlayerSaveState (#93 compatibility). */
  _persistDamageState() {
    const snap = this.snapshotForSave();
    this._saveState.set('damage_recovery_state', snap);
  }
}

module.exports = { DamageRecoveryController, RESTORATION_DAMAGE_STATE };
