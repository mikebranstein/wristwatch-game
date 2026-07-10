/**
 * DamageRecoveryController — orchestrates the full damage recovery loop.
 *
 * Issue #148 — In-Repair Part Damage Recovery — Core System
 * Issue #153 — Part Damage Recovery: Severity Tiers (additive pre-step)
 *
 * Wires together:
 *   - DamageEventDetector       (broken visual state + event detection)
 *   - DamageRecoveryPrompt      (recovery prompt UI within 1 second — AC1)
 *   - PartReplacementOrder      (ordering mechanic + awaiting-replacement state — AC2/AC3)
 *   - SeverityTierClassifier    (tier classification pre-step — Issue #153 AC1–AC3)
 *   - TelemetryEmitter          (damage event telemetry — AC5)
 *   - PlayerSaveState           (damage and awaiting-replacement fields — Test Scenario 7)
 *
 * Game state machine (new states alongside existing restoration states):
 *   'active'                — normal restoration in progress
 *   'awaiting_replacement'  — one or more replacement orders outstanding (AC2)
 *   'blocked'               — player declined recovery (Test Scenario 2)
 *   'non_recoverable'       — Extreme Negligence damage; checkpoint/restart required (Issue #153 AC3)
 *   'completed'             — all replacements installed; restoration can complete (AC4)
 *
 * Severity tier routing (Issue #153 — inserted as pre-step, Core System path unchanged):
 *   Minor Slip         → auto-undo within 500ms; brief visual indicator; zero cost/delay (AC1)
 *   Significant Damage → existing Core System replacement ordering path (AC2)
 *   Extreme Negligence → non-recoverable state; checkpoint/restart prompt; no ordering (AC3)
 *
 * Design constraints observed:
 *   - Non-Goal: does NOT modify save/load core logic (#93) — only adds new serialisable fields
 *   - Non-Goal: does NOT implement full Part-Sourcing supplier network (#4) — defers to that feature
 *   - Core System ordering path is UNCHANGED for Significant Damage tier (Issue #153 constraint)
 *   - Severity classifier is OPTIONAL — if not provided, all events route to Significant Damage (backward-compat)
 */

'use strict';

const { DamageEventDetector } = require('./DamageEventDetector');
const { DamageRecoveryPrompt } = require('./DamageRecoveryPrompt');
const { PartReplacementOrder }  = require('./PartReplacementOrder');
const { SEVERITY_TIER }         = require('./SeverityTierClassifier');

