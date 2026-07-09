/**
 * HintSystem — 3-tier progressive hint ladder for each fault instance.
 *
 * AC2: A player can voluntarily escalate through all 3 hint tiers
 * (nudge → clue → solution) without being forced to view any tier they have
 * not requested.  All 3 tiers are accessible for every diagnosable fault.
 *
 * Design constraints:
 *  - Hint state is keyed by `faultInstanceId` (a unique ID per encounter),
 *    NOT by fault_type_id — this satisfies Scenario 10 (hint ladder resets
 *    for a new instance of a previously-solved fault type).
 *  - Hints are never force-shown; the player must call requestNextHint().
 *  - The hint ladder can be re-read for an already-diagnosed fault (Scenario 8).
 */

const { getHintsForFault } = require('../data/fault-hints');

const HINT_TIERS = [1, 2, 3];
const MAX_TIER = 3;

class HintSystem {
  /**
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   */
  constructor(telemetry) {
    this._telemetry = telemetry;
    // Map<faultInstanceId, { faultTypeId, currentTier, hintsShown }>
    this._instanceState = new Map();
  }

  /**
   * Register a new fault encounter.  Must be called before requestNextHint.
   *
   * @param {string} faultInstanceId — unique per encounter (not per fault type)
   * @param {string} faultTypeId — maps to an entry in FAULT_HINTS
   */
  registerFaultInstance(faultInstanceId, faultTypeId) {
    if (this._instanceState.has(faultInstanceId)) {
      return; // already registered; idempotent
    }
    this._instanceState.set(faultInstanceId, {
      faultTypeId,
      currentTier: 0,   // 0 = no hint requested yet
      hintsShown: [],
    });
  }

  /**
   * Player voluntarily requests the next hint tier.
   * Returns the hint text for that tier, or null if already at max tier.
   * Never called automatically — always player-initiated (AC2).
   *
   * @param {string} faultInstanceId
   * @returns {{ tier: number, text: string }|null}
   */
  requestNextHint(faultInstanceId) {
    const state = this._instanceState.get(faultInstanceId);
    if (!state) {
      throw new Error(`Fault instance "${faultInstanceId}" not registered. Call registerFaultInstance first.`);
    }

    if (state.currentTier >= MAX_TIER) {
      return null; // already at max tier — no more hints
    }

    const nextTier = state.currentTier + 1;
    const hints = getHintsForFault(state.faultTypeId);
    if (!hints) {
      throw new Error(`No authored hints found for fault type "${state.faultTypeId}".`);
    }

    const hintText = hints[`tier${nextTier}`];
    state.currentTier = nextTier;
    state.hintsShown.push(nextTier);

    // Emit the appropriate telemetry event
    switch (nextTier) {
      case 1: this._telemetry.hintTier1Shown(faultInstanceId); break;
      case 2: this._telemetry.hintTier2Shown(faultInstanceId); break;
      case 3: this._telemetry.hintTier3Shown(faultInstanceId); break;
    }

    return { tier: nextTier, text: hintText };
  }

  /**
   * Returns the current hint tier reached for a fault instance (0 = no hints shown).
   * @param {string} faultInstanceId
   * @returns {number}
   */
  getCurrentTier(faultInstanceId) {
    const state = this._instanceState.get(faultInstanceId);
    return state ? state.currentTier : 0;
  }

  /**
   * Returns true when the fault instance has any hint available to show
   * (i.e. not yet at MAX_TIER).
   * @param {string} faultInstanceId
   * @returns {boolean}
   */
  hasMoreHints(faultInstanceId) {
    const state = this._instanceState.get(faultInstanceId);
    if (!state) return false;
    return state.currentTier < MAX_TIER;
  }

  /**
   * Returns the list of tier numbers shown so far for a fault instance.
   * @param {string} faultInstanceId
   * @returns {number[]}
   */
  getHintsShown(faultInstanceId) {
    const state = this._instanceState.get(faultInstanceId);
    return state ? state.hintsShown.slice() : [];
  }

  /**
   * Returns true if the player used any hint for this fault instance.
   * Used by DiagnosisScreen to choose the right telemetry completion event.
   * @param {string} faultInstanceId
   * @returns {boolean}
   */
  wasHintUsed(faultInstanceId) {
    const state = this._instanceState.get(faultInstanceId);
    return state ? state.hintsShown.length > 0 : false;
  }
}

module.exports = { HintSystem, HINT_TIERS, MAX_TIER };
