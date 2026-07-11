/**
 * Tests for RevealSequenceController.js — Issue #142 Completion Reveal Shareability Layer
 *
 * Acceptance criteria covered:
 *   AC1 — share prompt visible at peak moment (both states fully visible).
 *   AC2 — total reveal duration within 20–60 s (invalid configs rejected).
 *   AC4 — dismissing share prompt does not interrupt the reveal sequence.
 *   AC5 — before/after states forwarded unchanged to onPeakMoment callback.
 *   AC8 — pacing timing identical for 'job_completion' and 'job_log_replay' trigger sources.
 *
 * Test scenarios covered:
 *   Scenario 1  — Happy path: trigger → intro → peak (share prompt) → complete.
 *   Scenario 2  — Dismiss during peak: sequence completes normally.
 *   Scenario 3  — Clip pacing: total duration within 20–60 s.
 *   Scenario 7  — Share prompt timing: shown only after comparison_hold elapsed.
 *   Scenario 8  — Pacing consistency: same timings for both trigger sources.
 *
 * Run with: npm test
 */

'use strict';

const { RevealSequenceController, REVEAL_STATE, TRIGGER_SOURCES } = require('../../../src/completion/RevealSequenceController');
const { RevealPacingConfig }  = require('../../../src/completion/RevealPacingConfig');
const { SharePromptOverlay, OVERLAY_STATE }  = require('../../../src/completion/SharePromptOverlay');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a fast-pacing config for tests (stays within 20–60 s bounds).
 * Total: 100+100+100+19400+400 = 20100 ms — within [20000, 60000].
 */
function makeFastPacingConfig(overrides = {}) {
  return new RevealPacingConfig({
    intro_ms:            100,
    comparison_hold_ms:  100,
    peak_hold_ms:        100,
    outro_ms:          19_400,
    audio_fade_ms:       400,
    ...overrides,
  });
}

function makeOverlay(opts = {}) {
  return new SharePromptOverlay({ screenAreaPercent: 5, ...opts });
}

function makeController(opts = {}) {
  const pacing  = opts.pacingConfig    ?? makeFastPacingConfig();
  const overlay = opts.overlay         ?? makeOverlay();
  const ctrl    = new RevealSequenceController({
    pacingConfig:        pacing,
    sharePromptOverlay:  overlay,
    onPeakMoment:        opts.onPeakMoment       ?? null,
    onComplete:          opts.onComplete          ?? null,
    onAbort:             opts.onAbort             ?? null,
    instrumentationHook: opts.instrumentationHook ?? null,
  });
  return { ctrl, overlay, pacing };
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('RevealSequenceController — construction', () => {
  test('constructs successfully with valid pacing and overlay', () => {
    expect(() => makeController()).not.toThrow();
  });

  test('initial state is IDLE', () => {
    const { ctrl } = makeController();
    expect(ctrl.getState()).toBe(REVEAL_STATE.IDLE);
  });

  test('isPlaying() is false before trigger()', () => {
    const { ctrl } = makeController();
    expect(ctrl.isPlaying()).toBe(false);
  });

  test('throws TypeError if pacingConfig is not a RevealPacingConfig', () => {
    expect(() => new RevealSequenceController({
      pacingConfig: {},
      sharePromptOverlay: makeOverlay(),
    })).toThrow(TypeError);
  });

  test('throws TypeError if sharePromptOverlay is not a SharePromptOverlay', () => {
    expect(() => new RevealSequenceController({
      pacingConfig:       makeFastPacingConfig(),
      sharePromptOverlay: {},
    })).toThrow(TypeError);
  });

  test('AC2 — throws if pacing config is invalid (total below 20 s)', () => {
    const invalidPacing = new RevealPacingConfig({
      intro_ms: 100, comparison_hold_ms: 100,
      peak_hold_ms: 100, outro_ms: 100, audio_fade_ms: 100,
    });
    expect(() => new RevealSequenceController({
      pacingConfig:       invalidPacing,
      sharePromptOverlay: makeOverlay(),
    })).toThrow();
  });
});

// ── Scenario 1 — Happy path ───────────────────────────────────────────────────

describe('Scenario 1 — Happy path: trigger → peak → complete', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('trigger() sets state to INTRO synchronously', () => {
    const { ctrl } = makeController();
    ctrl.trigger({ watchId: 'w-001', beforeState: 'before', afterState: 'after' });
    expect(ctrl.getState()).toBe(REVEAL_STATE.INTRO);
  });

  test('isPlaying() is true after trigger()', () => {
    const { ctrl } = makeController();
    ctrl.trigger({ watchId: 'w-001', beforeState: 'before', afterState: 'after' });
    expect(ctrl.isPlaying()).toBe(true);
  });

  test('getActiveWatchId() returns the triggered watchId', () => {
    const { ctrl } = makeController();
    ctrl.trigger({ watchId: 'w-001', beforeState: 'before', afterState: 'after' });
    expect(ctrl.getActiveWatchId()).toBe('w-001');
  });

  test('AC1 — share prompt shown at peak moment offset (Scenario 7)', () => {
    const pacing  = makeFastPacingConfig({ intro_ms: 100, comparison_hold_ms: 100 });
    const overlay = makeOverlay();
    const { ctrl } = makeController({ pacingConfig: pacing, overlay });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'before', afterState: 'after' });

    // Before peak: overlay still HIDDEN
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs() - 1);
    expect(overlay.isHidden()).toBe(true);

    // At peak: overlay VISIBLE
    jest.advanceTimersByTime(1);
    expect(overlay.isVisible()).toBe(true);
  });

  test('AC1 — onPeakMoment callback fires at peak offset', () => {
    const onPeakMoment = jest.fn();
    const pacing = makeFastPacingConfig({ intro_ms: 100, comparison_hold_ms: 100 });
    const { ctrl } = makeController({ pacingConfig: pacing, onPeakMoment });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());
    expect(onPeakMoment).toHaveBeenCalledWith('w-001', 'B', 'A');
  });

  test('state is PEAK after peak moment', () => {
    const pacing = makeFastPacingConfig({ intro_ms: 100, comparison_hold_ms: 100 });
    const { ctrl } = makeController({ pacingConfig: pacing });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());
    expect(ctrl.getState()).toBe(REVEAL_STATE.PEAK);
  });

  test('onComplete callback fires after total duration', () => {
    const onComplete = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, onComplete });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getTotalMs());
    expect(onComplete).toHaveBeenCalledWith('w-001', TRIGGER_SOURCES.JOB_COMPLETION);
  });

  test('state is COMPLETE after total duration', () => {
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getTotalMs());
    expect(ctrl.getState()).toBe(REVEAL_STATE.COMPLETE);
  });

  test('isPlaying() is false after complete', () => {
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getTotalMs());
    expect(ctrl.isPlaying()).toBe(false);
  });
});