const RESTORATION_DAMAGE_STATE = {
  ACTIVE:               'active',
  AWAITING_REPLACEMENT: 'awaiting_replacement',
  BLOCKED:              'blocked',
  NON_RECOVERABLE:      'non_recoverable',  // Issue #153 — Extreme Negligence tier
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
   * @param {Object}   [params.severityClassifier]  SeverityTierClassifier instance (Issue #153).
   *   If omitted, all damage events route to the Significant Damage (Core System) path —
   *   backward-compatible default, also used when telemetry gate is not yet satisfied.
   * @param {Function} [params.onAutoUndo]  Optional callback fired when Minor Slip auto-undo fires.
   *   Signature: onAutoUndo({ partId, restorationId, tier, message, autoUndone, costPenalty })
   */
  constructor({
    telemetryEmitter,
    saveState,
    restorationId,
    restorationValue,
    restorationNumber,
    severityClassifier = null,
    onAutoUndo = null,
  }) {
    if (!telemetryEmitter) throw new Error('telemetryEmitter is required.');
    if (!saveState)        throw new Error('saveState is required.');
    if (!restorationId)    throw new Error('restorationId is required.');

    this._telemetry        = telemetryEmitter;
    this._saveState        = saveState;
    this._restorationId    = restorationId;
    this._restorationValue = restorationValue;
    this._restorationNumber = restorationNumber;
    this._severityClassifier = severityClassifier;  // Issue #153 — optional classifier
    this._onAutoUndo       = onAutoUndo;            // Issue #153 — Minor Slip callback

    this._state     = RESTORATION_DAMAGE_STATE.ACTIVE;
    this._orders    = new Map(); // partId → PartReplacementOrder
    this._totalCostPenalty = 0;
    this._pendingTier = null;   // Issue #153 — stores tier during synchronous event dispatch

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
   * Issue #153: Severity tier classification is inserted as a pre-step before
   * routing to the appropriate recovery handler.
   *
   * @param {string} eventType   'over_torque' | 'drop' | 'snap'
   * @param {string} partId
   * @param {{ isCriticalPath?: boolean, currentBalance?: number,
   *            forceMagnitude?: number, partFragility?: string }} options
   *   forceMagnitude and partFragility are consumed by the severity classifier (Issue #153).
   *   isCriticalPath and currentBalance are used by the Significant Damage prompt (Core System).
   * @returns {{ event: Object, tier: string }}
   */
  triggerDamage(eventType, partId, options = {}) {
    // ── Issue #153: Severity Tier Classification (pre-step) ──────────────────
    const tier = this._classifySeverity(options);

    // Store tier on instance so that the synchronous _handleDamageDetected callback
    // can read it during the registerDamageEvent call below.
    this._pendingTier = tier;
    const event = this._detector.registerDamageEvent(eventType, partId, this._restorationId);
    this._pendingTier = null;

    return { event, tier };
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
   * Extends the Issue #148 snapshot with severity tier state (Issue #153).
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
      // Issue #153: non-recoverable state field (for save/resume — Test Scenario 8)
      isNonRecoverable: this._state === RESTORATION_DAMAGE_STATE.NON_RECOVERABLE,
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

  /**
   * Called by DamageEventDetector when a damage event fires.
   * Issue #153: Routes to tier-specific handler using _pendingTier set by triggerDamage().
   */
  _handleDamageDetected(damageEvent) {
    const tier = this._pendingTier || SEVERITY_TIER.SIGNIFICANT_DAMAGE;

    // ── Issue #153: Route based on severity tier ──────────────────────────────
    if (tier === SEVERITY_TIER.MINOR_SLIP) {
      this._handleMinorSlip(damageEvent);
      return;
    }
    if (tier === SEVERITY_TIER.EXTREME_NEGLIGENCE) {
      this._handleExtremeNegligence(damageEvent);
      return;
    }

    // ── Significant Damage → unchanged Core System path ───────────────────────
    this._handleSignificantDamage(damageEvent);
  }

  /**
   * Issue #153 — AC1: Minor Slip handler.
   *
   * Auto-undoes the damage within 500ms (synchronous = immediate),
   * shows a brief non-punishing visual indicator, and applies zero cost/delay.
   * Restoration remains in 'active' state — no interruption to player flow.
   *
   * @param {{ partId, restorationId, eventType }} damageEvent
   */
  _handleMinorSlip(damageEvent) {
    const { partId, restorationId, eventType } = damageEvent;

    // Emit telemetry with tier_classification (AC5)
    this._telemetry.partDamaged(partId, restorationId, eventType, SEVERITY_TIER.MINOR_SLIP);

    // Auto-undo: clear broken state immediately (synchronous = within 500ms — AC1)
    this._detector.clearDamage(partId);

    // State remains 'active' (zero cost, zero delay — AC1)
    // No state transition needed.

    // Persist
    this._persistDamageState();

    // Fire auto-undo callback (for UI to render brief visual indicator — AC1)
    const result = {
      tier:        SEVERITY_TIER.MINOR_SLIP,
      partId,
      restorationId,
      message:     'Careful — adjusted',   // Non-punishing indicator text (AC1)
      autoUndone:  true,
      costPenalty: 0,
    };
    if (typeof this._onAutoUndo === 'function') {
      this._onAutoUndo(result);
    }

    return result;
  }

  /**
   * Issue #153 — AC3: Extreme Negligence handler.
   *
   * Applies non-recoverable damage state. Shows on-screen explanation.
   * Does NOT present replacement ordering option — player must use checkpoint/restart.
   * Persists non-recoverable state so it survives save/resume (Test Scenario 8).
   *
   * @param {{ partId, restorationId, eventType }} damageEvent
   */
  _handleExtremeNegligence(damageEvent) {
    const { partId, restorationId, eventType } = damageEvent;

    // Emit telemetry with tier_classification (AC5)
    this._telemetry.partDamaged(partId, restorationId, eventType, SEVERITY_TIER.EXTREME_NEGLIGENCE);

    // Apply non-recoverable state (AC3)
    this._state = RESTORATION_DAMAGE_STATE.NON_RECOVERABLE;

    // Show non-recoverable screen (no replacement option — AC3)
    this._prompt.showNonRecoverable(damageEvent);

    // Persist (ensures non-recoverable survives save/resume — Test Scenario 8)
    this._persistDamageState();
  }

  /**
   * Significant Damage handler — unchanged Core System path (Issue #148).
   * Issue #153 constraint: this method must NOT be modified.
   * Called by _handleDamageDetected when tier === SIGNIFICANT_DAMAGE.
   *
   * @param {{ partId, restorationId, eventType }} damageEvent
   */
  _handleSignificantDamage(damageEvent) {
    const { partId, restorationId, eventType } = damageEvent;

    // Emit telemetry (AC5) — partial payload; playerChoice emitted later on prompt interaction
    // Issue #153: includes tier_classification = 'significant_damage'
    this._telemetry.partDamaged(partId, restorationId, eventType, SEVERITY_TIER.SIGNIFICANT_DAMAGE);

    // Determine replacement cost for this part (needed for insufficient-funds display)
    const { computeReplacementCost } = require('./PartReplacementOrder');
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
    // Non-recoverable state is terminal — never downgrade from NON_RECOVERABLE (Issue #153 AC3)
    if (this._state === RESTORATION_DAMAGE_STATE.NON_RECOVERABLE) return;
    if (this._state === RESTORATION_DAMAGE_STATE.BLOCKED) return;

    const activeOrders = this.getActiveOrders();
    if (activeOrders.length === 0 && this._detector.getDamagedPartIds().length === 0) {
      this._state = RESTORATION_DAMAGE_STATE.ACTIVE;
    } else {
      this._state = RESTORATION_DAMAGE_STATE.AWAITING_REPLACEMENT;
    }
  }

  /**
   * Issue #153: Classifies damage event severity using the injected classifier.
   * Falls back to SIGNIFICANT_DAMAGE when no classifier is provided (backward-compatible).
   *
   * @param {{ forceMagnitude?: number, partFragility?: string }} options
   * @returns {'minor_slip'|'significant_damage'|'extreme_negligence'}
   */
  _classifySeverity(options = {}) {
    if (!this._severityClassifier) {
      // No classifier supplied — route all events to Significant Damage (Core System path)
      return SEVERITY_TIER.SIGNIFICANT_DAMAGE;
    }
    const forceMagnitude  = typeof options.forceMagnitude  === 'number' ? options.forceMagnitude  : 0;
    const partFragility   = options.partFragility || 'normal';
    return this._severityClassifier.classify({ forceMagnitude, partFragility });
  }

  /** Persists the current damage/order snapshot into PlayerSaveState (#93 compatibility). */
  _persistDamageState() {
    const snap = this.snapshotForSave();
    this._saveState.set('damage_recovery_state', snap);
    // Issue #153: persist non-recoverable state separately for explicit circumvention guard
    // (Test Scenario 8 — reloading an auto-save must not clear non-recoverable state)
    if (this._state === RESTORATION_DAMAGE_STATE.NON_RECOVERABLE) {
      this._saveState.set('severity_tier_state', { isNonRecoverable: true, restorationId: this._restorationId });
    }
  }
}

module.exports = { DamageRecoveryController, RESTORATION_DAMAGE_STATE };
