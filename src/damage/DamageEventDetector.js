/**
 * DamageEventDetector — detects part damage events during restoration.
 *
 * Issue #148 — In-Repair Part Damage Recovery — Core System
 *
 * AC1: When a part damage event triggers (over-torque, drop, etc.), the part
 * is placed into a distinct broken/damaged visual state and a recovery prompt
 * appears within 1 second.
 *
 * Supported damage event types:
 *   'over_torque'  — screw/crown over-tightened
 *   'drop'         — part physically dropped
 *   'snap'         — delicate component snapped under stress
 *
 * Usage:
 *   const detector = new DamageEventDetector(onDamageCallback);
 *   detector.registerDamageEvent('over_torque', partId, restorationId);
 */

'use strict';

const DAMAGE_EVENT_TYPES = {
  OVER_TORQUE: 'over_torque',
  DROP:        'drop',
  SNAP:        'snap',
};

class DamageEventDetector {
  /**
   * @param {Function} onDamage  Callback invoked when a damage event fires.
   *   Signature: onDamage({ partId, restorationId, eventType, timestamp })
   */
  constructor(onDamage) {
    if (typeof onDamage !== 'function') {
      throw new Error('DamageEventDetector requires an onDamage callback function.');
    }
    this._onDamage = onDamage;
    this._damagedParts = new Map(); // partId → { eventType, restorationId, timestamp }
  }

  /**
   * Register a damage event for a part. Transitions the part into broken state
   * and fires the onDamage callback (which in turn shows the recovery prompt
   * within the 1-second SLA — AC1).
   *
   * @param {string} eventType      One of DAMAGE_EVENT_TYPES values
   * @param {string} partId         Unique part identifier
   * @param {string} restorationId  Unique restoration session identifier
   * @returns {{ partId, restorationId, eventType, timestamp }}
   */
  registerDamageEvent(eventType, partId, restorationId) {
    if (!Object.values(DAMAGE_EVENT_TYPES).includes(eventType)) {
      throw new Error(`Unknown damage event type: "${eventType}". ` +
        `Valid types: ${Object.values(DAMAGE_EVENT_TYPES).join(', ')}`);
    }
    if (!partId || typeof partId !== 'string') {
      throw new Error('partId must be a non-empty string.');
    }
    if (!restorationId || typeof restorationId !== 'string') {
      throw new Error('restorationId must be a non-empty string.');
    }

    const event = {
      partId,
      restorationId,
      eventType,
      timestamp: Date.now(),
    };

    // Mark the part as damaged (broken visual state — AC1)
    this._damagedParts.set(partId, {
      state: 'broken',
      eventType,
      restorationId,
      timestamp: event.timestamp,
    });

    // Invoke callback — the controller wires this to the recovery prompt display
    // so the prompt appears within 1 second (AC1).
    this._onDamage(event);

    return event;
  }

  /**
   * Returns the visual state of a part.
   * AC1: broken state must be clearly distinct from 'missing' and 'installed'.
   *
   * @param {string} partId
   * @returns {'broken'|'installed'|'missing'}
   */
  getPartState(partId) {
    const record = this._damagedParts.get(partId);
    if (record) return record.state;
    return 'installed'; // default — undamaged parts are considered installed
  }

  /**
   * Returns true when the part has been damaged (broken state).
   * @param {string} partId
   * @returns {boolean}
   */
  isPartDamaged(partId) {
    return this._damagedParts.has(partId);
  }

  /**
   * Returns the damage record for a part, or null if undamaged.
   * @param {string} partId
   * @returns {{ state, eventType, restorationId, timestamp }|null}
   */
  getDamageRecord(partId) {
    return this._damagedParts.get(partId) || null;
  }

  /**
   * Returns all currently damaged part IDs (for multi-damage scenarios — AC4).
   * @returns {string[]}
   */
  getDamagedPartIds() {
    return Array.from(this._damagedParts.keys());
  }

  /**
   * Clears a part's broken state after a replacement has been successfully installed.
   * Called by DamageRecoveryController once a replacement is installed.
   *
   * @param {string} partId
   */
  clearDamage(partId) {
    this._damagedParts.delete(partId);
  }
}

module.exports = { DamageEventDetector, DAMAGE_EVENT_TYPES };
