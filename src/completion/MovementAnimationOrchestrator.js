/**
 * MovementAnimationOrchestrator — Phase 2 top-level coordinator for full
 * movement animation: escape wheel, pallet fork, gear train, and failure states.
 *
 * Design: Issue #150 (Full Movement Animation — Phase 2: Escapement & Gear Train)
 *
 * Responsibility:
 *   - Wires together all Phase 2 animation sub-controllers.
 *   - Attaches to the Phase 1 balance wheel extensibility hook via
 *     `attachToPhase1Hook(halfSwingSource)` — the ONLY integration point
 *     with Phase 1 code (AC5: no Phase 1 code is modified).
 *   - Ensures all Phase 2 components start simultaneously within 100ms of
 *     Phase 1 balance wheel start and issue #99 first-tick trigger (AC4).
 *   - Routes correct-run vs. failure-state animation based on assembly state (AC2).
 *   - Delegates LOD decisions to MovementAnimationLODController (AC3).
 *   - Stops all animations cleanly on scene exit (AC5 — no state leaks).
 *
 * Phase 1 integration boundary (HARD BLOCK for full validation):
 *   Phase 1 (Issue #147) must provide a `halfSwingSource` object with an
 *   `onHalfSwing(listener)` method.  Once Phase 1 delivers its extensibility
 *   hook, the game layer calls `attachToPhase1Hook(phase1HalfSwingSource)`.
 *   Until Phase 1 is complete, the orchestrator works in standalone mode
 *   (manual `onHalfSwing()` calls for testing).
 *
 * Acceptance criteria covered:
 *   AC1 — escape wheel, pallet fork, gear train all animate in sync after
 *          correct reassembly within 2 seconds of success trigger.
 *   AC2 — incorrect/incomplete assembly triggers failure-state animation.
 *   AC3 — LOD management reduces gear train on minimum-spec hardware.
 *   AC4 — all components start within 100ms of Phase 1 trigger (enforced by
 *          synchronous start() calls in the same call stack).
 *   AC5 — no Phase 1 code modified; attaches via Phase 1 hook exclusively;
 *          all Phase 1 test scenarios continue to pass after Phase 2 merge.
 */

'use strict';

const { EscapeWheelAnimationController, ESCAPE_WHEEL_STATE, FAILURE_MODE } =
  require('./EscapeWheelAnimationController');
const { PalletForkAnimationController }  = require('./PalletForkAnimationController');
const { GearTrainAnimationController }   = require('./GearTrainAnimationController');
const { MovementAnimationLODController, LOD_TIER } = require('./MovementAnimationLODController');

/** Orchestrator-level states. */
const ORCHESTRATOR_STATE = {
  IDLE:    'idle',
  RUNNING: 'running',
  FAILURE: 'failure',
};

