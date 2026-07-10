/**
 * PartReplacementOrder — models a replacement part order in the awaiting-replacement state.
 *
 * Issue #148 — In-Repair Part Damage Recovery — Core System
 *
 * AC2: A replacement order is confirmed, the restoration enters awaiting-replacement state,
 *      and all other valid restoration actions remain available while waiting.
 * AC3: For the first 3 restorations (early-game), cost is ≤5% of restoration value
 *      and delay is ≤30 seconds real time.
 * AC4: On successful installation, the restoration completes normally with cost penalty applied.
 *
 * Design constraint: UI patterns must coordinate with Part-Sourcing (#4) supplier workflow.
 * This class models the order state — it does NOT implement the full Part-Sourcing supplier
 * network (Non-Goal: Full Part-Sourcing supplier network UI).
 */

'use strict';

const ORDER_STATE = {
  PENDING:   'pending',    // order placed; awaiting arrival
  ARRIVED:   'arrived',    // replacement has arrived; ready to install
  INSTALLED: 'installed',  // player has installed the replacement
  CANCELLED: 'cancelled',  // order was cancelled (e.g. player declined after ordering)
};

/**
 * Computes the early-game replacement cost for a restoration.
 * For the first 3 restorations: cost ≤ 5% of restoration value (AC3).
 *
 * @param {number} restorationValue   Total value of the restoration job
 * @param {number} restorationNumber  1-based restoration index (1 = first ever)
 * @returns {number}  Cost in game currency units (floored to integer)
 */
function computeReplacementCost(restorationValue, restorationNumber) {
  if (restorationNumber <= 3) {
    // Early-game: capped at 5% (AC3)
    return Math.floor(restorationValue * 0.05);
  }
  // Post-early-game: standard cost (Phase 2 will calibrate this per severity tier).
  // Default: 15% of restoration value — intentionally visible consequence.
  return Math.floor(restorationValue * 0.15);
}

/**
 * Computes the early-game replacement delay in seconds.
 * For the first 3 restorations: delay ≤ 30 seconds (AC3).
 *
 * @param {number} restorationNumber  1-based restoration index
 * @returns {number}  Delay in seconds
 */
function computeReplacementDelaySecs(restorationNumber) {
  if (restorationNumber <= 3) {
    // Early-game: near-instant (AC3) — 15 seconds
    return 15;
  }
  // Post-early-game: 120 seconds (Phase 2 calibrates for rare/late-game parts)
  return 120;
}

class PartReplacementOrder {
  /**
   * @param {Object} params
   * @param {string} params.partId
   * @param {string} params.restorationId
   * @param {number} params.restorationValue        Total value of the restoration job
   * @param {number} params.restorationNumber       1-based restoration index (for early-game calibration)
   * @param {Function} [params.onArrival]           Optional callback fired when the order arrives
   */
  constructor({ partId, restorationId, restorationValue, restorationNumber, onArrival }) {
    if (!partId || !restorationId) {
      throw new Error('PartReplacementOrder requires partId and restorationId.');
    }
    if (typeof restorationValue !== 'number' || restorationValue < 0) {
      throw new Error('restorationValue must be a non-negative number.');
    }
    if (typeof restorationNumber !== 'number' || restorationNumber < 1) {
      throw new Error('restorationNumber must be a positive integer.');
    }

    this.partId = partId;
    this.restorationId = restorationId;
    this.restorationNumber = restorationNumber;
    this.restorationValue = restorationValue;

    this.cost = computeReplacementCost(restorationValue, restorationNumber);
    this.delaySecs = computeReplacementDelaySecs(restorationNumber);

    this._state = ORDER_STATE.PENDING;
    this._orderedAt = Date.now();
    this._arrivedAt = null;
    this._installedAt = null;
    this._onArrival = onArrival || null;

    // Schedule arrival
    this._arrivalTimer = null;
    this._scheduleArrival();
  }

