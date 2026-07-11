/**
 * Tests: TimingCalibrationTracker — Issue #255, AC1
 *
 * Covers:
 *   - Correct par time selection by pricing tier
 *   - Per-phase score = 100% at exact par time
 *   - Per-phase score < 50% when actual time < 50% of par
 *   - Per-phase score clamped to 100% (no over-score for slow jobs)
 *   - Arithmetic mean across multiple phases
 *   - null return when no phases recorded
 *   - Phase-gate: open phases (no end) are not included in score
 *   - Defensive: recordPhaseEnd without matching recordPhaseStart is a no-op
 *   - Per-phase raw timestamps are ephemeral (not accessible after end)
 *
 * Run with: npm test
 */

'use strict';

const { TimingCalibrationTracker, PAR_SECONDS, DEFAULT_PAR_SECONDS } = require('../../../javascript/workshop/TimingCalibrationTracker');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a slot-like object with a pricingTier. */
function makeSlot(pricingTier) {
  return { pricingTier };
}

/**
 * Build a mock clock that advances by `deltaMs` on each call after the first.
 * First call returns 0; each subsequent call returns 0 + cumulative deltas.
 */
function makeClock(...deltasMs) {
  let callCount = 0;
  let time = 0;
  return () => {
    if (callCount === 0) { callCount++; return time; }
    time += deltasMs[callCount - 1] || 0;
    callCount++;
    return time;
  };
}

// ---------------------------------------------------------------------------
// Par seconds by tier
// ---------------------------------------------------------------------------

describe('TimingCalibrationTracker — par time selection', () => {
  it('uses 45 s/phase par for simple_service (Tier 1)', () => {
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'));
    expect(tracker.getParSeconds()).toBe(45);
  });

  it('uses 75 s/phase par for complex_service (Tier 2)', () => {
    const tracker = new TimingCalibrationTracker(makeSlot('complex_service'));
    expect(tracker.getParSeconds()).toBe(75);
  });

  it('uses 120 s/phase par for full_restoration (Tier 3)', () => {
    const tracker = new TimingCalibrationTracker(makeSlot('full_restoration'));
    expect(tracker.getParSeconds()).toBe(120);
  });

  it('defaults to 45 s/phase for unrecognised pricing tier', () => {
    const tracker = new TimingCalibrationTracker(makeSlot('unknown_tier'));
    expect(tracker.getParSeconds()).toBe(DEFAULT_PAR_SECONDS);
  });

  it('defaults to 45 s/phase when slot has no pricingTier', () => {
    const tracker = new TimingCalibrationTracker({});
    expect(tracker.getParSeconds()).toBe(DEFAULT_PAR_SECONDS);
  });

  it('defaults to 45 s/phase when slot is null', () => {
    const tracker = new TimingCalibrationTracker(null);
    expect(tracker.getParSeconds()).toBe(DEFAULT_PAR_SECONDS);
  });
});

// ---------------------------------------------------------------------------
// Per-phase scoring
// ---------------------------------------------------------------------------

