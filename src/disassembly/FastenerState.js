/**
 * FastenerState — enum and disassembly flow branching for Rust-Fused Fasteners damage state.
 *
 * Issue #84: Phase 2 — Rust-Fused Fasteners mechanical complexity.
 *
 * Design contract (from design decision):
 *   - FastenerState enum: standard | fused | treated | extracted
 *   - If any fastener is 'fused', standard case-back removal is BLOCKED.
 *   - A contextual cue is surfaced — no silent failure (AC2 enforced at interaction layer).
 *   - Penetrant applicator transitions: fused → treated
 *   - Fastener extractor transitions: treated → extracted
 *   - First-encounter contextual hint: one-shot (uses PlayerSaveState flag).
 *   - No-softlock guarantee (AC5 / Test Scenario 5):
 *       - Player attempting to skip penetrant and force extraction surfaces a soft warning.
 *       - Player can return, apply penetrant, then extract — full path always remains open.
 *
 * Usage:
 *   const flow = new DisassemblyFlow();
 *   const can = flow.canRemoveFastener(FastenerState.FUSED);     // false
 *   const next = flow.applyPenetrant(FastenerState.FUSED);       // 'treated'
 *   const done = flow.applyExtractor(FastenerState.TREATED);     // { newState: 'extracted', warning: null }
 */

'use strict';

/**
 * FastenerState enum values.
 * Transition rules:
 *   standard  — can be removed normally (standard disassembly)
 *   fused     — removal BLOCKED; apply penetrant first
 *   treated   — penetrant applied; use extractor tool to extract
 *   extracted — fastener removed; requires replacement on reassembly
 *
 * @enum {string}
 */
const FastenerState = Object.freeze({
  STANDARD:  'standard',
  FUSED:     'fused',
  TREATED:   'treated',
  EXTRACTED: 'extracted',
});

/** Valid FastenerState values (for validation). */
const VALID_FASTENER_STATES = Object.values(FastenerState);

class DisassemblyFlow {
  // ──────────────────────────────────────────────────────────────────────────
  // State transition queries
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns true when the fastener can be removed via standard disassembly.
   * Only STANDARD and EXTRACTED fasteners are not blocking.
   *
   * @param {string} fastenerState — FastenerState value
   * @returns {boolean}
   */
  canRemoveFastener(fastenerState) {
    return fastenerState === FastenerState.STANDARD ||
           fastenerState === FastenerState.EXTRACTED;
  }

  /**
   * Returns true when ANY fastener in the map is blocking standard disassembly.
   *
   * @param {Object.<string, string>} fastenerMap — map of fastenerId → FastenerState
   * @returns {boolean}
   */
  isDisassemblyBlocked(fastenerMap) {
    return Object.values(fastenerMap).some(
      state => !this.canRemoveFastener(state)
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // State transitions
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Apply penetrant applicator to a fused fastener.
   * Transitions: FUSED → TREATED.
   * Returns unchanged state for any other input.
   *
   * @param {string} fastenerState
   * @returns {string} — new FastenerState
   */
  applyPenetrant(fastenerState) {
    if (fastenerState === FastenerState.FUSED) {
      return FastenerState.TREATED;
    }
    return fastenerState; // no-op for standard / treated / extracted
  }

  /**
   * Apply extractor tool to a treated fastener.
   * Transitions: TREATED → EXTRACTED.
   * Returns unchanged state for any other input, with a soft warning if FUSED
   * (player tried to skip penetrant — no-softlock guarantee: action is blocked,
   * warning shown, penetrant path remains open).
   *
   * @param {string} fastenerState
   * @returns {{ newState: string, warning: string|null }}
   */
  applyExtractor(fastenerState) {
    if (fastenerState === FastenerState.TREATED) {
      return { newState: FastenerState.EXTRACTED, warning: null };
    }
    if (fastenerState === FastenerState.FUSED) {
      // No-softlock: warn and leave in FUSED so the player can apply penetrant and retry.
      return {
        newState: FastenerState.FUSED,
        warning:
          'The fastener extractor cannot grip a corroded head. ' +
          'Apply penetrant first to loosen the rust bond, then use the extractor.',
      };
    }
    // STANDARD or EXTRACTED: no-op
    return { newState: fastenerState, warning: null };
  }

  /**
   * Apply a batch of state transitions to a fastener map.
   * Returns a new map with all FUSED fasteners transitioned to TREATED.
   *
   * @param {Object.<string, string>} fastenerMap
   * @returns {Object.<string, string>} — updated fastener map
   */
  applyPenetrantToAll(fastenerMap) {
    const updated = {};
    for (const [id, state] of Object.entries(fastenerMap)) {
      updated[id] = this.applyPenetrant(state);
    }
    return updated;
  }

  /**
   * Apply extractor to all TREATED fasteners in a map.
   * Returns { updatedMap, warnings }.
   *
   * @param {Object.<string, string>} fastenerMap
   * @returns {{ updatedMap: Object.<string, string>, warnings: string[] }}
   */
  applyExtractorToAll(fastenerMap) {
    const updatedMap = {};
    const warnings = [];
    for (const [id, state] of Object.entries(fastenerMap)) {
      const { newState, warning } = this.applyExtractor(state);
      updatedMap[id] = newState;
      if (warning) warnings.push(`Fastener '${id}': ${warning}`);
    }
    return { updatedMap, warnings };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Contextual cue generation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the contextual cue message to surface when standard disassembly is
   * blocked by fused fasteners. Returns null if no fasteners are blocking.
   *
   * AC2: "the game surfaces a contextual cue indicating specialised extraction is required"
   *
   * @param {Object.<string, string>} fastenerMap — map of fastenerId → FastenerState
   * @returns {string|null}
   */
  getBlockedDisassemblyCue(fastenerMap) {
    const fuseCount = Object.values(fastenerMap).filter(
      s => s === FastenerState.FUSED
    ).length;

    if (fuseCount === 0) return null;

    return (
      `Standard case removal blocked: ${fuseCount} fastener${fuseCount !== 1 ? 's' : ''} ` +
      `${fuseCount !== 1 ? 'are' : 'is'} rust-fused. ` +
      `Apply penetrant to corroded fasteners before attempting extraction.`
    );
  }

  /**
   * Returns true when all fasteners in the map are in EXTRACTED or STANDARD state
   * (i.e., disassembly can now proceed to the standard path).
   *
   * @param {Object.<string, string>} fastenerMap
   * @returns {boolean}
   */
  areAllFastenersCleared(fastenerMap) {
    return Object.values(fastenerMap).every(s => this.canRemoveFastener(s));
  }

  /**
   * Returns IDs of fasteners still in FUSED or TREATED state
   * (i.e., not yet fully extracted).
   *
   * @param {Object.<string, string>} fastenerMap
   * @returns {string[]}
   */
  getPendingFastenerIds(fastenerMap) {
    return Object.entries(fastenerMap)
      .filter(([, state]) => state === FastenerState.FUSED || state === FastenerState.TREATED)
      .map(([id]) => id);
  }

  /**
   * Validates that a fastener state string is a known FastenerState value.
   * Throws for unknown values (defensive guard for save-data deserialisation).
   *
   * @param {string} stateStr
   * @returns {string} — validated FastenerState
   */
  validateFastenerState(stateStr) {
    if (!VALID_FASTENER_STATES.includes(stateStr)) {
      throw new Error(
        `FastenerState: unknown state '${stateStr}'. ` +
        `Valid values: ${VALID_FASTENER_STATES.join(', ')}.`
      );
    }
    return stateStr;
  }
}

module.exports = { FastenerState, DisassemblyFlow, VALID_FASTENER_STATES };
