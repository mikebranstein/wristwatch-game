/**
 * PalletForkAnimationController — manages pallet fork rocking motion locked to
 * escapement rhythm in mechanically accurate lockstep with the balance wheel.
 *
 * Design: Issue #150 (Full Movement Animation — Phase 2: Escapement & Gear Train)
 *
 * Responsibility:
 *   - Rocks the pallet fork in opposition to each balance wheel half-swing:
 *     half-swing N → fork position toggles entry/exit (AC1 — mechanically correct).
 *   - Supports failure-state animation (stalled or jittery) for incorrect assembly (AC2).
 *   - Exposes renderHook for DI to the game render layer (no direct DOM/render coupling).
 *   - Resets cleanly on scene exit (AC5 — no animation state leaks).
 *
 * Mechanical accuracy note:
 *   In a Swiss lever escapement the pallet fork rocks between two positions:
 *     ENTRY (banking against the entry stone)  — fork blocks escape wheel.
 *     EXIT  (banking against the exit stone)   — fork releases escape wheel.
 *   The fork position alternates with every half-swing of the balance wheel.
 *
 * Acceptance criteria covered:
 *   AC1 — pallet fork rocks in opposition; verified tooth-by-tooth with EscapeWheel.
 *   AC2 — failure-state animation (stalled | jittery) for incorrect assembly.
 *   AC5 — no Phase 1 code modified; attaches via Phase 1 extensibility hook only.
 */

'use strict';

/** Pallet fork animation states. */
const PALLET_FORK_STATE = {
  IDLE:    'idle',
  RUNNING: 'running',
  STALLED: 'stalled',
  JITTERY: 'jittery',
};

/** Pallet fork positions during correct-run animation (AC1). */
const FORK_POSITION = {
  ENTRY: 'entry',
  EXIT:  'exit',
};

class PalletForkAnimationController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.renderHook   Injected render hook: ({ command, position, state }) => void.
   * @param {string}   [opts.failureMode] 'stalled' | 'jittery' (default 'stalled').
   */
  constructor({ renderHook, failureMode = 'stalled' }) {
    if (typeof renderHook !== 'function') {
      throw new Error('PalletForkAnimationController: renderHook must be a function.');
    }
    if (failureMode !== 'stalled' && failureMode !== 'jittery') {
      throw new Error(`PalletForkAnimationController: unknown failureMode "${failureMode}".`);
    }

    this._renderHook         = renderHook;
    this._failureMode        = failureMode;
    this._state              = PALLET_FORK_STATE.IDLE;
    this._position           = FORK_POSITION.ENTRY;
    this._halfSwingCount     = 0;
    this._assembledCorrectly = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the pallet fork animation.
   * @param {boolean} [assembledCorrectly]  False triggers failure-state animation (AC2).
   */
  start(assembledCorrectly = true) {
    this._assembledCorrectly = assembledCorrectly;

    if (assembledCorrectly) {
      this._state    = PALLET_FORK_STATE.RUNNING;
      this._position = FORK_POSITION.ENTRY;
      this._renderHook({ command: 'pallet_fork_start', position: this._position, state: this._state });
    } else {
      this._state = this._failureMode === 'jittery'
        ? PALLET_FORK_STATE.JITTERY
        : PALLET_FORK_STATE.STALLED;
      this._renderHook({ command: 'pallet_fork_failure', position: this._position, state: this._state });
    }
  }

  /**
   * Called by the Phase 1 extensibility hook on each balance wheel half-swing.
   * Toggles fork position between ENTRY and EXIT (AC1: rocks in opposition).
   * No-op if not RUNNING.
   */
  onHalfSwing() {
    if (this._state !== PALLET_FORK_STATE.RUNNING) return;

    this._halfSwingCount++;
    // Alternate between ENTRY and EXIT on each half-swing (mechanically accurate)
    this._position = this._position === FORK_POSITION.ENTRY
      ? FORK_POSITION.EXIT
      : FORK_POSITION.ENTRY;

    this._renderHook({
      command:    'pallet_fork_rock',
      position:   this._position,
      halfSwings: this._halfSwingCount,
      state:      this._state,
    });
  }

  /**
   * Stop the animation.  Call on scene exit (AC5 — no state leaks).
   */
  stop() {
    this._state = PALLET_FORK_STATE.IDLE;
    this._renderHook({ command: 'pallet_fork_stop', position: this._position, state: this._state });
  }

  /** Full reset — call when a new watch is loaded. */
  reset() {
    this._state              = PALLET_FORK_STATE.IDLE;
    this._position           = FORK_POSITION.ENTRY;
    this._halfSwingCount     = 0;
    this._assembledCorrectly = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  getState()         { return this._state; }
  getPosition()      { return this._position; }
  getHalfSwingCount(){ return this._halfSwingCount; }
}

module.exports = { PalletForkAnimationController, PALLET_FORK_STATE, FORK_POSITION };
