/**
 * ComponentHighlightController — data-driven component highlight system.
 *
 * Accepts a step-to-componentId configuration map injected at construction
 * time so the Phase 1 failure-map output (issue #112) can be dropped in
 * without changing the controller interface.
 *
 * Issue #111 — Guided First-Job Onboarding System
 *
 * Responsibilities:
 *   - Map a current onboarding step to the correct target componentId
 *   - Expose getHighlightTarget(step): returns componentId or null
 *   - Track whether the highlight has been cleared (player interacted with correct target)
 *   - Guard against out-of-sequence highlight requests (isOutOfSequence)
 *
 * Design constraints:
 *   - Pure logic controller — no DOM / UI references
 *   - Highlight config is injected; component is not responsible for the data
 *   - Additive only — no changes to existing highlight/UI systems
 */

class ComponentHighlightController {
  /**
   * @param {Object} stepConfig
   *   Map of step number (1-based) → componentId string.
   *   Example: { 1: 'mainspring', 2: 'gear-train', 3: 'escapement' }
   *   Pass an empty object ({}) to build the controller before Phase 1 data arrives.
   */
  constructor(stepConfig = {}) {
    this._stepConfig = Object.assign({}, stepConfig);
    this._activeHighlight = null; // { step: number, componentId: string } | null
    this._clearedSteps = new Set(); // steps where the player interacted with the correct target
  }

  /**
   * Returns the componentId that should be highlighted for the given step.
   * Returns null if:
   *   - no config entry exists for this step (e.g. Phase 1 data not yet available)
   *   - the step has already been cleared
   *   - the request is out of sequence (step > currentActiveStep + 1)
   *
   * @param {number} step  1-based step index
   * @returns {string|null}
   */
  getHighlightTarget(step) {
    if (!this._stepConfig[step]) return null;
    if (this._clearedSteps.has(step)) return null;
    if (this.isOutOfSequence(step)) return null;

    const componentId = this._stepConfig[step];
    this._activeHighlight = { step, componentId };
    return componentId;
  }

  /**
   * Clears the active highlight for the given step.
   * Called when the player correctly interacts with the highlighted component.
   *
   * @param {number} step
   */
  clearHighlight(step) {
    this._clearedSteps.add(step);
    if (this._activeHighlight && this._activeHighlight.step === step) {
      this._activeHighlight = null;
    }
  }

  /**
   * Returns true if the requested step is out of sequence.
   * A step is out of sequence if it skips ahead past the next expected step.
   *
   * @param {number} step
   * @returns {boolean}
   */
  isOutOfSequence(step) {
    // Determine the highest step that has been cleared (or 0 if none)
    const highestCleared = this._clearedSteps.size > 0
      ? Math.max(...this._clearedSteps)
      : 0;

    // The next valid step is highestCleared + 1
    // A step is out-of-sequence if it is more than 1 ahead of the highest cleared step
    return step > highestCleared + 1;
  }

  /**
   * Returns the currently active highlight target, or null if no highlight is active.
   * @returns {{ step: number, componentId: string }|null}
   */
  getActiveHighlight() {
    return this._activeHighlight ? Object.assign({}, this._activeHighlight) : null;
  }

  /**
   * Returns true if the given step has been cleared (player interacted correctly).
   * @param {number} step
   * @returns {boolean}
   */
  isStepCleared(step) {
    return this._clearedSteps.has(step);
  }

  /**
   * Resets all highlight state (for testing or session restart).
   */
  reset() {
    this._activeHighlight = null;
    this._clearedSteps.clear();
  }
}

module.exports = { ComponentHighlightController };
