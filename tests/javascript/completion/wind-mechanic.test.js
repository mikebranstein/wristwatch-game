/**
 * Tests for WindMechanic (Issue #113)
 *
 * Acceptance criteria covered:
 *   AC1  — onTensionRamp fires at the correct wind step threshold.
 *   AC6  — rapid wind input (large step count) fires onTensionRamp exactly once.
 *   AC7  — setAssembledCorrectly(false) suppresses onActivationThreshold even
 *           at full wind.
 *
 * Test scenarios mapped to issue #113:
 *   Scenario 1 (Happy path)        — full wind fires tension ramp then activation.
 *   Scenario 2 (Re-wind)           — reset() + re-wind fires hooks again.
 *   Scenario 6 (Rapid input)       — winding 10 steps at once fires ramp once.
 *   Scenario 7 (Incorrect assembly)— activation hook suppressed when assembly wrong.
 */

const { WindMechanic, TOTAL_WIND_STEPS, TENSION_WINDOW_STEPS } = require('../../../src/completion/WindMechanic');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMechanic(opts = {}) {
  const onTensionRamp = jest.fn();
  const onActivationThreshold = jest.fn();
  const mech = new WindMechanic({
    onTensionRamp,
    onActivationThreshold,
    ...opts,
  });
  return { mech, onTensionRamp, onActivationThreshold };
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('WindMechanic — exported constants', () => {
  test('TOTAL_WIND_STEPS is a positive integer', () => {
    expect(Number.isInteger(TOTAL_WIND_STEPS)).toBe(true);
    expect(TOTAL_WIND_STEPS).toBeGreaterThan(0);
  });

  test('TENSION_WINDOW_STEPS is less than TOTAL_WIND_STEPS', () => {
    expect(TENSION_WINDOW_STEPS).toBeLessThan(TOTAL_WIND_STEPS);
  });
});

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('WindMechanic — constructor', () => {
  test('constructs with no options', () => {
    expect(() => new WindMechanic()).not.toThrow();
  });

  test('initial wind steps is 0', () => {
    const { mech } = makeMechanic();
    expect(mech.getWindSteps()).toBe(0);
  });

  test('initial tensionRampFired is false', () => {
    const { mech } = makeMechanic();
    expect(mech.isTensionRampFired()).toBe(false);
  });

  test('initial activationFired is false', () => {
    const { mech } = makeMechanic();
    expect(mech.isActivationFired()).toBe(false);
  });

  test('throws if onTensionRamp is not a function (and not null)', () => {
    expect(() => new WindMechanic({ onTensionRamp: 'bad' })).toThrow(
      'WindMechanic: onTensionRamp must be a function or null.'
    );
  });

  test('throws if onActivationThreshold is not a function (and not null)', () => {
    expect(() => new WindMechanic({ onActivationThreshold: 42 })).toThrow(
      'WindMechanic: onActivationThreshold must be a function or null.'
    );
  });
});

// ─── Scenario 1 — Happy path: full wind fires both hooks ─────────────────────

describe('Scenario 1 — Happy path: tension ramp fires at threshold, activation fires at full wind', () => {
  test('onTensionRamp fires when wind reaches tension threshold', () => {
    const { mech, onTensionRamp } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);

    // Wind to step 7 (below threshold at step 8)
    for (let i = 0; i < 7; i++) mech.wind(1);
    expect(onTensionRamp).not.toHaveBeenCalled();

    // Step 8 = totalWindSteps - tensionWindowSteps = 10 - 2 = 8 → ramp fires
    mech.wind(1);
    expect(onTensionRamp).toHaveBeenCalledTimes(1);
  });

  test('onActivationThreshold fires when fully wound and correctly assembled', () => {
    const { mech, onActivationThreshold } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);

    for (let i = 0; i < 9; i++) mech.wind(1);
    expect(onActivationThreshold).not.toHaveBeenCalled();

    mech.wind(1); // step 10 = full wind
    expect(onActivationThreshold).toHaveBeenCalledTimes(1);
  });

  test('wind() returns new step count', () => {
    const { mech } = makeMechanic();
    mech.setAssembledCorrectly(true);
    expect(mech.wind(3)).toBe(3);
    expect(mech.wind(2)).toBe(5);
  });

  test('isTensionRampFired() is true after ramp threshold', () => {
    const { mech } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);
    for (let i = 0; i < 8; i++) mech.wind(1);
    expect(mech.isTensionRampFired()).toBe(true);
  });

  test('isActivationFired() is true after full wind + correct assembly', () => {
    const { mech } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);
    for (let i = 0; i < 10; i++) mech.wind(1);
    expect(mech.isActivationFired()).toBe(true);
  });
});

