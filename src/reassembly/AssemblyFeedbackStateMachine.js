/**
 * AssemblyFeedbackStateMachine — 4-state FSM driving audio/visual feedback
 * during watch reassembly.
 *
 * States (AC2, AC3, AC4):
 *   State 1 — NEUTRAL:    Part is outside approach radius; no feedback.
 *   State 2 — PROXIMITY:  Part is within approach radius but orientation not yet
 *                         checked or orientation window has not yet elapsed.
 *                         Distinct highlight activates (AC2).
 *   State 3 — WRONG_ORI:  Part is within approach radius, orientation is wrong.
 *                         Unique visual indicator fires; cannot trigger final snap (AC3).
 *   State 4 — LOCKED_IN:  Part is within lock radius AND orientation is correct.
 *                         Distinct audio + visual confirmation plays; snap triggers (AC4).
 *
 * Transition rules:
 *   zone === 'outside'                                  → NEUTRAL
 *   zone === 'approach' or 'lock', dwell < MIN_DWELL_MS → PROXIMITY  (AC2 dwell window)
 *   zone === 'approach' or 'lock', orientationCorrect  → LOCKED_IN if zone==='lock', else PROXIMITY
 *   zone === 'approach' or 'lock', !orientationCorrect → WRONG_ORI (after dwell)
 *   zone === 'lock',    orientationCorrect              → LOCKED_IN
 *
 * State 4 (LOCKED_IN) is the ONLY state that can trigger a final snap.
 *
 * Design mitigation from design decision:
 *   A minimum approach-zone dwell time (MIN_DWELL_MS = 250ms) ensures State 2
 *   remains perceptible as a "getting-warmer" signal before orientation resolves
 *   to State 3, preventing an imperceptible single-frame State 2 flash.
 */

const STATES = {
  NEUTRAL:    1,
  PROXIMITY:  2,
  WRONG_ORI:  3,
  LOCKED_IN:  4,
};

const STATE_NAMES = {
  [STATES.NEUTRAL]:   'neutral',
  [STATES.PROXIMITY]: 'proximity',
  [STATES.WRONG_ORI]: 'wrong_orientation',
  [STATES.LOCKED_IN]: 'locked_in',
};

/** Minimum dwell time in approach zone before orientation check resolves to State 3. */
const MIN_DWELL_MS = 250;

/**
 * Visual indicator descriptors — what each state should render.
 * The rendering engine reads these descriptors; the FSM does not render directly.
 */
const STATE_VISUALS = {
  [STATES.NEUTRAL]:   { highlight: false, color: null,      glow: 0,   animation: null },
  [STATES.PROXIMITY]: { highlight: true,  color: '#4fc3f7', glow: 0.4, animation: 'pulse-soft' },
  [STATES.WRONG_ORI]: { highlight: true,  color: '#ef5350', glow: 0.7, animation: 'shake' },
  [STATES.LOCKED_IN]: { highlight: true,  color: '#66bb6a', glow: 1.0, animation: 'lock-flash' },
};

/**
 * Audio cue names — each must map to a distinct loaded audio asset.
 * All 4 are differentiable without visual reference (AC4 accessibility).
 */
const STATE_AUDIO = {
  [STATES.NEUTRAL]:   null,
  [STATES.PROXIMITY]: 'sfx_proximity_hum',
  [STATES.WRONG_ORI]: 'sfx_wrong_orientation_buzz',
  [STATES.LOCKED_IN]: 'sfx_locked_in_chime',
};

