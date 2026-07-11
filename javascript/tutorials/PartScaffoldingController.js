/**
 * PartScaffoldingController — progressive part-count reveal for chronograph assembly.
 *
 * Accepts `saveState`, `telemetry`, `groups` (construction-time config), and a
 * `revealCallback` that the caller supplies to actually surface parts in the UI.
 *
 * AC2: Given discovery mode is active, when the chronograph assembly is presented,
 *      then chronograph-specific parts are revealed in at least 3 sequential groups
 *      (not all at once), each group labeled with a descriptive context cue.
 *
 * AC3 / AC4: When discovery mode is off, revealCallback is called once with all
 *            parts — normal mode, no scaffolding.
 *
 * Spike #87 dependency: `groups` is a construction-time config parameter derived
 * from the movement definition, not hardcoded. When the spike returns CONDITIONAL_GO,
 * the documented constraints (max part count per group, render budget) are applied as
 * config values — no code changes required.
 *
 * Test Scenarios: 3, 4, 6, 7
 */

const MIN_GROUPS = 3;

class PartScaffoldingController {
  /**
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   * @param {Array<{ label: string, partIds: string[] }>} groups
   *   Ordered reveal groups. Minimum 3 required when discovery mode is active (AC2).
   * @param {Function} revealCallback
   *   Called with a group object `{ label, partIds }` each time a group is revealed.
   *   In normal (non-discovery) mode, called once with a synthetic group containing ALL parts.
   */
  constructor(saveState, telemetry, groups, revealCallback) {
    if (!Array.isArray(groups)) {
      throw new Error('PartScaffoldingController: groups must be an array.');
    }
    if (typeof revealCallback !== 'function') {
      throw new Error('PartScaffoldingController: revealCallback must be a function.');
    }
    this._saveState = saveState;
    this._telemetry = telemetry;
    this._groups = groups;
    this._revealCallback = revealCallback;
    this._currentGroupIndex = 0;
    this._started = false;
  }

  /**
   * Returns true when discovery (scaffolded) mode is active.
   * Mirrors the saveState flag — deterministic, side-effect-free.
   *
   * @returns {boolean}
   */
  isActive() {
    return !!this._saveState.get('discovery_mode_enabled');
  }

  /**
   * Validates the groups config against the minimum-group requirement.
   * Call this before start() to surface misconfiguration early.
   *
   * @throws {Error} if discovery mode is active and fewer than 3 groups are configured.
   */
  validate() {
    if (this.isActive() && this._groups.length < MIN_GROUPS) {
      throw new Error(
        `PartScaffoldingController: at least ${MIN_GROUPS} groups are required when discovery mode is active (AC2). Got ${this._groups.length}.`
      );
    }
  }

  /**
   * Begin the reveal sequence.
   *
   * - Discovery mode ON: reveals only the first group immediately.
   *   Caller must call revealNextGroup() for each subsequent group.
   * - Discovery mode OFF: calls revealCallback once with all parts (normal mode).
   *
   * @param {string} [movementId] - for logging / telemetry context
   */
  start(movementId = '') {
    this._started = true;
    this._movementId = movementId;
    this._currentGroupIndex = 0;

    if (!this.isActive()) {
      // Normal mode: surface all parts at once (AC3, AC4)
      const allPartIds = this._groups.flatMap((g) => g.partIds);
      this._revealCallback({ label: 'all', partIds: allPartIds });
      return;
    }

    // Discovery mode: reveal first group immediately
    this._revealGroup(0);
  }

  /**
   * Reveals the next group in the sequence (discovery mode only).
   * No-ops when all groups have been revealed or discovery mode is off.
   *
   * @returns {boolean} true if a group was revealed, false if already complete or inactive
   */
  revealNextGroup() {
    if (!this.isActive()) return false;
    if (!this._started) return false;
    const nextIndex = this._currentGroupIndex + 1;
    if (nextIndex >= this._groups.length) return false;
    this._revealGroup(nextIndex);
    return true;
  }

  /**
   * Returns the 0-based index of the most-recently revealed group.
   * Returns -1 if start() has not been called.
   *
   * @returns {number}
   */
  getCurrentGroupIndex() {
    return this._started ? this._currentGroupIndex : -1;
  }

  /**
   * Returns true when all groups have been revealed.
   * @returns {boolean}
   */
  isComplete() {
    if (!this._started) return false;
    return this._currentGroupIndex >= this._groups.length - 1;
  }

  /**
   * Returns a copy of the groups config (useful for UI rendering / tests).
   * @returns {Array<{ label: string, partIds: string[] }>}
   */
  getGroups() {
    return this._groups.slice();
  }

  // ---- Private ----

  /**
   * @param {number} index 0-based group index
   */
  _revealGroup(index) {
    const group = this._groups[index];
    this._currentGroupIndex = index;
    this._telemetry.partGroupRevealed(index, group.label, group.partIds.length);
    this._revealCallback(group);
  }
}

module.exports = { PartScaffoldingController, MIN_GROUPS };
