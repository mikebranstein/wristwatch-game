/**
 * SnapZoneTolerance — tiered tolerance model for watch-part snap zones.
 *
 * Design contract (AC1):
 *   - Each part has an `approach_radius` and a `lock_radius`.
 *   - approach_radius >= 2 × lock_radius at all times (enforced in constructor).
 *   - Only the 'reassembly' screen context may activate snap zones; any other
 *     context is rejected to prevent regression to teardown/disassembly stages.
 *
 * Two-zone model:
 *   - Approach zone  (distance <= approach_radius): "getting warmer" zone — player
 *     can see proximity feedback without committing to a snap.
 *   - Lock zone      (distance <= lock_radius):     precision confirmation zone —
 *     final snap only fires here AND only when orientation is also correct.
 *
 * Usage:
 *   const sz = new SnapZoneTolerance('reassembly');
 *   sz.registerPart('mainspring', { approach_radius: 60, lock_radius: 20 });
 *   const zone = sz.evaluate('mainspring', distance, orientation);
 *   // zone => 'approach' | 'lock' | 'outside'
 */

/** Default tolerance values (pixels / game-units) for known watch parts. */
const DEFAULT_TOLERANCES = {
  mainspring:    { approach_radius: 60, lock_radius: 20 },
  escapement:    { approach_radius: 60, lock_radius: 20 },
  balance_wheel: { approach_radius: 60, lock_radius: 20 },
  pallet_fork:   { approach_radius: 60, lock_radius: 20 },
  crown_wheel:   { approach_radius: 60, lock_radius: 20 },
  cannon_pinion: { approach_radius: 60, lock_radius: 20 },
  minute_wheel:  { approach_radius: 60, lock_radius: 20 },
  hour_wheel:    { approach_radius: 60, lock_radius: 20 },
  dial:          { approach_radius: 60, lock_radius: 20 },
  crystal:       { approach_radius: 60, lock_radius: 20 },
};

/** Valid screen contexts that may activate snap zones. */
const ALLOWED_CONTEXTS = ['reassembly'];

class SnapZoneTolerance {
  /**
   * @param {string} screenContext — must be 'reassembly'; guards regression to
   *   teardown/disassembly stages.
   */
  constructor(screenContext) {
    if (!ALLOWED_CONTEXTS.includes(screenContext)) {
      throw new Error(
        `SnapZoneTolerance may only be activated from a valid context. ` +
        `Received: '${screenContext}'. Allowed: ${ALLOWED_CONTEXTS.join(', ')}.`
      );
    }
    this._context = screenContext;
    this._tolerances = {};

    // Pre-load defaults
    for (const [partId, tol] of Object.entries(DEFAULT_TOLERANCES)) {
      this._registerTolerance(partId, tol.approach_radius, tol.lock_radius);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Registration
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Register (or override) tolerance values for a part.
   * Enforces the 2× constraint: approach_radius >= 2 × lock_radius.
   *
   * @param {string} partId
   * @param {{ approach_radius: number, lock_radius: number }} tolerances
   */
  registerPart(partId, tolerances) {
    const { approach_radius, lock_radius } = tolerances;
    this._registerTolerance(partId, approach_radius, lock_radius);
  }

  /** @private */
  _registerTolerance(partId, approach_radius, lock_radius) {
    if (typeof approach_radius !== 'number' || typeof lock_radius !== 'number') {
      throw new Error(`SnapZoneTolerance.registerPart: radii must be numbers for part '${partId}'.`);
    }
    if (approach_radius < 2 * lock_radius) {
      throw new Error(
        `SnapZoneTolerance: approach_radius (${approach_radius}) must be >= 2 × ` +
        `lock_radius (${lock_radius}) for part '${partId}'. ` +
        `This is a hard design-time constraint (AC1).`
      );
    }
    if (lock_radius <= 0 || approach_radius <= 0) {
      throw new Error(`SnapZoneTolerance: radii must be positive for part '${partId}'.`);
    }
    this._tolerances[partId] = { approach_radius, lock_radius };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Evaluation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Evaluate which zone a part is currently in.
   *
   * @param {string} partId
   * @param {number} distance — distance from part's current position to target snap point
   * @returns {'outside'|'approach'|'lock'}
   */
  getZone(partId, distance) {
    const tol = this._tolerances[partId];
    if (!tol) {
      throw new Error(`SnapZoneTolerance: unknown part '${partId}'. Register it first.`);
    }
    if (distance <= tol.lock_radius) return 'lock';
    if (distance <= tol.approach_radius) return 'approach';
    return 'outside';
  }

  /**
   * Returns the tolerance spec for a registered part.
   * @param {string} partId
   * @returns {{ approach_radius: number, lock_radius: number }}
   */
  getTolerances(partId) {
    const tol = this._tolerances[partId];
    if (!tol) {
      throw new Error(`SnapZoneTolerance: unknown part '${partId}'.`);
    }
    return { ...tol };
  }

  /**
   * Returns the active screen context.
   * @returns {string}
   */
  getContext() {
    return this._context;
  }

  /**
   * Returns true if the part has been registered.
   * @param {string} partId
   * @returns {boolean}
   */
  hasPart(partId) {
    return Object.prototype.hasOwnProperty.call(this._tolerances, partId);
  }
}

module.exports = { SnapZoneTolerance, DEFAULT_TOLERANCES, ALLOWED_CONTEXTS };
