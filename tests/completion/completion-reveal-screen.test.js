/**
 * Tests for CompletionRevealScreen — hero-shot reveal payload builder (Issue #141)
 *
 * Acceptance criteria covered:
 *   AC1  — payload produced when triggerReveal is called at job-complete.
 *   AC2  — payload carries fullScreen=true, fullWatchView=true (whole assembled watch).
 *   AC4  — beforeState in payload reflects job-start snapshot (caller-provided).
 *   AC5  — isDismissable() enforces the 5-second dismissal gate.
 *
 * Test scenarios mapped to Issue #141:
 *   Scenario 1  — Happy path: full before/after payload with both states.
 *   Scenario 6  — Reveal is dismissable: isDismissable() gate checked at 5 s.
 *   Scenario 7  — Resolution coverage: payload carries no hardcoded pixel values.
 *   Scenario 8  — Minimal-damage job: payload built even with subtle contrast.
 */

'use strict';

const { CompletionRevealScreen, DEFAULT_DISMISSABLE_AFTER_MS } = require('../../src/completion/CompletionRevealScreen');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScreen(opts = {}) {
  return new CompletionRevealScreen(opts);
}

function beforeState() {
  return { watchId: 'w-001', condition: 'heavily damaged', damageState: 'water_ingress' };
}

function afterState() {
  return { watchId: 'w-001', condition: 'fully restored', damageState: null };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('CompletionRevealScreen — construction', () => {
  test('constructs with defaults', () => {
    expect(() => makeScreen()).not.toThrow();
  });

  test('default displayMode is side_by_side', () => {
    expect(makeScreen().getDisplayMode()).toBe('side_by_side');
  });

  test('displayMode animated_reveal is accepted', () => {
    expect(makeScreen({ displayMode: 'animated_reveal' }).getDisplayMode()).toBe('animated_reveal');
  });

  test('unknown displayMode falls back to side_by_side', () => {
    expect(makeScreen({ displayMode: 'invalid' }).getDisplayMode()).toBe('side_by_side');
  });

  test('default dismissableAfterMs is 5000', () => {
    expect(makeScreen().getDismissableAfterMs()).toBe(DEFAULT_DISMISSABLE_AFTER_MS);
    expect(DEFAULT_DISMISSABLE_AFTER_MS).toBe(5000);
  });

  test('custom dismissableAfterMs is stored', () => {
    expect(makeScreen({ dismissableAfterMs: 0 }).getDismissableAfterMs()).toBe(0);
  });
});

// ─── Scenario 1 — Happy path: full reveal payload (AC1, AC2, AC4) ─────────────

describe('Scenario 1 — Happy path: buildRevealPayload() with before and after states (AC1/AC2/AC4)', () => {
  test('returns an object with jobId', () => {
    const screen  = makeScreen();
    const payload = screen.buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.jobId).toBe('job-001');
  });

  test('fullScreen is true (AC2)', () => {
    const payload = makeScreen().buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.fullScreen).toBe(true);
  });

  test('fullWatchView is true (whole watch, not parts — AC2)', () => {
    const payload = makeScreen().buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.fullWatchView).toBe(true);
  });

  test('beforeAvailable is true when before-state is provided (AC4)', () => {
    const payload = makeScreen().buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.beforeAvailable).toBe(true);
  });

  test('beforeState in payload matches the injected before-state (AC4)', () => {
    const payload = makeScreen().buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.beforeState.condition).toBe('heavily damaged');
    expect(payload.beforeState.damageState).toBe('water_ingress');
  });

  test('afterState in payload matches the injected after-state', () => {
    const payload = makeScreen().buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.afterState.condition).toBe('fully restored');
  });

  test('displayMode carried through to payload', () => {
    const payload = makeScreen({ displayMode: 'animated_reveal' })
      .buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.displayMode).toBe('animated_reveal');
  });

  test('dismissableAfterMs carried through to payload', () => {
    const payload = makeScreen({ dismissableAfterMs: 3000 })
      .buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.dismissableAfterMs).toBe(3000);
  });

  test('builtAtMs is a recent timestamp', () => {
    const before   = Date.now();
    const payload  = makeScreen().buildRevealPayload('job-001', beforeState(), afterState());
    const after_ts = Date.now();
    expect(payload.builtAtMs).toBeGreaterThanOrEqual(before);
    expect(payload.builtAtMs).toBeLessThanOrEqual(after_ts);
  });

  test('beforeState in payload is a copy (immutable)', () => {
    const bs      = beforeState();
    const payload = makeScreen().buildRevealPayload('job-001', bs, afterState());
    payload.beforeState.condition = 'mutated';
    expect(bs.condition).toBe('heavily damaged');
  });

  test('afterState in payload is a copy (immutable)', () => {
    const as_     = afterState();
    const payload = makeScreen().buildRevealPayload('job-001', beforeState(), as_);
    payload.afterState.condition = 'mutated';
    expect(as_.condition).toBe('fully restored');
  });
});

