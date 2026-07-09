/**
 * Tests: SourcingScreen — Issue #82, AC1, AC5
 *
 * Run with: npm test
 */

const { SourcingScreen } = require('../../src/sourcing/SourcingScreen');

const noop = () => {};
const makeOpts = (overrides = {}) => ({
  instrumentationHook: noop,
  ...overrides,
});

describe('SourcingScreen', () => {
  // ── Construction ───────────────────────────────────────────────────────

  it('constructs without errors', () => {
    expect(() => new SourcingScreen(makeOpts())).not.toThrow();
  });

  it('accepts autosaveHook in constructor (Issue #82)', () => {
    const hook = jest.fn();
    expect(() => new SourcingScreen(makeOpts({ autosaveHook: hook }))).not.toThrow();
  });

  // ── Parts sourcing tracking ────────────────────────────────────────────

  it('onPartSourced adds part to sourced set', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('mainspring');
    expect(screen.getSourcedParts().has('mainspring')).toBe(true);
  });

  it('onPartUnSourced removes part from sourced set', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('crown');
    screen.onPartUnSourced('crown');
    expect(screen.getSourcedParts().has('crown')).toBe(false);
  });

  it('getSourcedParts returns a copy (immutable accessor)', () => {
    const screen = new SourcingScreen(makeOpts());
    screen.onPartSourced('part-x');
    const parts = screen.getSourcedParts();
    parts.add('injected');
    expect(screen.getSourcedParts().has('injected')).toBe(false);
  });

  // ── completeSourcing fires autosaveHook ────────────────────────────────

  it('AC1: completeSourcing calls autosaveHook with stage "sourcing"', async () => {
    const hook = jest.fn().mockResolvedValue(undefined);
    const screen = new SourcingScreen(makeOpts({ autosaveHook: hook }));

    await screen.completeSourcing();

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith('sourcing');
  });

  it('completeSourcing resolves without error when no hook provided', async () => {
    const screen = new SourcingScreen(makeOpts());
    await expect(screen.completeSourcing()).resolves.toBeUndefined();
  });

  it('AC5: autosaveHook is awaited before completeSourcing resolves', async () => {
    let hookDone = false;
    const hook = jest.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 10));
      hookDone = true;
    });
    const screen = new SourcingScreen(makeOpts({ autosaveHook: hook }));

    await screen.completeSourcing();

    expect(hookDone).toBe(true);
  });

  // ── Telemetry ──────────────────────────────────────────────────────────

  it('emits sourcing_part_placed telemetry on onPartSourced', () => {
    const events = [];
    const screen = new SourcingScreen(makeOpts({
      instrumentationHook: (e, p) => events.push({ e, p }),
    }));
    screen.onPartSourced('balance-wheel');
    expect(events.some(ev => ev.e === 'sourcing_part_placed')).toBe(true);
  });

  it('emits sourcing_completed telemetry on completeSourcing', async () => {
    const events = [];
    const screen = new SourcingScreen(makeOpts({
      instrumentationHook: (e, p) => events.push({ e, p }),
    }));
    await screen.completeSourcing();
    expect(events.some(ev => ev.e === 'sourcing_completed')).toBe(true);
  });
});
