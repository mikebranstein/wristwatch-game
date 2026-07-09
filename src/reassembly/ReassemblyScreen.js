/**
 * ReassemblyScreen — top-level orchestrator for the reassembly gate.
 *
 * Wires together:
 *   1. SnapZoneTolerance          — tiered tolerance model (AC1)
 *   2. AssemblyFeedbackStateMachine — 4-state audio/visual feedback (AC2–AC4)
 *   3. TelemetryEmitter           — undo_attempted / reassembly_completed events (AC5)
 *
 * Design pattern mirrors DiagnosisScreen: accepts injected hooks at construction
 * and delegates to subsystems for all domain logic.
 *
 * Screen-context guard: SnapZoneTolerance is constructed with context='reassembly',
 * ensuring no snap zone activation can bleed into teardown/disassembly stages.
 *
 * Playtest gate (AC5): TelemetryEmitter tracks undo_attempted events so post-
 * implementation undo frequency can be compared to the pre-implementation baseline.
 */

const { SnapZoneTolerance } = require('./SnapZoneTolerance');
const { AssemblyFeedbackStateMachine, STATES } = require('./AssemblyFeedbackStateMachine');
const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

class ReassemblyScreen {
  /**
   * @param {Object} opts
   * @param {Function} opts.instrumentationHook — existing telemetry hook
   * @param {Function} opts.playAudio           — (cueName: string) => void
   * @param {Function} opts.renderVisual        — ({ partId, state, stateName, visuals }) => void
   * @param {string}   [opts.sessionId]         — optional session identifier for telemetry
   * @param {number}   [opts.minDwellMs]        — override dwell window (default: 250ms)
   */
  constructor({ instrumentationHook, playAudio, renderVisual, sessionId = null, minDwellMs }) {
    this._telemetry = new TelemetryEmitter(instrumentationHook);
    this._snapZone = new SnapZoneTolerance('reassembly');
    this._fsm = new AssemblyFeedbackStateMachine({
      playAudio,
      renderVisual,
      ...(minDwellMs !== undefined ? { minDwellMs } : {}),
    });

    this._sessionId = sessionId;
    this._assembledParts = new Set();
    this._totalUndoAttempts = 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Part tolerance management
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Override default snap zone tolerances for a specific part.
   * Must satisfy AC1: approach_radius >= 2 × lock_radius.
   *
   * @param {string} partId
   * @param {{ approach_radius: number, lock_radius: number }} tolerances
   */
  setPartTolerance(partId, tolerances) {
    this._snapZone.registerPart(partId, tolerances);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main input handler — called each drag/move tick
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Process a drag-move event for a part being placed.
   * Returns the current FSM result so the UI can react.
   *
   * @param {string}  partId
   * @param {number}  distanceToTarget    — distance from part center to snap target
   * @param {boolean} orientationCorrect  — true when rotation matches target orientation
   * @param {number}  [now]               — timestamp (ms); defaults to Date.now()
   * @returns {{ state: number, stateName: string, canSnap: boolean, visuals: Object, audioCue: string|null }}
   */
  onPartMoved(partId, distanceToTarget, orientationCorrect, now = Date.now()) {
    const zone = this._snapZone.getZone(partId, distanceToTarget);
    return this._fsm.update(partId, zone, orientationCorrect, now);
  }

  /**
   * Attempt to confirm snap placement for a part.
   * Snap only succeeds when the FSM is in LOCKED_IN state (AC1: only lock zone + correct orientation).
   *
   * @param {string} partId
   * @returns {{ success: boolean, reason: string|null }}
   */
  confirmSnap(partId) {
    if (!this._fsm.canSnap(partId)) {
      return { success: false, reason: 'Part is not in locked-in state — ensure correct zone and orientation.' };
    }
    this._assembledParts.add(partId);
    this._fsm.reset(partId);
    this._telemetry.reassemblyPartConfirmed(partId, this._sessionId);
    return { success: true, reason: null };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Undo handler — tracks undo frequency for AC5 measurement
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Record that the player undid a reassembly placement.
   * Emits telemetry event used for AC5 undo-frequency measurement.
   *
   * @param {string} partId
   */
  onUndoAttempted(partId) {
    this._totalUndoAttempts += 1;
    if (this._assembledParts.has(partId)) {
      this._assembledParts.delete(partId);
    }
    this._telemetry.undoAttempted(partId, this._sessionId, this._totalUndoAttempts);
  }

  /**
   * Mark the reassembly stage as complete.
   * Emits a reassembly_completed telemetry event with undo frequency data.
   */
  completeReassembly() {
    this._telemetry.reassemblyCompleted(this._sessionId, {
      assembledCount: this._assembledParts.size,
      totalUndoAttempts: this._totalUndoAttempts,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ──────────────────────────────────────────────────────────────────────────

  /** Returns the internal SnapZoneTolerance instance. */
  getSnapZone() { return this._snapZone; }

  /** Returns the internal AssemblyFeedbackStateMachine instance. */
  getFSM() { return this._fsm; }

  /** Returns the internal TelemetryEmitter instance. */
  getTelemetry() { return this._telemetry; }

  /** Returns the set of successfully assembled part IDs. */
  getAssembledParts() { return new Set(this._assembledParts); }

  /** Returns total undo attempts recorded this session. */
  getTotalUndoAttempts() { return this._totalUndoAttempts; }
}

module.exports = { ReassemblyScreen };
