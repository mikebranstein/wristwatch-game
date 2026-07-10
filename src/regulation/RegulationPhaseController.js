/**
 * RegulationPhaseController — orchestrates the Movement Regulation Phase.
 *
 * Issue #294 — Movement Regulation Phase 1
 *
 * Inserts a new mandatory Regulation phase between reassembly and delivery for
 * "precision-certified" client jobs (regulation_required: true).
 *
 * Acceptance Criteria implemented:
 *   AC1 — Phase entry: timegrapher display visible, regulator interactive, deviation shown
 *   AC2 — submitCalibration(): awards grade when in Acceptable band; player may re-submit
 *   AC3 — Visual indicator ON by default (delegated to TimegrapherDisplay)
 *   AC4 — executeAssistMode(): auto-adjusts regulator; display and grade sequence still play out
 *   AC5 — completePhase() returns regulationGrade + accuracyScore for delivery injection
 *   AC6 — Four telemetry events fired with correct payloads
 *
 * Build-start design decision (per design mitigation):
 *   regulation_accuracy is added as a NEW 7th dimension in JobQualityAggregator
 *   (option a: separate dimension, not the timing_calibration slot). This keeps
 *   timing_calibration (time-efficiency via TimingCalibrationTracker) and
 *   regulation_accuracy (beat-rate precision) as distinct signals.
 *   Integration path: regulation_accuracy score injected via existing
 *   injectDimensionScores interface in DeliveryHandler.handleDelivery().
 *
 * Phase states (exposed for QA assertions):
 *   IDLE        — phase not started
 *   ACTIVE      — regulator is interactive; player is adjusting
 *   SUBMITTED   — player submitted calibration; grade awarded
 *   ASSIST_EXEC — assist mode executing (auto-calibrating to target)
 *   COMPLETED   — phase complete; grade returned to delivery layer
 */
'use strict';

const { ASSIST_MODE_TARGET_DEVIATION } = require('./RegulationConfig');
const { RegulatorSimulator }           = require('./RegulatorSimulator');
const { RegulationGradeEngine }        = require('./RegulationGradeEngine');
const { TimegrapherDisplay }           = require('./TimegrapherDisplay');
const { RegulationTutorial }           = require('./RegulationTutorial');
const { RegulationAudioController }    = require('./RegulationAudioController');

/** Phase state labels for QA assertions. */
const PHASE_STATE = Object.freeze({
  IDLE:        'idle',
  ACTIVE:      'active',
  SUBMITTED:   'submitted',
  ASSIST_EXEC: 'assist_exec',
  COMPLETED:   'completed',
});

