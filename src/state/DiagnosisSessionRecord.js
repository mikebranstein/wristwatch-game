/**
 * DiagnosisSessionRecord — session-level record for the loupe A/B test.
 *
 * Issue #117 — Scaffolded Fault-Signal System, Phase 1: Loupe Visual Cues
 *
 * AC3: Each new session is assigned consistently to 'treatment' or 'control'
 *   (~50/50 split).  The arm is written ONCE at session creation and is
 *   READ-ONLY thereafter — never re-randomised on session reload.
 *   - Session restore: pass `arm` from the serialised snapshot to the constructor.
 *   - fromSnapshot() restores the same arm without re-randomising.
 *
 * AC4: Tracks session-level metrics retrievable for post-test analysis:
 *   - time-before-first-hint: elapsed ms from diagnosis start to first hint request
 *     (null if player completed without requesting any hint)
 *   - diagnosis-without-hint %: boolean per session (true = no hints used)
 *   Both metrics are tagged with the A/B arm.
 */

class DiagnosisSessionRecord {
  /**
   * @param {Object} [opts]
   * @param {string|null} [opts.sessionId]          Unique session identifier.
   * @param {'treatment'|'control'|null} [opts.arm] Pre-assigned arm for session restore.
   *   If null (default), arm is randomly assigned ~50/50.
   * @param {Function} [opts.randomSource]           Override Math.random for testing.
   */
  constructor({ sessionId = null, arm = null, randomSource = Math.random } = {}) {
    this._sessionId = sessionId;

    if (arm !== null) {
      // Session restore path: use the pre-assigned arm, never re-randomise (AC3)
      if (arm !== 'treatment' && arm !== 'control') {
        throw new Error(
          `Invalid A/B arm value: "${arm}". Must be "treatment" or "control".`
        );
      }
      this._arm = arm;
    } else {
      // New session: assign arm once, ~50/50 split (AC3)
      this._arm = randomSource() < 0.5 ? 'treatment' : 'control';
    }

    this._diagnosisStartTime  = null;  // ms timestamp — set on startDiagnosis()
    this._firstHintTime       = null;  // ms timestamp — set on recordFirstHintRequest()
    this._diagnosisCompleted  = false;
    this._diagnosedWithoutHint = null; // boolean, set on completeDiagnosis()
  }

  // ── Arm (read-only after construction) ────────────────────────────────────

  /**
   * The A/B arm this session was assigned to.  Read-only after construction.
   * @returns {'treatment'|'control'}
   */
  get arm() {
    return this._arm;
  }

  /** @returns {string|null} */
  get sessionId() {
    return this._sessionId;
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  /**
   * Called when the player enters the diagnosis phase.
   * Records the start timestamp.  Idempotent — safe to call more than once.
   *
   * @param {number} [nowMs]  Override Date.now() for deterministic tests.
   */
  startDiagnosis(nowMs = Date.now()) {
    if (this._diagnosisStartTime !== null) return; // idempotent
    this._diagnosisStartTime = nowMs;
  }

  /**
   * Called on the player's first hint request.
   * Records the timestamp used to calculate time-before-first-hint (AC4).
   * Idempotent — only the FIRST call records a timestamp.
   *
   * @param {number} [nowMs]
   */
  recordFirstHintRequest(nowMs = Date.now()) {
    if (this._firstHintTime !== null) return; // only first request counts
    this._firstHintTime = nowMs;
  }

  /**
   * Called when the player submits their diagnosis.
   * Records whether the session was completed without using any hint (AC4).
   *
   * @param {boolean} diagnosedWithoutHint
   */
  completeDiagnosis(diagnosedWithoutHint) {
    this._diagnosisCompleted   = true;
    this._diagnosedWithoutHint = diagnosedWithoutHint;
  }

  // ── Metrics retrieval (AC4) ───────────────────────────────────────────────

  /**
   * Returns time-before-first-hint in milliseconds (AC4).
   * Returns null if the player completed without requesting any hint.
   *
   * @returns {number|null}
   */
  getTimeBeforeFirstHint() {
    if (this._diagnosisStartTime === null || this._firstHintTime === null) {
      return null;
    }
    return this._firstHintTime - this._diagnosisStartTime;
  }

  /**
   * Returns whether the session was completed without using any hint (AC4).
   * Returns null if completeDiagnosis() has not been called yet.
   *
   * @returns {boolean|null}
   */
  getDiagnosedWithoutHint() {
    return this._diagnosedWithoutHint;
  }

  /**
   * Returns a full metrics snapshot for post-test analysis (AC4).
   * All fields are tagged with the A/B arm for segmented analysis.
   *
   * @returns {{
   *   sessionId: string|null,
   *   arm: string,
   *   timeBeforeFirstHintMs: number|null,
   *   diagnosedWithoutHint: boolean|null,
   *   diagnosisCompleted: boolean,
   * }}
   */
  getSessionMetrics() {
    return {
      sessionId:             this._sessionId,
      arm:                   this._arm,
      timeBeforeFirstHintMs: this.getTimeBeforeFirstHint(),
      diagnosedWithoutHint:  this._diagnosedWithoutHint,
      diagnosisCompleted:    this._diagnosisCompleted,
    };
  }

  // ── Serialisation for session save/restore (AC3) ──────────────────────────

  /**
   * Returns a serialisable snapshot of the arm for session save/restore.
   * Store this alongside the session data; pass `arm` back to the constructor
   * on reload to prevent re-randomisation.
   *
   * @returns {{ sessionId: string|null, arm: string }}
   */
  toSerializable() {
    return {
      sessionId: this._sessionId,
      arm:       this._arm,
    };
  }

  /**
   * Restores a DiagnosisSessionRecord from a serialised snapshot.
   * The arm from the snapshot is pre-assigned — prevents re-randomisation (AC3).
   *
   * @param {{ sessionId: string|null, arm: string }} snapshot
   * @returns {DiagnosisSessionRecord}
   */
  static fromSnapshot(snapshot) {
    return new DiagnosisSessionRecord({
      sessionId: snapshot.sessionId,
      arm:       snapshot.arm,
    });
  }
}

module.exports = { DiagnosisSessionRecord };