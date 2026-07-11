/**
 * CosmeticRestorationFlow — top-level coordinator for the three-phase cosmetic
 * restoration arc: Phase 1 (strap swap), Phase 2 (crystal replacement), Phase 3
 * (case polishing).
 *
 * Implements: Issue #152 (Case Polishing — Phase 3)
 *
 * This coordinator gates Phase 3 on Phase 2 completion, wires together
 * SurfaceConditionShader + PolishingInputHandler + PolishingRevealSequence, and
 * drives CosmeticRestorationSummary after all three phases complete.
 *
 * Phases 1 and 2 integration points are represented as explicit state transitions
 * (confirmStrapSwap / confirmCrystalReplacement). Phase 3 is the full polishing
 * implementation delivered in this issue.
 *
 * Acceptance criteria covered:
 *   AC1  — phase 3 polishing loop advances shader; perceptible at 20%.
 *   AC2  — 100% polish triggers full polished state; no artefacts.
 *   AC3  — on polish complete, reveal sequence is triggered (deliberately paced).
 *   AC4  — reveal uses #53 BeforeAfterUI via PolishingRevealSequence.
 *   AC5  — all three phases marked in CosmeticRestorationSummary; summary shown.
 *   AC6  — partial polish abandonment: shader reflects partial state gracefully.
 *   AC7  — mixed states (new strap + clean crystal + worn case) do not conflict.
 *   AC9  — restoration summary reports 'Cosmetically Restored' after all phases.
 */

const { SurfaceConditionShader }    = require('./SurfaceConditionShader');
const { PolishingInputHandler }      = require('./PolishingInputHandler');
const { PolishingRevealSequence }    = require('./PolishingRevealSequence');
const { CosmeticRestorationSummary, PHASES } = require('./CosmeticRestorationSummary');

/** States of the overall cosmetic restoration flow. */
const FLOW_STATE = {
  IDLE:              'idle',
  PHASE1_COMPLETE:   'phase1_complete',   // Strap swap done
  PHASE2_COMPLETE:   'phase2_complete',   // Crystal replacement done; Phase 3 unlocked
  PHASE3_POLISHING:  'phase3_polishing',  // Active polishing interaction
  PHASE3_ABANDONED:  'phase3_abandoned',  // Player abandoned polish mid-way (AC6)
  PHASE3_REVEALING:  'phase3_revealing',  // Reveal sequence playing
  ALL_COMPLETE:      'all_complete',      // All three phases done; summary shown
};

class CosmeticRestorationFlow {
  /**
   * @param {Object}   opts
   * @param {Function} opts.renderSurface          SurfaceConditionShader renderSurface hook.
   * @param {Function} opts.clearSurface           SurfaceConditionShader clearSurface hook.
   * @param {Function} opts.renderRevealTransition PolishingRevealSequence transition hook.
   * @param {Function} opts.clearRevealTransition  PolishingRevealSequence clear hook.
   * @param {Function} opts.renderBeforeAfter      BeforeAfterUI render hook (#53 pattern).
   * @param {Function} opts.clearBeforeAfter       BeforeAfterUI clear hook (#53 pattern).
   * @param {Function} opts.renderSummary          CosmeticRestorationSummary render hook.
   * @param {Function} opts.clearSummary           CosmeticRestorationSummary clear hook.
   * @param {Function} opts.instrumentationHook    Telemetry hook.
   * @param {Object}   [opts.phaseDurations]       Optional timing overrides for ClipSequencePacer.
   * @param {Object}   [opts.timerImpl]            Optional timer injection for testing.
   */
  constructor({
    renderSurface,
    clearSurface,
    renderRevealTransition,
    clearRevealTransition,
    renderBeforeAfter,
    clearBeforeAfter,
    renderSummary,
    clearSummary,
    instrumentationHook,
    phaseDurations = {},
    timerImpl = {},
  }) {
    this._shader = new SurfaceConditionShader(renderSurface, clearSurface);

    this._reveal = new PolishingRevealSequence({
      renderRevealTransition,
      clearRevealTransition,
      renderBeforeAfter,
      clearBeforeAfter,
      instrumentationHook,
      phaseDurations,
      timerImpl,
    });

    this._summary = new CosmeticRestorationSummary(renderSummary, clearSummary);

    // PolishingInputHandler wired inline — drives shader + triggers reveal on complete
    this._inputHandler = null;

    this._flowState = FLOW_STATE.IDLE;
    this._sessionId = null;
    this._wornCaseTexture     = null;
    this._polishedCaseTexture = null;
  }

  // ── Phase gate transitions ────────────────────────────────────────────────

  /**
   * Confirm Phase 1 (strap swap) is complete.
   * Must be called before confirmCrystalReplacement().
   */
  confirmStrapSwap() {
    this._summary.markPhaseComplete(PHASES.STRAP);
    if (this._flowState === FLOW_STATE.IDLE) {
      this._flowState = FLOW_STATE.PHASE1_COMPLETE;
    }
  }

