/**
 * Tests for CompletionRevealAudioController (Issue #141)
 *
 * Acceptance criteria covered:
 *   AC3  — distinct completion audio cue fires (completion_reveal_fanfare).
 *   AC5  — audio-disabled mode: game functional, no cues fire except stop_all.
 *
 * Test scenarios mapped to Issue #141:
 *   Scenario 1  — Happy path: fanfare fires on fireCompletionCue().
 *   Scenario 2  — Audio escalation: correct cue ID for QA side-by-side comparison.
 *   Scenario 6  — stop() fires stop_all; no orphaned audio.
 */

'use strict';

const {
  CompletionRevealAudioController,
  COMPLETION_AUDIO_CUES,
  COMPLETION_AUDIO_STATE,
} = require('../../../javascript/completion/CompletionRevealAudioController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeController(opts = {}) {
  const audioHook = jest.fn();
  const ctrl = new CompletionRevealAudioController({ audioHook, ...opts });
  return { ctrl, audioHook };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('CompletionRevealAudioController — construction', () => {
  test('constructs without errors', () => {
    expect(() => makeController()).not.toThrow();
  });

  test('throws when audioHook is not a function', () => {
    expect(() => new CompletionRevealAudioController({ audioHook: 'not-a-function' })).toThrow();
  });

  test('initial audio state is idle', () => {
    const { ctrl } = makeController();
    expect(ctrl.getAudioState()).toBe(COMPLETION_AUDIO_STATE.IDLE);
  });

  test('isAudioEnabled() is true by default', () => {
    const { ctrl } = makeController();
    expect(ctrl.isAudioEnabled()).toBe(true);
  });

  test('isAudioEnabled() is false when audioEnabled=false', () => {
    const { ctrl } = makeController({ audioEnabled: false });
    expect(ctrl.isAudioEnabled()).toBe(false);
  });
});

// ─── Scenario 1 — Happy path: fanfare fires (AC3) ────────────────────────────

describe('Scenario 1 — Happy path: completion fanfare fires on fireCompletionCue() (AC3)', () => {
  test('audioHook receives completion_reveal_fanfare cue', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.fireCompletionCue();
    expect(audioHook).toHaveBeenCalledWith(COMPLETION_AUDIO_CUES.FANFARE);
  });

  test('audio state transitions to playing after fireCompletionCue()', () => {
    const { ctrl } = makeController();
    ctrl.fireCompletionCue();
    expect(ctrl.getAudioState()).toBe(COMPLETION_AUDIO_STATE.PLAYING);
  });

  test('fireCompletionCue() is a no-op if already playing', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.fireCompletionCue();
    ctrl.fireCompletionCue();
    const fanfareCalls = audioHook.mock.calls.filter(c => c[0] === COMPLETION_AUDIO_CUES.FANFARE);
    expect(fanfareCalls).toHaveLength(1);
  });
});

// ─── Scenario 2 — Audio escalation: correct cue ID for QA comparison (AC3) ───

describe('Scenario 2 — Audio escalation: cue ID distinct from SO #50 cleaning reveal', () => {
  test('FANFARE cue ID is completion_reveal_fanfare', () => {
    expect(COMPLETION_AUDIO_CUES.FANFARE).toBe('completion_reveal_fanfare');
  });

  test('FANFARE cue ID differs from hypothetical cleaning reveal cue', () => {
    // QA validates side-by-side that fanfare is more climactic; this test
    // asserts the cue IDs are distinct at the code level.
    expect(COMPLETION_AUDIO_CUES.FANFARE).not.toBe('cleaning_reveal_sting');
    expect(COMPLETION_AUDIO_CUES.FANFARE).not.toBe('first_tick_one_shot');
  });
});

// ─── Scenario 6 — stop() fires stop_all, no orphaned audio ───────────────────

describe('Scenario 6 — stop() fires stop_all and no audio can play after (AC5)', () => {
  test('stop() fires completion_reveal_stop_all cue', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.fireCompletionCue();
    ctrl.stop();
    expect(audioHook).toHaveBeenCalledWith(COMPLETION_AUDIO_CUES.STOP_ALL);
  });

  test('audio state is stopped after stop()', () => {
    const { ctrl } = makeController();
    ctrl.fireCompletionCue();
    ctrl.stop();
    expect(ctrl.getAudioState()).toBe(COMPLETION_AUDIO_STATE.STOPPED);
  });

  test('fireCompletionCue() is a no-op after stop()', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.stop();
    audioHook.mockClear();
    ctrl.fireCompletionCue();
    const fanfareCalls = audioHook.mock.calls.filter(c => c[0] === COMPLETION_AUDIO_CUES.FANFARE);
    expect(fanfareCalls).toHaveLength(0);
  });
});

// ─── Audio disabled (AC5) ─────────────────────────────────────────────────────

describe('Audio disabled — game functional, no music cues fire (AC5)', () => {
  test('no fanfare fires when audioEnabled=false', () => {
    const { ctrl, audioHook } = makeController({ audioEnabled: false });
    ctrl.fireCompletionCue();
    const fanfareCalls = audioHook.mock.calls.filter(c => c[0] === COMPLETION_AUDIO_CUES.FANFARE);
    expect(fanfareCalls).toHaveLength(0);
  });

  test('audio state still transitions to playing when audioEnabled=false', () => {
    const { ctrl } = makeController({ audioEnabled: false });
    ctrl.fireCompletionCue();
    expect(ctrl.getAudioState()).toBe(COMPLETION_AUDIO_STATE.PLAYING);
  });

  test('no errors thrown when audioEnabled=false', () => {
    const { ctrl } = makeController({ audioEnabled: false });
    expect(() => {
      ctrl.fireCompletionCue();
      ctrl.stop();
      ctrl.reset();
    }).not.toThrow();
  });
});

// ─── reset() behaviour ───────────────────────────────────────────────────────

describe('reset() — restores idle state for re-use', () => {
  test('audio state is idle after reset()', () => {
    const { ctrl } = makeController();
    ctrl.fireCompletionCue();
    ctrl.reset();
    expect(ctrl.getAudioState()).toBe(COMPLETION_AUDIO_STATE.IDLE);
  });

  test('fireCompletionCue() works again after reset()', () => {
    const { ctrl, audioHook } = makeController();
    ctrl.fireCompletionCue();
    ctrl.reset();
    audioHook.mockClear();
    ctrl.fireCompletionCue();
    expect(audioHook).toHaveBeenCalledWith(COMPLETION_AUDIO_CUES.FANFARE);
  });
});
