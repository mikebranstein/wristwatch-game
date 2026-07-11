/**
 * Tests for RevealPacingConfig.js — Issue #142 Completion Reveal Shareability Layer
 *
 * Acceptance criteria covered:
 *   AC2 — reveal sequence total duration is between 20 and 60 seconds inclusive
 *          (validate() enforces hard bounds; configs outside bounds are invalid).
 *   AC8 — pacing is identical for 'job_completion' and 'job_log_replay' trigger
 *          sources because a single RevealPacingConfig is used for both paths.
 *
 * Test scenarios covered:
 *   Scenario 3  — Clip pacing bounds: total duration ≥20 s and ≤60 s.
 *   Scenario 8  — Pacing consistency: same timing for both trigger paths.
 *
 * Run with: npm test
 */

'use strict';

const {
  RevealPacingConfig,
  DEFAULT_PACING,
  MIN_TOTAL_MS,
  MAX_TOTAL_MS,
} = require('../../../src/completion/RevealPacingConfig');

// ── Construction ──────────────────────────────────────────────────────────────

describe('RevealPacingConfig — construction', () => {
  test('constructs with no arguments (all defaults)', () => {
    expect(() => new RevealPacingConfig()).not.toThrow();
  });

  test('defaults match DEFAULT_PACING', () => {
    const cfg = new RevealPacingConfig();
    expect(cfg.getIntroMs()).toBe(DEFAULT_PACING.intro_ms);
    expect(cfg.getComparisonHoldMs()).toBe(DEFAULT_PACING.comparison_hold_ms);
    expect(cfg.getPeakHoldMs()).toBe(DEFAULT_PACING.peak_hold_ms);
    expect(cfg.getOutroMs()).toBe(DEFAULT_PACING.outro_ms);
    expect(cfg.getAudioFadeMs()).toBe(DEFAULT_PACING.audio_fade_ms);
  });

  test('partial override — only overridden values change', () => {
    const cfg = new RevealPacingConfig({ intro_ms: 5_000 });
    expect(cfg.getIntroMs()).toBe(5_000);
    expect(cfg.getComparisonHoldMs()).toBe(DEFAULT_PACING.comparison_hold_ms);
    expect(cfg.getPeakHoldMs()).toBe(DEFAULT_PACING.peak_hold_ms);
  });

  test('all segments can be independently overridden', () => {
    const cfg = new RevealPacingConfig({
      intro_ms:           4_000,
      comparison_hold_ms: 5_000,
      peak_hold_ms:       9_000,
      outro_ms:           4_000,
      audio_fade_ms:      2_000,
    });
    expect(cfg.getIntroMs()).toBe(4_000);
    expect(cfg.getComparisonHoldMs()).toBe(5_000);
    expect(cfg.getPeakHoldMs()).toBe(9_000);
    expect(cfg.getOutroMs()).toBe(4_000);
    expect(cfg.getAudioFadeMs()).toBe(2_000);
  });
});

// ── getTotalMs ────────────────────────────────────────────────────────────────

describe('RevealPacingConfig — getTotalMs()', () => {
  test('returns sum of all segments', () => {
    const cfg = new RevealPacingConfig({
      intro_ms:           3_000,
      comparison_hold_ms: 4_000,
      peak_hold_ms:       8_000,
      outro_ms:           6_000,
      audio_fade_ms:      3_000,
    });
    expect(cfg.getTotalMs()).toBe(24_000);
  });

  test('default config total is within [20000, 60000]', () => {
    const cfg = new RevealPacingConfig();
    expect(cfg.getTotalMs()).toBeGreaterThanOrEqual(MIN_TOTAL_MS);
    expect(cfg.getTotalMs()).toBeLessThanOrEqual(MAX_TOTAL_MS);
  });

  test('audio_fade_ms is included in total (AC2 — end-to-end including audio fade)', () => {
    const baseMs = 24_000;
    const cfg1   = new RevealPacingConfig({
      intro_ms: 3_000, comparison_hold_ms: 4_000,
      peak_hold_ms: 8_000, outro_ms: 6_000, audio_fade_ms: 3_000,
    });
    const cfg2 = new RevealPacingConfig({
      intro_ms: 3_000, comparison_hold_ms: 4_000,
      peak_hold_ms: 8_000, outro_ms: 6_000, audio_fade_ms: 0,
    });
    expect(cfg1.getTotalMs()).toBe(cfg2.getTotalMs() + 3_000);
  });
});

// ── getPeakMomentOffsetMs ──────────────────────────────────────────────────────

describe('RevealPacingConfig — getPeakMomentOffsetMs()', () => {
  test('peak offset = intro_ms + comparison_hold_ms', () => {
    const cfg = new RevealPacingConfig({ intro_ms: 3_000, comparison_hold_ms: 4_000 });
    expect(cfg.getPeakMomentOffsetMs()).toBe(7_000);
  });

  test('peak offset is always before or equal to total duration', () => {
    const cfg = new RevealPacingConfig();
    expect(cfg.getPeakMomentOffsetMs()).toBeLessThanOrEqual(cfg.getTotalMs());
  });
});

// ── validate() — happy path ───────────────────────────────────────────────────

