/**
 * LoupeViewportRenderer — manages the fault-signal overlay layer for the loupe tool.
 *
 * Issue #117 — Scaffolded Fault-Signal System: Phase 1 Loupe Visual Cues.
 *
 * Design contract (Design Decision, Issue #117):
 *   "The fault-signal overlay layer is injected only during the loupe render pass;
 *    other tool viewports do not invoke this render layer — enforced by architecture,
 *    not conditional flags at call sites."
 *
 * This renderer is ONLY invoked by the loupe tool viewport.  No other tool
 * (timing machine, pressure test, standard component view) ever holds a reference
 * to this renderer.  Loupe-exclusivity is therefore an architectural guarantee,
 * not a runtime flag scattered across callers.
 *
 * Overlay isolation per component (AC1, design risk mitigation):
 *   Each renderComponent() call applies the overlay to a specific componentId
 *   render target only.  The renderOverlay function is expected to scope its
 *   visual change to that single component — no shared overlay texture between
 *   adjacent components.
 *
 * False-signal protection (AC1, AC2):
 *   renderComponent() returns { signalApplied: false } when:
 *     a) the loupe is not currently active (loupe-exclusivity contract), OR
 *     b) faultType is null / undefined / empty string (healthy component), OR
 *     c) faultType is not on the FaultSignalConfig allowlist (unknown fault type).
 */

const { getSignalVariant } = require('./FaultSignalConfig');

class LoupeViewportRenderer {
  /**
   * @param {Function} renderOverlay
   *   Called as renderOverlay(componentId, signalVariant) to apply the fault
   *   signal to a specific component's render target during the loupe pass.
   * @param {Function} clearOverlay
   *   Called as clearOverlay() to remove all loupe overlay layers when the
   *   loupe tool is deactivated or the player moves away from the viewport.
   */
  constructor(renderOverlay, clearOverlay) {
    if (typeof renderOverlay !== 'function') {
      throw new Error('LoupeViewportRenderer requires a renderOverlay function.');
    }
    if (typeof clearOverlay !== 'function') {
      throw new Error('LoupeViewportRenderer requires a clearOverlay function.');
    }
    this._renderOverlay = renderOverlay;
    this._clearOverlay = clearOverlay;
    this._isLoupeActive = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Loupe render pass lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Marks the start of a loupe render pass.
   * Called by the loupe tool when the player activates the loupe viewport.
   */
  activateLoupe() {
    this._isLoupeActive = true;
  }

  /**
   * Marks the end of a loupe render pass.
   * Removes all fault-signal overlays from the viewport and resets loupe state.
   * Called when the player closes/deactivates the loupe tool.
   */
  deactivateLoupe() {
    this._isLoupeActive = false;
    this._clearOverlay();
  }

  /**
   * Returns true when the loupe viewport is currently active.
   * @returns {boolean}
   */
  isLoupeActive() {
    return this._isLoupeActive;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Component rendering
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Renders a component inside the loupe viewport, applying the fault-signal
   * overlay when all conditions are met.
   *
   * Returns the render result:
   *   { signalApplied: true,  componentId, variant }  — overlay was applied
   *   { signalApplied: false }                         — no overlay (various guards)
   *
   * Guards (in order):
   *   1. Loupe must be active — enforces AC2 loupe-exclusivity
   *   2. faultType must be a non-empty string — protects against false-signal
   *      on healthy components (null/undefined/'' → no overlay)
   *   3. faultType must be on the FaultSignalConfig allowlist — unknown or
   *      future fault types that lack an authored variant receive no overlay
   *
   * @param {string} componentId — the component being viewed through the loupe
   * @param {string|null|undefined} faultType — the fault attribute on this component
   * @returns {{ signalApplied: boolean, componentId?: string, variant?: string }}
   */
  renderComponent(componentId, faultType) {
    // Guard 1: loupe-exclusivity (AC2)
    if (!this._isLoupeActive) {
      return { signalApplied: false };
    }

    // Guard 2: healthy / null fault-type — no signal (protects against false-signal, AC1)
    if (!faultType) {
      return { signalApplied: false };
    }

    // Guard 3: explicit allowlist check — unknown fault types receive no overlay
    const variant = getSignalVariant(faultType);
    if (!variant) {
      return { signalApplied: false };
    }

    // All guards passed — apply the overlay scoped to this component's render target
    this._renderOverlay(componentId, variant);
    return { signalApplied: true, componentId, variant };
  }
}

module.exports = { LoupeViewportRenderer };
