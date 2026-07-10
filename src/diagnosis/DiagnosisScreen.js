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
const { AdaptiveCoachingController } = require('./AdaptiveCoachingController');

class DiagnosisScreen {
  /**
   * @param {Object} opts
   * @param {Function}  opts.instrumentationHook — existing telemetry hook
   * @param {Function}  opts.renderOverlay        — visual overlay renderer
   * @param {Function}  opts.clearOverlay         — visual overlay clear fn
   * @param {Object}    opts.eventBus             — existing UI event bus
   * @param {Function}  opts.onConfidenceUpdate   — callback for confidence changes
   * @param {Object}    [opts.initialSaveState]   — pre-loaded save data (optional)
   * @param {Function}  [opts.onCoachingTrigger]  — called when coaching_trigger fires
   *                                                 payload: { type, stepId, failureCount }
   *                                                 (Issue #293 — AC1 integration hook)
   * @param {number}    [opts.coachingThreshold]  — mistake threshold for coaching trigger
   *                                                 (Issue #293 — AC3; defaults to 2)
   */
  constructor(opts) {
    const {
      instrumentationHook,
      renderOverlay,
      clearOverlay,
      eventBus,
      onConfidenceUpdate,
      initialSaveState = {},
      onCoachingTrigger = () => {},
      coachingThreshold,
    } = opts;

    this._saveState = new PlayerSaveState(initialSaveState);
    this._telemetry = new TelemetryEmitter(instrumentationHook);
    this._symptomOverlay = new SymptomOverlay(renderOverlay, clearOverlay);
    this._hintSystem = new HintSystem(this._telemetry);
    this._tooltipSystem = new TooltipSystem();
    this._tutorialOverlay = new TutorialOverlay(this._saveState, this._telemetry);
    this._confidenceIndicator = new ConfidenceIndicator(eventBus, onConfidenceUpdate);

    // Issue #293 — Adaptive Coaching Engine: mistake-pattern detection controller.
    // Direct-callback integration pattern: DiagnosisScreen calls the controller
    // explicitly on each mistake interaction rather than via TelemetryEmitter
    // subscription (AC1, AC6 — additive, no existing signatures modified).
    const coachingOpts = { onCoachingTrigger };
    if (coachingThreshold !== undefined) coachingOpts.threshold = coachingThreshold;
    this._coachingController = new AdaptiveCoachingController(coachingOpts);

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

    // Issue #293 — Reset coaching counters for the new fault step (AC4 / Scenario 5)
    this._coachingController.resetStep(faultInstanceId);
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
  // Adaptive Coaching — mistake-type event hooks (Issue #293)
  //
  // Called by the game engine / UI layer when a diagnosis-phase mistake
  // interaction occurs.  Each method:
  //   1. Emits the corresponding named telemetry event (additive TelemetryEmitter
  //      convenience method — AC6, zero breaking changes).
  //   2. Records the mistake with the AdaptiveCoachingController so the
  //      per-step counter increments and coaching_trigger fires at threshold (AC1–AC3).
  //
  // AC5 phase isolation: these methods must only be called while the player
  // is in the diagnosis phase (i.e., after enterDiagnosis and before navigation
  // away from the diagnosis screen).  Non-diagnosis undo events (e.g. reassembly)
  // go through their own paths and never touch this controller.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Signal that the player selected an incorrect tool during diagnosis.
   * Emits wrong_tool_selected telemetry and increments the coaching counter.
   *
   * @param {string} toolId  The (incorrect) tool the player selected
   */
  onWrongToolSelected(toolId) {
    if (!this._activeFaultInstanceId) return;
    this._telemetry.wrongToolSelected(this._activeFaultInstanceId, toolId);
    this._coachingController.recordWrongToolSelected(this._activeFaultInstanceId, toolId);
  }

  /**
   * Signal that the player submitted an incorrect fault type during diagnosis.
   * Emits fault_type_misidentified telemetry and increments the coaching counter.
   *
   * @param {string} submittedFaultTypeId  The (incorrect) fault type the player submitted
   */
  onFaultTypeMisidentified(submittedFaultTypeId) {
    if (!this._activeFaultInstanceId) return;
    this._telemetry.faultTypeMisidentified(this._activeFaultInstanceId, submittedFaultTypeId);
    this._coachingController.recordFaultTypeMisidentified(this._activeFaultInstanceId, submittedFaultTypeId);
  }

  /**
   * Signal that the player attempted to undo a diagnosis during the diagnosis phase.
   * Emits diagnosis_undo_attempted telemetry and increments the coaching counter.
   * Note: does NOT respond to reassembly-phase undo_attempted events (AC5).
   */
  onDiagnosisUndoAttempted() {
    if (!this._activeFaultInstanceId) return;
    this._telemetry.diagnosisUndoAttempted(this._activeFaultInstanceId);
    this._coachingController.recordDiagnosisUndoAttempted(this._activeFaultInstanceId);
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
   * Returns the AdaptiveCoachingController instance (Issue #293).
   * Exposed for testing and QA; not intended for production callers.
   * @returns {AdaptiveCoachingController}
   */
  getAdaptiveCoachingController() {
    return this._coachingController;
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
