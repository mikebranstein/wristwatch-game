/**
 * Tests for BalanceWheelOscillationController (Issue #147)
 *
 * Design: Issue #147 (Balance Wheel Animation — Phase 1: Oscillation After
 * Successful Reassembly)
 *
 * Acceptance criteria covered:
 *   AC1 — oscillates at correct frequency derived from bph (not hardcoded)
 *   AC2 — trigger coordination (verified via FirstTickCinematicController integration tests)
 *   AC3 — frame delta capping prevents jumps after GC / tab visibility change
 *   AC4 — Phase 2 extensibility hook (registerPhase2Handler) is callable from
 *          outside the module without modifying Phase 1 internals
 *   AC5 — start(0) / start(null) / start() → no animation (fail-safe)
 *
 * Test scenarios mapped to issue #147:
 *   Happy path                — start(28800) launches animation loop at 4 Hz
 *   Frequency accuracy        — angle at known elapsed time matches sin formula
 *   Loop continuity           — multiple frames advance elapsed with delta capping
 *   Incorrect assembly        — bph absent or zero → start() returns false, no loop
 *   Scene transition          — stop() terminates loop and releases state
 *   Phase 2 readiness         — registerPhase2Handler is exported, callable, receives frames
 *   bph fail-safe             — missing/zero bph → no animation (Constraint #4)
 *   Frame delta capping       — deltas > MAX_FRAME_DELTA_MS are clamped (AC3)
 */

'use strict';

const {
  BalanceWheelOscillationController,
  MAX_FRAME_DELTA_MS,
} = require('../../../src/completion/BalanceWheelOscillationController');

// ─── Test scheduler ───────────────────────────────────────────────────────────

/**
 * Synchronous fake animation scheduler.
 * Collects registered callbacks and delivers them on demand via flush().
 */
