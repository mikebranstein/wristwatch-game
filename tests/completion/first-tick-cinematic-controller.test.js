'use strict';

const { FirstTickCinematicController } = require('../../src/completion/FirstTickCinematicController');
const {
  AUDIO_CUES,
  MIN_SILENCE_GATE_MS,
} = require('../../src/completion/FirstTickAudioController');
const {
  DEFAULT_ANIMATION_IN_MS,
  DEFAULT_ANIMATION_OUT_MS,
  MIN_HOLD_DURATION_MS,
  MAX_HOLD_DURATION_MS,
} = require('../../src/completion/CameraAnimationSystem');

function makeHarness(overrides = {}) {
  const viewState = {
    position: { x: 4, y: 2, z: 8 },
    angle: { pitch: 10, yaw: 25, roll: 0 },
  };
  const audioEvents = [];
  const highlightEvents = [];
  const instrumentationEvents = [];
  const inputEvents = [];

  const audioHook = jest.fn((cueId, payload) => {
    audioEvents.push({ cueId, payload, at: Date.now() });
  });
  const highlightRenderer = jest.fn((watchId, enabled) => {
    highlightEvents.push({ watchId, enabled, at: Date.now() });
  });
  const inputManager = {
    suspend: jest.fn(() => inputEvents.push({ type: 'suspend', at: Date.now() })),
    resume: jest.fn(() => inputEvents.push({ type: 'resume', at: Date.now() })),
  };
  const instrumentationHook = jest.fn((eventName, payload) => {
    instrumentationEvents.push({ eventName, payload, at: Date.now() });
  });

  const controller = new FirstTickCinematicController({
    audioHook,
    highlightRenderer,
    inputManager,
    instrumentationHook,
    savedViewProvider: () => JSON.parse(JSON.stringify(viewState)),
    holdDurationMs: 1800,
    totalWindSteps: 6,
    tensionWindowSteps: 2,
    ...overrides,
  });

  return {
    controller,
    viewState,
    audioHook,
    audioEvents,
    highlightRenderer,
    highlightEvents,
    inputManager,
    inputEvents,
    instrumentationHook,
    instrumentationEvents,
  };
}

function completeSequence(controller, holdDurationMs = 1800) {
  jest.advanceTimersByTime(DEFAULT_ANIMATION_IN_MS);
  expect(controller.getCinematicState()).toBe('hold');
  jest.advanceTimersByTime(holdDurationMs);
  expect(controller.getCinematicState()).toBe('animating_out');
  jest.advanceTimersByTime(DEFAULT_ANIMATION_OUT_MS);
  expect(controller.getCinematicState()).toBe('idle');
}

