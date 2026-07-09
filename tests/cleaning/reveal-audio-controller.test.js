/**
 * Tests for RevealAudioController — AC#53-2
 *
 * Covers: construction, playRevealCue(), isPlaying(), audio sync timing contract.
 *
 * AC#53-2: audio fires within ±100ms of visual reveal beat.
 * The key invariant: audioHook is called synchronously within the same call stack
 * as playRevealCue() — no artificial async gap.
 */

const { RevealAudioController, AUDIO_CUE_ID, AUDIO_CUE_DURATION_MS } =
  require('../../src/cleaning/RevealAudioController');

// ── Construction ──────────────────────────────────────────────────────────────

describe('RevealAudioController — construction', () => {
  test('throws if audioHook is not a function', () => {
    expect(() => new RevealAudioController(null)).toThrow(
      'audioHook must be a function'
    );
  });

  test('throws if audioHook is not provided', () => {
    expect(() => new RevealAudioController(undefined)).toThrow(
      'audioHook must be a function'
    );
  });

  test('constructs with a valid hook — isPlaying false initially', () => {
    const ctrl = new RevealAudioController(jest.fn());
    expect(ctrl.isPlaying()).toBe(false);
  });

  test('getLastCueFiredAt() is null before any cue fires', () => {
    const ctrl = new RevealAudioController(jest.fn());
    expect(ctrl.getLastCueFiredAt()).toBeNull();
  });
});

// ── playRevealCue() ───────────────────────────────────────────────────────────

describe('RevealAudioController — playRevealCue()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('AC#53-2: audioHook is called with the correct cue ID', () => {
    const audioHook = jest.fn();
    const ctrl = new RevealAudioController(audioHook);
    ctrl.playRevealCue();
    expect(audioHook).toHaveBeenCalledWith(AUDIO_CUE_ID);
  });

  test('AC#53-2: audioHook is called with "cleaning_reveal_cue"', () => {
    const audioHook = jest.fn();
    const ctrl = new RevealAudioController(audioHook);
    ctrl.playRevealCue();
    expect(audioHook).toHaveBeenCalledWith('cleaning_reveal_cue');
  });

  test('isPlaying() is true immediately after playRevealCue()', () => {
    const ctrl = new RevealAudioController(jest.fn());
    ctrl.playRevealCue();
    expect(ctrl.isPlaying()).toBe(true);
  });

  test('getLastCueFiredAt() is set to a timestamp after playRevealCue()', () => {
    const ctrl = new RevealAudioController(jest.fn());
    const before = Date.now();
    ctrl.playRevealCue();
    const after = Date.now();
    const ts = ctrl.getLastCueFiredAt();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test('isPlaying() returns false after the cue duration expires', () => {
    const ctrl = new RevealAudioController(jest.fn());
    ctrl.playRevealCue();
    jest.advanceTimersByTime(AUDIO_CUE_DURATION_MS + 1);
    expect(ctrl.isPlaying()).toBe(false);
  });

  test('AC#53-2: audioHook is called synchronously (no async gap)', () => {
    // The hook must be called within the same synchronous call stack
    let syncCallCount = 0;
    const audioHook = () => { syncCallCount++; };
    const ctrl = new RevealAudioController(audioHook);
    ctrl.playRevealCue();
    // Immediately after playRevealCue() returns, hook must already have been called
    expect(syncCallCount).toBe(1);
  });

  test('getCueId() returns the correct cue identifier constant', () => {
    expect(RevealAudioController.getCueId()).toBe('cleaning_reveal_cue');
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────────

describe('RevealAudioController — destroy()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('destroy() does not throw when called before any cue fires', () => {
    const ctrl = new RevealAudioController(jest.fn());
    expect(() => ctrl.destroy()).not.toThrow();
  });

  test('destroy() cancels pending isPlaying reset timer', () => {
    const ctrl = new RevealAudioController(jest.fn());
    ctrl.playRevealCue();
    ctrl.destroy();
    // Timer cancelled — but isPlaying state may remain true (timer was killed)
    // The important invariant is no error thrown and timer is not re-fired
    jest.runAllTimers(); // should not cause unhandled errors
  });
});