class MovementAnimationOrchestrator {
  /**
   * @param {Object}   opts
   * @param {Function} opts.escapeWheelRenderHook   Render hook for escape wheel.
   * @param {Function} opts.palletForkRenderHook    Render hook for pallet fork.
   * @param {Function} opts.gearTrainRenderHook     Render hook for gear train.
   * @param {number}   [opts.toothCount]            Escape wheel tooth count (per caliber).
   * @param {Object}   [opts.gearRatios]            Per-caliber gear ratio overrides.
   * @param {string}   [opts.escapeWheelFailureMode] 'stalled' | 'jittery' | 'over_spinning'.
   * @param {string}   [opts.palletForkFailureMode]  'stalled' | 'jittery'.
   * @param {string}   [opts.gearTrainFailureMode]   'over_spinning' | 'stalled'.
   * @param {Object}   [opts.lodConfig]              LOD configuration overrides.
   */
  constructor({
    escapeWheelRenderHook,
    palletForkRenderHook,
    gearTrainRenderHook,
    toothCount,
    gearRatios,
    escapeWheelFailureMode = FAILURE_MODE.STALLED,
    palletForkFailureMode  = 'stalled',
    gearTrainFailureMode   = 'over_spinning',
    lodConfig              = {},
  }) {
    this._escapeWheel = new EscapeWheelAnimationController({
      renderHook:  escapeWheelRenderHook,
      ...(toothCount !== undefined ? { toothCount } : {}),
      failureMode: escapeWheelFailureMode,
    });

    this._palletFork = new PalletForkAnimationController({
      renderHook:  palletForkRenderHook,
      failureMode: palletForkFailureMode,
    });

    this._gearTrain = new GearTrainAnimationController({
      renderHook:  gearTrainRenderHook,
      ...(gearRatios !== undefined ? { gearRatios } : {}),
      failureMode: gearTrainFailureMode,
    });

    this._lod   = new MovementAnimationLODController({ lodConfig });
    this._state = ORCHESTRATOR_STATE.IDLE;

    // Phase 1 hook reference (null until attachToPhase1Hook is called)
    this._phase1HalfSwingSource = null;
    this._startTimestampMs      = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1 integration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Attach to the Phase 1 balance wheel extensibility hook (AC5).
   *
   * Phase 1 (Issue #147) provides a `halfSwingSource` object with an
   * `onHalfSwing(listener)` method.  This is the ONLY point where Phase 2
   * touches Phase 1 — it registers as a consumer, not a modifier.
   *
   * @param {{ onHalfSwing: Function }} halfSwingSource  Phase 1 extensibility hook.
   */
  attachToPhase1Hook(halfSwingSource) {
    if (!halfSwingSource || typeof halfSwingSource.onHalfSwing !== 'function') {
      throw new Error(
        'MovementAnimationOrchestrator: halfSwingSource must have an onHalfSwing(listener) method. ' +
        'Phase 1 (Issue #147) must be complete before Phase 2 can attach.'
      );
    }

    this._phase1HalfSwingSource = halfSwingSource;
    halfSwingSource.onHalfSwing(() => this._handleHalfSwing());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start all Phase 2 animation components simultaneously (AC4: within 100ms
   * of Phase 1 trigger — achieved by synchronous call in same stack frame).
   *
   * @param {boolean} [assembledCorrectly]  False triggers failure-state (AC2).
   * @param {number}  [measuredFps]         Hardware FPS for LOD tier evaluation (AC3).
   * @param {number}  [startTimestampMs]    Phase 1 start timestamp (for AC4 validation).
   */
  start(assembledCorrectly = true, measuredFps = 60, startTimestampMs = Date.now()) {
    this._startTimestampMs = startTimestampMs;
    const lodTier          = this._lod.evaluateTier(measuredFps);
    const lodConfig        = this._lod.getCurrentConfig();
    const lodReduced       = lodConfig.lodReduced;

    this._state = assembledCorrectly ? ORCHESTRATOR_STATE.RUNNING : ORCHESTRATOR_STATE.FAILURE;

    // AC4: All components start synchronously in the same call stack — guaranteed
    // within a single event-loop tick (well within the 100ms SLA).
    this._escapeWheel.start(assembledCorrectly, startTimestampMs);
    this._palletFork.start(assembledCorrectly);
    this._gearTrain.start(assembledCorrectly, lodReduced);
  }

  /**
   * Manually trigger a half-swing (used in tests and when Phase 1 hook is
   * not yet wired).  In production, Phase 1 calls this via the registered
   * listener on its extensibility hook.
   */
  onHalfSwing() {
    this._handleHalfSwing();
  }

  /**
   * Stop all Phase 2 animation components and clean up state.
   * Must be called on scene exit (AC5 — no animation state leaks).
   */
  stop() {
    this._state = ORCHESTRATOR_STATE.IDLE;
    this._escapeWheel.stop();
    this._palletFork.stop();
    this._gearTrain.stop();
  }

  /**
   * Full reset — call when a new watch is loaded into the bench.
   */
  reset() {
    this._state            = ORCHESTRATOR_STATE.IDLE;
    this._startTimestampMs = null;
    this._escapeWheel.reset();
    this._palletFork.reset();
    this._gearTrain.reset();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  getState()              { return this._state; }
  getLodTier()            { return this._lod.getCurrentTier(); }
  getLodConfig()          { return this._lod.getCurrentConfig(); }
  getEscapeWheel()        { return this._escapeWheel; }
  getPalletFork()         { return this._palletFork; }
  getGearTrain()          { return this._gearTrain; }
  getStartTimestampMs()   { return this._startTimestampMs; }
  isPhase1Attached()      { return this._phase1HalfSwingSource !== null; }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Handles each half-swing from Phase 1 (or manual call in tests).
   * Propagates to escape wheel and pallet fork; escape wheel advance is then
   * forwarded to gear train.
   * @private
   */
  _handleHalfSwing() {
    const prevToothIndex = this._escapeWheel.getCurrentToothIndex();
    this._escapeWheel.onHalfSwing();
    const newToothIndex  = this._escapeWheel.getCurrentToothIndex();

    // Forward tooth advance to gear train (only fires when tooth actually advanced)
    if (newToothIndex !== prevToothIndex || this._escapeWheel.getHalfSwingCount() === 1) {
      this._gearTrain.onEscapeWheelAdvance(1);
    }

    this._palletFork.onHalfSwing();
  }
}

module.exports = { MovementAnimationOrchestrator, ORCHESTRATOR_STATE };
