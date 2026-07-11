/**
 * ConfidenceIndicator — real-time diagnosis confidence display.
 *
 * AC (design): As players select/deselect candidate parts, the confidence
 * indicator updates in real time:
 *   - "Likely"   — the selected part is the primary (first-listed) candidate
 *                  for the active symptom
 *   - "Possible" — the selected part is a secondary candidate for the symptom
 *   - "Unlikely" — the selected part is not associated with the active symptom
 *
 * Scenario 7: Selecting the correct primary part shows "Likely"; selecting an
 * unrelated part shows "Unlikely".
 *
 * Design note: This component subscribes to part-selection events via the
 * injected `eventBus` at construction time and unsubscribes on `destroy()` to
 * prevent memory leaks (per design risk mitigation).
 */

const CONFIDENCE = {
  LIKELY: 'Likely',
  POSSIBLE: 'Possible',
  UNLIKELY: 'Unlikely',
  NONE: 'None',
};

class ConfidenceIndicator {
  /**
   * @param {Object} eventBus — the existing UI event bus.
   *   Must support `.on(event, handler)` and `.off(event, handler)`.
   * @param {Function} onUpdate — callback invoked with the new confidence
   *   string whenever the state changes: (confidence: string) => void
   */
  constructor(eventBus, onUpdate) {
    if (!eventBus || typeof eventBus.on !== 'function') {
      throw new Error('ConfidenceIndicator requires an eventBus with .on()/.off() methods.');
    }
    if (typeof onUpdate !== 'function') {
      throw new Error('ConfidenceIndicator requires an onUpdate callback.');
    }

    this._eventBus = eventBus;
    this._onUpdate = onUpdate;
    this._activeCandidateParts = []; // current symptom's parts array (ordered: first = primary)
    this._selectedPartId = null;
    this._currentConfidence = CONFIDENCE.NONE;

    // Subscribe to part-selection events at construction time
    this._boundPartSelectedHandler = this._onPartSelected.bind(this);
    this._boundPartDeselectedHandler = this._onPartDeselected.bind(this);
    this._eventBus.on('part:selected', this._boundPartSelectedHandler);
    this._eventBus.on('part:deselected', this._boundPartDeselectedHandler);
  }

  /**
   * Update the set of candidate parts when the active symptom changes.
   * The first element of `candidateParts` is treated as the primary candidate.
   *
   * @param {string[]} candidateParts
   */
  setActiveCandidateParts(candidateParts) {
    this._activeCandidateParts = candidateParts.slice();
    this._recalculate();
  }

  /**
   * Compute the confidence level for the currently selected part.
   * @param {string|null} partId
   * @returns {string} one of the CONFIDENCE values
   */
  computeConfidence(partId) {
    if (!partId || this._activeCandidateParts.length === 0) {
      return CONFIDENCE.NONE;
    }
    const idx = this._activeCandidateParts.indexOf(partId);
    if (idx === -1) return CONFIDENCE.UNLIKELY;
    if (idx === 0) return CONFIDENCE.LIKELY;
    return CONFIDENCE.POSSIBLE;
  }

  /**
   * Returns the current displayed confidence string.
   * @returns {string}
   */
  getCurrentConfidence() {
    return this._currentConfidence;
  }

  /**
   * Unsubscribes from the event bus.  Must be called when the diagnosis screen
   * unmounts to prevent memory leaks.
   */
  destroy() {
    this._eventBus.off('part:selected', this._boundPartSelectedHandler);
    this._eventBus.off('part:deselected', this._boundPartDeselectedHandler);
  }

  // ---- Private ----

  _onPartSelected(partId) {
    this._selectedPartId = partId;
    this._recalculate();
  }

  _onPartDeselected() {
    this._selectedPartId = null;
    this._recalculate();
  }

  _recalculate() {
    const confidence = this.computeConfidence(this._selectedPartId);
    if (confidence !== this._currentConfidence) {
      this._currentConfidence = confidence;
      this._onUpdate(confidence);
    }
  }
}

module.exports = { ConfidenceIndicator, CONFIDENCE };