class AssemblyFeedbackStateMachine {
  /**
   * @param {Object} opts
   * @param {Function} opts.playAudio    — (cueName: string) => void; called when a
   *   state-entry audio cue should play. Null/undefined cue = silence.
   * @param {Function} opts.renderVisual — ({ state, visuals }) => void; called on
   *   every state change with the new visual descriptor.
   * @param {number}  [opts.minDwellMs] — override MIN_DWELL_MS (for testing).
   */
  constructor({ playAudio, renderVisual, minDwellMs = MIN_DWELL_MS }) {
    if (typeof playAudio !== 'function') {
      throw new Error('AssemblyFeedbackStateMachine requires a playAudio function.');
    }
    if (typeof renderVisual !== 'function') {
      throw new Error('AssemblyFeedbackStateMachine requires a renderVisual function.');
    }

    this._playAudio = playAudio;
    this._renderVisual = renderVisual;
    this._minDwellMs = minDwellMs;

    // Per-part state tracking
    // Map<partId, { state: number, approachEnteredAt: number|null }>
    this._partStates = new Map();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core FSM update
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Update the feedback state for a part based on its current zone and orientation.
   * Called every input tick while the part is being dragged.
   *
   * @param {string}  partId
   * @param {'outside'|'approach'|'lock'} zone  — from SnapZoneTolerance.getZone()
   * @param {boolean} orientationCorrect         — true when rotation matches target
   * @param {number}  [now]                      — current timestamp (ms); defaults to Date.now()
   * @returns {{ state: number, stateName: string, canSnap: boolean, visuals: Object, audioCue: string|null }}
   */
  update(partId, zone, orientationCorrect, now = Date.now()) {
    let entry = this._partStates.get(partId);
    if (!entry) {
      entry = { state: STATES.NEUTRAL, approachEnteredAt: null };
      this._partStates.set(partId, entry);
    }

    const prevState = entry.state;
    let nextState;

    if (zone === 'outside') {
      // Reset dwell timer when part leaves approach zone
      entry.approachEnteredAt = null;
      nextState = STATES.NEUTRAL;
    } else {
      // Part is within approach or lock zone
      if (entry.approachEnteredAt === null) {
        // First frame entering approach zone — record entry time and fire PROXIMITY
        entry.approachEnteredAt = now;
        nextState = STATES.PROXIMITY;
      } else {
        const dwell = now - entry.approachEnteredAt;

        if (dwell < this._minDwellMs) {
          // Still in the dwell window — hold PROXIMITY (AC2 dwell mitigation)
          nextState = STATES.PROXIMITY;
        } else if (zone === 'lock' && orientationCorrect) {
          // Final precision snap: within lock radius AND orientation correct → LOCKED_IN
          nextState = STATES.LOCKED_IN;
        } else if (orientationCorrect) {
          // In approach zone with correct orientation but not yet in lock zone
          // Still PROXIMITY — player is aligned but hasn't reached confirmation depth
          nextState = STATES.PROXIMITY;
        } else {
          // Orientation is wrong after dwell → WRONG_ORI (AC3)
          nextState = STATES.WRONG_ORI;
        }
      }
    }

    entry.state = nextState;

    // Emit audio/visual on any state change (or re-enter from same state if needed)
    if (nextState !== prevState) {
      this._onStateEnter(partId, nextState);
    }

    return this._buildResult(nextState);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Reset
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Reset a part to NEUTRAL state (call after snap completes or part is released).
   * @param {string} partId
   */
  reset(partId) {
    this._partStates.set(partId, { state: STATES.NEUTRAL, approachEnteredAt: null });
    this._onStateEnter(partId, STATES.NEUTRAL);
  }

  /**
   * Reset all tracked parts.
   */
  resetAll() {
    for (const partId of this._partStates.keys()) {
      this.reset(partId);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the current state number for a part (or NEUTRAL if not tracked yet).
   * @param {string} partId
   * @returns {number}
   */
  getState(partId) {
    const entry = this._partStates.get(partId);
    return entry ? entry.state : STATES.NEUTRAL;
  }

  /**
   * Returns the current state name for a part.
   * @param {string} partId
   * @returns {string}
   */
  getStateName(partId) {
    return STATE_NAMES[this.getState(partId)];
  }

  /**
   * Returns true if the part is currently in LOCKED_IN state (can snap).
   * @param {string} partId
   * @returns {boolean}
   */
  canSnap(partId) {
    return this.getState(partId) === STATES.LOCKED_IN;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** @private */
  _onStateEnter(partId, state) {
    const visuals = STATE_VISUALS[state];
    const audioCue = STATE_AUDIO[state];

    this._renderVisual({ partId, state, stateName: STATE_NAMES[state], visuals });
    if (audioCue) {
      this._playAudio(audioCue);
    }
  }

  /** @private */
  _buildResult(state) {
    return {
      state,
      stateName:  STATE_NAMES[state],
      canSnap:    state === STATES.LOCKED_IN,
      visuals:    STATE_VISUALS[state],
      audioCue:   STATE_AUDIO[state],
    };
  }
}

module.exports = {
  AssemblyFeedbackStateMachine,
  STATES,
  STATE_NAMES,
  STATE_VISUALS,
  STATE_AUDIO,
  MIN_DWELL_MS,
};
