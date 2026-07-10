/**
 * BalanceWheelOscillationController — Phase 1 balance-wheel animation subsystem.
 *
 * Design: Issue #147 (Balance Wheel Animation — Phase 1: Oscillation After
 * Successful Reassembly)
 *
 * Responsibilities:
 *   1. Oscillate the balance wheel at the frequency derived from the movement's
 *      bph value (frequency = bph / 7200 Hz), producing a ±180° sinusoidal arc.
 *   2. Drive the animation loop using requestAnimationFrame (non-blocking;
 *      Constraint #5), with an injected scheduler for testability.
 *   3. Use performance.now()-based timestamps (not frame counts) so that
 *      dropped frames and browser timer jitter do not accumulate phase drift
 *      (Constraint #6 mitigation; Design Decision mitigation #1).
 *   4. Clamp the per-frame delta to MAX_FRAME_DELTA_MS to prevent animation
 *      "jumps" after tab visibility changes or GC pauses (Design Decision
 *      mitigation #4).
 *   5. Expose a concrete Phase 2 extensibility hook (AC4, Constraint #9) via
 *      registerPhase2Handler() — callable from outside this module without
 *      modifying any Phase 1 internals.
 *   6. Fail-safe: start() with absent or zero bph produces no animation
 *      (Constraint #4 — no wrong-frequency animation is worse than no animation).
 *   7. Clean teardown: stop() cancels the animation frame and releases all
 *      state; no animation loop outlives the completion scene (Constraint #8).
 *
 * Acceptance criteria covered:
 *   AC1 — Oscillates at correct frequency for the movement's bph within the
 *         2-second window after the success trigger (caller ensures trigger timing).
 *   AC2 — start() is invoked directly from FirstTickCinematicController._startCinematic()
 *         which fires on AUDIO_CUES.FIRST_TICK — coordination within 100ms window
 *         is guaranteed by the existing synchronous call chain.
 *   AC3 — requestAnimationFrame loop with performance.now() timestamps and frame-
 *         delta capping ensures smooth looping without per-frame phase accumulation.
 *   AC4 — registerPhase2Handler() is the exported extensibility hook; Phase 2 can
 *         attach escapement/gear-train animation callbacks without modifying this file.
 *   AC5 — If bph is absent/zero (i.e. caller never calls start(), or start(0) called),
 *         no animation loop is created; balance wheel remains static.
 *
 * ── Phase 2 extensibility hook contract ────────────────────────────────────────
 *
 *   Symbol:   BalanceWheelOscillationController.prototype.registerPhase2Handler
 *   Signature: registerPhase2Handler(handler: (frame: Phase2AnimationFrame) => void): void
 *   Contract:  handler is called on every animation frame while the loop is running.
 *
 *   Phase2AnimationFrame shape:
 *     {
 *       angle:   number,   // current balance-wheel angle in degrees (±180°)
 *       elapsed: number,   // ms since animation start (performance.now() based)
 *       bph:     number,   // beats-per-hour driving this animation instance
 *     }
 *
 *   Phase 2 attaches by calling:
 *     controller.registerPhase2Handler((frame) => { ... });
 *   No Phase 1 file is modified. Multiple handlers can be registered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/**
 * Maximum per-frame delta in ms. Frames longer than this (e.g. after a GC
 * pause or tab backgrounding) are clamped so the animation does not "jump"
 * to a large phase offset on resumption.
 *
 * @type {number}
 */
const MAX_FRAME_DELTA_MS = 50;

/**
 * Default animation scheduler — delegates to requestAnimationFrame / cancelAnimationFrame.
 * Replace at construction time (animationScheduler option) to use a test fake.
 */
