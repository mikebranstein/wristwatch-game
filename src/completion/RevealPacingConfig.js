/**
 * RevealPacingConfig — data-driven, designer-configurable timing parameters
 * for the Completion Reveal Shareability Layer (Issue #142).
 *
 * Responsibilities:
 *   - Hold all reveal timing parameters as named, data-driven values that a
 *     designer can modify without a code change (Constraint: timing must be
 *     data-driven and designer-configurable without a code change).
 *   - Enforce the hard duration bound: total reveal duration must be between
 *     20,000 ms and 60,000 ms inclusive, measured end-to-end including audio
 *     fade (AC2).
 *   - Expose a `validate()` method that returns a result object so callers can
 *     surface configuration errors at startup, before any reveal sequence fires.
 *   - Remain stateless (no timers, no side effects) — purely a validated config
 *     container consumed by RevealSequenceController.
 *
 * Timeline segments:
 *   [intro] → [comparison_hold] → [peak_hold] → [outro] → [audio_fade]
 *
 *   • intro_ms          — time before both states are fully visible (ramp-in)
 *   • comparison_hold_ms — time with both before/after fully visible before peak
 *   • peak_hold_ms      — share-prompt display window at peak moment
 *   • outro_ms          — wind-down after peak (reveal end animation)
 *   • audio_fade_ms     — tail audio crossfade (counted in total duration per AC2)
 *
 * Total duration = intro_ms + comparison_hold_ms + peak_hold_ms + outro_ms + audio_fade_ms
 *
 * Hard bounds (Constraint, AC2):
 *   MIN_TOTAL_MS = 20,000 ms (20 seconds)
 *   MAX_TOTAL_MS = 60,000 ms (60 seconds)
 *
 * Acceptance criteria covered:
 *   AC2 — reveal sequence total duration is between 20 and 60 seconds inclusive
 *          (enforced by validate(); RevealSequenceController rejects invalid configs).
 *   AC8 — pacing timing is identical whether triggered at job completion or via
 *          job log replay (single config object is shared across both trigger paths;
 *          no per-trigger-source timing fork exists in this module).
 */

'use strict';

/** Hard minimum total reveal duration (inclusive), in milliseconds (AC2). */
const MIN_TOTAL_MS = 20_000;

/** Hard maximum total reveal duration (inclusive), in milliseconds (AC2). */
const MAX_TOTAL_MS = 60_000;

/**
 * Default pacing values — tuned as a starting point; must be validated against
 * post-Core-System playtest data before ship (Constraint).
 *
 * Default total: 3000 + 4000 + 8000 + 6000 + 3000 = 24,000 ms (24 s) — within bounds.
 */
const DEFAULT_PACING = {
  intro_ms:            3_000,   // ramp-in to full comparison view
  comparison_hold_ms:  4_000,   // both states visible, before peak prompt appears
  peak_hold_ms:        8_000,   // share prompt visible (peak moment window)
  outro_ms:            6_000,   // wind-down and exit animation
  audio_fade_ms:       3_000,   // tail audio crossfade (included in total per AC2)
};

class RevealPacingConfig {
  /**
   * @param {Object} [opts]  Designer-supplied override values.  Any subset of
   *   keys may be provided; missing keys fall back to DEFAULT_PACING.
   * @param {number} [opts.intro_ms]
   * @param {number} [opts.comparison_hold_ms]
   * @param {number} [opts.peak_hold_ms]
   * @param {number} [opts.outro_ms]
   * @param {number} [opts.audio_fade_ms]
   */
  constructor(opts = {}) {
    this._intro_ms           = opts.intro_ms           ?? DEFAULT_PACING.intro_ms;
    this._comparison_hold_ms = opts.comparison_hold_ms ?? DEFAULT_PACING.comparison_hold_ms;
    this._peak_hold_ms       = opts.peak_hold_ms       ?? DEFAULT_PACING.peak_hold_ms;
    this._outro_ms           = opts.outro_ms           ?? DEFAULT_PACING.outro_ms;
    this._audio_fade_ms      = opts.audio_fade_ms      ?? DEFAULT_PACING.audio_fade_ms;
  }

  // ── Segment accessors ──────────────────────────────────────────────────────

  /** @returns {number} Ramp-in duration before both states visible (ms). */
  getIntroMs()          { return this._intro_ms; }

  /** @returns {number} Both-states-visible hold before share prompt (ms). */
  getComparisonHoldMs() { return this._comparison_hold_ms; }

  /** @returns {number} Peak-moment window when share prompt is displayed (ms). */
  getPeakHoldMs()       { return this._peak_hold_ms; }

  /** @returns {number} Wind-down outro after peak (ms). */
  getOutroMs()          { return this._outro_ms; }

  /** @returns {number} Audio fade tail duration (ms, counted in total). */
  getAudioFadeMs()      { return this._audio_fade_ms; }

  // ── Derived accessors ──────────────────────────────────────────────────────

  /**
   * Total end-to-end reveal duration, including audio fade (AC2).
   * @returns {number} Total duration in milliseconds.
   */
  getTotalMs() {
    return (
      this._intro_ms +
      this._comparison_hold_ms +
      this._peak_hold_ms +
      this._outro_ms +
      this._audio_fade_ms
    );
  }

  /**
   * Time offset (from sequence start) at which the peak moment begins —
   * i.e. when the share prompt should first appear (AC1).
   * This is the moment both before/after states are fully visible AND the
   * comparison_hold window has elapsed.
   *
   * @returns {number} Peak moment offset in milliseconds from sequence start.
   */
  getPeakMomentOffsetMs() {
    return this._intro_ms + this._comparison_hold_ms;
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate that all timing parameters are positive and the total duration
   * is within [MIN_TOTAL_MS, MAX_TOTAL_MS] inclusive (AC2 hard bounds).
   *
   * @returns {{ valid: boolean, errors: string[], totalMs: number }}
   */
  validate() {
    const errors = [];

    const segments = {
      intro_ms:           this._intro_ms,
      comparison_hold_ms: this._comparison_hold_ms,
      peak_hold_ms:       this._peak_hold_ms,
      outro_ms:           this._outro_ms,
      audio_fade_ms:      this._audio_fade_ms,
    };

    for (const [key, value] of Object.entries(segments)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        errors.push(`${key} must be a non-negative finite number; got ${value}.`);
      }
    }

    const total = this.getTotalMs();

    if (total < MIN_TOTAL_MS) {
      errors.push(
        `Total reveal duration ${total} ms is below the minimum ${MIN_TOTAL_MS} ms (20 s). ` +
        'Increase segment values.'
      );
    }
    if (total > MAX_TOTAL_MS) {
      errors.push(
        `Total reveal duration ${total} ms exceeds the maximum ${MAX_TOTAL_MS} ms (60 s). ` +
        'Reduce segment values.'
      );
    }

    return { valid: errors.length === 0, errors, totalMs: total };
  }
}

module.exports = {
  RevealPacingConfig,
  DEFAULT_PACING,
  MIN_TOTAL_MS,
  MAX_TOTAL_MS,
};