// ─── Scenario 6 — Rapid input: large step count fires ramp exactly once ──────

describe('Scenario 6 — Rapid wind input: hooks fire exactly once even with large step', () => {
  test('winding totalWindSteps at once fires onTensionRamp exactly once', () => {
    const { mech, onTensionRamp } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);
    mech.wind(10); // one giant step
    expect(onTensionRamp).toHaveBeenCalledTimes(1);
  });

  test('winding totalWindSteps at once fires onActivationThreshold exactly once', () => {
    const { mech, onActivationThreshold } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);
    mech.wind(10);
    expect(onActivationThreshold).toHaveBeenCalledTimes(1);
  });

  test('winding beyond totalWindSteps clamps at totalWindSteps', () => {
    const { mech } = makeMechanic({ totalWindSteps: 10 });
    mech.setAssembledCorrectly(true);
    mech.wind(99);
    expect(mech.getWindSteps()).toBe(10);
  });

  test('subsequent wind() calls after full wind do not re-fire hooks', () => {
    const { mech, onTensionRamp, onActivationThreshold } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);
    mech.wind(10);
    mech.wind(1); // excess — should be no-op on hooks
    expect(onTensionRamp).toHaveBeenCalledTimes(1);
    expect(onActivationThreshold).toHaveBeenCalledTimes(1);
  });
});

// ─── Scenario 7 — Incorrect assembly: activation hook suppressed ─────────────

describe('Scenario 7 — Incorrect assembly: activation threshold hook NOT fired (AC7)', () => {
  test('onActivationThreshold is NOT called when assembly is incorrect', () => {
    const { mech, onActivationThreshold } = makeMechanic({ totalWindSteps: 10 });
    mech.setAssembledCorrectly(false);
    mech.wind(10);
    expect(onActivationThreshold).not.toHaveBeenCalled();
  });

  test('onTensionRamp IS still called even when assembly is incorrect', () => {
    // Tension ramp is a presentation hook — it fires regardless of assembly
    // because it happens before activation; the activation guard is separate.
    const { mech, onTensionRamp } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(false);
    mech.wind(10);
    expect(onTensionRamp).toHaveBeenCalledTimes(1);
  });

  test('isActivationFired() is false when assembly is incorrect even at full wind', () => {
    const { mech } = makeMechanic({ totalWindSteps: 10 });
    mech.setAssembledCorrectly(false);
    mech.wind(10);
    expect(mech.isActivationFired()).toBe(false);
  });
});

// ─── Scenario 2 — Re-wind: reset() re-arms the hooks ─────────────────────────

describe('Scenario 2 — Re-wind: reset() re-arms hooks for subsequent wind', () => {
  test('after reset(), winding again fires onTensionRamp again', () => {
    const { mech, onTensionRamp } = makeMechanic({ totalWindSteps: 10, tensionWindowSteps: 2 });
    mech.setAssembledCorrectly(true);
    mech.wind(10);
    mech.reset();
    mech.wind(10);
    expect(onTensionRamp).toHaveBeenCalledTimes(2);
  });

  test('after reset(), getWindSteps() is 0', () => {
    const { mech } = makeMechanic({ totalWindSteps: 10 });
    mech.wind(5);
    mech.reset();
    expect(mech.getWindSteps()).toBe(0);
  });

  test('reset() preserves assembledCorrectly flag', () => {
    const { mech } = makeMechanic();
    mech.setAssembledCorrectly(true);
    mech.reset();
    expect(mech.isAssembledCorrectly()).toBe(true);
  });
});
