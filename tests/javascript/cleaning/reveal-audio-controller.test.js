/**
 * Tests for RevealAudioController
 *
 * Covers:
 *   AC2 — audio cue fires in sync with visual transition beat (within ±100ms).
 *   AC5 — no audio stacking: second call while playing is a no-op; clean reset
 *          between sessions enables correct subsequent reveals.
 *
 * Test scenarios mapped to issue #53:
 *   Scenario 1 (Happy path)           — fireRevealCue fires the hook.
 *   Scenario 3 (Audio sync)           — syncDeltaMs within tolerance is reported.
 *   Scenario 7 (Back-to-back)         — no audio stacking after onCueComplete().
 */

const { RevealAudioController, MAX_SYNC_TOLERANCE_MS } = require('../../../src/cleaning/RevealAudioController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController() {
  const audioHook = jest.fn();
  const ctrl = new RevealAudioController(audioHook);
  return { ctrl, audioHook };
}

// ─── Constructor validation ───────────────────────────────────────────────────

describe('RevealAudioController — constructor', () => {
  test('throws if audioHook is not a function', () => {
    expect(() => new RevealAudioController(null)).toThrow(
      'RevealAudioController requires an audioHook function.'
    );
  });

  test('initial state: not playing', () => {
    const { ctrl } = makeController();
    expect(ctrl.isPlaying()).toBe(false);
  });

  test('MAX_SYNC_TOLERANCE_MS is 100', () => {
    expect(MAX_SYNC_TOLERANCE_MS).toBe(100);
  });
});

// ─── Scenario 1 (AC2): fireRevealCue invokes the hook ────────────────────────

describe('Scenario 1 — Happy path: fireRevealCue fires the audio hook', () => {
  test('audioHook is called with the cue ID', () => {
    const { ctrl, audioHook } = makeController();
    const beatMs = Date.now();
    ctrl.fireRevealCue('cleaning_reveal_cue', beatMs);
    expect(audioHook).toHaveBeenCalledWith('cleaning_reveal_cue');
  });

  test('fireRevealCue returns fired: true', () => {
    const { ctrl } = makeController();
    const result = ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    expect(result.fired).toBe(true);
  });

  test('isPlaying returns true after fireRevealCue', () => {
    const { ctrl } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    expect(ctrl.isPlaying()).toBe(true);
  });
});

// ─── Scenario 3 (AC2): sync tolerance check ──────────────────────────────────

describe('Scenario 3 — Audio sync: syncDeltaMs is within ±100ms when called on the same beat', () => {
  test('syncDeltaMs is a number in the return value', () => {
    const { ctrl } = makeController();
    const beatMs = Date.now();
    const result = ctrl.fireRevealCue('cleaning_reveal_cue', beatMs);
    expect(typeof result.syncDeltaMs).toBe('number');
  });

  test('withinTolerance is true when fired at the same timestamp', () => {
    const { ctrl } = makeController();
    const beatMs = Date.now();
    const result = ctrl.fireRevealCue('cleaning_reveal_cue', beatMs);
    expect(result.withinTolerance).toBe(true);
  });

  test('withinTolerance is false when fired more than 100ms after the beat', () => {
    const { ctrl } = makeController();
    const beatMs = Date.now() - 200; // 200ms in the past
    const result = ctrl.fireRevealCue('cleaning_reveal_cue', beatMs);
    expect(result.withinTolerance).toBe(false);
  });

  test('withinTolerance is false does not prevent the hook from firing', () => {
    const { ctrl, audioHook } = makeController();
    const beatMs = Date.now() - 200;
    ctrl.fireRevealCue('cleaning_reveal_cue', beatMs);
    expect(audioHook).toHaveBeenCalled();
  });

  test('getLastSyncData returns the timing of the last fire', () => {
    const { ctrl } = makeController();
    const beatMs = Date.now();
    ctrl.fireRevealCue('cleaning_reveal_cue', beatMs);
    const data = ctrl.getLastSyncData();
    expect(data.lastVisualBeatMs).toBe(beatMs);
    expect(typeof data.lastAudioFireMs).toBe('number');
    expect(typeof data.lastSyncDeltaMs).toBe('number');
  });
});

// ─── AC5: no audio stacking ───────────────────────────────────────────────────

describe('AC5 — No audio stacking: second fireRevealCue while playing is discarded', () => {
  test('second fireRevealCue returns fired: false', () => {
    const { ctrl } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    const result = ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    expect(result.fired).toBe(false);
  });

  test('audioHook is called only once when two cues arrive while playing', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    expect(audioHook).toHaveBeenCalledTimes(1);
  });

  test('after onCueComplete, a new fireRevealCue fires the hook again', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    ctrl.onCueComplete();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    expect(audioHook).toHaveBeenCalledTimes(2);
  });

  test('onCueComplete resets isPlaying to false', () => {
    const { ctrl } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    ctrl.onCueComplete();
    expect(ctrl.isPlaying()).toBe(false);
  });
});

// ─── Scenario 7: Back-to-back ─────────────────────────────────────────────────

describe('Scenario 7 — Back-to-back: stop() enables a fresh reveal', () => {
  test('stop() sets isPlaying to false', () => {
    const { ctrl } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    ctrl.stop();
    expect(ctrl.isPlaying()).toBe(false);
  });

  test('stop() clears last sync data', () => {
    const { ctrl } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    ctrl.stop();
    const data = ctrl.getLastSyncData();
    expect(data.lastVisualBeatMs).toBeNull();
    expect(data.lastAudioFireMs).toBeNull();
    expect(data.lastSyncDeltaMs).toBeNull();
  });

  test('after stop(), fireRevealCue fires the hook again', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    ctrl.stop();
    ctrl.fireRevealCue('cleaning_reveal_cue', Date.now());
    expect(audioHook).toHaveBeenCalledTimes(2);
  });
});
