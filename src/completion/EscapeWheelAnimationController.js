/**
 * EscapeWheelAnimationController — manages escape wheel tooth-by-tooth
 * advancement synchronized to the balance wheel oscillation frequency.
 *
 * Design: Issue #150 (Full Movement Animation — Phase 2: Escapement & Gear Train)
 *
 * Responsibility:
 *   - Advances the escape wheel one tooth per balance wheel half-swing (AC1).
 *   - Attaches to the Phase 1 balance wheel extensibility hook via
 *     registerHalfSwingListener(listener) once Phase 1 is available.
 *   - Supports failure-state branching: stalled, jittery, or over-spinning
 *     when assembly is incorrect (AC2).
 *   - Exposes a renderHook for the game render layer (DI, same pattern as
 *     BalanceWheelActivation — Issue #113).
 *   - Resets cleanly on scene exit to prevent state leaks (AC5 — scene transition).
 *
 * Phase 1 integration boundary:
 *   Phase 1 (Issue #147) must provide a half-swing notification mechanism.
 *   This controller accepts a `halfSwingSource` in opts — an object with a
 *   `onHalfSwing(listener)` registration method. Once Phase 1 delivers its
 *   extensibility hook, the caller wires `halfSwingSource` to Phase 1's hook.
 *
 * Acceptance criteria covered:
 *   AC1 — escape wheel advances one tooth per balance wheel half-swing.
 *   AC2 — failure-state animation plays when assembly is incorrect.
 *   AC5 — no Phase 1 code modified; attaches via Phase 1 extensibility hook only.
 */

'use strict';

/** Escape wheel animation states. */
const ESCAPE_WHEEL_STATE = {
  IDLE:          'idle',
  RUNNING:       'running',
  STALLED:       'stalled',
  JITTERY:       'jittery',
  OVER_SPINNING: 'over_spinning',
};

/** Failure animation modes for incorrect assembly (AC2). */
const FAILURE_MODE = {
  STALLED:       'stalled',
  JITTERY:       'jittery',
  OVER_SPINNING: 'over_spinning',
};

/** Default escape wheel tooth count for a standard Swiss lever movement. */
const DEFAULT_TOOTH_COUNT = 15;

class EscapeWheelAnimationController {
  /**
   * @param {Object}   opts
   * @param {Function} opts.renderHook          Injected render command hook:
   *   ({ command, toothIndex, state }) => void.
   * @param {number}   [opts.toothCount]        Tooth count for this caliber
   *   (default 15 for standard Swiss lever movement).
   * @param {string}   [opts.failureMode]       Which failure animation to play when
   *   assembledCorrectly is false (default: 'stalled').
   */
  constructor({ renderHook, toothCount = DEFAULT_TOOTH_COUNT, failureMode = FAILURE_MODE.STALLED }) {
    if (typeof renderHook !== 'function') {
      throw new Error('EscapeWheelAnimationController: renderHook must be a function.');
    }
    if (!Number.isInteger(toothCount) || toothCount < 1) {
      throw new Error('EscapeWheelAnimationController: toothCount must be a positive integer.');
    }
    if (!Object.values(FAILURE_MODE).includes(failureMode)) {
      throw new Error(`EscapeWheelAnimationController: unknown failureMode "${failureMode}".`);
    }

    this._renderHook          = renderHook;
    this._toothCount          = toothCount;
    this._failureMode         = failureMode;
    this._state               = ESCAPE_WHEEL_STATE.IDLE;
    this._currentToothIndex   = 0;
    this._halfSwingCount      = 0;
    this._assembledCorrectly  = true;
    this._startTimestamp      = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the escape wheel animation.
   *
   * @param {boolean} [assembledCorrectly]  True for correct-run animation; false
   *   triggers failure-state animation (AC2).
   * @param {number}  [startTimestampMs]   Timestamp when Phase 1 balance wheel
   *   started (used for AC4 timing validation).
   */
  start(assembledCorrectly = true, startTimestampMs = Date.now()) {
    this._assembledCorrectly = assembledCorrectly;
    this._startTimestamp     = startTimestampMs;

    if (assembledCorrectly) {
      this._state = ESCAPE_WHEEL_STATE.RUNNING;
      this._renderHook({ command: 'escape_wheel_start', toothIndex: this._currentToothIndex, state: this._state });
    } else {
      this._state = ESCAPE_WHEEL_STATE[this._failureMode.toUpperCase()] || ESCAPE_WHEEL_STATE.STALLED;
      this._renderHook({ command: 'escape_wheel_failure', toothIndex: this._currentToothIndex, state: this._state });
    }
  }

  /**
   * Called by the Phase 1 extensibility hook on each balance wheel half-swing.
   * Advances escape wheel one tooth (AC1: one tooth per half-swing).
   * No-op if not in RUNNING state.
   */
  onHalfSwing() {
    if (this._state !== ESCAPE_WHEEL_STATE.RUNNING) return;

    this._halfSwingCount++;
    this._currentToothIndex = (this._currentToothIndex + 1) % this._toothCount;

    this._renderHook({
      command:    'escape_wheel_advance',
      toothIndex: this._currentToothIndex,
      halfSwings: this._halfSwingCount,
      state:      this._state,
    });
  }

  /**
   * Stop the escape wheel animation and reset to IDLE.
   * Call on scene exit to prevent state leaks (AC5 — scene transition).
   */
  stop() {
    this._state          = ESCAPE_WHEEL_STATE.IDLE;
    this._halfSwingCount = 0;
    this._renderHook({ command: 'escape_wheel_stop', toothIndex: this._currentToothIndex, state: this._state });
  }

  /**
   * Full reset — zero tooth position.
   * Use when a new watch is loaded.
   */
  reset() {
    this._state              = ESCAPE_WHEEL_STATE.IDLE;
    this._currentToothIndex  = 0;
    this._halfSwingCount     = 0;
    this._assembledCorrectly = true;
    this._startTimestamp     = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {string} Current animation state. */
  getState() { return this._state; }

  /** @returns {number} Current tooth index (0-based). */
  getCurrentToothIndex() { return this._currentToothIndex; }

  /** @returns {number} Total half-swings accumulated since last reset. */
  getHalfSwingCount() { return this._halfSwingCount; }

  /** @returns {number} Configured tooth count for this caliber. */
  getToothCount() { return this._toothCount; }

  /** @returns {number|null} Start timestamp in ms (for AC4 timing check). */
  getStartTimestamp() { return this._startTimestamp; }
}

module.exports = {
  EscapeWheelAnimationController,
  ESCAPE_WHEEL_STATE,
  FAILURE_MODE,
  DEFAULT_TOOTH_COUNT,
};
