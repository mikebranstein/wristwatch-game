/**
 * LoupeViewport — loupe tool viewport renderer with fault-signal overlay.
 *
 * Issue #117 — Scaffolded Fault-Signal System, Phase 1: Loupe Visual Cues
 *
 * ARCHITECTURE CONTRACT:
 *   This is the ONLY class that instantiates LoupeFaultSignalLayer.  No other
 *   tool viewport (timing machine, pressure test, manual observation tool)
 *   imports or invokes LoupeFaultSignalLayer.  This is enforced by architecture,
 *   not conditional flags scattered at call sites.
 *
 * AC1: When loupe is active AND the session arm is 'treatment', abnormal
 *      components render with a visual signal overlay (faint tint / texture /
 *      material differentiation).
 *
 * AC2: Visual signals are EXCLUSIVELY visible through the loupe viewport.
 *      Other viewports never invoke this renderer's signal layer.
 *      - Loupe-inactive state: inspectComponent() returns null, no render call.
 *      - Non-loupe tools: they use different viewport classes that do not
 *        contain a LoupeFaultSignalLayer instance.
 *
 * AC3 (arm-driven gate): A/B arm is READ from the session record by the caller
 *      and passed to inspectComponent(); this class does NOT assign the arm.
 *
 * Multiple-fault isolation (AC7 Scenario 7):
 *   Each signal overlay is bounded to the individual component render target via
 *   renderSignalOverlay(signal) — the hook receives the specific component's
 *   signal data and must not blend it with adjacent components.
 */

const { LoupeFaultSignalLayer } = require('./LoupeFaultSignalLayer');

class LoupeViewport {
  /**
   * @param {Object} opts
   * @param {Function} opts.renderSignalOverlay  (signal) => void  — existing render hook;
   *   called with { componentId, variant, description } per component.
   * @param {Function} opts.clearSignalOverlay   () => void  — clears the active overlay.
   */
  constructor({ renderSignalOverlay, clearSignalOverlay }) {
    if (typeof renderSignalOverlay !== 'function') {
      throw new Error('LoupeViewport requires a renderSignalOverlay function.');
    }
    if (typeof clearSignalOverlay !== 'function') {
      throw new Error('LoupeViewport requires a clearSignalOverlay function.');
    }

    this._renderSignalOverlay = renderSignalOverlay;
    this._clearSignalOverlay = clearSignalOverlay;
    this._signalLayer = new LoupeFaultSignalLayer();
    this._isActive = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Activates the loupe viewport.  Must be called before inspectComponent.
   */
  activate() {
    this._isActive = true;
  }

  /**
   * Deactivates the loupe viewport and clears any active signal overlay.
   * After deactivation, inspectComponent returns null.
   */
  deactivate() {
    this._isActive = false;
    this._clearSignalOverlay();
  }

  // ── Component inspection ───────────────────────────────────────────────────

  /**
   * Inspects a component through the loupe viewport.
   *
   * Applies the fault-signal overlay only when ALL three conditions hold:
   *   (a) the loupe is currently active (AC2: loupe-only),
   *   (b) the session arm is 'treatment' (AC3: A/B gate),
   *   (c) the component's faultTypeId is in the allowlist (AC1: fault signal).
   *
   * Returns the signal that was applied, or null (healthy, control arm, or inactive).
   *
   * @param {string} componentId
   * @param {string|null} faultTypeId
   * @param {'treatment'|'control'} abArm
   * @returns {{ componentId: string, variant: string, description: string }|null}
   */
  inspectComponent(componentId, faultTypeId, abArm) {
    // AC2: loupe must be the active viewport
    if (!this._isActive) {
      return null;
    }

    // AC3/AC5: control arm receives no signals — matches pre-feature baseline exactly
    if (abArm !== 'treatment') {
      return null;
    }

    const signal = this._signalLayer.getSignalForComponent(componentId, faultTypeId);
    if (signal) {
      this._renderSignalOverlay(signal);
    }
    return signal;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /**
   * Returns whether the loupe viewport is currently active.
   * @returns {boolean}
   */
  isActive() {
    return this._isActive;
  }
}

module.exports = { LoupeViewport };