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
 *   7. LoupeViewport        — Issue #117 AC1/AC2: loupe-only fault-signal overlay
 *   8. DiagnosisSessionRecord — Issue #117 AC3/AC4: A/B arm + session metrics
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
   * @param {import('./LoupeViewport').LoupeViewport|null} [opts.loupeViewport]
   *   — Issue #117: loupe viewport renderer with fault-signal overlay (optional).
   *     When provided, onLoupeInspect() applies signals for treatment arm sessions.
   * @param {import('../state/DiagnosisSessionRecord').DiagnosisSessionRecord|null}
   *   [opts.diagnosisSessionRecord]
   *   — Issue #117: session record for A/B arm + telemetry metrics (optional).
   *     When provided, session timing and diagnosis-without-hint % are tracked.
   */
  constructor(opts) {
    const {
      instrumentationHook,
      renderOverlay,
      clearOverlay,
      eventBus,
      onConfidenceUpdate,
      initialSaveState = {},
      loupeViewport = null,
      diagnosisSessionRecord = null,
    } = opts;

    this._saveState = new PlayerSaveState(initialSaveState);
    this._telemetry = new TelemetryEmitter(instrumentationHook);
    this._symptomOverlay = new SymptomOverlay(renderOverlay, clearOverlay);
    this._hintSystem = new HintSystem(this._telemetry);
    this._tooltipSystem = new TooltipSystem();
    this._tutorialOverlay = new TutorialOverlay(this._saveState, this._telemetry);
    this._confidenceIndicator = new ConfidenceIndicator(eventBus, onConfidenceUpdate);

    // Issue #117: optional loupe A/B subsystems
    this._loupeViewport = loupeViewport;
    this._diagnosisSessionRecord = diagnosisSessionRecord;

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

    // Issue #117: start diagnosis session timer for time-before-first-hint metric (AC4)
    if (this._diagnosisSessionRecord) {
      this._diagnosisSessionRecord.startDiagnosis();
    }
  }

  /**
   * Called when the player submits their diagnosis.
   * Emits the appropriate telemetry completion event (AC5).
   * Issue #117: also emits loupe A/B session completion telemetry (AC4).
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

    // Issue #117: complete session record and emit loupe A/B telemetry (AC4)
    if (this._diagnosisSessionRecord) {
      const diagnosedWithoutHint = !hintUsed;
      this._diagnosisSessionRecord.completeDiagnosis(diagnosedWithoutHint);
      const metrics = this._diagnosisSessionRecord.getSessionMetrics();
      this._telemetry.diagnosisSessionCompleted(
        metrics.sessionId,
        metrics.arm,
        diagnosedWithoutHint
      );
      // Emit time-before-first-hint if a hint was used (AC4)
      if (!diagnosedWithoutHint && metrics.timeBeforeFirstHintMs !== null) {
        this._telemetry.timeBeforeFirstHintRecorded(
          metrics.sessionId,
          metrics.arm,
          metrics.timeBeforeFirstHintMs
        );
      }
    }
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
   * Issue #117: records first hint request timestamp for time-before-first-hint metric (AC4).
   * @returns {{ tier: number, text: string }|null}
   */
  requestHint() {
    if (!this._activeFaultInstanceId) return null;
    // Issue #117: record first hint time in session record (AC4)
    if (this._diagnosisSessionRecord) {
      this._diagnosisSessionRecord.recordFirstHintRequest();
    }
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
  // Loupe viewport — Issue #117 (AC1, AC2, AC3)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Called when the player uses the loupe tool on a component.
   * Delegates to the LoupeViewport to apply the fault-signal overlay (AC1).
   * Signal is only rendered if:
   *   (a) loupeViewport is configured,
   *   (b) the session arm is 'treatment',
   *   (c) the component has a recognized fault type.
   *
   * @param {string} componentId
   * @param {string|null} faultTypeId
   * @returns {{ componentId: string, variant: string, description: string }|null}
   */
  onLoupeInspect(componentId, faultTypeId) {
    if (!this._loupeViewport || !this._diagnosisSessionRecord) return null;
    return this._loupeViewport.inspectComponent(
      componentId,
      faultTypeId,
      this._diagnosisSessionRecord.arm
    );
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
   * Returns the LoupeViewport instance (Issue #117 — for testing & QA).
   * @returns {import('./LoupeViewport').LoupeViewport|null}
   */
  getLoupeViewport() {
    return this._loupeViewport;
  }

  /**
   * Returns the DiagnosisSessionRecord instance (Issue #117 — for testing & QA).
   * @returns {import('../state/DiagnosisSessionRecord').DiagnosisSessionRecord|null}
   */
  getDiagnosisSessionRecord() {
    return this._diagnosisSessionRecord;
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