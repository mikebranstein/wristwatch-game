/**
 * Tests for BalanceWheelActivation (Issue #113)
 *
 * Acceptance criteria covered:
 *   AC1  — hookable trigger fires on balance-wheel activation.
 *   AC3  — activate() is idempotent: hook fires only once per instance.
 *   AC7  — incorrect assembly handled by caller (WindMechanic guard);
 *           these tests confirm the hook fires when called directly.
 *
 * Test scenarios mapped to issue #113:
 *   Scenario 1 (Happy path)         — activate() fires the onActivate hook.
 *   Scenario 2 (Re-wind)            — second activate() is a no-op.
 *   Scenario 5 (Multi-watch)        — reset() enables a fresh activate().
 *   Scenario 7 (Incorrect assembly) — caller never invokes activate();
 *                                     tested via WindMechanic instead.
 */

const { BalanceWheelActivation } = require('../../../javascript/completion/BalanceWheelActivation');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActivation(onActivate = jest.fn()) {
  const bwa = new BalanceWheelActivation({ onActivate });
  return { bwa, onActivate };
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('BalanceWheelActivation — constructor', () => {
  test('constructs with no options (hook omitted)', () => {
    expect(() => new BalanceWheelActivation()).not.toThrow();
  });

  test('constructs with null onActivate', () => {
    expect(() => new BalanceWheelActivation({ onActivate: null })).not.toThrow();
  });

  test('throws if onActivate is not a function (and not null)', () => {
    expect(() => new BalanceWheelActivation({ onActivate: 'bad' })).toThrow(
      'BalanceWheelActivation: onActivate must be a function or null.'
    );
  });

  test('initial isActivated() is false', () => {
    const { bwa } = makeActivation();
    expect(bwa.isActivated()).toBe(false);
  });
});

// ─── Scenario 1 — Happy path: activate() fires the hook ──────────────────────

describe('Scenario 1 — Happy path: activate() fires the onActivate hook', () => {
  test('onActivate is called once with the watchId', () => {
    const { bwa, onActivate } = makeActivation();
    bwa.activate('watch-001');
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('watch-001');
  });

  test('activate() returns true on first call', () => {
    const { bwa } = makeActivation();
    expect(bwa.activate('watch-001')).toBe(true);
  });

  test('isActivated() becomes true after activate()', () => {
    const { bwa } = makeActivation();
    bwa.activate('watch-001');
    expect(bwa.isActivated()).toBe(true);
  });

  test('activate() with default watchId uses "default" string', () => {
    const { bwa, onActivate } = makeActivation();
    bwa.activate();
    expect(onActivate).toHaveBeenCalledWith('default');
  });
});

// ─── Scenario 2 — Re-wind: second activate() is a no-op (AC3) ────────────────

describe('Scenario 2 — Re-wind: second activate() does not re-fire the hook (AC3)', () => {
  test('second activate() returns false', () => {
    const { bwa } = makeActivation();
    bwa.activate('watch-001');
    expect(bwa.activate('watch-001')).toBe(false);
  });

  test('onActivate is called only once even when activate() is called twice', () => {
    const { bwa, onActivate } = makeActivation();
    bwa.activate('watch-001');
    bwa.activate('watch-001');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  test('isActivated() remains true after second activate()', () => {
    const { bwa } = makeActivation();
    bwa.activate('watch-001');
    bwa.activate('watch-001');
    expect(bwa.isActivated()).toBe(true);
  });
});

// ─── Scenario 5 — Multi-watch: reset() enables fresh activate() ──────────────

describe('Scenario 5 — Multi-watch: reset() allows fresh first-tick on a new watch', () => {
  test('reset() sets isActivated() back to false', () => {
    const { bwa } = makeActivation();
    bwa.activate('watch-001');
    bwa.reset();
    expect(bwa.isActivated()).toBe(false);
  });

  test('after reset(), activate() fires the hook again', () => {
    const { bwa, onActivate } = makeActivation();
    bwa.activate('watch-001');
    bwa.reset();
    bwa.activate('watch-002');
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenLastCalledWith('watch-002');
  });

  test('after reset(), activate() returns true again', () => {
    const { bwa } = makeActivation();
    bwa.activate('watch-001');
    bwa.reset();
    expect(bwa.activate('watch-002')).toBe(true);
  });
});

// ─── No-hook construction ─────────────────────────────────────────────────────

describe('BalanceWheelActivation — no hook (null onActivate)', () => {
  test('activate() does not throw when no hook is provided', () => {
    const bwa = new BalanceWheelActivation({ onActivate: null });
    expect(() => bwa.activate('watch-001')).not.toThrow();
  });

  test('isActivated() still becomes true when no hook is provided', () => {
    const bwa = new BalanceWheelActivation({ onActivate: null });
    bwa.activate('watch-001');
    expect(bwa.isActivated()).toBe(true);
  });
});
