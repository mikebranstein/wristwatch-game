/**
 * BeforeAfterUI — renders the before/after split-screen comparison UI that
 * displays immediately after the reveal animation completes.
 *
 * The UI shows the pre-cleaning (dirty/corroded) state alongside the
 * post-cleaning (gleaming) state.  It remains visible for at least 3 seconds
 * then auto-dismisses.  Players can tap/click to dismiss early.
 *
 * Design pattern: renderBeforeAfter and clearBeforeAfter hooks are injected at
 * construction time, keeping the rendering implementation separate from logic.
 *
 * Acceptance criteria covered:
 *   AC3 — before/after UI is displayed after animation completes; visible for
 *          at least 3 seconds before auto-dismiss.
 *   AC4 — early dismiss on tap/click dismisses cleanly with no errors or artifacts.
 *   AC5 — clean state reset on each call prevents visual artifacts across multiple
 *          sequential reveals.
 */

/** Minimum time the before/after UI is visible before it auto-dismisses. */
const MIN_DISPLAY_DURATION_MS = 3000;

class BeforeAfterUI {
  /**
   * @param {Function} renderBeforeAfter  Injected renderer; called with
   *   ({ preTexture, postTexture, layoutMode }) to paint the split-screen panel.
   * @param {Function} clearBeforeAfter   Injected clear function; called when the
   *   panel is dismissed (auto or early).
   * @param {{ setTimeout: Function, clearTimeout: Function }} [timerImpl]
   *   Optional timer implementation injection for testing (defaults to global).
   */
  constructor(renderBeforeAfter, clearBeforeAfter, timerImpl = {}) {
    if (typeof renderBeforeAfter !== 'function') {
      throw new Error('BeforeAfterUI requires a renderBeforeAfter function.');
    }
    if (typeof clearBeforeAfter !== 'function') {
      throw new Error('BeforeAfterUI requires a clearBeforeAfter function.');
    }

    this._render = renderBeforeAfter;
    this._clear = clearBeforeAfter;

    // Allow timer injection for deterministic testing
    this._setTimeout = timerImpl.setTimeout || setTimeout;
    this._clearTimeout = timerImpl.clearTimeout || clearTimeout;

    this._isVisible = false;
    this._autoDismissHandle = null;
    this._preTexture = null;
    this._postTexture = null;
    this._layoutMode = null;

    // Callback invoked when the UI is dismissed (auto or early)
    this._onDismiss = null;

    // Record whether the last dismiss was early (for QA assertions)
    this._lastDismissWasEarly = false;
    this._showTimestampMs = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Show the before/after panel.
   *
   * @param {string}   preTexture   Texture key for the dirty/corroded pre-state.
   * @param {string}   postTexture  Texture key for the gleaming post-state.
   * @param {string}   layoutMode   Aspect-ratio hint: '16:9' or '9:16'.
   * @param {Function} [onDismiss]  Called when the panel dismisses.
   */
  show(preTexture, postTexture, layoutMode, onDismiss) {
    // Clean up any existing display first (safety reset — AC5)
    this._reset();

    this._preTexture = preTexture;
    this._postTexture = postTexture;
    this._layoutMode = layoutMode || '16:9';
    this._onDismiss = typeof onDismiss === 'function' ? onDismiss : null;
    this._isVisible = true;
    this._lastDismissWasEarly = false;
    this._showTimestampMs = Date.now();

    this._render({
      preTexture: this._preTexture,
      postTexture: this._postTexture,
      layoutMode: this._layoutMode,
    });

    // Schedule auto-dismiss after minimum display duration (AC3)
    this._autoDismissHandle = this._setTimeout(
      () => this._autoDismiss(),
      MIN_DISPLAY_DURATION_MS
    );
  }

  /**
   * Player-initiated early dismiss (AC4).
   * Cancels the auto-dismiss timer and clears the panel cleanly.
   */
  dismissEarly() {
    if (!this._isVisible) return;
    this._lastDismissWasEarly = true;
    this._dismiss();
  }

  /** @returns {boolean} True while the before/after panel is visible. */
  isVisible() {
    return this._isVisible;
  }

  /**
   * Returns display metadata for the current (or last) showing.
   * Useful for QA assertions (AC3, AC4).
   *
   * @returns {{
   *   preTexture: string|null,
   *   postTexture: string|null,
   *   layoutMode: string|null,
   *   isVisible: boolean,
   *   lastDismissWasEarly: boolean,
   *   showTimestampMs: number|null
   * }}
   */
  getDisplayState() {
    return {
      preTexture: this._preTexture,
      postTexture: this._postTexture,
      layoutMode: this._layoutMode,
      isVisible: this._isVisible,
      lastDismissWasEarly: this._lastDismissWasEarly,
      showTimestampMs: this._showTimestampMs,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  _autoDismiss() {
    if (!this._isVisible) return;
    this._lastDismissWasEarly = false;
    this._dismiss();
  }

  _dismiss() {
    this._isVisible = false;
    this._clearTimeout(this._autoDismissHandle);
    this._autoDismissHandle = null;
    this._clear();
    if (this._onDismiss) this._onDismiss();
  }

  /**
   * Full state reset — called at the start of each show() to prevent any
   * leftover state from a previous reveal (AC5).
   */
  _reset() {
    if (this._autoDismissHandle !== null) {
      this._clearTimeout(this._autoDismissHandle);
      this._autoDismissHandle = null;
    }
    this._isVisible = false;
    this._preTexture = null;
    this._postTexture = null;
    this._layoutMode = null;
    this._onDismiss = null;
    this._showTimestampMs = null;
  }
}

module.exports = { BeforeAfterUI, MIN_DISPLAY_DURATION_MS };
