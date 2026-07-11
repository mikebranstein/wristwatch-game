/**
 * Tests: ReassemblyScreen autosave hook — Issue #82, AC1, AC5
 *
 * Run with: npm test
 */

const { ReassemblyScreen } = require('../../../src/reassembly/ReassemblyScreen');

// Minimal stubs
const noop = () => {};
const makeOpts = (overrides = {}) => ({
  instrumentationHook: noop,
  playAudio: noop,
  renderVisual: noop,
  ...overrides,
});

describe('ReassemblyScreen — autosave hook (Issue #82)', () => {
  // ── Hook injection ──────────────────────────────────────────────────────

  it('accepts autosaveHook in constructor options', () => {
    const hook = jest.fn().mockResolvedValue(undefined);
    expect(() => new ReassemblyScreen(makeOpts({ autosaveHook: hook }))).not.toThrow();
  });

  it('works without autosaveHook (backward compatible)', () => {
    const screen = new ReassemblyScreen(makeOpts());
    expect(() => screen.completeReassembly()).not.toThrow();
  });

  // ── completeReassembly fires the hook ──────────────────────────────────

  it('calls autosaveHook with stage "reassembly" on completion', async () => {
    const hook = jest.fn().mockResolvedValue(undefined);
    const screen = new ReassemblyScreen(makeOpts({ autosaveHook: hook }));

    await screen.completeReassembly();

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith('reassembly');
  });

  it('does not call autosaveHook when it is not injected', async () => {
    // Should not throw when no hook provided
    const screen = new ReassemblyScreen(makeOpts({ autosaveHook: null }));
    await expect(screen.completeReassembly()).resolves.toBeUndefined();
  });

  // ── AC1: hook is awaited before method resolves ────────────────────────

  it('AC1: autosaveHook is awaited — completeReassembly resolves after hook', async () => {
    let hookResolved = false;
    const hook = jest.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 10));
      hookResolved = true;
    });
    const screen = new ReassemblyScreen(makeOpts({ autosaveHook: hook }));

    await screen.completeReassembly();

    expect(hookResolved).toBe(true);
  });

  // ── Telemetry still fires even with autosave hook ──────────────────────

  it('telemetry reassembly_completed still emits when hook is present', async () => {
    const events = [];
    const hook = jest.fn().mockResolvedValue(undefined);
    const screen = new ReassemblyScreen(makeOpts({
      autosaveHook: hook,
      instrumentationHook: (e, payload) => events.push({ e, payload }),
    }));

    await screen.completeReassembly();

    const completedEvents = events.filter(ev => ev.e === 'reassembly_completed');
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);
  });
});
