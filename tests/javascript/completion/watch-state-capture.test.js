/**
 * Tests for WatchStateCapture — before-state snapshot manager (Issue #141)
 *
 * Acceptance criteria covered:
 *   AC4  — before-state captured once at job-start; mid-repair overwrites rejected.
 *   AC1  — captured state is retrievable at reveal time.
 *
 * Test scenarios mapped to Issue #141:
 *   Scenario 1  — Happy path: capture at job-start, retrieve at job-complete.
 *   Scenario 3  — State accuracy: mid-repair capture attempt is a no-op.
 *   Scenario 4  — Multiple consecutive jobs: each job is isolated.
 *   Scenario 5  — Abandoned job: clearJob() discards before-state; no bleed.
 */

'use strict';

const { WatchStateCapture } = require('../../../javascript/completion/WatchStateCapture');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCapture() {
  return new WatchStateCapture();
}

function sampleSnapshot(overrides = {}) {
  return Object.assign({
    watchId:    'watch-001',
    watchName:  'Rolex Datejust',
    damageState: 'water_ingress',
    visualCues: ['fogged crystal', 'rust on case'],
  }, overrides);
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('WatchStateCapture — construction', () => {
  test('constructs without errors', () => {
    expect(() => makeCapture()).not.toThrow();
  });

  test('starts with zero captures', () => {
    expect(makeCapture().captureCount()).toBe(0);
  });
});

// ─── Scenario 1 — Happy path: capture and retrieve ───────────────────────────

describe('Scenario 1 — Happy path: capture at job-start and retrieve at job-complete (AC4, AC1)', () => {
  test('captureJobStart() returns true on first call', () => {
    const cap = makeCapture();
    expect(cap.captureJobStart('job-001', sampleSnapshot())).toBe(true);
  });

  test('hasCapture() is true after captureJobStart()', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    expect(cap.hasCapture('job-001')).toBe(true);
  });

  test('getBeforeState() returns the stored snapshot', () => {
    const cap      = makeCapture();
    const snapshot = sampleSnapshot();
    cap.captureJobStart('job-001', snapshot);
    const stored   = cap.getBeforeState('job-001');
    expect(stored.watchId).toBe('watch-001');
    expect(stored.watchName).toBe('Rolex Datejust');
    expect(stored.damageState).toBe('water_ingress');
  });

  test('getBeforeState() returns a copy (not same reference)', () => {
    const cap      = makeCapture();
    const snapshot = sampleSnapshot();
    cap.captureJobStart('job-001', snapshot);
    const stored   = cap.getBeforeState('job-001');
    stored.watchId = 'mutated';
    expect(cap.getBeforeState('job-001').watchId).toBe('watch-001');
  });

  test('getBeforeState() returns null for unknown jobId', () => {
    expect(makeCapture().getBeforeState('job-unknown')).toBeNull();
  });

  test('captureCount() increments on each new capture', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    cap.captureJobStart('job-002', sampleSnapshot({ watchId: 'watch-002' }));
    expect(cap.captureCount()).toBe(2);
  });
});

// ─── Scenario 3 — State accuracy: mid-repair capture rejected (AC4) ──────────

describe('Scenario 3 — State accuracy: mid-repair overwrite is rejected (AC4)', () => {
  test('captureJobStart() returns false on duplicate jobId', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    expect(cap.captureJobStart('job-001', sampleSnapshot({ damageState: 'mid_repair' }))).toBe(false);
  });

  test('original before-state is unchanged after rejected mid-repair capture', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot({ damageState: 'water_ingress' }));
    cap.captureJobStart('job-001', sampleSnapshot({ damageState: 'OVERWRITE_ATTEMPT' }));
    expect(cap.getBeforeState('job-001').damageState).toBe('water_ingress');
  });

  test('captureCount() does not increase on rejected capture', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    cap.captureJobStart('job-001', sampleSnapshot());
    expect(cap.captureCount()).toBe(1);
  });
});

// ─── Scenario 4 — Multiple consecutive jobs: isolated captures ───────────────

describe('Scenario 4 — Multiple consecutive jobs: each job isolated', () => {
  test('separate jobIds store independent snapshots', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot({ watchId: 'w1' }));
    cap.captureJobStart('job-002', sampleSnapshot({ watchId: 'w2' }));
    expect(cap.getBeforeState('job-001').watchId).toBe('w1');
    expect(cap.getBeforeState('job-002').watchId).toBe('w2');
  });

  test('clearing job-001 does not affect job-002', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot({ watchId: 'w1' }));
    cap.captureJobStart('job-002', sampleSnapshot({ watchId: 'w2' }));
    cap.clearJob('job-001');
    expect(cap.getBeforeState('job-002').watchId).toBe('w2');
  });
});

// ─── Scenario 5 — Abandoned job: clearJob() removes before-state ─────────────

describe('Scenario 5 — Abandoned job: clearJob() discards before-state (no bleed)', () => {
  test('clearJob() returns true when entry exists', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    expect(cap.clearJob('job-001')).toBe(true);
  });

  test('hasCapture() is false after clearJob()', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    cap.clearJob('job-001');
    expect(cap.hasCapture('job-001')).toBe(false);
  });

  test('getBeforeState() returns null after clearJob()', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    cap.clearJob('job-001');
    expect(cap.getBeforeState('job-001')).toBeNull();
  });

  test('clearJob() returns false for non-existent jobId', () => {
    expect(makeCapture().clearJob('job-ghost')).toBe(false);
  });

  test('captureCount() decrements after clearJob()', () => {
    const cap = makeCapture();
    cap.captureJobStart('job-001', sampleSnapshot());
    cap.captureJobStart('job-002', sampleSnapshot({ watchId: 'w2' }));
    cap.clearJob('job-001');
    expect(cap.captureCount()).toBe(1);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('WatchStateCapture — error handling', () => {
  test('captureJobStart() throws when jobId is falsy', () => {
    expect(() => makeCapture().captureJobStart('', sampleSnapshot())).toThrow();
  });

  test('captureJobStart() throws when snapshot is null', () => {
    expect(() => makeCapture().captureJobStart('job-001', null)).toThrow();
  });
});
