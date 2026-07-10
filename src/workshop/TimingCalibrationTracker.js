/**
 * TimingCalibrationTracker — instruments job timing events for craftsmanship scoring.
 *
 * Issue #255 — Holistic Craftsmanship Score Phase 2:
 *   New class that instruments job timing events; records phase start/end timestamps
 *   and computes a 'timing calibration' score (how deliberate vs. rushed the restoration was).
 *
 * Scoring algorithm:
 *   per-phase score = clamp(actual_seconds / par_seconds, 0.0, 1.0) × 100
 *   job-level score = arithmetic mean of all active phases
 *
 * Par times by job tier (read from slot.pricingTier, set by WorkshopController.acceptJob()):
 *   simple_service    → 45 s/phase (Tier 1)
 *   complex_service   → 75 s/phase (Tier 2)
 *   full_restoration  → 120 s/phase (Tier 3)
 *
 * Ephemeral: raw phase timestamps are NOT persisted; only the final computed
 * timing_calibration_score is stored alongside the composite score (FD-004 pattern).
 *
 * Performance: timing event capture completes in < 1 ms per event (performance.now() only).
 *
 * Phase-gate integration:
 *   If the player has not yet unlocked timing tracking, do NOT instantiate this class —
 *   pass null to JobQualityAggregator for the timing_calibration dimension instead.
 *
 * Acceptance Criteria covered:
 *   AC1 — Records phase start/end timestamps; produces normalised timing calibration
 *          score (0–100%) at the DeliveryHandler boundary.
 */

'use strict';

/** Par seconds per phase by pricing tier. */
const PAR_SECONDS = {
  simple_service:   45,
  complex_service:  75,
  full_restoration: 120,
};

/** Default par time (Tier 1) used when pricingTier is unrecognised. */
const DEFAULT_PAR_SECONDS = 45;

class TimingCalibrationTracker {
  /**
   * @param {Object} slot  BenchSlot instance (or any object with a pricingTier property).
   *                       slot.pricingTier is read at construction time (set by
   *                       WorkshopController.acceptJob() before any phase begins).
   * @param {Function} [nowFn]  Injectable clock function (default: performance.now).
   *                             Accepts a () => number returning milliseconds since epoch.
   *                             Used for test isolation without real time dependency.
   */
  constructor(slot, nowFn = null) {
    const tier = slot && slot.pricingTier ? slot.pricingTier : null;
    this._parSeconds   = PAR_SECONDS[tier] ?? DEFAULT_PAR_SECONDS;
    this._phaseScores  = [];           // Array<number> — ephemeral computed per-phase scores
    this._phaseStartMs = {};           // { [phaseId]: number } — ephemeral start timestamps
    this._nowFn        = nowFn || (() => {
      // Use performance.now() in browser/node environments; fallback to Date.now().
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    });
  }

  // ---------------------------------------------------------------------------
  // Phase instrumentation (< 1 ms per event)
  // ---------------------------------------------------------------------------

  /**
   * Record the start of a restoration phase.
   *
   * @param {string} phaseId  Stable identifier for this phase (e.g. 'teardown', 'cleaning').
   */
  recordPhaseStart(phaseId) {
    this._phaseStartMs[phaseId] = this._nowFn();
  }

  /**
   * Record the end of a restoration phase and compute the per-phase timing score.
   *
   * per-phase score = clamp(actual_seconds / par_seconds, 0.0, 1.0) × 100
   *
   * Raw timestamps are discarded after scoring (ephemeral — never persisted).
   *
   * @param {string} phaseId  Must match a prior recordPhaseStart() call.
   */
  recordPhaseEnd(phaseId) {
    if (!Object.prototype.hasOwnProperty.call(this._phaseStartMs, phaseId)) {
      // No matching start recorded — skip silently (defensive guard).
      return;
    }

    const elapsedMs      = this._nowFn() - this._phaseStartMs[phaseId];
    const elapsedSeconds = elapsedMs / 1000;
    const score          = Math.min(elapsedSeconds / this._parSeconds, 1.0) * 100;

    this._phaseScores.push(score);
    delete this._phaseStartMs[phaseId];  // ephemeral — do not persist raw timestamp
  }

  // ---------------------------------------------------------------------------
  // Score computation (call at DeliveryHandler boundary)
  // ---------------------------------------------------------------------------

  /**
   * Compute the job-level timing calibration score.
   *
   * Returns the arithmetic mean of all recorded per-phase scores, or null if no phases
   * were recorded (phase-gate exclusion — aggregator excludes null dimensions).
   *
   * @returns {number|null}  Score in [0, 100], or null when no phases were tracked.
   */
  computeJobScore() {
    if (this._phaseScores.length === 0) return null;
    const sum = this._phaseScores.reduce((a, b) => a + b, 0);
    return sum / this._phaseScores.length;
  }

  // ---------------------------------------------------------------------------
  // Accessors (for testing & QA)
  // ---------------------------------------------------------------------------

  /** @returns {number} Par seconds per phase for this tracker's tier. */
  getParSeconds() { return this._parSeconds; }

  /** @returns {number[]} Copy of per-phase scores recorded so far. */
  getPhaseScores() { return [...this._phaseScores]; }

  /** @returns {Object} Map of currently open (started but not ended) phases. */
  getOpenPhases() { return Object.assign({}, this._phaseStartMs); }
}

module.exports = { TimingCalibrationTracker, PAR_SECONDS, DEFAULT_PAR_SECONDS };
