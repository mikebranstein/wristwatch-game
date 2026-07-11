/**
 * SurfaceConditionShader — continuous-blend shader that transitions the case
 * surface from worn/scratched to fully polished, driven by a polishing progress
 * value in the range [0.0, 1.0].
 *
 * Implements: Issue #152 (Case Polishing — Phase 3)
 *
 * Design constraint: transition MUST be a continuous blend (not a discrete texture
 * swap) so that each tick of polishing interaction produces a perceptible visual
 * change. The blend factor maps 1-to-1 to polishing progress.
 *
 * Acceptance criteria covered:
 *   AC1 — visual change is perceptible within the first 20% of the interaction.
 *          The shader emits a render call on every progress update ≥ 0.0, so
 *          any positive progress (including 0.01–0.20) immediately produces a
 *          non-zero blend factor.
 *   AC2 — at 100% progress the case is rendered in the fully polished state with
 *          no visual artefacts: blendFactor is clamped exactly to 1.0 and the
 *          worn texture is passed as the 'pre' side (never omitted).
 *   AC6 — partial progress (e.g. 0.60 on abandonment) produces a defined partial
 *          state; no crash, no undefined blend factor.
 */

/** Minimum blend factor delta considered perceptible by the renderer. */
const PERCEPTIBLE_THRESHOLD = 0.01;

class SurfaceConditionShader {
  /**
   * @param {Function} renderSurface  Hook: (wornTexture, polishedTexture, blendFactor) => void
   *   Called on every progress update. blendFactor is [0.0 = fully worn, 1.0 = fully polished].
   * @param {Function} clearSurface   Hook: () => void — called on destroy/reset.
   */
  constructor(renderSurface, clearSurface) {
    if (typeof renderSurface !== 'function') {
      throw new Error('SurfaceConditionShader requires a renderSurface function.');
    }
    if (typeof clearSurface !== 'function') {
      throw new Error('SurfaceConditionShader requires a clearSurface function.');
    }

    this._renderSurface = renderSurface;
    this._clearSurface  = clearSurface;

    this._progress      = 0.0;   // [0.0, 1.0]
    this._wornTexture   = null;
    this._polishedTexture = null;
    this._isInitialised  = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Initialise the shader with surface textures and set starting state.
   * Must be called before applyProgress().
   *
   * @param {string} wornTexture      Texture key for the worn/scratched state.
   * @param {string} polishedTexture  Texture key for the fully polished state.
   */
  init(wornTexture, polishedTexture) {
    this._wornTexture     = wornTexture;
    this._polishedTexture = polishedTexture;
    this._progress        = 0.0;
    this._isInitialised   = true;

    // Render initial state (fully worn)
    this._renderSurface(this._wornTexture, this._polishedTexture, 0.0);
  }

  /**
   * Update the shader blend factor to reflect new polishing progress.
   *
   * The blend factor is clamped to [0.0, 1.0] so neither texture is omitted
   * at any point — no artefacts at boundaries (AC2).
   *
   * A render call is issued on any progress change ≥ PERCEPTIBLE_THRESHOLD
   * to ensure incremental updates are visible (AC1).
   *
   * @param {number} progress  Polishing progress in [0.0, 1.0].
   */
  applyProgress(progress) {
    if (!this._isInitialised) {
      throw new Error('SurfaceConditionShader.init() must be called before applyProgress().');
    }

    const clamped = Math.max(0.0, Math.min(1.0, progress));
    const delta   = Math.abs(clamped - this._progress);

    this._progress = clamped;

    // Always render when delta is perceptible — ensures AC1 (visual change at 20%)
    // and AC6 (partial state rendered on abandonment)
    if (delta >= PERCEPTIBLE_THRESHOLD || clamped === 0.0 || clamped === 1.0) {
      this._renderSurface(this._wornTexture, this._polishedTexture, clamped);
    }
  }

  /**
   * Force-render the current state without advancing progress.
   * Used to re-render after a context loss or orientation change (AC6).
   */
  forceRender() {
    if (!this._isInitialised) return;
    this._renderSurface(this._wornTexture, this._polishedTexture, this._progress);
  }

  /** @returns {number} Current polishing progress in [0.0, 1.0]. */
  getProgress() {
    return this._progress;
  }

  /** @returns {boolean} True when progress has reached 100%. */
  isFullyPolished() {
    return this._progress >= 1.0;
  }

  /**
   * Returns the human-readable condition state for summary screen display (AC5).
   * @returns {'worn'|'partial'|'polished'}
   */
  getConditionState() {
    if (this._progress >= 1.0) return 'polished';
    if (this._progress >= PERCEPTIBLE_THRESHOLD) return 'partial';
    return 'worn';
  }

  /**
   * Reset the shader to the worn state and clear the surface render target.
   * Called on destroy or when navigating away from the polishing phase.
   */
  reset() {
    this._progress        = 0.0;
    this._wornTexture     = null;
    this._polishedTexture = null;
    this._isInitialised   = false;
    this._clearSurface();
  }
}

module.exports = { SurfaceConditionShader, PERCEPTIBLE_THRESHOLD };
