/**
 * Tests for ClipSequencePacer — AC#54-1, AC#54-3
 *
 * AC#54-1: total sequence duration is between 20 and 60 seconds.
 * AC#54-3: opening frame is visually distinct from gameplay (clip-in);
 *          closing frame returns to a neutral/calm state (clip-out).
 */

const {
  ClipSequencePacer,
  CLIP_WINDOW_MIN_S,
  CLIP_WINDOW_MAX_S,
  BEFORE_AFTER_MIN_S,
  DEFAULT_PHASES,
} = require('../../src/cleaning/ClipSequencePacer');

// ── Construction ──────────────────────────────────────────────────────────────

describe('ClipSequencePacer — construction', () => {
  test('constructs with default phases without throwing', () => {
    expect(() => new ClipSequencePacer()).not.toThrow();
  });

  test('accepts custom phases that sum to a valid total', () => {
    expect(() =>
      new ClipSequencePacer({ clipIn: 4, cinematicMove: 4, coreReveal: 5, beforeAfter: 5, clipOut: 5 })
    ).not.toThrow();
  });

  test('AC#54-1: throws if custom phases produce total < 20 seconds', () => {
    expect(() =>
      new ClipSequencePacer({ clipIn: 1, cinematicMove: 1, coreReveal: 1, beforeAfter: 3, clipOut: 1 })
    ).toThrow('outside the required 20–60 second clip window');
  });

  test('AC#54-1: throws if custom phases produce total > 60 seconds', () => {
    expect(() =>
      new ClipSequencePacer({ clipIn: 20, cinematicMove: 15, coreReveal: 15, beforeAfter: 15, clipOut: 15 })
    ).toThrow('outside the required 20–60 second clip window');
  });

  test('AC#53-3 cross-constraint: throws if beforeAfter < 3 seconds', () => {
    expect(() =>
      new ClipSequencePacer({ clipIn: 5, cinematicMove: 5, coreReveal: 5, beforeAfter: 2, clipOut: 5 })
    ).toThrow('beforeAfter phase must be at least 3 seconds');
  });

  test('exactly 20 seconds total is accepted (lower boundary)', () => {
    // 3 + 3 + 5 + 4 + 5 = 20
    expect(() =>
      new ClipSequencePacer({ clipIn: 3, cinematicMove: 3, coreReveal: 5, beforeAfter: 4, clipOut: 5 })
    ).not.toThrow();
  });

  test('exactly 60 seconds total is accepted (upper boundary)', () => {
    // 10 + 10 + 15 + 15 + 10 = 60
    expect(() =>
      new ClipSequencePacer({ clipIn: 10, cinematicMove: 10, coreReveal: 15, beforeAfter: 15, clipOut: 10 })
    ).not.toThrow();
  });
});

// ── computeSequenceTiming() (AC#54-1) ─────────────────────────────────────────

describe('ClipSequencePacer — computeSequenceTiming() (AC#54-1)', () => {
  test('AC#54-1: default timing total is between 20 and 60 seconds', () => {
    const pacer = new ClipSequencePacer();
    const timing = pacer.computeSequenceTiming();
    expect(timing.totalDurationS).toBeGreaterThanOrEqual(CLIP_WINDOW_MIN_S);
    expect(timing.totalDurationS).toBeLessThanOrEqual(CLIP_WINDOW_MAX_S);
  });

  test('AC#54-1: isWithinClipWindow is true for default phases', () => {
    const pacer = new ClipSequencePacer();
    const timing = pacer.computeSequenceTiming();
    expect(timing.isWithinClipWindow).toBe(true);
  });

  test('timing includes all required phase duration fields', () => {
    const pacer = new ClipSequencePacer();
    const timing = pacer.computeSequenceTiming();
    expect(timing).toHaveProperty('clipInDurationS');
    expect(timing).toHaveProperty('cinematicMoveDurationS');
    expect(timing).toHaveProperty('coreRevealDurationS');
    expect(timing).toHaveProperty('beforeAfterDurationS');
    expect(timing).toHaveProperty('clipOutDurationS');
    expect(timing).toHaveProperty('totalDurationS');
    expect(timing).toHaveProperty('isWithinClipWindow');
  });

  test('totalDurationS equals the sum of all phase durations', () => {
    const pacer = new ClipSequencePacer();
    const timing = pacer.computeSequenceTiming();
    const computed =
      timing.clipInDurationS +
      timing.cinematicMoveDurationS +
      timing.coreRevealDurationS +
      timing.beforeAfterDurationS +
      timing.clipOutDurationS;
    expect(timing.totalDurationS).toBe(computed);
  });

  test('custom phases within the clip window are reported accurately', () => {
    const customPhases = { clipIn: 4, cinematicMove: 3, coreReveal: 6, beforeAfter: 5, clipOut: 4 };
    const pacer = new ClipSequencePacer(customPhases);
    const timing = pacer.computeSequenceTiming();
    expect(timing.clipInDurationS).toBe(4);
    expect(timing.cinematicMoveDurationS).toBe(3);
    expect(timing.coreRevealDurationS).toBe(6);
    expect(timing.beforeAfterDurationS).toBe(5);
    expect(timing.clipOutDurationS).toBe(4);
    expect(timing.totalDurationS).toBe(22);
    expect(timing.isWithinClipWindow).toBe(true);
  });

  test('all phase durations are non-negative numbers', () => {
    const pacer = new ClipSequencePacer();
    const timing = pacer.computeSequenceTiming();
    expect(timing.clipInDurationS).toBeGreaterThanOrEqual(0);
    expect(timing.cinematicMoveDurationS).toBeGreaterThanOrEqual(0);
    expect(timing.coreRevealDurationS).toBeGreaterThanOrEqual(0);
    expect(timing.beforeAfterDurationS).toBeGreaterThanOrEqual(BEFORE_AFTER_MIN_S);
    expect(timing.clipOutDurationS).toBeGreaterThanOrEqual(0);
  });
});