class RegulationPhaseController {
  /**
   * @param {Object}       opts
   * @param {Object}       opts.saveState           PlayerSaveState-compatible object
   * @param {Object}       opts.telemetryEmitter    TelemetryEmitter instance
   * @param {Function}     opts.renderFn            (viewModel) => void — timegrapher render hook
   * @param {Function|null} [opts.audioHook]        (cueId) => void — optional audio hook
   * @param {boolean}      [opts.audioEnabled]      Default: true
   * @param {boolean}      [opts.visualIndicatorOn] Default: true (AC3)
   * @param {number|null}  [opts.initialDeviation]  Override for deterministic testing
   */
  constructor({
    saveState,
    telemetryEmitter,
    renderFn,
    audioHook         = null,
    audioEnabled      = true,
    visualIndicatorOn = true,
    initialDeviation  = null,
  }) {
    this._saveState      = saveState;
    this._telemetry      = telemetryEmitter;
    this._phaseState     = PHASE_STATE.IDLE;
    this._attemptCount   = 0;
    this._currentGrade   = null;
    this._assistModeUsed = false;
    this._jobId          = null;

    // Subsystems
    this._simulator = new RegulatorSimulator(
      initialDeviation !== null ? { initialDeviation } : {}
    );

    this._display = new TimegrapherDisplay({ renderFn, visualIndicatorOn });

    this._tutorial = new RegulationTutorial({ saveState });

    this._audio = audioHook
      ? new RegulationAudioController({ audioHook, audioEnabled })
      : null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Enter the regulation phase.
   *
   * AC1: timegrapher display becomes visible, regulator control becomes interactive,
   * and current beat-rate deviation is shown in real time.
   * Shows first-run tutorial if not yet seen (Test Scenario 1, Test Scenario 7).
   * Emits: regulation_phase_started (AC6).
   *
   * @param {string} [jobId]  Current job ID for telemetry/save association
   * @returns {{ phaseState: string, tutorialShown: boolean, deviation: number }}
   */
  enterPhase(jobId = null) {
    if (this._phaseState !== PHASE_STATE.IDLE) {
      throw new Error('[RegulationPhaseController] enterPhase() called while phase is not IDLE.');
    }

    this._jobId      = jobId;
    this._phaseState = PHASE_STATE.ACTIVE;
    this._attemptCount = 0;

    // Show tutorial on first regulation encounter (Test Scenarios 1, 7)
    const tutorialShown = this._tutorial.tryShow();

    // Initial timegrapher render (AC1)
    this._renderCurrentState();

    // Audio: start with deviation-appropriate cue
    if (this._audio) {
      this._audio.reset();
      this._audio.updateForDeviation(this._simulator.getDeviation());
    }

    // AC6: emit phase_started
    this._telemetry.emit('regulation_phase_started', {
      jobId,
      initialDeviation: this._simulator.getDeviation(),
    });

    return {
      phaseState:    this._phaseState,
      tutorialShown,
      deviation:     this._simulator.getDeviation(),
    };
  }

  /**
   * Adjust the regulator index interactively.
   *
   * AC1: regulator control is interactive; deviation updates in real time.
   * May be called while phase is ACTIVE or SUBMITTED (player adjusting after first submit).
   *
   * @param {number} index  New regulator index (0–100)
   * @returns {{ deviation: number, grade: string|null, regulatorIndex: number }}
   */
  adjustRegulator(index) {
    if (this._phaseState !== PHASE_STATE.ACTIVE && this._phaseState !== PHASE_STATE.SUBMITTED) {
      return this._currentDisplayState();
    }

    this._simulator.setRegulatorIndex(index);
    const deviation = this._simulator.getDeviation();
    const grade     = RegulationGradeEngine.computeGrade(deviation);

    // Update audio feedback
    if (this._audio) {
      this._audio.updateForDeviation(deviation);
    }

    // Re-render display (AC1: real-time update)
    this._renderCurrentState();

    return { deviation, grade, regulatorIndex: this._simulator.getRegulatorIndex() };
  }

  /**
   * Submit the current calibration.
   *
   * AC2: Awards grade based on current deviation. Phase is NOT automatically
   * completed — player may continue adjusting and re-submit to reach a higher grade.
   * Emits: regulation_grade_achieved (AC6).
   *
   * @returns {{ grade: string|null, isPassing: boolean, deviation: number, attemptNumber: number }}
   */
  submitCalibration() {
    if (this._phaseState !== PHASE_STATE.ACTIVE && this._phaseState !== PHASE_STATE.SUBMITTED) {
      return {
        grade:         null,
        isPassing:     false,
        deviation:     this._simulator.getDeviation(),
        attemptNumber: this._attemptCount,
      };
    }

    this._attemptCount += 1;
    const deviation = this._simulator.getDeviation();
    const grade     = RegulationGradeEngine.computeGrade(deviation);
    const isPassing = grade !== null;

    this._currentGrade = grade;
    this._phaseState   = PHASE_STATE.SUBMITTED;

    // AC6: emit grade_achieved with grade and attempt_number payload
    this._telemetry.emit('regulation_grade_achieved', {
      grade,
      attemptNumber: this._attemptCount,
      isPassing,
      deviation,
      jobId: this._jobId,
    });

    // Re-render to show awarded grade on display
    this._renderCurrentState();

    return { grade, isPassing, deviation, attemptNumber: this._attemptCount };
  }

  /**
   * Complete the phase and return the regulation grade for delivery injection.
   *
   * AC5: regulation grade passed to delivery summary and to Holistic Craftsmanship Score.
   * Emits: regulation_phase_completed (AC6).
   *
   * @returns {{ regulationGrade: string|null, accuracyScore: number|null }}
   */
  completePhase() {
    if (this._phaseState !== PHASE_STATE.SUBMITTED && this._phaseState !== PHASE_STATE.ASSIST_EXEC) {
      throw new Error('[RegulationPhaseController] completePhase() requires a submitted calibration first.');
    }

    this._phaseState = PHASE_STATE.COMPLETED;

    // Stop audio on phase exit
    if (this._audio) this._audio.stop();

    const regulationGrade = this._currentGrade;
    const accuracyScore   = RegulationGradeEngine.gradeToAccuracyScore(regulationGrade);

    // AC6: emit phase_completed
    this._telemetry.emit('regulation_phase_completed', {
      regulationGrade,
      accuracyScore,
      attemptCount:   this._attemptCount,
      assistModeUsed: this._assistModeUsed,
      jobId:          this._jobId,
    });

    return { regulationGrade, accuracyScore };
  }

  /**
   * Execute Assist Mode.
   *
   * AC4: Assist mode does NOT silently skip the phase. The timegrapher display
   * and grade-award sequence still execute in full. Assist mode ONLY auto-adjusts
   * the regulator index to achieve a grade within the Acceptable band.
   *
   * After execution: phase is in SUBMITTED state; call completePhase() to finish.
   * Emits: regulation_assist_mode_used AND regulation_grade_achieved (AC6).
   *
   * @returns {{ regulatorIndex: number, deviation: number, grade: string }}
   */
  executeAssistMode() {
    if (this._phaseState !== PHASE_STATE.ACTIVE) {
      return this._currentDisplayState();
    }

    this._assistModeUsed = true;
    this._phaseState     = PHASE_STATE.ASSIST_EXEC;

    // Auto-calibrate: compute index for target deviation (~0 s/day)
    const targetIndex = this._simulator.computeIndexForDeviation(ASSIST_MODE_TARGET_DEVIATION);
    this._simulator.setRegulatorIndex(targetIndex);

    const deviation = this._simulator.getDeviation();
    const grade     = RegulationGradeEngine.computeGrade(deviation);

    // AC4: grade is still awarded and display plays out in full (NOT a skip)
    this._currentGrade = grade;
    this._attemptCount += 1;

    // Update audio to stable cue (Acceptable zone)
    if (this._audio) {
      this._audio.updateForDeviation(deviation);
    }

    // AC6: emit assist_mode_used
    this._telemetry.emit('regulation_assist_mode_used', {
      targetDeviation:   ASSIST_MODE_TARGET_DEVIATION,
      achievedDeviation: deviation,
      grade,
      jobId: this._jobId,
    });

    // AC6: emit grade_achieved (same contract as manual submission)
    this._telemetry.emit('regulation_grade_achieved', {
      grade,
      attemptNumber: this._attemptCount,
      isPassing:     grade !== null,
      deviation,
      jobId: this._jobId,
    });

    // Transition to SUBMITTED — completePhase() can now be called
    this._phaseState = PHASE_STATE.SUBMITTED;

    // AC4: render display in full (NOT silently skipped)
    this._renderCurrentState();

    return {
      regulatorIndex: this._simulator.getRegulatorIndex(),
      deviation,
      grade,
    };
  }

  // ---------------------------------------------------------------------------
  // Accessors (for testing & QA)
  // ---------------------------------------------------------------------------

  /** @returns {string} Current phase state label. */
  getPhaseState()     { return this._phaseState; }

  /** @returns {string|null} Grade awarded on most recent submission. */
  getCurrentGrade()   { return this._currentGrade; }

  /** @returns {number} Current simulated deviation. */
  getDeviation()      { return this._simulator.getDeviation(); }

  /** @returns {number} Current regulator index (0–100). */
  getRegulatorIndex() { return this._simulator.getRegulatorIndex(); }

  /** @returns {number} Number of submitCalibration() calls made. */
  getAttemptCount()   { return this._attemptCount; }

  /** @returns {boolean} True if assist mode was used in this phase. */
  wasAssistModeUsed() { return this._assistModeUsed; }

  /** TimegrapherDisplay — for direct visual indicator toggle (Test Scenario 5). */
  getDisplay()        { return this._display; }

  /** RegulationTutorial — for direct dismiss/step control. */
  getTutorial()       { return this._tutorial; }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _renderCurrentState() {
    const deviation      = this._simulator.getDeviation();
    const grade          = RegulationGradeEngine.computeGrade(deviation);
    const regulatorIndex = this._simulator.getRegulatorIndex();
    const directionLabel = this._simulator.getDirectionLabel();
    this._display.render(deviation, grade, regulatorIndex, directionLabel);
  }

  _currentDisplayState() {
    return {
      deviation:      this._simulator.getDeviation(),
      grade:          this._currentGrade,
      regulatorIndex: this._simulator.getRegulatorIndex(),
    };
  }
}

module.exports = { RegulationPhaseController, PHASE_STATE };
