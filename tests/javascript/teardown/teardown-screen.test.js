/**
 * Tests: TeardownScreen — Issue #82, AC1, AC5
 *
 * Run with: npm test
 */

const { TeardownScreen } = require('../../../src/teardown/TeardownScreen');

const noop = () => {};
const makeOpts = (overrides = {}) => ({
  instrumentationHook: noop,
  ...overrides,
});

describe('TeardownScreen', () => {
  // ── Construction ───────────────────────────────────────────────────────

  it('constructs without errors', () => {
    expect(() => new TeardownScreen(makeOpts())).not.toThrow();
  });

  it('accepts autosaveHook in constructor (Issue #82)', () => {
    const hook = jest.fn();
    expect(() => new TeardownScreen(makeOpts({ autosaveHook: hook }))).not.toThrow();
  });

  // ── Part removal tracking ──────────────────────────────────────────────

  it('onPartRemoved adds part to removed set', () => {
    const screen = new TeardownScreen(makeOpts());
    screen.onPartRemoved('mainspring');
    expect(screen.getRemovedParts().has('mainspring')).toBe(true);
  });

  it('onPartRestored removes part from removed set', () => {
    const screen = new TeardownScreen(makeOpts());
    screen.onPartRemoved('crown');
    screen.onPartRestored('crown');
    expect(screen.getRemovedParts().has('crown')).toBe(false);
  });

  it('getRemovedParts returns a copy (immutable accessor)', () => {
    const screen = new TeardownScreen(makeOpts());
    screen.onPartRemoved('part-a');
    const parts = screen.getRemovedParts();
    parts.add('injected');
    expect(screen.getRemovedParts().has('injected')).toBe(false);
  });

  // ── completeTeardown fires autosaveHook ────────────────────────────────

  it('AC1: completeTeardown calls autosaveHook with stage "teardown"', async () => {
    const hook = jest.fn().mockResolvedValue(undefined);
    const screen = new TeardownScreen(makeOpts({ autosaveHook: hook }));

    await screen.completeTeardown();

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith('teardown');
  });

  it('completeTeardown resolves without error when no hook provided', async () => {
    const screen = new TeardownScreen(makeOpts());
    await expect(screen.completeTeardown()).resolves.toBeUndefined();
  });

  it('AC5: autosaveHook is awaited before completeTeardown resolves', async () => {
    let hookDone = false;
    const hook = jest.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 10));
      hookDone = true;
    });
    const screen = new TeardownScreen(makeOpts({ autosaveHook: hook }));

    await screen.completeTeardown();

    expect(hookDone).toBe(true);
  });

  // ── Telemetry ──────────────────────────────────────────────────────────

  it('emits teardown_part_removed telemetry on onPartRemoved', () => {
    const events = [];
    const screen = new TeardownScreen(makeOpts({
      instrumentationHook: (e, p) => events.push({ e, p }),
    }));
    screen.onPartRemoved('escapement');
    expect(events.some(ev => ev.e === 'teardown_part_removed')).toBe(true);
  });

  it('emits teardown_completed telemetry on completeTeardown', async () => {
    const events = [];
    const screen = new TeardownScreen(makeOpts({
      instrumentationHook: (e, p) => events.push({ e, p }),
    }));
    await screen.completeTeardown();
    expect(events.some(ev => ev.e === 'teardown_completed')).toBe(true);
  });
});