// ── getClipInMarker() (AC#54-3) ───────────────────────────────────────────────

describe('ClipSequencePacer — getClipInMarker() (AC#54-3)', () => {
  test('clip-in marker has timestampS of 0 (sequence starts at t=0)', () => {
    const pacer = new ClipSequencePacer();
    const marker = pacer.getClipInMarker();
    expect(marker.timestampS).toBe(0);
  });

  test('AC#54-3: isDistinctFromGameplay is true (opening frame is distinct)', () => {
    const pacer = new ClipSequencePacer();
    const marker = pacer.getClipInMarker();
    expect(marker.isDistinctFromGameplay).toBe(true);
  });

  test('clip-in marker has a non-empty description string', () => {
    const pacer = new ClipSequencePacer();
    const marker = pacer.getClipInMarker();
    expect(typeof marker.description).toBe('string');
    expect(marker.description.length).toBeGreaterThan(0);
  });

  test('clip-in marker is stable across multiple calls', () => {
    const pacer = new ClipSequencePacer();
    const m1 = pacer.getClipInMarker();
    const m2 = pacer.getClipInMarker();
    expect(m1.timestampS).toBe(m2.timestampS);
    expect(m1.isDistinctFromGameplay).toBe(m2.isDistinctFromGameplay);
  });
});

// ── getClipOutMarker() (AC#54-3) ──────────────────────────────────────────────

describe('ClipSequencePacer — getClipOutMarker() (AC#54-3)', () => {
  test('clip-out marker timestampS equals the total sequence duration', () => {
    const pacer = new ClipSequencePacer();
    const timing = pacer.computeSequenceTiming();
    const marker = pacer.getClipOutMarker();
    expect(marker.timestampS).toBe(timing.totalDurationS);
  });

  test('AC#54-3: isNeutralState is true (closing frame returns to neutral)', () => {
    const pacer = new ClipSequencePacer();
    const marker = pacer.getClipOutMarker();
    expect(marker.isNeutralState).toBe(true);
  });

  test('clip-out marker has a non-empty description string', () => {
    const pacer = new ClipSequencePacer();
    const marker = pacer.getClipOutMarker();
    expect(typeof marker.description).toBe('string');
    expect(marker.description.length).toBeGreaterThan(0);
  });

  test('clip-out marker timestamp updates when custom phases extend the sequence', () => {
    const pacer = new ClipSequencePacer({ clipIn: 5, cinematicMove: 5, coreReveal: 10, beforeAfter: 10, clipOut: 10 });
    const marker = pacer.getClipOutMarker();
    expect(marker.timestampS).toBe(40);
  });
});

// ── isWithinClipWindow() ──────────────────────────────────────────────────────

describe('ClipSequencePacer — isWithinClipWindow()', () => {
  let pacer;
  beforeEach(() => { pacer = new ClipSequencePacer(); });

  test('returns true for 20 seconds (minimum boundary)', () => {
    expect(pacer.isWithinClipWindow(20)).toBe(true);
  });

  test('returns true for 60 seconds (maximum boundary)', () => {
    expect(pacer.isWithinClipWindow(60)).toBe(true);
  });

  test('returns true for 40 seconds (mid-range)', () => {
    expect(pacer.isWithinClipWindow(40)).toBe(true);
  });

  test('returns false for 19 seconds (below minimum)', () => {
    expect(pacer.isWithinClipWindow(19)).toBe(false);
  });

  test('returns false for 61 seconds (above maximum)', () => {
    expect(pacer.isWithinClipWindow(61)).toBe(false);
  });

  test('returns false for 0 seconds', () => {
    expect(pacer.isWithinClipWindow(0)).toBe(false);
  });
});

// ── Static methods ────────────────────────────────────────────────────────────

describe('ClipSequencePacer — static methods', () => {
  test('getClipWindowBounds() returns { min: 20, max: 60 }', () => {
    const bounds = ClipSequencePacer.getClipWindowBounds();
    expect(bounds.min).toBe(20);
    expect(bounds.max).toBe(60);
  });

  test('getDefaultPhaseDurations() returns all 5 phase keys', () => {
    const defaults = ClipSequencePacer.getDefaultPhaseDurations();
    expect(defaults).toHaveProperty('clipIn');
    expect(defaults).toHaveProperty('cinematicMove');
    expect(defaults).toHaveProperty('coreReveal');
    expect(defaults).toHaveProperty('beforeAfter');
    expect(defaults).toHaveProperty('clipOut');
  });

  test('getDefaultPhaseDurations() returns an immutable copy (modifications do not affect class)', () => {
    const defaults1 = ClipSequencePacer.getDefaultPhaseDurations();
    defaults1.clipIn = 9999;
    const defaults2 = ClipSequencePacer.getDefaultPhaseDurations();
    expect(defaults2.clipIn).not.toBe(9999);
  });

  test('getClipWindowBounds() min is CLIP_WINDOW_MIN_S and max is CLIP_WINDOW_MAX_S', () => {
    const bounds = ClipSequencePacer.getClipWindowBounds();
    expect(bounds.min).toBe(CLIP_WINDOW_MIN_S);
    expect(bounds.max).toBe(CLIP_WINDOW_MAX_S);
  });
});
