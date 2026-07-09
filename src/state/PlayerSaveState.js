/**
 * PlayerSaveState — manages persistent player data.
 *
 * Stores player progress flags using an in-memory store (swap this for
 * actual persistence — localStorage, IndexedDB, or a save-file API — in
 * the production integration layer).
 */

const DEFAULT_SAVE = {
  tutorial_first_fault_seen: false,

  // Chronograph Discovery Path — Phase 1 (Issue #88)
  // Backward-compatible additions: Object.assign({}, DEFAULT_SAVE, initialState) handles
  // defaults transparently for existing save data that lacks these keys.
  chronograph_overlay_seen: false,   // overlay first-time-only trigger (AC1, AC3, AC4)
  discovery_mode_enabled: true,      // global discovery mode setting; default ON (AC3, AC4)
};

class PlayerSaveState {
  constructor(initialState = {}) {
    this._store = Object.assign({}, DEFAULT_SAVE, initialState);
  }

  /**
   * Read a value from the save state.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._store[key];
  }

  /**
   * Write a value to the save state.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    this._store[key] = value;
  }

  /**
   * Returns a shallow snapshot of the entire save state (for serialisation).
   * @returns {Object}
   */
  snapshot() {
    return Object.assign({}, this._store);
  }
}

module.exports = { PlayerSaveState };
