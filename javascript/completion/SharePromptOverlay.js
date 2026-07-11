/**
 * SharePromptOverlay — in-screen share/capture affordance for the Completion
 * Reveal Shareability Layer (Issue #142).
 *
 * Responsibilities:
 *   - Display an explicit share/capture prompt at the peak reveal moment —
 *     when both before/after states are fully visible (AC1).
 *   - Enforce UI placement constraints: the overlay must not occupy more than
 *     15% of the visible screen area and must not overlap the central watch
 *     comparison region (Constraint — share prompt UI placement).
 *   - Allow dismissal with a single input action: keyboard shortcut, controller
 *     button, or mouse click (AC4, Constraint).
 *   - Use generic, platform-agnostic copy only — no specific platform names
 *     (e.g. Steam, Twitter, TikTok) are permitted in the UI copy
 *     (Constraint — platform and storefront).
 *   - After dismissal the reveal continues or completes normally — no visual
 *     interruption, audio glitch, or stuck state (AC4).
 *   - Emit events via the injected instrumentationHook for analytics
 *     (`share_prompt_shown`, `share_prompt_dismissed`).
 *
 * State machine:
 *   HIDDEN → VISIBLE → DISMISSED
 *
 * This module is purely a state/data layer (no DOM or canvas dependency) so
 * it is fully testable in isolation.  The UI render layer consumes
 * getViewModel() to decide what to paint.
 *
 * Acceptance criteria covered:
 *   AC1 — show() is called by RevealSequenceController.onPeakMoment callback,
 *          ensuring the prompt appears only when both states are fully visible.
 *   AC4 — dismiss() transitions VISIBLE → DISMISSED; caller (RevealSequenceController)
 *          continues the reveal sequence uninterrupted.
 *
 * Test scenarios covered:
 *   Scenario 1 — Happy path: show() → prompt visible; dismiss() → DISMISSED.
 *   Scenario 2 — Dismiss: reveal continues normally (state transitions only;
 *                RevealSequenceController owns the sequence continuation).
 *   Scenario 7 — Prompt appears only at peak (show() is only called by the
 *                controller after peak-moment offset has elapsed).
 *   Scenario 9 — Accessibility: copy is readable text; no platform names.
 */

'use strict';

/** Share prompt overlay states. */
const OVERLAY_STATE = {
  HIDDEN:    'hidden',
  VISIBLE:   'visible',
  DISMISSED: 'dismissed',
};

/**
 * Built-in generic copy keys.  Each key maps to a short, platform-agnostic
 * string that encourages capture without naming any specific platform.
 * (Constraint: no platform names in UI copy.)
 */
const COPY_REGISTRY = {
  default:          'Save your restoration',
  capture_moment:   'Capture this moment',
  share_journey:    'Share your journey',
  screenshot_hint:  'Take a screenshot to save this reveal',
};

/** Maximum permitted screen-area percentage for the overlay (Constraint). */
const MAX_SCREEN_AREA_PERCENT = 15;

class SharePromptOverlay {
  /**
   * @param {Object}   [opts]
   * @param {string}   [opts.copyKey]              — Key into COPY_REGISTRY (default: 'default').
   *                                                 Must resolve to generic, platform-agnostic text.
   * @param {number}   [opts.screenAreaPercent]    — Declared screen area used by overlay (0–15%).
   *                                                 Used by RevealSequenceController to enforce
   *                                                 the 15% cap before placing the overlay.
   * @param {boolean}  [opts.overlapsComparison]   — Must be false; validates no overlap with
   *                                                 the central watch comparison region.
   * @param {Function} [opts.instrumentationHook]  — (eventName: string, payload: Object) => void
   */
  constructor({
    copyKey            = 'default',
    screenAreaPercent  = 5,
    overlapsComparison = false,
    instrumentationHook = null,
  } = {}) {
    if (typeof screenAreaPercent !== 'number' ||
        screenAreaPercent < 0 ||
        screenAreaPercent > MAX_SCREEN_AREA_PERCENT) {
      throw new RangeError(
        `SharePromptOverlay: screenAreaPercent must be 0–${MAX_SCREEN_AREA_PERCENT}%; ` +
        `got ${screenAreaPercent}.`
      );
    }

    if (overlapsComparison === true) {
      throw new Error(
        'SharePromptOverlay: overlapsComparison must be false — the share prompt ' +
        'must not overlap the central watch comparison region (Constraint).'
      );
    }

    if (!Object.prototype.hasOwnProperty.call(COPY_REGISTRY, copyKey)) {
      throw new Error(
        `SharePromptOverlay: unknown copyKey "${copyKey}". ` +
        `Valid keys: ${Object.keys(COPY_REGISTRY).join(', ')}.`
      );
    }

    this._copyKey             = copyKey;
    this._screenAreaPercent   = screenAreaPercent;
    this._overlapsComparison  = overlapsComparison;
    this._instrumentationHook = instrumentationHook;
    this._state               = OVERLAY_STATE.HIDDEN;
  }

