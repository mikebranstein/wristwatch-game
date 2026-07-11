/**
 * MovementData — runtime registry of watch movement specifications.
 *
 * Design: Issue #147 (Balance Wheel Animation — Phase 1)
 *
 * Provides watchId → bph lookup for the animation subsystem. The animation
 * logic derives oscillation frequency from this value at runtime; frequency
 * is never hardcoded in the animation code itself (Constraint #4).
 *
 * Pattern: registry populated at game initialisation time; individual modules
 * receive a bphProvider function at construction so they remain decoupled from
 * this module's internals (DI, Constraint #2).
 *
 * Usage:
 *   const { defaultMovementData } = require('../data/MovementData');
 *   const bph = defaultMovementData.getBph(watchId);  // null if unknown
 *
 *   // or inject as a provider function:
 *   const bphProvider = (watchId) => defaultMovementData.getBph(watchId);
 */

'use strict';

class MovementData {
  /**
   * @param {Object} [registry]  Initial registry mapping watchId → { bph: number }.
   */
  constructor(registry = {}) {
    this._registry = Object.assign({}, registry);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the beats-per-hour (bph) for the given watchId.
   * Returns null if the watchId is unknown or bph is invalid (Constraint #4 fail-safe).
   *
   * @param {string} watchId
   * @returns {number|null}
   */
  getBph(watchId) {
    if (!watchId) return null;
    const entry = this._registry[watchId];
    if (!entry || typeof entry.bph !== 'number' || entry.bph <= 0) return null;
    return entry.bph;
  }

  /**
   * Register a movement specification at runtime (e.g. from game level data).
   *
   * @param {string} watchId
   * @param {Object} spec         Movement specification.
   * @param {number} spec.bph     Beats per hour (must be positive).
   */
  register(watchId, { bph }) {
    if (!watchId) throw new Error('MovementData.register: watchId is required.');
    if (typeof bph !== 'number' || bph <= 0) {
      throw new Error(`MovementData.register: bph must be a positive number (got ${bph}).`);
    }
    this._registry[watchId] = { bph };
  }

  /**
   * Returns all registered watchIds.
   * @returns {string[]}
   */
  getRegisteredIds() {
    return Object.keys(this._registry);
  }
}

/**
 * Default movement registry pre-populated with common calibers.
 * The game integration layer can extend this via register() or provide its
 * own MovementData instance injected via bphProvider.
 *
 * NOTE: The registry intentionally stores factual bph data for known calibers;
 * this is the data layer Constraint #4 refers to. What is disallowed is
 * hardcoding frequency (e.g. 4 Hz) directly in animation logic — the
 * animation subsystem always reads bph from this layer and computes frequency
 * at runtime.
 */
const defaultMovementData = new MovementData({
  // ── ETA / Elaboré base calibers ─────────────────────────────────────
  'eta-2824-2': { bph: 28800 },   // 4 Hz — very common Swiss lever
  'eta-7750':   { bph: 28800 },   // 4 Hz — workhorse chronograph
  'eta-6497-1': { bph: 18000 },   // 2.5 Hz — pocket watch / large pilot
  'eta-6498-1': { bph: 18000 },   // 2.5 Hz

  // ── Rolex (Manufacture) ──────────────────────────────────────────────
  'rolex-3135': { bph: 28800 },   // 4 Hz — Datejust, Sub
  'rolex-3235': { bph: 28800 },   // 4 Hz — modern generation

  // ── Seiko (Japanese lever) ──────────────────────────────────────────
  'seiko-nh35': { bph: 21600 },   // 3 Hz — popular automatic
  'seiko-6r15': { bph: 21600 },   // 3 Hz

  // ── Generic test stubs ──────────────────────────────────────────────
  'default':    { bph: 28800 },   // fallback for unit tests / prototyping
});

module.exports = { MovementData, defaultMovementData };