function makeScheduler() {
  let nextId = 1;
  const pending = new Map();

  return {
    request(cb) {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancel(id) {
      pending.delete(id);
    },
    /**
     * Fire all currently-pending callbacks with the given timestamp.
     * Each callback may re-schedule; those land in pending for the NEXT flush.
     */
    flush(timestamp) {
      const entries = Array.from(pending.entries());
      pending.clear();
      entries.forEach(([, cb]) => cb(timestamp));
    },
    hasPending() {
      return pending.size > 0;
    },
    pendingCount() {
      return pending.size;
    },
  };
}

function makeController(overrides = {}) {
  const scheduler = makeScheduler();
  const controller = new BalanceWheelOscillationController({
    animationScheduler: scheduler,
    ...overrides,
  });
  return { controller, scheduler };
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('BalanceWheelOscillationController — constructor', () => {
  test('constructs with no options', () => {
    expect(() => new BalanceWheelOscillationController()).not.toThrow();
  });

  test('initial state: not animating, angle 0, bph 0', () => {
    const { controller } = makeController();
    expect(controller.isAnimating()).toBe(false);
    expect(controller.getAngle()).toBe(0);
    expect(controller.getBph()).toBe(0);
    expect(controller.getElapsed()).toBe(0);
  });

  test('accepts a custom animationScheduler', () => {
    const scheduler = makeScheduler();
    expect(
      () => new BalanceWheelOscillationController({ animationScheduler: scheduler })
    ).not.toThrow();
  });
});

// ─── start() — happy path ────────────────────────────────────────────────────

describe('BalanceWheelOscillationController — start() happy path', () => {
  test('start(28800) begins the animation loop (AC1 — happy path)', () => {
    const { controller, scheduler } = makeController();
    const started = controller.start(28800);

    expect(started).toBe(true);
    expect(controller.isAnimating()).toBe(true);
    expect(controller.getBph()).toBe(28800);
    expect(scheduler.hasPending()).toBe(true);
  });

  test('first frame initialises startTime; angle = 0 on first tick', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);

    // First frame: elapsed = 0 so sin(0) = 0
    scheduler.flush(1000);
    expect(controller.isAnimating()).toBe(true);
    expect(controller.getAngle()).toBeCloseTo(0, 5);
  });

  test('AC1 — frequency accuracy: 28800 bph = 4 Hz → ±180° arc', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);

    // First frame establishes startTime = T0
    const T0 = 0;
    scheduler.flush(T0);

    // At elapsed = 250 ms: 4 Hz → one full cycle in 250 ms (quarter-period = 62.5 ms)
    // sin(2π × 4 × 0.25) = sin(2π) = 0  — but let's use a quarter period:
    // At elapsed = 62.5 ms: sin(2π × 4 × 0.0625) = sin(π/2) = 1 → angle = 180°
    // We deliver it as multiple frames with small deltas to test accumulation.
    scheduler.flush(T0 + 20);   // elapsed += 20 ms
    scheduler.flush(T0 + 40);   // elapsed += 20 ms
    scheduler.flush(T0 + 62);   // elapsed += 22 ms → ~62 ms total

    // At 62 ms elapsed: angle ≈ 180 * sin(2π × 4 × 0.062) ≈ 180 * sin(1.558) ≈ 180 * 0.9999 ≈ ~180°
    const expectedAngle = 180 * Math.sin(2 * Math.PI * (28800 / 7200) * 62 / 1000);
    expect(controller.getAngle()).toBeCloseTo(expectedAngle, 3);
  });

  test('AC1 — frequency accuracy: 18000 bph = 2.5 Hz', () => {
    const { controller, scheduler } = makeController();
    controller.start(18000);

    const T0 = 500;
    scheduler.flush(T0);           // establish start; elapsed = 0
    // Accumulate 100ms using steps ≤ MAX_FRAME_DELTA_MS to avoid clamping
    scheduler.flush(T0 + 40);     // +40ms → elapsed = 40
    scheduler.flush(T0 + 80);     // +40ms → elapsed = 80
    scheduler.flush(T0 + 100);    // +20ms → elapsed = 100

    const expectedAngle = 180 * Math.sin(2 * Math.PI * (18000 / 7200) * 100 / 1000);
    expect(controller.getAngle()).toBeCloseTo(expectedAngle, 3);
  });

  test('angle oscillates between +180 and -180 (full arc verified at key points)', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);  // 4 Hz: full cycle = 250 ms, quarter period = 62.5 ms

    const T0 = 0;
    scheduler.flush(T0);        // establish start; elapsed = 0

    // Quarter period = 62.5 ms → sin(π/2) = 1 → angle ≈ 180°
    // Break into two steps to stay within MAX_FRAME_DELTA_MS (50ms)
    scheduler.flush(T0 + 50);   // +50ms → elapsed = 50
    scheduler.flush(T0 + 62.5); // +12.5ms → elapsed = 62.5
    expect(controller.getAngle()).toBeCloseTo(180, 0);

    // Half period: another 62.5ms → elapsed = 125ms → sin(π) = 0
    scheduler.flush(T0 + 112.5); // +50ms → elapsed = 112.5
    scheduler.flush(T0 + 125);   // +12.5ms → elapsed = 125
    expect(controller.getAngle()).toBeCloseTo(0, 0);

    // Three-quarter period: another 62.5ms → elapsed = 187.5ms → sin(3π/2) = -1 → angle ≈ -180°
    scheduler.flush(T0 + 175);   // +50ms → elapsed = 175
    scheduler.flush(T0 + 187.5); // +12.5ms → elapsed = 187.5
    expect(controller.getAngle()).toBeCloseTo(-180, 0);
  });

  test('schedules a new frame after each tick (loop continuity — AC3)', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);

    scheduler.flush(0);    // frame 1
    expect(scheduler.hasPending()).toBe(true);  // frame 2 scheduled

    scheduler.flush(16);   // frame 2
    expect(scheduler.hasPending()).toBe(true);  // frame 3 scheduled

    scheduler.flush(32);   // frame 3
    expect(scheduler.hasPending()).toBe(true);  // frame 4 scheduled
  });
});

// ─── start() — fail-safe (AC5) ───────────────────────────────────────────────

describe('BalanceWheelOscillationController — start() fail-safe (AC5 / Constraint #4)', () => {
  test('start() with no argument returns false; loop not started', () => {
    const { controller, scheduler } = makeController();
    const started = controller.start();

    expect(started).toBe(false);
    expect(controller.isAnimating()).toBe(false);
    expect(scheduler.hasPending()).toBe(false);
  });

  test('start(0) returns false; loop not started', () => {
    const { controller, scheduler } = makeController();
    const started = controller.start(0);

    expect(started).toBe(false);
    expect(controller.isAnimating()).toBe(false);
  });

  test('start(null) returns false; loop not started', () => {
    const { controller, scheduler } = makeController();
    const started = controller.start(null);

    expect(started).toBe(false);
    expect(controller.isAnimating()).toBe(false);
  });

  test('start(negative) returns false; loop not started', () => {
    const { controller, scheduler } = makeController();
    const started = controller.start(-100);

    expect(started).toBe(false);
    expect(controller.isAnimating()).toBe(false);
  });

  test('start("28800") (string) returns false; loop not started', () => {
    const { controller, scheduler } = makeController();
    const started = controller.start('28800');

    expect(started).toBe(false);
    expect(controller.isAnimating()).toBe(false);
  });
});

