/**
 * LoupeFaultCueController — orchestrates Phase 1 loupe fault-signal A/B test.
 *
 * Issue #117 — Scaffolded Fault-Signal System: Phase 1 Loupe Visual Cues.
 *
 * Responsibilities:
 *   1. A/B arm assignment (treatment | control): written once to PlayerSaveState
 *      at session creation, read-only thereafter — survives pause/resume/reload
 *      without re-randomisation (AC3, design risk mitigation).
 *   2. Loupe lifecycle management: activates the LoupeViewportRenderer only for
 *      the treatment arm; control arm players get the same loupe experience as
 *      pre-feature baseline (AC3).
 *   3. Component rendering: routes renderComponentInLoupe() calls through
 *      LoupeViewportRenderer for treatment arm; returns signalApplied:false for
 *      control arm without invoking any renderer path.
 *   4. Telemetry: emits three new events (additive, no changes to existing events):
 *        loupe_cue_arm_assigned     — once at arm assignment
 *        loupe_time_before_first_hint — fired on first hint request, carries elapsed ms and arm
 *        loupe_diagnosis_without_hint_sample — fired at each diagnosis completion,
 *          carries running diagnosis-without-hint % and arm for post-test analysis
 *
 * Design contract (Design Decision, Issue #117):
 *   "A/B arm stored on session record at creation time; session restore reads from
 *    record and never re-randomizes regardless of reconnect path."
 *
 *   "Each component signal overlay is bounded to its own render target with no
 *    shared overlay texture between adjacent components." — enforced by
 *    LoupeViewportRenderer.renderComponent().
 *
 * A/B success threshold (pre-launch requirement, Issue #117 constraints):
 *   ≥15% lift in 'diagnosis-without-hint %' for treatment vs. control arm before
 *   Phase 2 gates open. This threshold must be formally documented on the issue
 *   before test launch.
 */

const VALID_ARMS = ['treatment', 'control'];

/** Pre-launch A/B success threshold: ≥15% lift in diagnosis-without-hint % */
const AB_SUCCESS_THRESHOLD_PCT = 15;