// ─── Graceful degradation: no before-state (pre-feature / crash recovery) ────

describe('Graceful degradation — null before-state (pre-feature / crash recovery)', () => {
  test('beforeAvailable is false when beforeState is null', () => {
    const payload = makeScreen().buildRevealPayload('job-001', null, afterState());
    expect(payload.beforeAvailable).toBe(false);
  });

  test('beforeState in payload is null when no capture exists', () => {
    const payload = makeScreen().buildRevealPayload('job-001', null, afterState());
    expect(payload.beforeState).toBeNull();
  });

  test('afterState still populated when beforeState is null', () => {
    const payload = makeScreen().buildRevealPayload('job-001', null, afterState());
    expect(payload.afterState.condition).toBe('fully restored');
  });
});

// ─── Scenario 6 — Reveal is dismissable (AC5) ────────────────────────────────

describe('Scenario 6 — Reveal is dismissable at 5 seconds (AC5)', () => {
  test('isDismissable(0) is false (reveal just started)', () => {
    expect(makeScreen().isDismissable(0)).toBe(false);
  });

  test('isDismissable(4999) is false (just under threshold)', () => {
    expect(makeScreen().isDismissable(4999)).toBe(false);
  });

  test('isDismissable(5000) is true (at threshold)', () => {
    expect(makeScreen().isDismissable(5000)).toBe(true);
  });

  test('isDismissable(6000) is true (beyond threshold)', () => {
    expect(makeScreen().isDismissable(6000)).toBe(true);
  });

  test('dismissableAfterMs=0 is always dismissable', () => {
    const screen = makeScreen({ dismissableAfterMs: 0 });
    expect(screen.isDismissable(0)).toBe(true);
  });

  test('custom dismissableAfterMs=3000 enforced correctly', () => {
    const screen = makeScreen({ dismissableAfterMs: 3000 });
    expect(screen.isDismissable(2999)).toBe(false);
    expect(screen.isDismissable(3000)).toBe(true);
  });
});

// ─── Scenario 8 — Minimal-damage job: payload still produced ─────────────────

describe('Scenario 8 — Minimal-damage job: reveal still fires with subtle contrast', () => {
  test('payload is produced for a lightly damaged watch', () => {
    const lightBefore = { watchId: 'w-lite', condition: 'light wear', damageState: null };
    const lightAfter  = { watchId: 'w-lite', condition: 'polished', damageState: null };
    const payload     = makeScreen().buildRevealPayload('job-lite', lightBefore, lightAfter);
    expect(payload.jobId).toBe('job-lite');
    expect(payload.beforeAvailable).toBe(true);
  });

  test('hasBeforeState() is true for minimal-damage payload', () => {
    const screen  = makeScreen();
    const payload = screen.buildRevealPayload('job-lite',
      { watchId: 'w-lite', condition: 'light wear' },
      { watchId: 'w-lite', condition: 'polished' });
    expect(screen.hasBeforeState(payload)).toBe(true);
  });
});

// ─── Scenario 7 — No hardcoded pixel values ───────────────────────────────────

describe('Scenario 7 — Payload carries no resolution-hardcoded values', () => {
  test('payload has no width or height fields', () => {
    const payload = makeScreen().buildRevealPayload('job-001', beforeState(), afterState());
    expect(payload.width).toBeUndefined();
    expect(payload.height).toBeUndefined();
    expect(payload.resolution).toBeUndefined();
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('CompletionRevealScreen — error handling', () => {
  test('buildRevealPayload() throws when jobId is falsy', () => {
    expect(() => makeScreen().buildRevealPayload('', beforeState(), afterState())).toThrow();
  });

  test('buildRevealPayload() throws when afterState is missing', () => {
    expect(() => makeScreen().buildRevealPayload('job-001', beforeState(), null)).toThrow();
  });
});