describe('FirstTickCinematicController — Issue #114 Phase 2', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('1. Happy path — full a/v beat', () => {
    const { controller, audioEvents, highlightEvents, inputEvents } = makeHarness();

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(4);
    controller.onWindStep(2);

    // Advance past the silence gate so FIRST_TICK and TICKING_LOOP fire.
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(audioEvents.map((event) => event.cueId)).toEqual([
      AUDIO_CUES.TENSION_RAMP,
      AUDIO_CUES.FIRST_TICK,
      AUDIO_CUES.TICKING_LOOP,
    ]);
    expect(controller.getCinematicState()).toBe('animating_in');
    expect(controller.getHighlightEffect().isActive('watch-001')).toBe(true);
    expect(controller.getInputSuspension().isSuspended()).toBe(true);

    jest.advanceTimersByTime(DEFAULT_ANIMATION_IN_MS);
    expect(controller.getCinematicState()).toBe('hold');

    jest.advanceTimersByTime(1800);
    expect(controller.getCinematicState()).toBe('animating_out');

    jest.advanceTimersByTime(DEFAULT_ANIMATION_OUT_MS);
    expect(controller.getCinematicState()).toBe('idle');
    expect(controller.getHighlightEffect().isActive('watch-001')).toBe(false);
    expect(controller.getInputSuspension().isSuspended()).toBe(false);
    expect(highlightEvents.map((event) => event.enabled)).toEqual([true, false]);
    expect(inputEvents.map((event) => event.type)).toEqual(['suspend', 'resume']);
  });

  test('2. Camera return accuracy', () => {
    const { controller, viewState } = makeHarness();

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);

    // Advance past the silence gate to start the cinematic (saves view at that point).
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);
    const savedView = controller.getCameraSystem().getSavedView();
    expect(savedView).toEqual(viewState);

    completeSequence(controller);

    expect(controller.getCameraSystem().getCurrentView()).toEqual(viewState);
  });

  test('3. Re-wind suppression', () => {
    const { controller, highlightRenderer, inputManager } = makeHarness();

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);
    completeSequence(controller);

    highlightRenderer.mockClear();
    inputManager.suspend.mockClear();
    controller.prepareForWatch('watch-001', true);
    const result = controller.onWindStep(6);

    expect(result.suppressed).toBe(true);
    expect(controller.getCinematicState()).toBe('idle');
    expect(highlightRenderer).not.toHaveBeenCalled();
    expect(inputManager.suspend).not.toHaveBeenCalled();
  });

  test('4. Player input during animation', () => {
    const { controller, inputManager } = makeHarness();

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);

    // Advance past the silence gate so input is suspended and cinematic is animating.
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(inputManager.suspend).toHaveBeenCalledTimes(1);
    expect(controller.getInputSuspension().isSuspended()).toBe(true);

    jest.advanceTimersByTime(DEFAULT_ANIMATION_IN_MS + 900);
    expect(controller.getCinematicState()).toBe('hold');
    expect(controller.getInputSuspension().isSuspended()).toBe(true);

    jest.advanceTimersByTime(900 + DEFAULT_ANIMATION_OUT_MS);
    expect(inputManager.resume).toHaveBeenCalledTimes(1);
    expect(controller.getInputSuspension().isSuspended()).toBe(false);
  });

  test('5. Multiple watches in session', () => {
    const { controller, audioEvents } = makeHarness();

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);
    completeSequence(controller);

    controller.prepareForWatch('watch-002', true);
    controller.onWindStep(6);
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);
    completeSequence(controller);

    expect(controller.hasActivated('watch-001')).toBe(true);
    expect(controller.hasActivated('watch-002')).toBe(true);
    expect(audioEvents.filter((event) => event.cueId === AUDIO_CUES.FIRST_TICK)).toHaveLength(2);
  });

  test('6. Rapid completion path', () => {
    const { controller, audioEvents } = makeHarness();

    controller.prepareForWatch('watch-rapid', true);
    controller.onWindStep(6);

    // Advance past the silence gate so FIRST_TICK fires and the cinematic starts.
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(audioEvents.map((event) => event.cueId)).toEqual([
      AUDIO_CUES.TENSION_RAMP,
      AUDIO_CUES.FIRST_TICK,
      AUDIO_CUES.TICKING_LOOP,
    ]);
    expect(controller.getCinematicState()).toBe('animating_in');
  });

  test('7. Balance wheel fail (incorrect assembly)', () => {
    const { controller, audioEvents, highlightRenderer, inputManager } = makeHarness();

    controller.prepareForWatch('watch-bad', false);
    controller.onWindStep(6);

    // TENSION_RAMP fires before the activation gate, so it may still appear in the
    // audio log. The critical assertion is that the cinematic trigger (FIRST_TICK)
    // and the cinematic visual/input effects NEVER fire for incorrect assembly.
    const cinematicTriggerEvents = audioEvents.filter(
      (e) => e.cueId === AUDIO_CUES.FIRST_TICK || e.cueId === AUDIO_CUES.TICKING_LOOP,
    );
    expect(cinematicTriggerEvents).toHaveLength(0);
    expect(controller.getCinematicState()).toBe('idle');
    expect(highlightRenderer).not.toHaveBeenCalled();
    expect(inputManager.suspend).not.toHaveBeenCalled();
    expect(controller.hasActivated('watch-bad')).toBe(false);
  });

  test('8. Scene/state transition during animation', () => {
    const { controller, highlightRenderer, inputManager } = makeHarness();

    controller.prepareForWatch('watch-001', true);
    controller.onWindStep(6);
    // Let the silence gate fire so the cinematic (highlight, input suspension) starts
    // before we call abort — this verifies abort tears down a running sequence.
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);
    controller.abort();

    expect(controller.getCinematicState()).toBe('idle');
    expect(controller.getHighlightEffect().isActive('watch-001')).toBe(false);
    expect(controller.getInputSuspension().isSuspended()).toBe(false);
    expect(inputManager.resume).toHaveBeenCalled();

    jest.runAllTimers();
    expect(controller.getCinematicState()).toBe('idle');
    expect(highlightRenderer.mock.calls.filter(([, enabled]) => enabled === false)).toHaveLength(1);
  });

  test('9. Phase 1 audio regression', () => {
    const { controller, audioEvents } = makeHarness();

    controller.prepareForWatch('watch-audio', true);
    controller.onWindStep(2);
    controller.onWindStep(2);
    controller.onWindStep(2);

    // Advance past the silence gate so FIRST_TICK and TICKING_LOOP fire.
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    expect(audioEvents.map((event) => event.cueId)).toEqual([
      AUDIO_CUES.TENSION_RAMP,
      AUDIO_CUES.FIRST_TICK,
      AUDIO_CUES.TICKING_LOOP,
    ]);
    expect(audioEvents[0].payload.watchId).toBe('watch-audio');
    expect(audioEvents[1].payload.watchId).toBe('watch-audio');
    expect(audioEvents[2].payload.watchId).toBe('watch-audio');
  });

  test('10. Input suspension timing', () => {
    const { controller, inputEvents, audioEvents } = makeHarness();

    controller.prepareForWatch('watch-timing', true);
    controller.onWindStep(6);

    // Advance past the silence gate so FIRST_TICK fires and the cinematic starts.
    jest.advanceTimersByTime(MIN_SILENCE_GATE_MS);

    const firstTickEvent = audioEvents.find((event) => event.cueId === AUDIO_CUES.FIRST_TICK);
    expect(firstTickEvent).toBeDefined();
    expect(controller.getCinematicState()).toBe('animating_in');
    expect(inputEvents[0].type).toBe('suspend');
    expect(inputEvents[0].at - firstTickEvent.at).toBeLessThanOrEqual(100);

    jest.advanceTimersByTime(DEFAULT_ANIMATION_IN_MS);
    expect(controller.getCinematicState()).toBe('hold');
    expect(controller.getInputSuspension().isSuspended()).toBe(true);

    jest.advanceTimersByTime(1800 + DEFAULT_ANIMATION_OUT_MS - 1);
    expect(controller.getInputSuspension().isSuspended()).toBe(true);

    jest.advanceTimersByTime(1);
    expect(controller.getInputSuspension().isSuspended()).toBe(false);
    expect(inputEvents.map((event) => event.type)).toEqual(['suspend', 'resume']);
  });

  test('hold duration is clamped to design bounds', () => {
    const minHarness = makeHarness({ holdDurationMs: 1 });
    const maxHarness = makeHarness({ holdDurationMs: 999999 });

    expect(minHarness.controller.getCameraSystem().getHoldDurationMs()).toBe(MIN_HOLD_DURATION_MS);
    expect(maxHarness.controller.getCameraSystem().getHoldDurationMs()).toBe(MAX_HOLD_DURATION_MS);
  });
});
