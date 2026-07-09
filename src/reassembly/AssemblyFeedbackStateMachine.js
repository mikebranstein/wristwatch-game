/**
 * AssemblyFeedbackStateMachine — 4-state FSM for the reassembly snap feedback system.
 *
 * States (Phase 1 — Issue #76):
 *   NEUTRAL          (1) — Part is not near any snap zone; no feedback.
 *   NEAR_CORRECT     (2) — Part is within approach radius; getting-warmer highlight fires.
 *   WRONG_ORIENTATION(3) — Part is within approach radius but orientation is wrong;
 *                          directional error message fires (Phase 2 hook).
 *   LOCKED_IN        (4) — Part is within lock radius with correct orientation;
 *                          confirmation cue fires; this is the only state that allows
 *                          final snap to proceed.
 *
 * Transition rules:
 *   - LOCKED_IN requires inLockZone AND orientationCorrect (strictest gate).
 *   - WRONG_ORIENTATION requires inApproachZone AND !orientationCorrect AND
 *     dwellMs >= STATE_2_MIN_DWELL_MS (minimum approach-zone dwell before State 3 fires,
 *     preventing imperceptible single-frame State 2 flash).
 *   - NEAR_CORRECT fires for any in-approach-zone entry not yet resolved to State 3 or 4.
 *   - NEUTRAL fires when the part is outside the approach zone entirely.
 *
 * The minimum dwell window (STATE_2_MIN_DWELL_MS = 200ms) preserves the "getting-warmer"
 * signal and prevents State 2 from being an imperceptible flash before State 3 activates.
 *
 * Phase 1 — Issue #76: Snap Zone Tolerance Tuning + Differentiated Feedback State System.
 */

const STATES = {
  NEUTRAL: 'neutral',
  NEAR_CORRECT: 'near_correct',
  WRONG_ORIENTATION: 'wrong_orientation',
  LOCKED_IN: 'locked_in',
};

/** Minimum ms the part must dwell in the approach zone before State 3 can fire. */
const STATE_2_MIN_DWELL_MS = 200;

class AssemblyFeedbackStateMachine {
  constructor() {
    this._state = STATES.NEUTRAL;
    this._lastStateChangeAt = null;
    this._onStateChangeCb = null;
  }

  /**
   * Register a callback that fires whenever state transitions occur.
   * @param {Function} callback — receives ({ previousState, newState })
   */
  onStateChange(callback) {
    this._onStateChangeCb = callback;
  }

  /**
   * Returns the current FSM state string.
   * @returns {string}
   */
  getState() {
    return this._state;
  }

  /**
   * Drive the FSM with fresh position/orientation data.
   *
   * @param {Object} opts
   * @param {boolean} opts.inApproachZone    — part is within approach_radius
   * @param {boolean} opts.inLockZone        — part is within lock_radius
   * @param {boolean} opts.orientationCorrect — true when part orientation matches target
   * @param {number}  [opts.dwellMs=0]       — ms the part has been in the approach zone
   * @returns {string} — the new (or unchanged) state
   */
  update({ inApproachZone, inLockZone, orientationCorrect, dwellMs = 0 }) {
    let newState;

    if (inLockZone && orientationCorrect) {
      // State 4: fully correct position and orientation — allow snap
      newState = STATES.LOCKED_IN;
    } else if (inApproachZone && !orientationCorrect && dwellMs >= STATE_2_MIN_DWELL_MS) {
      // State 3: in approach zone, orientation wrong, dwell exceeded — fire directional message
      newState = STATES.WRONG_ORIENTATION;
    } else if (inApproachZone) {
      // State 2: in approach zone (orientation not yet evaluated or dwell not met)
      newState = STATES.NEAR_CORRECT;
    } else {
      // State 1: outside all zones
      newState = STATES.NEUTRAL;
    }

    if (newState !== this._state) {
      const previousState = this._state;
      this._state = newState;
      this._lastStateChangeAt = Date.now();
      if (this._onStateChangeCb) {
        this._onStateChangeCb({ previousState, newState });
      }
    }

    return this._state;
  }

  /**
   * Resets the FSM to NEUTRAL. Call when the player picks up a new part or
   * cancels the current placement attempt.
   */
  reset() {
    const previousState = this._state;
    this._state = STATES.NEUTRAL;
    this._lastStateChangeAt = null;
    if (this._onStateChangeCb && previousState !== STATES.NEUTRAL) {
      this._onStateChangeCb({ previousState, newState: STATES.NEUTRAL });
    }
  }
}

module.exports = { AssemblyFeedbackStateMachine, STATES, STATE_2_MIN_DWELL_MS };