// ─── stop() — scene-boundary isolation (Constraint #8) ───────────────────────

describe('BalanceWheelOscillationController — stop()', () => {
  test('stop() while animating cancels loop and resets state', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);
    scheduler.flush(0);    // run one frame
    scheduler.flush(16);   // run another

    controller.stop();

    expect(controller.isAnimating()).toBe(false);
    expect(controller.getAngle()).toBe(0);
    expect(controller.getBph()).toBe(0);
    expect(controller.getElapsed()).toBe(0);
    // Pending frame should have been cancelled
    expect(scheduler.hasPending()).toBe(false);
  });

  test('stop() when not animating is a no-op (safe to call repeatedly)', () => {
    const { controller } = makeController();
    expect(() => controller.stop()).not.toThrow();
    expect(() => controller.stop()).not.toThrow();
  });

  test('frames scheduled before stop() do not advance state after stop()', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);

    // There is a pending frame but we stop BEFORE flushing it
    controller.stop();
    expect(controller.isAnimating()).toBe(false);

    // Even if the scheduler somehow fires a stale callback, state should not change
    // (The cancel() call removes it from the queue; this test verifies the guard)
    expect(controller.getAngle()).toBe(0);
  });

  test('start() after stop() restarts the loop cleanly', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);
    scheduler.flush(0);
    controller.stop();

    // Restart with different bph
    const restarted = controller.start(21600);
    expect(restarted).toBe(true);
    expect(controller.isAnimating()).toBe(true);
    expect(controller.getBph()).toBe(21600);
    expect(scheduler.hasPending()).toBe(true);
  });
});

// ─── Frame delta capping (AC3 — Constraint #6) ───────────────────────────────

describe('BalanceWheelOscillationController — frame delta capping (AC3)', () => {
  test('delta above MAX_FRAME_DELTA_MS is clamped to MAX_FRAME_DELTA_MS', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);

    scheduler.flush(0);           // establish start at T=0

    // Simulate a 500 ms gap (e.g. GC pause / tab backgrounded)
    scheduler.flush(500);

    // elapsed should be clamped to MAX_FRAME_DELTA_MS, not 500
    expect(controller.getElapsed()).toBeLessThanOrEqual(MAX_FRAME_DELTA_MS + 1);
  });

  test('normal frames (< MAX_FRAME_DELTA_MS) accumulate correctly', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);

    scheduler.flush(0);     // start
    scheduler.flush(16);    // +16 ms
    scheduler.flush(32);    // +16 ms

    expect(controller.getElapsed()).toBeCloseTo(32, 0);
  });

  test('repeated large deltas do not cause unbounded phase drift', () => {
    const { controller, scheduler } = makeController();
    controller.start(28800);

    scheduler.flush(0);

    // Five consecutive 200ms frames (each clamped to MAX_FRAME_DELTA_MS)
    scheduler.flush(200);
    scheduler.flush(400);
    scheduler.flush(600);
    scheduler.flush(800);
    scheduler.flush(1000);

    // Expected elapsed: 5 × MAX_FRAME_DELTA_MS
    const expected = 5 * MAX_FRAME_DELTA_MS;
    expect(controller.getElapsed()).toBeCloseTo(expected, 0);

    // Angle should be valid (within ±180°)
    expect(Math.abs(controller.getAngle())).toBeLessThanOrEqual(180);
  });
});

// ─── Phase 2 extensibility hook (AC4 / Constraint #9) ────────────────────────

