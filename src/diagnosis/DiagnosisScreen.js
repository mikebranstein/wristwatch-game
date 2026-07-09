/**
 * DiagnosisScreen — orchestrates all six guided-fault-diagnosis subsystems.
 *
 * This is the top-level module that wires together:
 *   1. SymptomOverlay       — AC1: symptom → parts highlight
 *   2. HintSystem           — AC2: voluntary 3-tier hint ladder
 *   3. TooltipSystem        — AC3: inline horology glossary tooltips
 *   4. TutorialOverlay      — AC4: first-time walkthrough, skippable
 *   5. ConfidenceIndicator  — real-time part selection confidence
 *   6. TelemetryEmitter     — AC5: all six named events
 *
 * Design constraint: uses ONLY the existing hint/tutorial framework; no new
 * engine architectural systems introduced.
 */

const { SymptomOverlay } = require('./SymptomOverlay');
const { HintSystem } = require('./HintSystem');
const { ConfidenceIndicator } = require('./ConfidenceIndicator');
const { TooltipSystem } = require('../tooltips/TooltipSystem');
const { TutorialOverlay } = require('../tutorials/TutorialOverlay');
const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');
const { PlayerSaveState } = require('../state/PlayerSaveState');

class DiagnosisScreen {
  /**
   * @param {Object} opts
   * @param {Function}  opts.instrumentationHook — existing telemetry hook
   * @param {Function}  opts.renderOverlay        — visual overlay renderer
   * @param {Function}  opts.clearOverlay         — visual overlay clear fn
   * @param {Object}    opts.eventBus             — existing UI event bus
   * @param {Function}  opts.onConfidenceUpdate   — callback for confidence changes
   * @param {Object}    [opts.initialSaveState]   — pre-loaded save data (optional)
   */
  constructor(opts) {
    const {
      instrumentationHook,
      renderOverlay,
      clearOverlay,
      eventBus,
      onConfidenceUpdate,
      initialSaveState = {},
    } = opts;

    this._saveState = new PlayerSaveState(initialSaveState);
    this._telemetry = new TelemetryEmitter(instrumentationHook);
    this._symptomOverlay = new SymptomOverlay(renderOverlay, clearOverlay);
    this._hintSystem = new HintSystem(this._telemetry);
    this._tooltipSystem = new TooltipSystem();
    this._tutorialOverlay = new TutorialOverlay(this._saveState, this._telemetry);
    this._confidenceIndicator = new ConfidenceIndicator(eventBus, onConfidenceUpdate);

    this._activeFaultInstanceId = null;
    this._activeFaultTypeId = null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fault lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Called when the player enters the diagnosis screen for a specific fault.
   *
   * @param {string} faultInstanceId — unique per encounter
   * @param {string} faultTypeId     — maps to fault-hints data
   */
  enterDiagnosis(faultInstanceId, faultTypeId) {
    this._activeFaultInstanceId = faultInstanceId;
    this._activeFaultTypeId = faultTypeId;

    // Register hint instance (resets tier for new instance — Scenario 10)
    this._hintSystem.registerFaultInstance(faultInstanceId, faultTypeId);

    // Show tutorial overlay on first-ever fault (AC4 / Scenarios 3, 4, 8)
    this._tutorialOverlay.tryShow(faultInstanceId);
  }

  /**
   * Called when the player submits their diagnosis.
   * Emits the appropriate telemetry completion event (AC5).
   *
   * @param {string} faultInstanceId
   * @param {string} diagnosedPartId
   */
  submitDiagnosis(faultInstanceId, diagnosedPartId) {
    const hintUsed = this._hintSystem.wasHintUsed(faultInstanceId);
    if (hintUsed) {
      const highestTier = this._hintSystem.getCurrentTier(faultInstanceId);
      this._telemetry.diagnosisCompletedWithHint(faultInstanceId, highestTier);
    } else {
      this._telemetry.diagnosisCompletedWithoutHint(faultInstanceId);
    }
    this._symptomOverlay.clearOverlay();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Symptom overlay (AC1)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Player clicks a symptom label.
   * @param {string} symptomKey
   */
  onSymptomClicked(symptomKey) {
    const result = this._symptomOverlay.onSymptomClicked(symptomKey);
    // Update confidence indicator candidate parts for the newly active symptom
    this._confidenceIndicator.setActiveCandidateParts(result.highlightedParts);
    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hint system (AC2)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Player voluntarily requests the next hint tier.
   * @returns {{ tier: number, text: string }|null}
   */
  requestHint() {
    if (!this._activeFaultInstanceId) return null;
    return this._hintSystem.requestNextHint(this._activeFaultInstanceId);
  }

  /**
   * Returns true if more hints are available for the active fault.
   * @returns {boolean}
   */
  hasMoreHints() {
    if (!this._activeFaultInstanceId) return false;
    return this._hintSystem.hasMoreHints(this._activeFaultInstanceId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Tooltip system (AC3)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns tooltip data for a term key (shown on hover/tap).
   * @param {string} termKey
   * @returns {{term: string, definition: string}|null}
   */
  getTooltip(termKey) {
    return this._tooltipSystem.getTooltip(termKey);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Tutorial overlay (AC4)
  // ──────────────────────────────────────────────────────────────────────────

  skipTutorial() {
    this._tutorialOverlay.skip();
  }

  advanceTutorial() {
    return this._tutorialOverlay.nextStep();
  }

  isTutorialVisible() {
    return this._tutorialOverlay.isVisible();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ──────────────────────────────────────────────────────────────────────────

  getTelemetry() {
    return this._telemetry;
  }

  getSaveState() {
    return this._saveState;
  }

  getConfidenceIndicator() {
    return this._confidenceIndicator;
  }

  getTooltipSystem() {
    return this._tooltipSystem;
  }

  /**
   * Cleanup — unsubscribes event bus listeners.  Call when navigating away
   * from the diagnosis screen.
   */
  destroy() {
    this._confidenceIndicator.destroy();
  }
}

module.exports = { DiagnosisScreen };
