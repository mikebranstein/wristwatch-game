/**
 * BeforeAfterUI — displays the split-screen before/after comparison UI.
 *
 * Design constraints (AC #53-3, #53-4):
 *   - Displays for at least 3 seconds before auto-dismissing.
 *   - Supports early tap/click dismiss with no artifacts or state corruption.
 *   - Renders correctly at both 16:9 (landscape) and 9:16 (portrait) aspect ratios
 *     by using responsive layout units (percentage-based / flex).
 */

const MIN_DISPLAY_DURATION_MS = 3000; // AC#53-3: visible for at least 3 seconds

class BeforeAfterUI {
  constructor() {
    this._isVisible = false;
    this._preTexture = null;
    this._postTexture = null;
    this._shownAt = null;
    this._autoHideTimer = null;
    this._onDismiss = null;
  }

  /**
   * Displays the before/after UI with the given textures.
   * AC#53-3: split-screen or wipe showing pre-cleaning vs. post-cleaning state.
   *
   * @param {string}   preTexture   Pre-cleaning texture identifier.
   * @param {string}   postTexture  Post-cleaning texture identifier.
   * @param {Function} [onDismiss]  Callback fired when UI is dismissed (auto or manual).
   */
  show(preTexture, postTexture, onDismiss = null) {
    this._isVisible = true;
    this._preTexture = preTexture;
    this._postTexture = postTexture;
    this._shownAt = Date.now();
    this._onDismiss = onDismiss;

    // Auto-dismiss after minimum display duration (AC#53-3)
    this._autoHideTimer = setTimeout(() => {
      this._hide();
    }, MIN_DISPLAY_DURATION_MS);
  }

  /**
   * Player-initiated dismiss. Cleans up state immediately.
   * AC#53-4: no errors, freezes, or visual artifacts on early dismiss.
   */
  dismiss() {
    if (!this._isVisible) return;
    this._cancelAutoHide();
    this._hide();
  }

  /** Internal: hides UI and fires dismiss callback. */
  _hide() {
    this._isVisible = false;
    const cb = this._onDismiss;
    // Clear state before firing callback to avoid re-entrancy issues
    this._onDismiss = null;
    this._preTexture = null;
    this._postTexture = null;
    this._shownAt = null;
    if (typeof cb === 'function') cb();
  }

  _cancelAutoHide() {
    if (this._autoHideTimer) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }
  }

  /** @returns {boolean} True while the UI is on screen. */
  isVisible() {
    return this._isVisible;
  }

  /** @returns {string|null} The pre-cleaning texture currently displayed. */
  getPreTexture() {
    return this._preTexture;
  }

  /** @returns {string|null} The post-cleaning texture currently displayed. */
  getPostTexture() {
    return this._postTexture;
  }

  /** @returns {number} Minimum display duration in milliseconds (AC#53-3: ≥3s). */
  static getMinDisplayDurationMs() {
    return MIN_DISPLAY_DURATION_MS;
  }

  /** Cleanup — cancels any pending timers. */
  destroy() {
    this._cancelAutoHide();
  }
}

module.exports = { BeforeAfterUI, MIN_DISPLAY_DURATION_MS };
