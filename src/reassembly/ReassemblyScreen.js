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
 * Issue #82 — Save/Load Reliability System:
 *   An optional `autosaveHook` can be injected at construction.  When provided,
 *   completeReassembly() awaits the hook before advancing so the autosave
 *   checkpoint is guaranteed to land on disk before the next stage begins (AC1, AC5).
 *   The hook signature is: async (stage: string) => void.
 *
 * Screen-context guard: SnapZoneTolerance is constructed with context='reassembly',
 * ensuring no snap zone activation can bleed into teardown/disassembly stages.
 *
 * Playtest gate (AC5): TelemetryEmitter tracks undo_attempted events so post-
 * implementation undo frequency can be compared to the pre-implementation baseline.
 *
 * Issue #123 — Progressive Reassembly Phase 2 Full Rollout:
 *   All 13 SNAP_ZONES parts are pre-registered at construction (design note: DEFAULT_TOLERANCES
 *   only pre-loads 10 parts; SNAP_ZONES has all 13 — pre-registering ensures no
 *   unregistered-part throws for the 3 additional components on first drag event).
 *   An optional `highlightRenderHook` can be injected for the ambient 'highlight
 *   remaining work' toggle.  This hook is INDEPENDENT of the FSM renderVisual
 *   callback to prevent state collision between ambient persistent highlights and
 *   per-seating confirmation highlights.
 */

const { SnapZoneTolerance, SNAP_ZONES } = require('./SnapZoneTolerance');
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
   * @param {Function} [opts.autosaveHook]      — Issue #82: async (stage: string) => void
   * @param {Function} [opts.highlightRenderHook] — Issue #123: ({ active, unseatedParts? partId? }) => void
   *                                               Called on toggle interactions and on individual
   *                                               part clears after successful snap.
   *                                               Independent of FSM renderVisual to prevent
   *                                               state collision with per-seating highlights.
   */
  constructor({ instrumentationHook, playAudio, renderVisual, sessionId = null, minDwellMs, autosaveHook = null, microConfirmationController = null, highlightRenderHook = null }) {
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
    this._autosaveHook = autosaveHook;  // Issue #82
    this._microConfirmation = microConfirmationController;
    if (this._microConfirmation) { this._microConfirmation.startSession(); }

    // Issue #123 — Phase 2: pre-register all 13 SNAP_ZONES parts so no
    // unregistered-part throw fires on first drag for the 3 additional
    // components not covered by DEFAULT_TOLERANCES.
    for (const [partId, tolerances] of Object.entries(SNAP_ZONES)) {
      this._snapZone.registerPart(partId, tolerances);
    }

    // Issue #123 — Phase 2: highlight remaining work toggle (session-scoped, defaults OFF)
    this._highlightToggle = false;
    this._highlightRenderHook = highlightRenderHook;
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
   * Issue #123 — Phase 2: after a successful snap, if the highlight-remaining toggle is ON,
   * the ambient highlight for this specific component is cleared via _highlightRenderHook.
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
    if (this._microConfirmation) { this._microConfirmation.onComponentSeated(partId); }
    // Issue #123: clear ambient toggle highlight for this part after successful snap
    if (this._highlightRenderHook && this._highlightToggle) {
      this._highlightRenderHook({ partId, active: false, clearAmbient: true });
    }
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
      if (this._microConfirmation) { this._microConfirmation.onComponentUnseated(partId); }
    }
    this._telemetry.undoAttempted(partId, this._sessionId, this._totalUndoAttempts);
  }

  /**
   * Mark the reassembly stage as complete.
   * Emits a reassembly_completed telemetry event with undo frequency data.
   *
   * Issue #82 — AC1, AC5: if an autosaveHook was injected, it is awaited here
   * so the checkpoint write completes before the next stage begins.  Returns a
   * Promise so callers can await stage-gate logic.
   *
   * @returns {Promise<void>}
   */
  async completeReassembly() {
    this._telemetry.reassemblyCompleted(this._sessionId, {
      assembledCount: this._assembledParts.size,
      totalUndoAttempts: this._totalUndoAttempts,
    });

    // Issue #82: trigger autosave checkpoint at reassembly completion (AC1).
    if (this._autosaveHook) {
      await this._autosaveHook('reassembly');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Issue #123 — Phase 2: Highlight remaining work toggle (AC3)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Toggle the 'highlight remaining work' overlay on or off.
   *
   * When turned ON:  calls _highlightRenderHook({ active: true, unseatedParts })
   *                  so the UI can apply a persistent ambient highlight to all
   *                  unseated components at once.
   * When turned OFF: calls _highlightRenderHook({ active: false, unseatedParts: [] })
   *                  so the UI can remove all ambient highlights.
   * On each toggle: emits highlight_toggle_used analytics event (AC4).
   *
   * Toggle state is session-scoped (defaults OFF, does not persist cross-session).
   *
   * @returns {boolean} The new state of the toggle (true = ON, false = OFF)
   */
  toggleHighlightRemaining() {
    this._highlightToggle = !this._highlightToggle;
    const state = this._highlightToggle ? 'on' : 'off';
    this._telemetry.highlightToggleUsed(state, Date.now());
    if (this._highlightRenderHook) {
      // When ON: pass all currently unseated parts so UI can apply ambient highlights.
      // When OFF: pass empty array — UI clears all ambient highlights.
      const unseatedParts = this._highlightToggle
        ? Object.keys(SNAP_ZONES).filter(p => !this._assembledParts.has(p))
        : [];
      this._highlightRenderHook({ active: this._highlightToggle, unseatedParts });
    }
    return this._highlightToggle;
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

  /** Issue #123: Returns the current state of the highlight-remaining toggle. */
  getHighlightToggle() { return this._highlightToggle; }

  abandonReassembly() { if (this._microConfirmation) { this._microConfirmation.onSessionAbandoned(); } }
  getMicroConfirmation() { return this._microConfirmation; }
}

module.exports = { ReassemblyScreen };