  // ── State transitions ──────────────────────────────────────────────────────

  /**
   * Show the share prompt.  Transitions HIDDEN → VISIBLE.
   * Called by RevealSequenceController at the peak-moment callback (AC1).
   * No-op if already visible or dismissed.
   *
   * @returns {boolean} True if the overlay became visible as a result of this call.
   */
  show() {
    if (this._state !== OVERLAY_STATE.HIDDEN) return false;
    this._state = OVERLAY_STATE.VISIBLE;

    if (this._instrumentationHook) {
      this._instrumentationHook('share_prompt_shown', {
        copyKey:           this._copyKey,
        copyText:          this.getCopyText(),
        screenAreaPercent: this._screenAreaPercent,
      });
    }

    return true;
  }

  /**
   * Dismiss the share prompt with a single player input action (AC4, Constraint).
   * Transitions VISIBLE → DISMISSED.  The reveal sequence continues uninterrupted
   * — the caller (RevealSequenceController) drives sequence continuation; this
   * module only tracks state.
   *
   * No-op if already dismissed or not yet visible.
   *
   * @returns {boolean} True if the overlay was dismissed as a result of this call.
   */
  dismiss() {
    if (this._state !== OVERLAY_STATE.VISIBLE) return false;
    this._state = OVERLAY_STATE.DISMISSED;

    if (this._instrumentationHook) {
      this._instrumentationHook('share_prompt_dismissed', {
        copyKey: this._copyKey,
      });
    }

    return true;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** @returns {string} Current overlay state (OVERLAY_STATE constant). */
  getState() { return this._state; }

  /** @returns {boolean} True when the overlay is currently visible. */
  isVisible() { return this._state === OVERLAY_STATE.VISIBLE; }

  /** @returns {boolean} True after the player has dismissed the overlay. */
  isDismissed() { return this._state === OVERLAY_STATE.DISMISSED; }

  /** @returns {boolean} True before show() has been called. */
  isHidden() { return this._state === OVERLAY_STATE.HIDDEN; }

  /**
   * Returns the platform-agnostic copy text for this overlay.
   * Guaranteed to contain no platform names (Constraint).
   *
   * @returns {string}
   */
  getCopyText() { return COPY_REGISTRY[this._copyKey]; }

  /**
   * Returns the active copy key identifier.
   * @returns {string}
   */
  getCopyKey() { return this._copyKey; }

  /**
   * Returns the declared screen-area percentage (≤ MAX_SCREEN_AREA_PERCENT).
   * @returns {number}
   */
  getScreenAreaPercent() { return this._screenAreaPercent; }

  /**
   * Returns whether this overlay overlaps the comparison region.
   * Always false for valid instances (constructor throws otherwise).
   * @returns {boolean}
   */
  getOverlapsComparison() { return this._overlapsComparison; }

  /**
   * Build a clean view-model for the UI render layer.
   * Only contains fields relevant to rendering; no debug state.
   *
   * @returns {Object}
   */
  getViewModel() {
    return {
      state:             this._state,
      isVisible:         this.isVisible(),
      copyText:          this.getCopyText(),
      copyKey:           this._copyKey,
      screenAreaPercent: this._screenAreaPercent,
    };
  }

  /**
   * Reset overlay to HIDDEN for re-use (e.g. in replay sequences).
   */
  reset() {
    this._state = OVERLAY_STATE.HIDDEN;
  }
}

module.exports = {
  SharePromptOverlay,
  OVERLAY_STATE,
  COPY_REGISTRY,
  MAX_SCREEN_AREA_PERCENT,
};