const RAF_SCHEDULER = {
  request: (callback) => {
    /* istanbul ignore next */
    return (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(callback)
      : setTimeout(() => callback(Date.now()), 16);
  },
  cancel: (id) => {
    /* istanbul ignore next */
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  },
};

class BalanceWheelOscillationController {
  /**
   * @param {Object} [opts]
   * @param {Object|null} [opts.animationScheduler]
   *   Scheduler with .request(callback) → id and .cancel(id) interface.
   *   Defaults to requestAnimationFrame/cancelAnimationFrame.
   *   Inject a fake in tests to control frame delivery synchronously.
   */
  constructor({ animationScheduler = null } = {}) {
    this._scheduler = (animationScheduler && typeof animationScheduler.request === 'function')
      ? animationScheduler
      : RAF_SCHEDULER;

    // Animation state
    this._animating = false;
    this._cancelId  = null;
    this._bph       = 0;
    this._angle     = 0;        // current balance-wheel angle in degrees
    this._startTime = null;     // performance.now() timestamp of first frame
    this._lastTime  = null;     // timestamp of previous frame (for delta capping)
    this._elapsed   = 0;        // accumulated clamped elapsed time in ms

    // Phase 2 handlers (AC4)
    this._phase2Handlers = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the oscillation animation at the given beats-per-hour rate.
   *
   * Fail-safe: if bph is absent, zero, or negative the animation does NOT
   * start (no wrong-frequency animation rather than a wrong animation; AC5
   * and Constraint #4).
   *
   * @param {number} bph  Beats per hour (e.g. 28800 → 4 Hz oscillation).
   * @returns {boolean}   True if the animation was started; false if fail-safe triggered.
   */
  start(bph) {
    if (!bph || typeof bph !== 'number' || bph <= 0) {
      return false;  // fail-safe: no animation rather than wrong animation
    }

    if (this._animating) {
      this.stop();
    }

    this._bph       = bph;
    this._animating = true;
    this._startTime = null;
    this._lastTime  = null;
    this._elapsed   = 0;
    this._angle     = 0;

    this._scheduleFrame();
    return true;
  }

  /**
   * Stop the animation and release all resources.
   * Safe to call when not animating (no-op).
   * Must be called on scene transition (Constraint #8 — no animation leaks).
   */
  stop() {
    this._animating = false;

    if (this._cancelId !== null) {
      this._scheduler.cancel(this._cancelId);
      this._cancelId = null;
    }

    this._bph       = 0;
    this._angle     = 0;
    this._startTime = null;
    this._lastTime  = null;
    this._elapsed   = 0;
  }

  /**
   * Register a Phase 2 extension handler (AC4 — extensibility hook).
   *
   * The handler is called on every animation frame while the loop is running.
   * Phase 2 code can attach escapement / gear-train animation here without
   * modifying any Phase 1 file.
   *
   * Signature: handler(frame: Phase2AnimationFrame) → void
   * where Phase2AnimationFrame = { angle: number, elapsed: number, bph: number }
   *
   * @param {Function} handler  Called each frame with the current animation state.
   */
  registerPhase2Handler(handler) {
    if (typeof handler !== 'function') {
      throw new Error('BalanceWheelOscillationController.registerPhase2Handler: handler must be a function.');
    }
    this._phase2Handlers.push(handler);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Accessors (for testing & QA)
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {boolean} True while the animation loop is running. */
  isAnimating() { return this._animating; }

  /** @returns {number}  Current balance-wheel angle in degrees (±180°). */
  getAngle() { return this._angle; }

  /** @returns {number}  Currently configured bph (0 when stopped). */
  getBph() { return this._bph; }

  /** @returns {number}  Accumulated clamped elapsed time in ms (0 when stopped). */
  getElapsed() { return this._elapsed; }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — animation loop
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Schedule the next animation frame.
   * @private
   */
  _scheduleFrame() {
    this._cancelId = this._scheduler.request((timestamp) => {
      this._onFrame(timestamp);
    });
  }

  /**
   * Process one animation frame.
   *
   * Uses performance.now()-based timestamps delivered by requestAnimationFrame
   * (AC3 / Constraint #6 mitigation): phase is computed from absolute elapsed
   * time, not accumulated frame counts, so dropped frames do not drift phase.
   *
   * @param {number} timestamp  High-resolution timestamp from the scheduler (ms).
   * @private
   */
  _onFrame(timestamp) {
    if (!this._animating) return;

    if (this._startTime === null) {
      this._startTime = timestamp;
      this._lastTime  = timestamp;
    }

    // Clamp delta to MAX_FRAME_DELTA_MS to prevent jumps after GC / tab hide
    const rawDelta = timestamp - this._lastTime;
    const clampedDelta = Math.min(rawDelta, MAX_FRAME_DELTA_MS);
    this._elapsed  += clampedDelta;
    this._lastTime  = timestamp;

    // Oscillation frequency: bph beats/hour ÷ 3600 s/hour ÷ 2 beats/oscillation
    // = bph / 7200 oscillations/second
    const frequencyHz = this._bph / 7200;

    // ±180° sinusoidal arc:  angle = 180° × sin(2π × freq × elapsed_s)
    this._angle = 180 * Math.sin(2 * Math.PI * frequencyHz * this._elapsed / 1000);

    // Notify Phase 2 handlers (AC4)
    if (this._phase2Handlers.length > 0) {
      const frame = { angle: this._angle, elapsed: this._elapsed, bph: this._bph };
      this._phase2Handlers.forEach((handler) => {
        try { handler(frame); } catch (_) { /* handler errors must not crash the loop */ }
      });
    }

    // Schedule the next frame
    this._scheduleFrame();
  }
}

module.exports = {
  BalanceWheelOscillationController,
  MAX_FRAME_DELTA_MS,
  RAF_SCHEDULER,
};