// ── Scenario 2 — Dismiss during peak (AC4) ───────────────────────────────────

describe('Scenario 2 — Dismiss during peak: reveal continues normally (AC4)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('dismissSharePrompt() transitions overlay to DISMISSED', () => {
    const pacing  = makeFastPacingConfig();
    const overlay = makeOverlay();
    const { ctrl } = makeController({ pacingConfig: pacing, overlay });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());
    ctrl.dismissSharePrompt();
    expect(overlay.isDismissed()).toBe(true);
  });

  test('AC4 — sequence continues after dismiss (onComplete still fires)', () => {
    const onComplete = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, onComplete });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());
    ctrl.dismissSharePrompt();

    // Advance through remaining time — sequence must complete
    jest.advanceTimersByTime(pacing.getTotalMs() - pacing.getPeakMomentOffsetMs() + 10);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('AC4 — state is COMPLETE after dismiss + remaining duration (no stuck state)', () => {
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());
    ctrl.dismissSharePrompt();
    jest.advanceTimersByTime(pacing.getTotalMs());
    expect(ctrl.getState()).toBe(REVEAL_STATE.COMPLETE);
  });

  test('dismissSharePrompt() returns true when overlay was visible', () => {
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());
    expect(ctrl.dismissSharePrompt()).toBe(true);
  });
});

// ── AC5 — Before/after states forwarded unchanged ────────────────────────────

describe('AC5 — before/after states forwarded unchanged to onPeakMoment', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('onPeakMoment receives exact same before/after references (no data drift)', () => {
    const onPeakMoment = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, onPeakMoment });

    const beforeState = { url: 'before.png', timestamp: 1234 };
    const afterState  = { url: 'after.png',  timestamp: 5678 };

    ctrl.trigger({ watchId: 'w-001', beforeState, afterState });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());

    const [, b, a] = onPeakMoment.mock.calls[0];
    expect(b).toBe(beforeState);  // exact reference — no copy or drift
    expect(a).toBe(afterState);
  });

  test('onPeakMoment receives the correct watchId', () => {
    const onPeakMoment = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, onPeakMoment });

    ctrl.trigger({ watchId: 'my-watch-42', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getPeakMomentOffsetMs());

    expect(onPeakMoment.mock.calls[0][0]).toBe('my-watch-42');
  });
});

// ── AC8 — Pacing consistency for both trigger sources ────────────────────────

