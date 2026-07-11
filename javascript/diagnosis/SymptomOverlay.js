/**
 * SymptomOverlay — symptom-to-part visual mapping overlay for the diagnosis screen.
 *
 * AC1: When a player clicks a visible watch symptom, this module resolves which
 * parts to highlight on the watch anatomy diagram.  The actual visual rendering
 * (DOM manipulation, canvas, sprite highlights) is delegated to the injected
 * `renderOverlay` function so this module remains framework-agnostic and
 * fully unit-testable.
 *
 * Performance constraint: The overlay must respond within 1 second on min-spec
 * hardware (AC1 / Scenario 9).  The data lookup is O(1) (hash map) so the
 * timing budget is almost entirely determined by the renderer.
 *
 * Scenario 6: Multi-cause symptoms (e.g. "stops running") must highlight ALL
 * plausible parts simultaneously — the 1-to-many data structure ensures this.
 */

const { getPartsForSymptom } = require('../data/symptom-parts-map');

class SymptomOverlay {
  /**
   * @param {Function} renderOverlay
   *   Injected renderer: (symptomKey: string, partIds: string[]) => void
   *   Called synchronously to trigger the visual highlight.
   * @param {Function} clearOverlay
   *   Injected clear function: () => void
   *   Called when the overlay should be dismissed.
   */
  constructor(renderOverlay, clearOverlay) {
    if (typeof renderOverlay !== 'function') {
      throw new Error('SymptomOverlay requires a renderOverlay function.');
    }
    if (typeof clearOverlay !== 'function') {
      throw new Error('SymptomOverlay requires a clearOverlay function.');
    }
    this._render = renderOverlay;
    this._clear = clearOverlay;
    this._currentSymptom = null;
    this._highlightedParts = [];
    this._renderStartTime = null;
    this._lastRenderDurationMs = null;
  }

  /**
   * Called when a player clicks a symptom label in the diagnosis view.
   * Resolves candidate parts and delegates to the renderer (AC1).
   *
   * @param {string} symptomKey — e.g. 'stops_running'
   * @returns {{ symptomKey: string, highlightedParts: string[], renderDurationMs: number }}
   */
  onSymptomClicked(symptomKey) {
    const parts = getPartsForSymptom(symptomKey);
    this._currentSymptom = symptomKey;
    this._highlightedParts = parts;

    const start = Date.now();
    this._render(symptomKey, parts);
    const elapsed = Date.now() - start;

    this._renderStartTime = start;
    this._lastRenderDurationMs = elapsed;

    return {
      symptomKey,
      highlightedParts: parts.slice(),
      renderDurationMs: elapsed,
    };
  }

  /**
   * Clears the currently active symptom overlay.
   */
  clearOverlay() {
    this._currentSymptom = null;
    this._highlightedParts = [];
    this._clear();
  }

  /**
   * Returns the symptom key currently being shown, or null.
   * @returns {string|null}
   */
  getCurrentSymptom() {
    return this._currentSymptom;
  }

  /**
   * Returns the list of part IDs currently highlighted.
   * @returns {string[]}
   */
  getHighlightedParts() {
    return this._highlightedParts.slice();
  }

  /**
   * Returns the measured render duration of the last onSymptomClicked call.
   * Useful for performance assertions in Scenario 9 automated tests.
   * @returns {number|null} milliseconds, or null if never called
   */
  getLastRenderDurationMs() {
    return this._lastRenderDurationMs;
  }
}

module.exports = { SymptomOverlay };