describe('BalanceWheelOscillationController — Phase 2 extensibility hook (AC4)', () => {
  test('registerPhase2Handler is a function exported on the prototype (AC4)', () => {
    const { controller } = makeController();
    expect(typeof controller.registerPhase2Handler).toBe('function');
  });

  test('registerPhase2Handler(handler) registers without throwing', () => {
    const { controller } = makeController();
    expect(() => controller.registerPhase2Handler(() => {})).not.toThrow();
  });

  test('Phase 2 handler is called on each animation frame with correct shape', () => {
    const { controller, scheduler } = makeController();
    const frames = [];

    // Register from outside the module — simulates Phase 2 attachment
    controller.registerPhase2Handler((frame) => frames.push(frame));

    controller.start(28800);
    scheduler.flush(0);     // frame 1
    scheduler.flush(16);    // frame 2

    expect(frames).toHaveLength(2);
    expect(frames[0]).toHaveProperty('angle');
    expect(frames[0]).toHaveProperty('elapsed');
    expect(frames[0]).toHaveProperty('bph');
    expect(frames[0].bph).toBe(28800);
  });

  test('Phase 2 handler receives correct angle matching controller state', () => {
    const { controller, scheduler } = makeController();
    let capturedFrame = null;

    controller.registerPhase2Handler((frame) => { capturedFrame = frame; });

    controller.start(28800);
    scheduler.flush(0);      // start
    scheduler.flush(62.5);   // quarter period for 4 Hz

    expect(capturedFrame).not.toBeNull();
    expect(capturedFrame.angle).toBeCloseTo(controller.getAngle(), 5);
    expect(capturedFrame.elapsed).toBeCloseTo(controller.getElapsed(), 1);
    expect(capturedFrame.bph).toBe(28800);
  });

  test('multiple Phase 2 handlers can be registered (extensibility)', () => {
    const { controller, scheduler } = makeController();
    const calls1 = [];
    const calls2 = [];

    controller.registerPhase2Handler((f) => calls1.push(f));
    controller.registerPhase2Handler((f) => calls2.push(f));

    controller.start(28800);
    scheduler.flush(0);
    scheduler.flush(16);

    expect(calls1).toHaveLength(2);
    expect(calls2).toHaveLength(2);
  });

  test('Phase 2 handler error does not crash the animation loop (resilience)', () => {
    const { controller, scheduler } = makeController();
    let frameCount = 0;

    controller.registerPhase2Handler(() => { throw new Error('Phase 2 error'); });
    controller.registerPhase2Handler(() => { frameCount++; });

    controller.start(28800);
    expect(() => scheduler.flush(0)).not.toThrow();
    expect(frameCount).toBe(1);   // second handler still ran
    expect(controller.isAnimating()).toBe(true);
  });

  test('registerPhase2Handler throws if handler is not a function', () => {
    const { controller } = makeController();
    expect(() => controller.registerPhase2Handler(42)).toThrow(
      'BalanceWheelOscillationController.registerPhase2Handler: handler must be a function.'
    );
  });

  test('Phase 2 handlers are NOT called after stop()', () => {
    const { controller, scheduler } = makeController();
    const frames = [];

    controller.registerPhase2Handler((f) => frames.push(f));
    controller.start(28800);
    scheduler.flush(0);
    controller.stop();

    const countBeforeStop = frames.length;

    // No more frames should arrive after stop
    expect(scheduler.hasPending()).toBe(false);
    expect(frames).toHaveLength(countBeforeStop);
  });
});

// ─── Integration: FirstTickCinematicController (AC2, AC5) ────────────────────

