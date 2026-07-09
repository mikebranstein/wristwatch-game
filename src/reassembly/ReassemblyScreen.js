/**
 * ReassemblyScreen — top-level orchestrator for the watch reassembly workflow.
 *
 * Wires together (following the DiagnosisScreen orchestrator pattern):
 *   1. SnapZoneTolerance         — two-radius snap model per part (Phase 1 / #76)
 *   2. AssemblyFeedbackStateMachine — 4-state FSM driven by position/orientation (Phase 1 / #76)
 *   3. DirectionalMessageService — part-specific directional error messages (Phase 2 / #78)
 *   4. TelemetryEmitter          — undo_attempted + reassembly_completed events (Phase 1 / #76)
 *
 * Scope guard: SnapZoneTolerance is constructed with context='reassembly' so snap zone
 * logic cannot bleed into teardown/disassembly stages (Test Scenario 10 / regression guard).
 *
 * Audio cue dispatch (4 state audio cues, one per FSM state):
 *   'state_neutral'           — Part moved outside all snap zones
 *   'state_near_correct'      — Part entered approach radius (getting-warmer)
 *   'state_wrong_orientation' — Part in approach zone, orientation wrong
 *   'state_locked_in'         — Part in lock zone, orientation correct
 *
 * Directional message timing (AC3 — Issue #78):
 *   renderMessage is called synchronously in the FSM state-change callback,
 *   which fires within the same game-loop tick that drives updatePartPosition.
 *   No asynchronous delay is introduced; the 500 ms budget is easily met.
 *
 * Phase 1 — Issue #76  |  Phase 2 — Issue #78
 */

const { SnapZoneTolerance } = require('./SnapZoneTolerance');
const { AssemblyFeedbackStateMachine, STATES } = require('./AssemblyFeedbackStateMachine');
const { DirectionalMessageService } = require('./DirectionalMessageService');
const { TelemetryEmitter } = require('../telemetry/TelemetryEmitter');

class ReassemblyScreen {
  /**
   * @param {Object} opts
   * @param {Function} opts.instrumentationHook — existing telemetry hook (eventName, payload)
   * @param {Function} opts.renderMessage       — displays a string in the error message UI region
   * @param {Function} opts.clearMessage        — clears the error message UI region
   * @param {Function} opts.playAudio           — plays a named audio cue (cueName)
   */
  constructor(opts) {
    const { instrumentationHook, renderMessage, clearMessage, playAudio } = opts;

    this._telemetry = new TelemetryEmitter(instrumentationHook);
    this._snapZone = new SnapZoneTolerance('reassembly');
    this._fsm = new AssemblyFeedbackStateMachine();
    this._messageService = new DirectionalMessageService();

    this._renderMessage = renderMessage;
    this._clearMessage = clearMessage;
    this._playAudio = playAudio;

    this._activePartId = null;
    this._approachEnteredAt = null;

    // Wire up FSM state-change handler
    this._fsm.onStateChange(({ previousState, newState }) => {
      this._handleStateChange(previousState, newState);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — FSM state-change handler
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Responds to FSM transitions by dispatching audio, message render/clear.
   * Called synchronously within the same tick as updatePartPosition so message
   * display latency stays well below the 500 ms AC3 budget.
   *
   * @param {string} previousState
   * @param {string} newState
   */
  _handleStateChange(previousState, newState) {
    switch (newState) {
      case STATES.NEUTRAL:
        this._clearMessage();
        this._playAudio('state_neutral');
        break;

      case STATES.NEAR_CORRECT:
        // State 2 — getting-warmer highlight; no error message
        this._clearMessage();
        this._playAudio('state_near_correct');
        break;

      case STATES.WRONG_ORIENTATION: {
        // State 3 — fire part-specific directional message (Phase 2 / AC1, AC2, AC3)
        const message = this._activePartId
          ? this._messageService.getMessage(this._activePartId)
          : null;
        if (message) {
          this._renderMessage(message);
        }
        this._playAudio('state_wrong_orientation');
        break;
      }

      case STATES.LOCKED_IN:
        // State 4 — confirmation; clear any lingering error message
        this._clearMessage();
        this._playAudio('state_locked_in');
        break;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Part lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Called when the player picks up a reassembly part.
   * Resets FSM and clears any previous approach dwell tracking.
   *
   * @param {string} partId
   */
  enterReassembly(partId) {
    this._activePartId = partId;
    this._fsm.reset();
    this._approachEnteredAt = null;
  }

  /**
   * Called each game-loop tick with the current part position and orientation.
   * Drives the FSM and returns the new state string.
   *
   * @param {Object} opts
   * @param {string}  opts.partId            — must match the activePartId
   * @param {number}  opts.distance          — distance from snap target centre (game units)
   * @param {boolean} opts.orientationCorrect — true when orientation matches target
   * @returns {string|undefined} — new FSM state, or undefined if partId does not match
   */
  updatePartPosition({ partId, distance, orientationCorrect }) {
    if (partId !== this._activePartId) return undefined;

    const inApproachZone = this._snapZone.isInApproachZone(partId, distance);
    const inLockZone = this._snapZone.isInLockZone(partId, distance);

    // Track approach-zone dwell start
    if (inApproachZone && this._approachEnteredAt === null) {
      this._approachEnteredAt = Date.now();
    } else if (!inApproachZone) {
      this._approachEnteredAt = null;
    }

    const dwellMs = this._approachEnteredAt != null
      ? Date.now() - this._approachEnteredAt
      : 0;

    return this._fsm.update({ inApproachZone, inLockZone, orientationCorrect, dwellMs });
  }

  /**
   * Called when the player attempts to confirm final part placement.
   * Only succeeds when the FSM is in LOCKED_IN state.
   * Emits appropriate telemetry and returns true on success, false otherwise.
   *
   * @param {string} partId
   * @returns {boolean}
   */
  confirmPlacement(partId) {
    if (this._fsm.getState() !== STATES.LOCKED_IN) {
      this._telemetry.undoAttempted(partId);
      return false;
    }
    this._telemetry.reassemblyCompleted(partId);
    this._activePartId = null;
    this._approachEnteredAt = null;
    this._fsm.reset();
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ──────────────────────────────────────────────────────────────────────────

  /** @returns {string} current FSM state */
  getState() {
    return this._fsm.getState();
  }

  /** @returns {TelemetryEmitter} */
  getTelemetry() {
    return this._telemetry;
  }

  /** @returns {DirectionalMessageService} */
  getMessageService() {
    return this._messageService;
  }

  /** @returns {SnapZoneTolerance} */
  getSnapZone() {
    return this._snapZone;
  }
}

module.exports = { ReassemblyScreen };