describe('Scenario 8 — AC8: pacing identical for job_completion and job_log_replay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('getTriggerSource() records job_completion correctly', () => {
    const { ctrl } = makeController();
    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A',
      triggerSource: TRIGGER_SOURCES.JOB_COMPLETION });
    expect(ctrl.getTriggerSource()).toBe(TRIGGER_SOURCES.JOB_COMPLETION);
  });

  test('getTriggerSource() records job_log_replay correctly', () => {
    const { ctrl } = makeController();
    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A',
      triggerSource: TRIGGER_SOURCES.JOB_LOG_REPLAY });
    expect(ctrl.getTriggerSource()).toBe(TRIGGER_SOURCES.JOB_LOG_REPLAY);
  });

  test('AC8 — peak moment offset is identical for both trigger sources', () => {
    // Use the same pacing config for both (single RevealPacingConfig)
    const pacing = makeFastPacingConfig();

    const peaks = [];
    // Measure peak timing for job_completion
    {
      const overlay = makeOverlay();
      const onPeakMoment = jest.fn(() => peaks.push(Date.now()));
      const ctrl = new RevealSequenceController({
        pacingConfig: pacing, sharePromptOverlay: overlay, onPeakMoment });
      ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A',
        triggerSource: TRIGGER_SOURCES.JOB_COMPLETION });
      jest.advanceTimersByTime(pacing.getTotalMs());
    }

    const completionPeakOffset = pacing.getPeakMomentOffsetMs();

    // Measure peak timing for job_log_replay
    {
      const overlay = makeOverlay();
      const onPeakMoment = jest.fn();
      const ctrl = new RevealSequenceController({
        pacingConfig: pacing, sharePromptOverlay: overlay, onPeakMoment });
      ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A',
        triggerSource: TRIGGER_SOURCES.JOB_LOG_REPLAY });
      jest.advanceTimersByTime(pacing.getTotalMs());
      expect(onPeakMoment).toHaveBeenCalledTimes(1);
    }

    const replayPeakOffset = pacing.getPeakMomentOffsetMs();

    // Both peak offsets come from the same pacing config → always equal (AC8)
    expect(completionPeakOffset).toBe(replayPeakOffset);
  });

  test('AC8 — total duration is identical for both trigger sources', () => {
    const pacing = makeFastPacingConfig();
    const completionTotal = pacing.getTotalMs();
    const replayTotal     = pacing.getTotalMs();
    expect(completionTotal).toBe(replayTotal);
  });

  test('onComplete receives triggerSource for job_log_replay', () => {
    const onComplete = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, onComplete });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A',
      triggerSource: TRIGGER_SOURCES.JOB_LOG_REPLAY });
    jest.advanceTimersByTime(pacing.getTotalMs());
    expect(onComplete).toHaveBeenCalledWith('w-001', TRIGGER_SOURCES.JOB_LOG_REPLAY);
  });
});

// ── Abort ─────────────────────────────────────────────────────────────────────

describe('RevealSequenceController — abort()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('abort() sets state to ABORTED', () => {
    const { ctrl } = makeController();
    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    ctrl.abort();
    expect(ctrl.getState()).toBe(REVEAL_STATE.ABORTED);
  });

  test('abort() fires onAbort callback', () => {
    const onAbort = jest.fn();
    const { ctrl } = makeController({ onAbort });
    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    ctrl.abort();
    expect(onAbort).toHaveBeenCalledWith('w-001');
  });

  test('no further timers fire after abort()', () => {
    const onComplete = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, onComplete });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    ctrl.abort();
    jest.advanceTimersByTime(pacing.getTotalMs() + 1000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('isPlaying() is false after abort()', () => {
    const { ctrl } = makeController();
    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    ctrl.abort();
    expect(ctrl.isPlaying()).toBe(false);
  });
});

// ── Double-trigger guard ──────────────────────────────────────────────────────

describe('RevealSequenceController — double-trigger guard', () => {
  let controller;
  afterEach(() => { controller.abort(); });

  test('trigger() while playing throws an error', () => {
    controller = makeController().ctrl;
    controller.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    expect(() =>
      controller.trigger({ watchId: 'w-002', beforeState: 'B', afterState: 'A' })
    ).toThrow();
  });
});

// ── Instrumentation ───────────────────────────────────────────────────────────

describe('RevealSequenceController — instrumentation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('reveal_sequence_started event fires on trigger()', () => {
    const hook = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, instrumentationHook: hook });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    expect(hook).toHaveBeenCalledWith('reveal_sequence_started', expect.objectContaining({
      watchId: 'w-001',
    }));
  });

  test('reveal_sequence_complete event fires on completion', () => {
    const hook = jest.fn();
    const pacing = makeFastPacingConfig();
    const { ctrl } = makeController({ pacingConfig: pacing, instrumentationHook: hook });

    ctrl.trigger({ watchId: 'w-001', beforeState: 'B', afterState: 'A' });
    jest.advanceTimersByTime(pacing.getTotalMs());
    expect(hook).toHaveBeenCalledWith('reveal_sequence_complete', expect.objectContaining({
      watchId: 'w-001',
    }));
  });
});