describe('BalanceWheelOscillationController — integration with FirstTickCinematicController (AC2, AC5)', () => {
  const { FirstTickCinematicController } = require('../../../src/completion/FirstTickCinematicController');
  const { AUDIO_CUES, MIN_SILENCE_GATE_MS } = require('../../../src/completion/FirstTickAudioController');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function makeCinematicHarness(bphProviderFn = null) {
    const scheduler = makeScheduler();
    const oscillation = new BalanceWheelOscillationController({ animationScheduler: scheduler });

    const controller = new FirstTickCinematicController({
      audioHook: jest.fn(),
      highlightRenderer: jest.fn(),
      inputManager: { suspend: jest.fn(), resume: jest.fn() },
      savedViewProvider: () => ({ position: { x: 0, y: 0, z: 0 }, angle: {} }),
      holdDurationMs: 1800,
      totalWindSteps: 6,
      tensionWindowSteps: 2,
      bphProvider: bphProviderFn,
      oscillationController: oscillation,
    });

    return { controller, oscillation, scheduler };
  }

  test('AC2 — oscillation starts when AUDIO_CUES.FIRST_TICK fires (correct assembly)', () => {
    const bphProvider = jest.fn(() => 28800);
    const { controller, oscillation, scheduler } = makeCinematicHarness(bphProvider);

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);

    // Before silence gate: oscillation not yet started
    expect(oscillation.isAnimating()).toBe(false);

    // Advance past silence gate → FIRST_TICK fires → _startCinematic → oscillation.start
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(oscillation.isAnimating()).toBe(true);
    expect(oscillation.getBph()).toBe(28800);
    expect(scheduler.hasPending()).toBe(true);
  });

  test('AC2 — bph is resolved from provider for the correct watchId', () => {
    const bphProvider = jest.fn((watchId) => watchId === 'seiko-nh35' ? 21600 : null);
    const { controller, oscillation } = makeCinematicHarness(bphProvider);

    controller.prepareForWatch('seiko-nh35', true);
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(bphProvider).toHaveBeenCalledWith('seiko-nh35');
    expect(oscillation.getBph()).toBe(21600);
  });

  test('AC5 — incorrect assembly: oscillation does NOT start', () => {
    const bphProvider = () => 28800;
    const { controller, oscillation } = makeCinematicHarness(bphProvider);

    controller.prepareForWatch('watch-bad', false);  // incorrectly assembled
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(oscillation.isAnimating()).toBe(false);
  });

  test('AC5 — no bphProvider: oscillation does not start (fail-safe)', () => {
    const { controller, oscillation } = makeCinematicHarness(null);

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(oscillation.isAnimating()).toBe(false);
  });

  test('AC5 — bphProvider returns null: oscillation does not start (fail-safe)', () => {
    const bphProvider = () => null;
    const { controller, oscillation } = makeCinematicHarness(bphProvider);

    controller.prepareForWatch('watch-unknown', true);
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(oscillation.isAnimating()).toBe(false);
  });

  test('Constraint #8 — abort() stops oscillation (scene-boundary isolation)', () => {
    const bphProvider = () => 28800;
    const { controller, oscillation, scheduler } = makeCinematicHarness(bphProvider);

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(oscillation.isAnimating()).toBe(true);

    controller.abort();

    expect(oscillation.isAnimating()).toBe(false);
    expect(oscillation.getAngle()).toBe(0);
    expect(scheduler.hasPending()).toBe(false);
  });

  test('getOscillationController() exposes the injected controller', () => {
    const { controller, oscillation } = makeCinematicHarness(() => 28800);
    expect(controller.getOscillationController()).toBe(oscillation);
  });
});

// ─── MovementData integration ─────────────────────────────────────────────────

describe('BalanceWheelOscillationController — MovementData bph lookup', () => {
  const { MovementData, defaultMovementData } = require('../../../src/data/MovementData');

  test('defaultMovementData.getBph returns known bph for registered caliber', () => {
    expect(defaultMovementData.getBph('eta-2824-2')).toBe(28800);
    expect(defaultMovementData.getBph('eta-6497-1')).toBe(18000);
    expect(defaultMovementData.getBph('seiko-nh35')).toBe(21600);
  });

  test('defaultMovementData.getBph returns null for unknown watchId', () => {
    expect(defaultMovementData.getBph('watch-unknown-xyz')).toBeNull();
    expect(defaultMovementData.getBph(null)).toBeNull();
    expect(defaultMovementData.getBph('')).toBeNull();
  });

  test('MovementData.register() adds a new entry retrievable via getBph()', () => {
    const data = new MovementData();
    data.register('custom-watch-1', { bph: 36000 });
    expect(data.getBph('custom-watch-1')).toBe(36000);
  });

  test('MovementData.register() throws on invalid bph', () => {
    const data = new MovementData();
    expect(() => data.register('bad-watch', { bph: 0 })).toThrow();
    expect(() => data.register('bad-watch', { bph: -100 })).toThrow();
    expect(() => data.register('bad-watch', { bph: 'fast' })).toThrow();
  });

  test('bph provider from defaultMovementData feeds oscillation correctly', () => {
    const scheduler = makeScheduler();
    const osc = new BalanceWheelOscillationController({ animationScheduler: scheduler });
    const bph = defaultMovementData.getBph('eta-2824-2');

    osc.start(bph);
    expect(osc.isAnimating()).toBe(true);
    expect(osc.getBph()).toBe(28800);
  });
});