describe('TimingCalibrationTracker — per-phase score computation', () => {
  it('AC1: per-phase score = 100% when actual time equals par time (simple_service)', () => {
    // par = 45 s; actual = 45 s → score = 100%
    const clock = makeClock(45_000);  // 45 000 ms = 45 s
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);
    tracker.recordPhaseStart('teardown');
    tracker.recordPhaseEnd('teardown');
    expect(tracker.getPhaseScores()).toEqual([100]);
  });

  it('AC1: per-phase score = 100% at exact par time (complex_service, 75 s)', () => {
    const clock = makeClock(75_000);
    const tracker = new TimingCalibrationTracker(makeSlot('complex_service'), clock);
    tracker.recordPhaseStart('cleaning');
    tracker.recordPhaseEnd('cleaning');
    expect(tracker.getPhaseScores()).toEqual([100]);
  });

  it('AC1: per-phase score = 100% at exact par time (full_restoration, 120 s)', () => {
    const clock = makeClock(120_000);
    const tracker = new TimingCalibrationTracker(makeSlot('full_restoration'), clock);
    tracker.recordPhaseStart('reassembly');
    tracker.recordPhaseEnd('reassembly');
    expect(tracker.getPhaseScores()).toEqual([100]);
  });

  it('per-phase score < 50% when actual < 50% of par (rushed job)', () => {
    // par = 45 s; actual = 20 s → score = 20/45 × 100 ≈ 44.4%
    const clock = makeClock(20_000);
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);
    tracker.recordPhaseStart('teardown');
    tracker.recordPhaseEnd('teardown');
    const [score] = tracker.getPhaseScores();
    expect(score).toBeCloseTo((20 / 45) * 100, 5);
    expect(score).toBeLessThan(50);
  });

  it('per-phase score is clamped to 100% when actual > par (deliberate/slow job)', () => {
    // par = 45 s; actual = 200 s → raw = 200/45*100 ≈ 444% → clamped to 100%
    const clock = makeClock(200_000);
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);
    tracker.recordPhaseStart('teardown');
    tracker.recordPhaseEnd('teardown');
    expect(tracker.getPhaseScores()).toEqual([100]);
  });

  it('per-phase score = 0% when actual = 0 ms', () => {
    // par = 45 s; actual = 0 → score = 0%
    const clock = makeClock(0);
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);
    tracker.recordPhaseStart('teardown');
    tracker.recordPhaseEnd('teardown');
    expect(tracker.getPhaseScores()).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// computeJobScore — arithmetic mean
// ---------------------------------------------------------------------------

describe('TimingCalibrationTracker — computeJobScore', () => {
  it('AC1: returns null when no phases have been recorded', () => {
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'));
    expect(tracker.computeJobScore()).toBeNull();
  });

  it('AC1: returns single phase score when only one phase recorded', () => {
    // par = 45 s; actual = 45 s → score = 100% → mean = 100%
    const clock = makeClock(45_000);
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);
    tracker.recordPhaseStart('teardown');
    tracker.recordPhaseEnd('teardown');
    expect(tracker.computeJobScore()).toBeCloseTo(100, 5);
  });

  it('AC1: arithmetic mean across multiple phases', () => {
    // par = 45 s
    // phase 1: actual = 45 s → 100%
    // phase 2: actual = 22.5 s → 50%
    // mean = 75%
    let time = 0;
    const clock = () => time;
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);

    tracker.recordPhaseStart('teardown');
    time += 45_000;
    tracker.recordPhaseEnd('teardown');

    tracker.recordPhaseStart('cleaning');
    time += 22_500;
    tracker.recordPhaseEnd('cleaning');

    expect(tracker.computeJobScore()).toBeCloseTo(75, 5);
  });

  it('arithmetic mean across 4 phases with mixed scores', () => {
    // par = 75 s (complex_service)
    // phase scores: 75/75*100=100, 30/75*100=40, 75/75*100=100, 37.5/75*100=50
    // mean = (100 + 40 + 100 + 50) / 4 = 72.5%
    let time = 0;
    const clock = () => time;
    const tracker = new TimingCalibrationTracker(makeSlot('complex_service'), clock);

    const phases = [
      { id: 'teardown',   ms: 75_000 },
      { id: 'cleaning',   ms: 30_000 },
      { id: 'sourcing',   ms: 75_000 },
      { id: 'reassembly', ms: 37_500 },
    ];

    for (const { id, ms } of phases) {
      tracker.recordPhaseStart(id);
      time += ms;
      tracker.recordPhaseEnd(id);
    }

    expect(tracker.computeJobScore()).toBeCloseTo(72.5, 5);
  });
});

// ---------------------------------------------------------------------------
// Ephemeral timestamps / open phases
// ---------------------------------------------------------------------------

describe('TimingCalibrationTracker — ephemeral timestamps', () => {
  it('open phases (started but not ended) are not included in score', () => {
    // Start two phases, end only one — only the ended phase contributes
    let time = 0;
    const clock = () => time;
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);

    tracker.recordPhaseStart('teardown');
    time += 45_000;
    tracker.recordPhaseEnd('teardown');  // contributes: 100%

    tracker.recordPhaseStart('cleaning');  // not ended — NOT included in score
    time += 45_000;

    expect(tracker.getPhaseScores().length).toBe(1);  // only teardown
    expect(tracker.computeJobScore()).toBeCloseTo(100, 5);
    expect(Object.keys(tracker.getOpenPhases())).toContain('cleaning');
  });

  it('raw timestamps are deleted after recordPhaseEnd (ephemeral)', () => {
    let time = 0;
    const clock = () => time;
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'), clock);
    tracker.recordPhaseStart('teardown');
    time += 45_000;
    tracker.recordPhaseEnd('teardown');
    expect(Object.keys(tracker.getOpenPhases())).not.toContain('teardown');
  });

  it('recordPhaseEnd without matching recordPhaseStart is a no-op (defensive guard)', () => {
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'));
    expect(() => tracker.recordPhaseEnd('no-such-phase')).not.toThrow();
    expect(tracker.getPhaseScores()).toHaveLength(0);
    expect(tracker.computeJobScore()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase-gate integration (phase 2 AC4)
// ---------------------------------------------------------------------------

describe('TimingCalibrationTracker — phase-gate exclusion', () => {
  it('AC4: when tracker is not instantiated (player has not unlocked), pass null to aggregator', () => {
    // Simulated: when timing is not unlocked, TimingCalibrationTracker is never instantiated.
    // The JobQualityAggregator receives null for timing_calibration — excluded from composite.
    // This test verifies computeJobScore() returns null on a fresh tracker with no phases.
    const tracker = new TimingCalibrationTracker(makeSlot('simple_service'));
    // No phases recorded = null → excludes from aggregator (phase-gate)
    expect(tracker.computeJobScore()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PAR_SECONDS export
// ---------------------------------------------------------------------------

describe('PAR_SECONDS export', () => {
  it('exports correct par times for all known tiers', () => {
    expect(PAR_SECONDS.simple_service).toBe(45);
    expect(PAR_SECONDS.complex_service).toBe(75);
    expect(PAR_SECONDS.full_restoration).toBe(120);
  });
});
