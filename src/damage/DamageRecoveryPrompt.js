/**
 * DamageRecoveryPrompt — recovery prompt UI controller.
 *
 * Issue #148 — In-Repair Part Damage Recovery — Core System
 *
 * AC1: A contextual recovery prompt appears within 1 second of a damage event.
 * AC2: When the player orders a replacement, the restoration enters awaiting-replacement
 *      state and all other valid restoration actions remain available.
 *
 * Design constraint: built on the existing hint/tooltip framework (TooltipSystem
 * pattern) — no new UI infrastructure introduced (Non-Goal: Tutorial system rework).
 *
 * Non-punishing tone: all copy uses "This part needs replacing" framing, never
 * "You failed."
 *
 * Coordinates with Part-Sourcing (#4) UI patterns: the ordering interaction
 * surface (confirmOrder / declineOrder) is designed to plug into the Part-Sourcing
 * supplier workflow without creating duplicate UX flows.
 */

'use strict';

const PROMPT_STATE = {
  HIDDEN:    'hidden',
  VISIBLE:   'visible',
  DISMISSED: 'dismissed',
};

const PLAYER_CHOICE = {
  ORDERED:  'ordered',
  DECLINED: 'declined',
};

class DamageRecoveryPrompt {
  /**
   * @param {{ onOrder: Function, onDecline: Function }} handlers
   *   onOrder(partId, restorationId)  — called when player confirms ordering a replacement
   *   onDecline(partId, restorationId) — called when player declines the recovery
   */
  constructor({ onOrder, onDecline } = {}) {
    if (typeof onOrder !== 'function') {
      throw new Error('DamageRecoveryPrompt requires an onOrder handler.');
    }
    if (typeof onDecline !== 'function') {
      throw new Error('DamageRecoveryPrompt requires an onDecline handler.');
    }
    this._onOrder = onOrder;
    this._onDecline = onDecline;
    this._state = PROMPT_STATE.HIDDEN;
    this._currentContext = null; // { partId, restorationId, eventType, shownAt }
  }

  /**
   * Display the recovery prompt for a damaged part (AC1: must be called within
   * 1 second of the damage event — the caller, DamageRecoveryController, is
   * responsible for the timing contract).
   *
   * @param {{ partId: string, restorationId: string, eventType: string }} damageEvent
   * @param {{ isCriticalPath: boolean, currentBalance: number, replacementCost: number }} options
   */
  show(damageEvent, options = {}) {
    const { partId, restorationId, eventType } = damageEvent;

    this._currentContext = {
      partId,
      restorationId,
      eventType,
      shownAt: Date.now(),
      isCriticalPath: options.isCriticalPath || false,
      currentBalance: options.currentBalance !== undefined ? options.currentBalance : null,
      replacementCost: options.replacementCost !== undefined ? options.replacementCost : null,
    };
    this._state = PROMPT_STATE.VISIBLE;

    return {
      state: this._state,
      context: Object.assign({}, this._currentContext),
      message: this._buildPromptMessage(this._currentContext),
    };
  }

  /**
   * Player confirms ordering a replacement (AC2: enters awaiting-replacement state).
   * @returns {{ choice: string, partId: string, restorationId: string }}
   */
  confirmOrder() {
    if (this._state !== PROMPT_STATE.VISIBLE) {
      throw new Error('Cannot confirm order: prompt is not currently visible.');
    }
    const { partId, restorationId } = this._currentContext;
    this._state = PROMPT_STATE.DISMISSED;
    this._onOrder(partId, restorationId);
    return { choice: PLAYER_CHOICE.ORDERED, partId, restorationId };
  }

  /**
   * Player declines the recovery (Test Scenario 2: recovery is opt-in, not mandatory).
   * Restoration enters blocked/failed state consistent with current behavior.
   * @returns {{ choice: string, partId: string, restorationId: string }}
   */
  declineOrder() {
    if (this._state !== PROMPT_STATE.VISIBLE) {
      throw new Error('Cannot decline order: prompt is not currently visible.');
    }
    const { partId, restorationId } = this._currentContext;
    this._state = PROMPT_STATE.DISMISSED;
    this._onDecline(partId, restorationId);
    return { choice: PLAYER_CHOICE.DECLINED, partId, restorationId };
  }

  /**
   * Returns the current prompt display state.
   * @returns {'hidden'|'visible'|'dismissed'}
   */
  getState() {
    return this._state;
  }

  /**
   * Returns the currently displayed context (or null when hidden/dismissed).
   * @returns {Object|null}
   */
  getCurrentContext() {
    return this._currentContext ? Object.assign({}, this._currentContext) : null;
  }

  /**
   * Resets the prompt to hidden state (for next damage event).
   */
  reset() {
    this._state = PROMPT_STATE.HIDDEN;
    this._currentContext = null;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Builds the non-punishing user-facing prompt message (AC1 tone requirement).
   * Also handles the insufficient-funds edge case (AC of Test Scenario 9).
   *
   * @param {Object} context
   * @returns {{ title: string, body: string, canAfford: boolean }}
   */
  _buildPromptMessage(context) {
    const { isCriticalPath, currentBalance, replacementCost } = context;

    const canAfford = (currentBalance === null || replacementCost === null)
      ? true
      : currentBalance >= replacementCost;

    const title = 'This part needs replacing';
    let body = 'No problem — a replacement can be ordered while you continue your work.';

    if (isCriticalPath) {
      body = 'This part is required to proceed. Order a replacement to continue.';
    }

    // Insufficient-funds warning (Test Scenario 9): show balance and acquisition path
    if (!canAfford) {
      body = `You need ${replacementCost} coins to order a replacement ` +
        `(current balance: ${currentBalance}). ` +
        `Complete other restorations or sell spare parts to acquire more funds.`;
    }

    return { title, body, canAfford };
  }
}

module.exports = { DamageRecoveryPrompt, PROMPT_STATE, PLAYER_CHOICE };
