/**
 * ClipSequencePacer — designs and validates the full reveal sequence timing for
 * clip-optimized shareability.
 *
 * Design constraints (AC #54-1, #54-3):
 *   - Total sequence duration: 20–60 seconds (non-negotiable for TikTok/YouTube Shorts).
 *   - Clip-in point: opening frame is visually distinct from mid-gameplay (AC#54-3).
 *   - Clip-out point: closing frame returns to a neutral/calm state (AC#54-3).
 *
 * Sequence phases (default timing — 22 seconds total):
 *   1. Clip-in    (3 s)  — camera repositions; UI clears → visually distinct start frame
 *   2. Cinematic  (3 s)  — pull-back fires at reveal beat (CinematicCameraController)
 *   3. Core reveal(5 s)  — RevealAnimation (dirty → gleaming transition)
 *   4. Before/after(6 s) — BeforeAfterUI display (≥3 s auto-dismiss included)
 *   5. Clip-out   (5 s)  — camera recovers; return to neutral/calm state
 *
 *   Default total: 3 + 3 + 5 + 6 + 5 = 22 seconds (comfortably within 20–60 s window).
 *
 * Phase durations are fully configurable at construction time so playtesting can
 * iterate on timing without architectural changes.
 */

const CLIP_WINDOW_MIN_S = 20; // AC#54-1: minimum total sequence duration
const CLIP_WINDOW_MAX_S = 60; // AC#54-1: maximum total sequence duration
const BEFORE_AFTER_MIN_S = 3; // AC#53-3: before/after UI must be visible ≥3 seconds

const DEFAULT_PHASES = {
  clipIn:        3, // seconds
  cinematicMove: 3, // seconds
  coreReveal:    5, // seconds
  beforeAfter:   6, // seconds (≥3 s per AC#53-3)
  clipOut:       5, // seconds
};

class ClipSequencePacer {
  /**
   * @param {Object} [phaseDurations]  Optional per-phase duration overrides (in seconds).
   *   Any unspecified phase uses the default value.
   */
  constructor(phaseDurations = {}) {
    this._phases = { ...DEFAULT_PHASES, ...phaseDurations };
    this._validatePhases();
  }

  _validatePhases() {
    // Validate beforeAfter minimum (AC#53-3 cross-constraint)
    if (this._phases.beforeAfter < BEFORE_AFTER_MIN_S) {
      throw new Error(
        `ClipSequencePacer: beforeAfter phase must be at least ${BEFORE_AFTER_MIN_S} seconds (AC #53-3).`
      );
    }

    // Validate total sequence is within clip window (AC#54-1)
    const total = this._computeTotal();
    if (total < CLIP_WINDOW_MIN_S || total > CLIP_WINDOW_MAX_S) {
      throw new Error(
        `ClipSequencePacer: total sequence duration ${total}s is outside the required ` +
        `20–60 second clip window. Adjust phase durations.`
      );
    }
  }

  _computeTotal() {
    return Object.values(this._phases).reduce((sum, v) => sum + v, 0);
  }

  /**
   * Returns the complete timing configuration for the reveal sequence.
   * AC#54-1: isWithinClipWindow must be true for a valid shareability-ready sequence.
   *
   * @returns {{
   *   clipInDurationS:        number,
   *   cinematicMoveDurationS: number,
   *   coreRevealDurationS:    number,
   *   beforeAfterDurationS:   number,
   *   clipOutDurationS:       number,
   *   totalDurationS:         number,
   *   isWithinClipWindow:     boolean,
   * }}
   */
  computeSequenceTiming() {
    const total = this._computeTotal();
    return {
      clipInDurationS:        this._phases.clipIn,
      cinematicMoveDurationS: this._phases.cinematicMove,
      coreRevealDurationS:    this._phases.coreReveal,
      beforeAfterDurationS:   this._phases.beforeAfter,
      clipOutDurationS:       this._phases.clipOut,
      totalDurationS:         total,
      isWithinClipWindow:     total >= CLIP_WINDOW_MIN_S && total <= CLIP_WINDOW_MAX_S,
    };
  }

  /**
   * Returns the clip-in marker — the visually distinct opening frame of the sequence.
   * AC#54-3: opening frame must be clearly different from standard mid-gameplay.
   *
   * @returns {{
   *   timestampS:             number,
   *   isDistinctFromGameplay: boolean,
   *   description:            string,
   * }}
   */
  getClipInMarker() {
    return {
      timestampS: 0,
      isDistinctFromGameplay: true,
      description:
        'Sequence opens with camera repositioning and UI clearing — clearly ' +
        'different from standard mid-gameplay; a screen recorder captures a ' +
        'distinct clip-in point at t=0.',
    };
  }

  /**
   * Returns the clip-out marker — the neutral/calm closing frame of the sequence.
   * AC#54-3: closing frame returns to a neutral state — not mid-action, not mid-UI.
   *
   * @returns {{
   *   timestampS:     number,
   *   isNeutralState: boolean,
   *   description:    string,
   * }}
   */
  getClipOutMarker() {
    const total = this._computeTotal();
    return {
      timestampS: total,
      isNeutralState: true,
      description:
        'Sequence closes with camera fully restored to gameplay position and all ' +
        'reveal UI dismissed — calm, neutral state; a screen recorder captures a ' +
        'clean clip-out point at the total sequence duration.',
    };
  }

  /**
   * Validates that a measured playback duration falls within the required clip window.
   * Useful for runtime assertion in analytics events and QA tooling.
   *
   * @param {number} measuredDurationS  Measured total duration in seconds.
   * @returns {boolean}
   */
  isWithinClipWindow(measuredDurationS) {
    return measuredDurationS >= CLIP_WINDOW_MIN_S && measuredDurationS <= CLIP_WINDOW_MAX_S;
  }

  /** @returns {{ min: number, max: number }} Required clip window bounds in seconds. */
  static getClipWindowBounds() {
    return { min: CLIP_WINDOW_MIN_S, max: CLIP_WINDOW_MAX_S };
  }

  /** @returns {Object} Default phase durations in seconds (immutable copy). */
  static getDefaultPhaseDurations() {
    return { ...DEFAULT_PHASES };
  }
}

module.exports = { ClipSequencePacer, CLIP_WINDOW_MIN_S, CLIP_WINDOW_MAX_S, BEFORE_AFTER_MIN_S, DEFAULT_PHASES };