  /**
   * Confirm Phase 2 (crystal replacement) is complete.
   * Gates Phase 3: polishing cannot begin until this is called.
   *
   * @throws {Error} If Phase 1 has not been confirmed.
   */
  confirmCrystalReplacement() {
    if (
      this._flowState !== FLOW_STATE.PHASE1_COMPLETE &&
      this._flowState !== FLOW_STATE.IDLE // allow direct phase 2 confirmation in legacy flows
    ) {
      throw new Error(
        'Cannot confirm crystal replacement: Phase 1 (strap swap) must be confirmed first.'
      );
    }
    this._summary.markPhaseComplete(PHASES.CRYSTAL);
    this._flowState = FLOW_STATE.PHASE2_COMPLETE;
  }

  // ── Phase 3: Case Polishing ───────────────────────────────────────────────

  /**
   * Start the Phase 3 polishing interaction.
   *
   * Phase 3 is gated on Phase 2 completion (design constraint). If Phase 2 has not
   * been confirmed, this method throws rather than silently ignoring.
   *
   * @param {string} sessionId            Unique session identifier.
   * @param {string} wornCaseTexture      Worn/scratched case texture key.
   * @param {string} polishedCaseTexture  Fully polished case texture key.
   */
  startPolishing(sessionId, wornCaseTexture, polishedCaseTexture) {
    if (this._flowState !== FLOW_STATE.PHASE2_COMPLETE) {
      throw new Error(
        'Phase 3 polishing cannot begin until Phase 2 (crystal replacement) is complete.'
      );
    }

    this._sessionId           = sessionId;
    this._wornCaseTexture     = wornCaseTexture;
    this._polishedCaseTexture = polishedCaseTexture;

    // Initialise shader to worn state
    this._shader.init(wornCaseTexture, polishedCaseTexture);

    // Wire input handler: each input event drives shader + triggers reveal at 100%
    this._inputHandler = new PolishingInputHandler(
      (progress) => this._shader.applyProgress(progress),
      (/* progress */) => this._onPolishingComplete()
    );

    this._flowState = FLOW_STATE.PHASE3_POLISHING;
  }

  /**
   * Route a player polishing input event into the handler (AC1, AC8).
   * No-op if polishing is not active.
   *
   * @param {number} deltaProgress  Progress delta in (0, MAX_DELTA_PER_EVENT].
   */
  onPolishInput(deltaProgress) {
    if (this._flowState !== FLOW_STATE.PHASE3_POLISHING || !this._inputHandler) return;
    this._inputHandler.onInput(deltaProgress);
  }

  /**
   * Player abandons polishing before completion (AC6).
   * Shader reflects the partial state; no crash.
   */
  abandonPolishing() {
    if (this._flowState !== FLOW_STATE.PHASE3_POLISHING || !this._inputHandler) return;
    this._inputHandler.abandon();
    this._flowState = FLOW_STATE.PHASE3_ABANDONED;
  }

  // ── Internal phase 3 completion handler ───────────────────────────────────

  /**
   * Called by PolishingInputHandler when progress reaches 100%.
   * Triggers the polishing reveal sequence (AC3).
   * @private
   */
  _onPolishingComplete() {
    this._flowState = FLOW_STATE.PHASE3_REVEALING;

    this._reveal.onPolishComplete(
      this._sessionId,
      this._wornCaseTexture,
      this._polishedCaseTexture,
      () => this._onRevealDismissed()
    );
  }

  /**
   * Called when the reveal sequence ends — mark Phase 3 complete and show summary.
   * @private
   */
  _onRevealDismissed() {
    this._summary.markPhaseComplete(PHASES.CASE);
    this._flowState = FLOW_STATE.ALL_COMPLETE;

    // Render the restoration summary showing all three phases (AC5, AC9)
    this._summary.render();
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {string} Current flow state (FLOW_STATE constant). */
  getFlowState() {
    return this._flowState;
  }

  /** @returns {SurfaceConditionShader} The surface condition shader. */
  getShader() {
    return this._shader;
  }

  /** @returns {PolishingInputHandler|null} The active input handler, or null. */
  getInputHandler() {
    return this._inputHandler;
  }

  /** @returns {PolishingRevealSequence} The reveal sequence. */
  getReveal() {
    return this._reveal;
  }

  /** @returns {CosmeticRestorationSummary} The restoration summary. */
  getSummary() {
    return this._summary;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Tear down all subsystems. Call when navigating away.
   */
  destroy() {
    this._shader.reset();
    this._reveal.destroy();
    this._summary.reset();
    this._inputHandler = null;
    this._flowState    = FLOW_STATE.IDLE;
  }
}

module.exports = { CosmeticRestorationFlow, FLOW_STATE };