class LoupeFaultCueController {
  /**
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   * @param {import('./LoupeViewportRenderer').LoupeViewportRenderer} loupeViewportRenderer
   * @param {Function} [randomFn]  Injected RNG for deterministic testing (default: Math.random)
   */
  constructor(saveState, telemetry, loupeViewportRenderer, randomFn = Math.random) {
    this._saveState = saveState;
    this._telemetry = telemetry;
    this._renderer = loupeViewportRenderer;
    this._randomFn = randomFn;

    // Per-session diagnosis metrics for diagnosis-without-hint % tracking (AC4)
    this._diagnosisCount = 0;
    this._diagnosisWithoutHintCount = 0;

    // Per-diagnosis state — reset on each startDiagnosis() call
    this._diagnosisStartTime = null;
    this._firstHintEmittedThisDiagnosis = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // A/B arm assignment (AC3)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Assigns this session to the treatment or control arm.
   * Written synchronously to PlayerSaveState BEFORE any game-loop code runs.
   * Idempotent: if an arm is already assigned (e.g., session restore), returns
   * the existing arm without re-randomising (AC3 consistency invariant).
   *
   * @param {string} [sessionId]  Optional session identifier for telemetry payload
   * @returns {'treatment'|'control'}  The assigned (or pre-existing) arm
   */
  assignArm(sessionId = '') {
    const existing = this._saveState.get('ab_loupe_cues_arm');
    if (existing && VALID_ARMS.includes(existing)) {
      // Already assigned — never re-randomise mid-session or on reconnect
      return existing;
    }
    // ~50/50 split (AC3)
    const arm = this._randomFn() < 0.5 ? 'treatment' : 'control';
    // Write synchronously before any game-loop code (AC3 invariant)
    this._saveState.set('ab_loupe_cues_arm', arm);
    this._telemetry.loupeCueArmAssigned(arm, sessionId);
    return arm;
  }

  /**
   * Returns true when this session is in the treatment arm (loupe cues active).
   * @returns {boolean}
   */
  isInTreatment() {
    return this._saveState.get('ab_loupe_cues_arm') === 'treatment';
  }

  /**
   * Returns the current arm value, or null if not yet assigned.
   * @returns {'treatment'|'control'|null}
   */
  getArm() {
    return this._saveState.get('ab_loupe_cues_arm') || null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Diagnosis lifecycle (AC4 telemetry)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Called when the player enters the diagnosis phase for a new fault instance.
   * Resets per-diagnosis state and starts the hint-timing clock (AC4).
   *
   * @param {string} faultInstanceId
   */
  startDiagnosis(faultInstanceId) {
    this._diagnosisStartTime = Date.now();
    this._firstHintEmittedThisDiagnosis = false;
    this._diagnosisCount++;
  }

  /**
   * Called when the player requests their first hint for the active diagnosis.
   * Emits loupe_time_before_first_hint with elapsed milliseconds and A/B arm (AC4).
   * Idempotent within a single diagnosis — fires once per diagnosis only.
   *
   * @param {string} faultInstanceId
   */
  recordFirstHint(faultInstanceId) {
    if (this._firstHintEmittedThisDiagnosis) return;
    this._firstHintEmittedThisDiagnosis = true;

    const elapsedMs = this._diagnosisStartTime !== null
      ? Date.now() - this._diagnosisStartTime
      : null;
    const arm = this.getArm();
    this._telemetry.loupeTimeBeforeFirstHint(faultInstanceId, elapsedMs, arm);
  }

  /**
   * Called at the end of each diagnosis to record the outcome.
   * Increments session-level hint/no-hint counters and emits
   * loupe_diagnosis_without_hint_sample with the running percentage (AC4).
   *
   * @param {string} faultInstanceId
   * @param {boolean} usedHint  true if any hint tier was used during this diagnosis
   */
  recordDiagnosisOutcome(faultInstanceId, usedHint) {
    if (!usedHint) {
      this._diagnosisWithoutHintCount++;
    }
    const pct = this._diagnosisCount > 0
      ? Math.round((this._diagnosisWithoutHintCount / this._diagnosisCount) * 100)
      : 0;
    const arm = this.getArm();
    this._telemetry.loupeDiagnosisWithoutHintSample(faultInstanceId, pct, arm);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Loupe viewport lifecycle (AC1, AC2)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Activates the loupe viewport.
   * Treatment arm: activates the fault-signal overlay layer in the renderer.
   * Control arm: loupe activates normally but the overlay layer is never invoked,
   *   preserving the pre-feature baseline experience for the control cohort (AC3).
   */
  activateLoupe() {
    if (this.isInTreatment()) {
      this._renderer.activateLoupe();
    }
    // Control arm: loupe viewport is active but overlay layer remains off
  }

  /**
   * Deactivates the loupe viewport.
   * Clears overlay layer for treatment arm; no-op for control arm renderer state.
   */
  deactivateLoupe() {
    this._renderer.deactivateLoupe();
  }

  /**
   * Renders a component inside the loupe viewport.
   *
   * Treatment arm: delegates to LoupeViewportRenderer, which applies the
   *   fault-signal overlay if the fault type is on the allowlist (AC1).
   * Control arm: returns signalApplied:false immediately without invoking
   *   the renderer, preserving baseline behaviour exactly (AC3).
   *
   * @param {string} componentId
   * @param {string|null|undefined} faultType
   * @returns {{ signalApplied: boolean, componentId?: string, variant?: string }}
   */
  renderComponentInLoupe(componentId, faultType) {
    if (!this.isInTreatment()) {
      return { signalApplied: false };
    }
    return this._renderer.renderComponent(componentId, faultType);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Session-level metrics (for post-test analysis retrieval)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the session-level diagnosis count.
   * @returns {number}
   */
  getDiagnosisCount() {
    return this._diagnosisCount;
  }

  /**
   * Returns the number of diagnoses completed without using any hint.
   * @returns {number}
   */
  getDiagnosisWithoutHintCount() {
    return this._diagnosisWithoutHintCount;
  }
}

module.exports = {
  LoupeFaultCueController,
  VALID_ARMS,
  AB_SUCCESS_THRESHOLD_PCT,
};
