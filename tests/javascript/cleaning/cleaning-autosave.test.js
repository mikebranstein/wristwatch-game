/**
 * Tests: CleaningRevealSequence autosave hook — Issue #82, AC1
 *
 * Run with: npm test
 */

// Mock all subsystems (BeforeAfterUI requires injected functions — mock it so
// CleaningRevealSequence can be constructed without wiring up real render hooks).
jest.mock('../../../javascript/cleaning/RevealAnimation');
jest.mock('../../../javascript/cleaning/RevealAudioController');
jest.mock('../../../javascript/cleaning/BeforeAfterUI');
jest.mock('../../../javascript/cleaning/CinematicCameraController');
jest.mock('../../../javascript/cleaning/ClipSequencePacer');
jest.mock('../../../javascript/telemetry/TelemetryEmitter');

const { CleaningRevealSequence } = require('../../../javascript/cleaning/CleaningRevealSequence');
const { CinematicCameraController } = require('../../../javascript/cleaning/CinematicCameraController');

// Minimal stubs for all required hooks
const noop = () => {};
const makeOpts = (overrides = {}) => ({
  renderReveal:        jest.fn(),
  clearReveal:         jest.fn(),
  audioHook:           jest.fn(),
  instrumentationHook: jest.fn(),
  cameraOverrideHook:  jest.fn(),
  cameraRestoreHook:   jest.fn(),
  ...overrides,
});

describe('CleaningRevealSequence — autosave hook (Issue #82)', () => {
  // ── Hook injection ──────────────────────────────────────────────────────

  it('accepts autosaveHook in constructor options', () => {
    const hook = jest.fn();
    expect(() => new CleaningRevealSequence(makeOpts({ autosaveHook: hook }))).not.toThrow();
  });

  it('works without autosaveHook (backward compatible)', () => {
    const seq = new CleaningRevealSequence(makeOpts());
    expect(() =>
      seq.onCleaningComplete('session-1', 'pre.png', 'post.png')
    ).not.toThrow();
  });

  // ── onCleaningComplete fires the hook ──────────────────────────────────

  it('calls autosaveHook with stage "cleaning" on onCleaningComplete', () => {
    const hook = jest.fn();
    const seq = new CleaningRevealSequence(makeOpts({ autosaveHook: hook }));

    seq.onCleaningComplete('session-1', 'pre.png', 'post.png');

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith('cleaning');
  });

  it('does not call hook when autosaveHook is null', () => {
    const seq = new CleaningRevealSequence(makeOpts({ autosaveHook: null }));
    // Should not throw
    expect(() => seq.onCleaningComplete('s', 'pre', 'post')).not.toThrow();
  });

  // ── Concurrency guard still applies ────────────────────────────────────

  it('AC#53-5 concurrency guard: second onCleaningComplete while revealing is ignored', () => {
    const hook = jest.fn();
    const seq = new CleaningRevealSequence(makeOpts({ autosaveHook: hook }));

    seq.onCleaningComplete('session-1', 'pre', 'post');
    seq.onCleaningComplete('session-2', 'pre', 'post'); // should be discarded

    // Hook should only fire once (first call)
    expect(hook).toHaveBeenCalledTimes(1);
  });

  // ── hook fires on every new cleaning complete after destroy ─────────────

  it('hook fires again after destroy() resets state', () => {
    const hook = jest.fn();
    const seq = new CleaningRevealSequence(makeOpts({ autosaveHook: hook }));

    seq.onCleaningComplete('s1', 'pre', 'post');
    seq.destroy();
    seq.onCleaningComplete('s2', 'pre', 'post');

    expect(hook).toHaveBeenCalledTimes(2);
  });
});