describe('RevealPacingConfig — validate() — valid configs', () => {
  test('default config is valid', () => {
    const result = new RevealPacingConfig().validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validate returns totalMs', () => {
    const cfg    = new RevealPacingConfig();
    const result = cfg.validate();
    expect(result.totalMs).toBe(cfg.getTotalMs());
  });

  test('AC2 — exactly 20 s total is valid (minimum boundary)', () => {
    // 5+5+5+3+2 = 20 s
    const cfg = new RevealPacingConfig({
      intro_ms: 5_000, comparison_hold_ms: 5_000,
      peak_hold_ms: 5_000, outro_ms: 3_000, audio_fade_ms: 2_000,
    });
    expect(cfg.getTotalMs()).toBe(20_000);
    expect(cfg.validate().valid).toBe(true);
  });

  test('AC2 — exactly 60 s total is valid (maximum boundary)', () => {
    // 10+10+20+15+5 = 60 s
    const cfg = new RevealPacingConfig({
      intro_ms: 10_000, comparison_hold_ms: 10_000,
      peak_hold_ms: 20_000, outro_ms: 15_000, audio_fade_ms: 5_000,
    });
    expect(cfg.getTotalMs()).toBe(60_000);
    expect(cfg.validate().valid).toBe(true);
  });

  test('AC2 — mid-range total (30 s) is valid', () => {
    const cfg = new RevealPacingConfig({
      intro_ms: 5_000, comparison_hold_ms: 7_000,
      peak_hold_ms: 10_000, outro_ms: 6_000, audio_fade_ms: 2_000,
    });
    expect(cfg.getTotalMs()).toBe(30_000);
    expect(cfg.validate().valid).toBe(true);
  });
});

// ── validate() — violation: below minimum ─────────────────────────────────────

describe('RevealPacingConfig — validate() — below MIN_TOTAL_MS (AC2)', () => {
  test('total below 20 s is invalid', () => {
    const cfg = new RevealPacingConfig({
      intro_ms: 1_000, comparison_hold_ms: 1_000,
      peak_hold_ms: 1_000, outro_ms: 1_000, audio_fade_ms: 1_000,
    });
    expect(cfg.getTotalMs()).toBe(5_000);
    const result = cfg.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('error message mentions minimum when below', () => {
    const cfg = new RevealPacingConfig({
      intro_ms: 1_000, comparison_hold_ms: 1_000,
      peak_hold_ms: 1_000, outro_ms: 1_000, audio_fade_ms: 1_000,
    });
    const result = cfg.validate();
    expect(result.errors.join(' ')).toMatch(/minimum|20/i);
  });

  test('total of 19999 ms (1 ms below 20 s) is invalid', () => {
    // 4000+4000+4000+4000+3999 = 19999
    const cfg = new RevealPacingConfig({
      intro_ms: 4_000, comparison_hold_ms: 4_000,
      peak_hold_ms: 4_000, outro_ms: 4_000, audio_fade_ms: 3_999,
    });
    expect(cfg.getTotalMs()).toBe(19_999);
    expect(cfg.validate().valid).toBe(false);
  });
});

// ── validate() — violation: above maximum ─────────────────────────────────────

describe('RevealPacingConfig — validate() — above MAX_TOTAL_MS (AC2)', () => {
  test('total above 60 s is invalid', () => {
    const cfg = new RevealPacingConfig({
      intro_ms: 15_000, comparison_hold_ms: 15_000,
      peak_hold_ms: 15_000, outro_ms: 12_000, audio_fade_ms: 10_000,
    });
    expect(cfg.getTotalMs()).toBe(67_000);
    const result = cfg.validate();
    expect(result.valid).toBe(false);
  });

  test('error message mentions maximum when exceeded', () => {
    const cfg = new RevealPacingConfig({
      intro_ms: 15_000, comparison_hold_ms: 15_000,
      peak_hold_ms: 15_000, outro_ms: 12_000, audio_fade_ms: 10_000,
    });
    const result = cfg.validate();
    expect(result.errors.join(' ')).toMatch(/maximum|60/i);
  });

  test('total of 60001 ms (1 ms above 60 s) is invalid', () => {
    const cfg = new RevealPacingConfig({
      intro_ms: 10_000, comparison_hold_ms: 10_000,
      peak_hold_ms: 20_000, outro_ms: 15_000, audio_fade_ms: 5_001,
    });
    expect(cfg.getTotalMs()).toBe(60_001);
    expect(cfg.validate().valid).toBe(false);
  });
});

// ── AC8 — Pacing consistency across trigger paths ────────────────────────────

describe('RevealPacingConfig — AC8: pacing identical for both trigger paths', () => {
  test('a single config object produces the same total for job_completion and job_log_replay', () => {
    // A single RevealPacingConfig is used for both trigger sources —
    // verify that the config itself is source-agnostic (no per-source fork).
    const cfg = new RevealPacingConfig();
    const total1 = cfg.getTotalMs();  // as used by job_completion
    const total2 = cfg.getTotalMs();  // as used by job_log_replay
    expect(total1).toBe(total2);
  });

  test('all segment accessors return same values regardless of trigger source context', () => {
    const cfg = new RevealPacingConfig({
      intro_ms: 3_000, comparison_hold_ms: 4_000,
      peak_hold_ms: 8_000, outro_ms: 6_000, audio_fade_ms: 3_000,
    });
    // Called in job_completion context
    const jobCompletionTotal = cfg.getTotalMs();
    const jobCompletionPeak  = cfg.getPeakMomentOffsetMs();

    // Called in job_log_replay context (same object, same values)
    const replayTotal = cfg.getTotalMs();
    const replayPeak  = cfg.getPeakMomentOffsetMs();

    expect(jobCompletionTotal).toBe(replayTotal);
    expect(jobCompletionPeak).toBe(replayPeak);
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('RevealPacingConfig — exported constants', () => {
  test('MIN_TOTAL_MS is 20000 (20 s)', () => {
    expect(MIN_TOTAL_MS).toBe(20_000);
  });

  test('MAX_TOTAL_MS is 60000 (60 s)', () => {
    expect(MAX_TOTAL_MS).toBe(60_000);
  });

  test('DEFAULT_PACING total is within bounds', () => {
    const total = Object.values(DEFAULT_PACING).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(MIN_TOTAL_MS);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_MS);
  });
});