  /**
   * Returns the current order state.
   * @returns {'pending'|'arrived'|'installed'|'cancelled'}
   */
  getState() {
    return this._state;
  }

  /**
   * Returns true when the replacement is ready to be installed.
   * @returns {boolean}
   */
  isReadyToInstall() {
    return this._state === ORDER_STATE.ARRIVED;
  }

  /**
   * Marks the replacement as installed by the player (AC4).
   * Returns the cost penalty that should be applied to the restoration score.
   *
   * @returns {{ costPenalty: number, installedAt: number }}
   * @throws {Error} if order is not in ARRIVED state
   */
  install() {
    if (this._state !== ORDER_STATE.ARRIVED) {
      throw new Error(
        `Cannot install: order is in state "${this._state}". Must be "arrived".`
      );
    }
    this._state = ORDER_STATE.INSTALLED;
    this._installedAt = Date.now();
    return {
      costPenalty: this.cost,
      installedAt: this._installedAt,
    };
  }

  /**
   * Simulates immediate arrival (used in tests and for early-game ≤30s path).
   * In production, the server/game-loop fires this after `delaySecs`.
   */
  simulateArrival() {
    if (this._state !== ORDER_STATE.PENDING) return;
    this._clearTimer();
    this._markArrived();
  }

  /**
   * Returns a serialisable snapshot of this order for save/load (AC7 / #93 compatibility).
   * @returns {Object}
   */
  snapshot() {
    return {
      partId:            this.partId,
      restorationId:     this.restorationId,
      restorationNumber: this.restorationNumber,
      restorationValue:  this.restorationValue,
      cost:              this.cost,
      delaySecs:         this.delaySecs,
      state:             this._state,
      orderedAt:         this._orderedAt,
      arrivedAt:         this._arrivedAt,
      installedAt:       this._installedAt,
    };
  }

  /**
   * Restores an order from a saved snapshot (AC7 / #93 checkpoint compatibility).
   * The caller must wire the `onArrival` callback after restoration.
   *
   * @param {Object} snap  — from snapshot()
   * @param {Function} [onArrival]
   * @returns {PartReplacementOrder}
   */
  static fromSnapshot(snap, onArrival) {
    const order = new PartReplacementOrder({
      partId:            snap.partId,
      restorationId:     snap.restorationId,
      restorationValue:  snap.restorationValue,
      restorationNumber: snap.restorationNumber,
      onArrival,
    });
    // Override timer-computed values with saved state
    order._state      = snap.state;
    order._orderedAt  = snap.orderedAt;
    order._arrivedAt  = snap.arrivedAt;
    order._installedAt = snap.installedAt;
    // Re-schedule arrival only if still pending
    order._clearTimer();
    if (snap.state === ORDER_STATE.PENDING) {
      const elapsed    = (Date.now() - snap.orderedAt) / 1000;
      const remaining  = Math.max(0, snap.delaySecs - elapsed);
      order._scheduleArrival(remaining);
    }
    return order;
  }

  /** @private */
  _scheduleArrival(delaySecs = this.delaySecs) {
    this._clearTimer();
    this._arrivalTimer = setTimeout(() => {
      this._markArrived();
    }, delaySecs * 1000);
  }

  /** @private */
  _markArrived() {
    if (this._state !== ORDER_STATE.PENDING) return;
    this._state = ORDER_STATE.ARRIVED;
    this._arrivedAt = Date.now();
    if (typeof this._onArrival === 'function') {
      this._onArrival(this.partId, this.restorationId);
    }
  }

  /** @private */
  _clearTimer() {
    if (this._arrivalTimer !== null) {
      clearTimeout(this._arrivalTimer);
      this._arrivalTimer = null;
    }
  }

  /**
   * Dispose — clear the internal timer (important for test teardown).
   */
  dispose() {
    this._clearTimer();
  }
}

module.exports = {
  PartReplacementOrder,
  ORDER_STATE,
  computeReplacementCost,
  computeReplacementDelaySecs,
};
