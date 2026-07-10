/**
 * ComponentPositionValidator — snap-to-position completeness validator for Shock Damage repair.
 *
 * Issue #84: Phase 2 — Shock Damage spatial UI system.
 *
 * Design contract (from design decision):
 *   - Each component has a canonical target zone.
 *   - Placement within a configurable tolerance counts as "repositioned".
 *   - Tolerance is per-component, not pixel-perfect (satisfying vs. frustrating).
 *   - Orientation (rotation) is also validated within a configurable angle tolerance.
 *   - Blocked reassembly surfaces an incomplete-repair warning (no-softlock guarantee — AC6).
 *
 * Usage:
 *   const validator = new ComponentPositionValidator();
 *   const ok = validator.isComponentRepositioned('balance_wheel', currentPos, canonicalPos);
 *   const allDone = validator.areAllComponentsRepositioned(componentStates, canonicalPositions);
 */

'use strict';

/**
 * Default per-component position and rotation tolerances.
 * All values in game units (position) and degrees (rotation).
 *
 * Design intent: tolerances are intentionally generous so repositioning feels
 * "snap-satisfying" rather than "pixel-hunt frustrating".
 */
const DEFAULT_COMPONENT_TOLERANCES = {
  balance_wheel:  { position_tolerance: 18, rotation_tolerance: 15 },
  pallet_fork:    { position_tolerance: 16, rotation_tolerance: 12 },
  balance_cock:   { position_tolerance: 18, rotation_tolerance: 15 },
  escape_wheel:   { position_tolerance: 16, rotation_tolerance: 12 },
  hour_hand:      { position_tolerance: 10, rotation_tolerance:  8 },   // hands: tighter tolerance
  minute_hand:    { position_tolerance: 10, rotation_tolerance:  8 },
};

/** Fallback tolerance used for any component not in the defaults table. */
const FALLBACK_TOLERANCE = { position_tolerance: 16, rotation_tolerance: 12 };

class ComponentPositionValidator {
  /**
   * @param {Object} [toleranceConfig] — optional per-component tolerance overrides;
   *   merged with DEFAULT_COMPONENT_TOLERANCES (overrides win for matching keys).
   */
  constructor(toleranceConfig = {}) {
    this._tolerances = Object.assign({}, DEFAULT_COMPONENT_TOLERANCES, toleranceConfig);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Per-component evaluation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns true when a component's current position and rotation are within
   * the configured tolerances of its canonical target.
   *
   * @param {string} componentId
   * @param {{ x: number, y: number, rotation: number }} currentPos
   * @param {{ x: number, y: number, rotation: number }} canonicalPos
   * @returns {boolean}
   */
  isComponentRepositioned(componentId, currentPos, canonicalPos) {
    const tol = this._tolerances[componentId] || FALLBACK_TOLERANCE;

    const positionDist = Math.sqrt(
      Math.pow(currentPos.x - canonicalPos.x, 2) +
      Math.pow(currentPos.y - canonicalPos.y, 2)
    );

    // Rotation difference normalised to [-180, 180]
    let rotDiff = (currentPos.rotation - canonicalPos.rotation) % 360;
    if (rotDiff > 180)  rotDiff -= 360;
    if (rotDiff < -180) rotDiff += 360;
    const absRotDiff = Math.abs(rotDiff);

    return positionDist <= tol.position_tolerance && absRotDiff <= tol.rotation_tolerance;
  }

  /**
   * Returns true when ALL components that require repositioning have been placed
   * within their canonical tolerance zones.
   *
   * @param {Object.<string, {x:number, y:number, rotation:number}>} componentStates
   *   — map of componentId → current position/rotation
   * @param {Object.<string, {x:number, y:number, rotation:number}>} canonicalPositions
   *   — map of componentId → canonical target position/rotation
   * @returns {boolean}
   */
  areAllComponentsRepositioned(componentStates, canonicalPositions) {
    for (const [componentId, canonicalPos] of Object.entries(canonicalPositions)) {
      const currentPos = componentStates[componentId];
      if (!currentPos) return false; // missing entry = not yet repositioned
      if (!this.isComponentRepositioned(componentId, currentPos, canonicalPos)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the list of component IDs that have NOT yet been repositioned to
   * within tolerance. Used to surface incomplete-repair warnings (no-softlock — AC6).
   *
   * @param {Object.<string, {x:number, y:number, rotation:number}>} componentStates
   * @param {Object.<string, {x:number, y:number, rotation:number}>} canonicalPositions
   * @returns {string[]} — array of incomplete component IDs (empty when all done)
   */
  getIncompleteComponents(componentStates, canonicalPositions) {
    const incomplete = [];
    for (const [componentId, canonicalPos] of Object.entries(canonicalPositions)) {
      const currentPos = componentStates[componentId];
      if (!currentPos || !this.isComponentRepositioned(componentId, currentPos, canonicalPos)) {
        incomplete.push(componentId);
      }
    }
    return incomplete;
  }

  /**
   * Returns the contextual incomplete-repair warning message for no-softlock enforcement.
   * Called when the player attempts reassembly before all components are repositioned.
   *
   * @param {string[]} incompleteComponentIds — from getIncompleteComponents()
   * @returns {string|null} — warning message, or null if all components are placed
   */
  getIncompleteRepairWarning(incompleteComponentIds) {
    if (!incompleteComponentIds || incompleteComponentIds.length === 0) return null;
    const count = incompleteComponentIds.length;
    const list = incompleteComponentIds.join(', ');
    return (
      `Reassembly blocked: ${count} component${count !== 1 ? 's' : ''} ` +
      `still displaced — reposition before proceeding. ` +
      `Incomplete: ${list}.`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Tolerance inspection
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the tolerance spec for a component ID.
   * Falls back to FALLBACK_TOLERANCE for unknown parts.
   *
   * @param {string} componentId
   * @returns {{ position_tolerance: number, rotation_tolerance: number }}
   */
  getComponentTolerance(componentId) {
    return { ...(this._tolerances[componentId] || FALLBACK_TOLERANCE) };
  }

  /**
   * Register (or override) tolerance values for a specific component.
   * Allows per-watch-model fine-tuning without constructing a new instance.
   *
   * @param {string} componentId
   * @param {{ position_tolerance: number, rotation_tolerance: number }} tolerance
   */
  registerComponentTolerance(componentId, tolerance) {
    if (typeof tolerance.position_tolerance !== 'number' ||
        typeof tolerance.rotation_tolerance !== 'number') {
      throw new Error(
        `ComponentPositionValidator.registerComponentTolerance: ` +
        `tolerances must be numbers for component '${componentId}'.`
      );
    }
    if (tolerance.position_tolerance <= 0 || tolerance.rotation_tolerance <= 0) {
      throw new Error(
        `ComponentPositionValidator.registerComponentTolerance: ` +
        `tolerances must be positive for component '${componentId}'.`
      );
    }
    this._tolerances[componentId] = { ...tolerance };
  }
}

module.exports = {
  ComponentPositionValidator,
  DEFAULT_COMPONENT_TOLERANCES,
  FALLBACK_TOLERANCE,
};
