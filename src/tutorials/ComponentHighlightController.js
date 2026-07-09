/**
 * ComponentHighlightController — manages visual highlight (glow/outline) state for
 * guided first-job onboarding (Issue #111).
 *
 * Accepts an injected step-to-componentId config map at construction time so the
 * Phase 1 failure-map output (issue #112) can be slotted in without any interface change.
 * Until Phase 1 data is delivered, the config map is populated with placeholder values.
 *
 * AC4: Visual highlight targets the correct component or tool for the current step;
 *      highlight clears when player interacts with the correct target; no highlights
 *      fire out of sequence.
 *
 * Design contract (from approved design):
 *   - `stepConfig`: injected at construction — Map<stepNumber, componentId>
 *   - `getHighlightTarget(step)`: returns the componentId for the given step
 *   - `clearHighlight()`: clears active highlight on correct interaction
 *   - `isOutOfSequence(step)`: returns true if step > current active step
 */

class ComponentHighlightController {
  /**
   * @param {Map<number, string>|Object} stepConfig
   *   A step→componentId mapping injected at construction time.
   *   Accepts a plain object ({ 1: 'mainspring', 2: 'gear-train' }) or a Map.
   *   Placeholder values are used until Phase 1 failure-map data is available.
   */
  constructor(stepConfig = {}) {
    // Normalise plain object to Map for uniform access
    if (stepConfig instanceof Map) {
      this._stepConfig = stepConfig;
    } else {
      this._stepConfig = new Map(Object.entries(stepConfig).map(([k, v]) => [Number(k), v]));
    }
    this._activeStep = null;      // The step whose highlight is currently active
    this._highlightCleared = false;
  }

  /**
   * Activate the highlight for a given step.
   * Sets the internal active step so out-of-sequence checks work correctly.
   * No-ops if the step has no configured componentId (unknown step).
   *
   * @param {number} step  1-based step number
   * @returns {string|null}  The componentId to highlight, or null if unconfigured
   */
  activateHighlight(step) {
    const componentId = this._stepConfig.get(step) || null;
    if (componentId) {
      this._activeStep = step;
      this._highlightCleared = false;
    }
    return componentId;
  }

  /**
   * Returns the componentId that should be highlighted for the given step.
   * Does NOT activate the highlight — use activateHighlight() for that.
   * Returns null when no config entry exists for the step.
   *
   * @param {number} step  1-based step number
   * @returns {string|null}
   */
  getHighlightTarget(step) {
    return this._stepConfig.get(step) || null;
  }

  /**
   * Clears the active highlight after the player interacts with the correct target (AC4).
   * Called by the game loop on correct-component interaction.
   */
  clearHighlight() {
    this._activeStep = null;
    this._highlightCleared = true;
  }

  /**
   * Returns true if the requested step is ahead of the currently active highlight step,
   * i.e. the player is asking about a future step before they've reached it (AC4 — no
   * highlights fire out of sequence).
   *
   * @param {number} step  The step being queried
   * @returns {boolean}
   */
  isOutOfSequence(step) {
    if (this._activeStep === null) return false;
    return step > this._activeStep;
  }

  /**
   * Returns the currently active step number, or null if no highlight is active.
   * @returns {number|null}
   */
  getActiveStep() {
    return this._activeStep;
  }

  /**
   * Returns true if clearHighlight() was the most recent terminal action.
   * Useful for assertions in tests.
   * @returns {boolean}
   */
  wasCleared() {
    return this._highlightCleared;
  }

  /**
   * Returns a copy of the step-config map (useful for tests / QA validation).
   * @returns {Map<number, string>}
   */
  getStepConfig() {
    return new Map(this._stepConfig);
  }
}

module.exports = { ComponentHighlightController };
