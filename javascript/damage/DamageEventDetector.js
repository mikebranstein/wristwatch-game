/**
 * DamageEventDetector — detects part damage events during restoration.
 *
 * Issue #148 — In-Repair Part Damage Recovery — Core System
 *
 * AC1: When a part damage event triggers (over-torque, drop, etc.), the part
 * is placed into a distinct broken/damaged visual state and a recovery prompt
 * appears within 1 second.
 *
 * Issue #295 — Wrong-Tool Consequence System Phase 1
 * Adds 'wrong_tool' damage event type and optional severity parameter to
 * registerDamageEvent() so Phase 1 can produce 'degraded' (not 'broken') state.
 *
 * Supported damage event types:
 *   'over_torque'  — screw/crown over-tightened
 *   'drop'         — part physically dropped
 *   'snap'         — delicate component snapped under stress
 *   'wrong_tool'   — wrong tool used on a Phase 1 targeted operation (Issue #295)
 *
 * Usage:
 *   const detector = new DamageEventDetector(onDamageCallback);
 *   detector.registerDamageEvent('over_torque', partId, restorationId);
 *   detector.registerDamageEvent('wrong_tool', partId, restorationId, 'degraded', { operationId, toolId, failureMessage });
 */

'use strict';

const DAMAGE_EVENT_TYPES = {
  OVER_TORQUE: 'over_torque',
  DROP:        'drop',
  SNAP:        'snap',
  // Issue #295 — Wrong-Tool Consequence System Phase 1
  // Produces 'degraded' state only; 'broken' states remain for over_torque/drop/snap.
  WRONG_TOOL:  'wrong_tool',
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
   * Register a damage event for a part. Transitions the part into the specified
   * damage state ('broken' by default; 'degraded' for wrong_tool Phase 1 events)
   * and fires the onDamage callback (which in turn shows the recovery prompt
   * within the 1-second SLA — AC1).
   *
   * Issue #295: added optional `severity` ('broken'|'degraded', default 'broken') and
   * optional `context` object for additional payload fields (e.g. operationId, toolId,
   * failureMessage) forwarded on the event for the recovery prompt.
   *
   * Guard (Issue #295 Test Scenario 5): if the part is already in a degraded state
   * and a second wrong_tool attempt fires before recovery, skip state mutation to
   * prevent double-degrade anomalies — the onDamage callback is still invoked so
   * the recovery prompt can re-surface.
   *
   * @param {string} eventType      One of DAMAGE_EVENT_TYPES values
   * @param {string} partId         Unique part identifier
   * @param {string} restorationId  Unique restoration session identifier
   * @param {'broken'|'degraded'} [severity='broken']  Damage severity (Issue #295)
   * @param {Object} [context={}]   Additional event context (operationId, toolId, failureMessage)
   * @returns {{ partId, restorationId, eventType, severity, timestamp, ...context }}
   */
  registerDamageEvent(eventType, partId, restorationId, severity = 'broken', context = {}) {
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
    if (severity !== 'broken' && severity !== 'degraded') {
      throw new Error(`Unknown severity: "${severity}". Valid values: 'broken', 'degraded'.`);
    }

    const event = {
      partId,
      restorationId,
      eventType,
      severity,
      timestamp: Date.now(),
      ...context,
    };

    // Guard: if already damaged, skip state mutation to prevent double-degrade (Issue #295 TS5).
    // Re-fire the callback so the recovery prompt can re-surface for the player.
    if (this._damagedParts.has(partId)) {
      this._onDamage(event);
      return event;
    }

    // Mark the part as damaged in the requested severity state (AC1 / Issue #295 AC1)
    this._damagedParts.set(partId, {
      state: severity,
      eventType,
      restorationId,
      timestamp: event.timestamp,
      ...context,
    });

    // Invoke callback — the controller wires this to the recovery prompt display
    // so the prompt appears within 1 second (AC1).
    this._onDamage(event);

    return event;
  }

  /**
   * Returns the visual state of a part.
   * AC1: broken state must be clearly distinct from 'missing' and 'installed'.
   * Issue #295: 'degraded' is an additional distinct state for wrong_tool Phase 1 events.
   *
   * @param {string} partId
   * @returns {'broken'|'degraded'|'installed'|'missing'}
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
