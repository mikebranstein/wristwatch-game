/**
 * SnapZoneTolerance — design-time constants for the two-radius snap model.
 *
 * Each watch part has two concentric zones:
 *   approach_radius — outer ring; entering triggers the proximity highlight (State 2).
 *   lock_radius     — inner ring; entering with correct orientation triggers lock (State 4).
 *
 * Invariant (enforced at startup): approach_radius >= 2 × lock_radius for every part.
 * This prevents State 4 (locked-in) from firing inside the approach zone regardless of
 * orientation, preserving the earned-precision feel.
 *
 * Scope guard: module only activates when screenContext === 'reassembly'.
 * Calls from any other context throw immediately to prevent bleeding into teardown/disassembly.
 *
 * Phase 1 — Issue #76: Snap Zone Tolerance Tuning + Differentiated Feedback State System.
 * Values are design-time placeholders; final calibration requires mandatory playtest gate
 * (5–10 new players) before ship.
 */

const SNAP_ZONES = {
  mainspring:    { approach_radius: 80,  lock_radius: 40 },
  barrel:        { approach_radius: 100, lock_radius: 50 },
  barrel_bridge: { approach_radius: 90,  lock_radius: 45 },
  escape_wheel:  { approach_radius: 60,  lock_radius: 30 },
  pallet_fork:   { approach_radius: 60,  lock_radius: 30 },
  balance_wheel: { approach_radius: 70,  lock_radius: 35 },
  balance_cock:  { approach_radius: 80,  lock_radius: 40 },
  cannon_pinion: { approach_radius: 50,  lock_radius: 25 },
  minute_wheel:  { approach_radius: 60,  lock_radius: 30 },
  hour_wheel:    { approach_radius: 60,  lock_radius: 30 },
  dial:          { approach_radius: 120, lock_radius: 60 },
  crown:         { approach_radius: 50,  lock_radius: 25 },
  stem:          { approach_radius: 50,  lock_radius: 25 },
};

// Validate the 2× invariant at module load time.
for (const [partId, zone] of Object.entries(SNAP_ZONES)) {
  if (zone.approach_radius < 2 * zone.lock_radius) {
    throw new Error(
      `SnapZoneTolerance invariant violated for "${partId}": ` +
      `approach_radius (${zone.approach_radius}) must be >= 2 × lock_radius (${zone.lock_radius}).`
    );
  }
}

class SnapZoneTolerance {
  /**
   * @param {string} [screenContext='reassembly'] — must be 'reassembly'; any
   *   other value causes getZone() to throw, preventing accidental reuse in
   *   teardown/disassembly stages.
   */
  constructor(screenContext = 'reassembly') {
    this._screenContext = screenContext;
  }

  /**
   * Returns the snap zone constants for a given part.
   * Throws if called outside the reassembly context or for an unknown part ID.
   *
   * @param {string} partId
   * @returns {{ approach_radius: number, lock_radius: number }}
   */
  getZone(partId) {
    if (this._screenContext !== 'reassembly') {
      throw new Error(
        `SnapZoneTolerance is only valid in the "reassembly" context; ` +
        `received context "${this._screenContext}".`
      );
    }
    const zone = SNAP_ZONES[partId];
    if (!zone) {
      throw new Error(`SnapZoneTolerance: unknown part ID "${partId}".`);
    }
    return { ...zone };
  }

  /**
   * Returns true when the part's distance is within the approach radius.
   * @param {string} partId
   * @param {number} distance — distance from snap target centre (game units)
   * @returns {boolean}
   */
  isInApproachZone(partId, distance) {
    const { approach_radius } = this.getZone(partId);
    return distance <= approach_radius;
  }

  /**
   * Returns true when the part's distance is within the lock radius.
   * @param {string} partId
   * @param {number} distance
   * @returns {boolean}
   */
  isInLockZone(partId, distance) {
    const { lock_radius } = this.getZone(partId);
    return distance <= lock_radius;
  }

  /**
   * Returns an array of all part IDs with defined snap zones.
   * @returns {string[]}
   */
  getSupportedParts() {
    return Object.keys(SNAP_ZONES);
  }
}

module.exports = { SnapZoneTolerance, SNAP_ZONES };
