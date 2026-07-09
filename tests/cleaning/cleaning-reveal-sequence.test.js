/**
 * Integration tests for CleaningRevealSequence
 *
 * Covers all 5 acceptance criteria (AC1–AC5) and the 10 test scenarios from
 * issue #53 at the orchestrator level.  Subsystems are mocked so every public
 * method can be exercised against controlled behaviour.
 *
 * Test scenarios:
 *   Scenario 1  (Happy path)           — full sequence triggers on completion event.
 *   Scenario 2  (Visual contrast)      — animation plays with pre/post textures.
 *   Scenario 3  (Audio sync)           — audio cue fires after sheen phase.
 *   Scenario 4  (Before/after accuracy)— UI receives correct pre/post textures.
 *   Scenario 5  (Portrait 9:16)        — layout mode forwarded to UI.
 *   Scenario 6  (Landscape 16:9)       — default layout mode is 16:9.
 *   Scenario 7  (Back-to-back)         — isRevealing guard prevents stacking.
 *   Scenario 8  (Performance floor)    — guard releases after sequence completes.
 *   Scenario 9  (Early dismiss)        — dismissEarly() delegates to BeforeAfterUI.
 *   Scenario 10 (Sequence boundary)    — telemetry fired; game loop unblocked.
 */

const { CleaningRevealSequence } = require('../../src/cleaning/CleaningRevealSequence');
const { CleaningRevealAnimation } = require('../../src/cleaning/CleaningRevealAnimation');
const { RevealAudioController } = require('../../src/cleaning/RevealAudioController');
const { BeforeAfterUI } = require('../../src/cleaning/BeforeAfterUI');
const { TelemetryEmitter } = require('../../src/telemetry/TelemetryEmitter');

// ─── Mock all subsystems ──────────────────────────────────────────────────────

jest.mock('../../src/cleaning/CleaningRevealAnimation');
jest.mock('../../src/cleaning/RevealAudioController');
jest.mock('../../src/cleaning/BeforeAfterUI');
jest.mock('../../src/telemetry/TelemetryEmitter');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEventBus() {
  return { on: jest.fn(), off: jest.fn() };
}

function makeSequence(overrides = {}) {
  return new CleaningRevealSequence({
    instrumentationHook: jest.fn(),
    renderReveal: jest.fn(),
    clearReveal: jest.fn(),
    renderBeforeAfter: jest.fn(),
    clearBeforeAfter: jest.fn(),
    audioHook: jest.fn(),
    eventBus: makeEventBus(),
    layoutMode: '16:9',
    ...overrides,
  });
}

// ─── Per-test setup ───────────────────────────────────────────────────────────

let seq;
let mockAnimation, mockAudio, mockUI, mockTelemetry;

beforeEach(() => {
  jest.clearAllMocks();

  seq = makeSequence();

  mockAnimation = CleaningRevealAnimation.mock.instances[0];
  mockAudio = RevealAudioController.mock.instances[0];
  mockUI = BeforeAfterUI.mock.instances[0];
  mockTelemetry = TelemetryEmitter.mock.instances[0];

  // ── Default return values ────────────────────────────────────────────────
  mockAnimation.play.mockReturnValue({ visualTransitionBeatMs: Date.now() });
  mockAnimation.isComplete.mockReturnValue(true);
  mockAnimation.getCurrentState.mockReturnValue({ phase: 'sheen_transition', phaseIndex: 2 });
  mockAnimation.getVisualTransitionBeatMs.mockReturnValue(Date.now());
  mockAnimation.isPlaying.mockReturnValue(false);
  mockAudio.fireRevealCue.mockReturnValue({ fired: true, syncDeltaMs: 5, withinTolerance: true });
  mockUI.isVisible.mockReturnValue(false);
  mockUI.getDisplayState.mockReturnValue({ lastDismissWasEarly: false });
});

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('CleaningRevealSequence — constructor', () => {
  test('subscribes to cleaning_phase_complete on the event bus', () => {
    const eventBus = makeEventBus();
    makeSequence({ eventBus });
    expect(eventBus.on).toHaveBeenCalledWith('cleaning_phase_complete', expect.any(Function));
  });

  test('does not throw when no event bus is provided', () => {
    expect(() => makeSequence({ eventBus: null })).not.toThrow();
  });

  test('isRevealing starts as false', () => {
    expect(seq.isRevealing()).toBe(false);
  });
});

// ─── Scenario 1 (AC1): Happy path ────────────────────────────────────────────

describe('Scenario 1 — Happy path: triggerReveal() starts the full sequence', () => {
  test('triggerReveal returns true when not already revealing', () => {
    const result = seq.triggerReveal('dirty', 'clean');
    expect(result).toBe(true);
  });

  test('animation.play() is called with preTexture and postTexture', () => {
    seq.triggerReveal('dirty_movement', 'clean_movement');
    expect(mockAnimation.play).toHaveBeenCalledWith('dirty_movement', 'clean_movement');
  });

  test('isRevealing is true during the sequence', () => {
    // UI show() won't call onDismiss synchronously in the mock, so guard stays true
    mockUI.show.mockImplementation(() => {});
    seq.triggerReveal('dirty', 'clean');
    expect(seq.isRevealing()).toBe(true);
  });

  test('telemetry cleaning_reveal_started is emitted', () => {
    seq.triggerReveal('dirty', 'clean');
    expect(mockTelemetry.emit).toHaveBeenCalledWith(
      'cleaning_reveal_started',
      expect.objectContaining({ preTexture: 'dirty', postTexture: 'clean' })
    );
  });
});

// ─── Scenario 2 (AC1): Visual contrast — animation receives correct textures ──

describe('Scenario 2 — Visual contrast: animation.play receives pre/post textures', () => {
  test('pre texture is passed to animation.play()', () => {
    seq.triggerReveal('dirty_tex', 'clean_tex');
    expect(mockAnimation.play).toHaveBeenCalledWith('dirty_tex', expect.anything());
  });

  test('post texture is passed to animation.play()', () => {
    seq.triggerReveal('dirty_tex', 'clean_tex');
    expect(mockAnimation.play).toHaveBeenCalledWith(expect.anything(), 'clean_tex');
  });
});

// ─── Scenario 3 (AC2): Audio sync ────────────────────────────────────────────

describe('Scenario 3 — Audio sync: audio cue is fired at the sheen_transition phase', () => {
  test('audio.fireRevealCue is called with the reveal cue ID', () => {
    // Simulate sheen_transition phase appearing after two nextPhase() calls
    let callCount = 0;
    mockAnimation.getCurrentState.mockImplementation(() => {
      callCount++;
      // Return sheen_transition on the 2nd nextPhase call (index 2)
      return callCount === 2
        ? { phase: 'sheen_transition', phaseIndex: 2 }
        : { phase: 'particle_burst', phaseIndex: 1 };
    });
    seq.triggerReveal('dirty', 'clean');
    expect(mockAudio.fireRevealCue).toHaveBeenCalledWith(
      'cleaning_reveal_cue',
      expect.any(Number)
    );
  });
});

// ─── Scenario 4 (AC3): Before/after UI accuracy ──────────────────────────────

describe('Scenario 4 — Before/after UI: show() called with correct textures after animation', () => {
  test('ui.show() is called when animation is complete', () => {
    mockAnimation.isComplete.mockReturnValue(true);
    seq.triggerReveal('dirty_tex', 'clean_tex');
    expect(mockUI.show).toHaveBeenCalled();
  });

  test('ui.show() is called with preTexture', () => {
    mockAnimation.isComplete.mockReturnValue(true);
    seq.triggerReveal('dirty_tex', 'clean_tex');
    expect(mockUI.show).toHaveBeenCalledWith('dirty_tex', 'clean_tex', '16:9', expect.any(Function));
  });

  test('ui.show() is NOT called when animation is not complete', () => {
    mockAnimation.isComplete.mockReturnValue(false);
    seq.triggerReveal('dirty_tex', 'clean_tex');
    expect(mockUI.show).not.toHaveBeenCalled();
  });
});

// ─── Scenario 5 (AC3): Portrait 9:16 ─────────────────────────────────────────

describe('Scenario 5 — Portrait 9:16: layoutMode 9:16 is forwarded to BeforeAfterUI', () => {
  test('ui.show() receives layoutMode 9:16', () => {
    const seq916 = makeSequence({ layoutMode: '9:16' });
    const mockUI916 = BeforeAfterUI.mock.instances[BeforeAfterUI.mock.instances.length - 1];
    mockUI916.show = jest.fn();
    CleaningRevealAnimation.mock.instances[
      CleaningRevealAnimation.mock.instances.length - 1
    ].play.mockReturnValue({ visualTransitionBeatMs: Date.now() });
    CleaningRevealAnimation.mock.instances[
      CleaningRevealAnimation.mock.instances.length - 1
    ].isComplete.mockReturnValue(true);
    CleaningRevealAnimation.mock.instances[
      CleaningRevealAnimation.mock.instances.length - 1
    ].getCurrentState.mockReturnValue({ phase: 'gleam_hold', phaseIndex: 3 });

    seq916.triggerReveal('dirty', 'clean');
    expect(mockUI916.show).toHaveBeenCalledWith('dirty', 'clean', '9:16', expect.any(Function));
  });
});

// ─── Scenario 6 (AC3): Landscape 16:9 ────────────────────────────────────────

describe('Scenario 6 — Landscape 16:9: default layoutMode is 16:9', () => {
  test('ui.show() defaults to layoutMode 16:9 when none specified', () => {
    mockAnimation.isComplete.mockReturnValue(true);
    seq.triggerReveal('dirty', 'clean');
    expect(mockUI.show).toHaveBeenCalledWith('dirty', 'clean', '16:9', expect.any(Function));
  });
});

// ─── Scenario 7 (AC5): Back-to-back / isRevealing guard ──────────────────────

describe('Scenario 7 — Back-to-back: isRevealing guard prevents audio stacking', () => {
  test('second triggerReveal returns false while still revealing', () => {
    mockUI.show.mockImplementation(() => {
      // Don't call onDismiss — keep isRevealing locked
    });
    seq.triggerReveal('dirty', 'clean');
    const secondResult = seq.triggerReveal('dirty', 'clean');
    expect(secondResult).toBe(false);
  });

  test('animation.play() is called only once when two triggers arrive', () => {
    mockUI.show.mockImplementation(() => {});
    seq.triggerReveal('dirty', 'clean');
    seq.triggerReveal('dirty', 'clean');
    expect(mockAnimation.play).toHaveBeenCalledTimes(1);
  });

  test('event bus trigger also respects the isRevealing guard', () => {
    const eventBus = makeEventBus();
    const seqEB = makeSequence({ eventBus });
    const mockAnimEB = CleaningRevealAnimation.mock.instances[
      CleaningRevealAnimation.mock.instances.length - 1
    ];
    mockAnimEB.play.mockReturnValue({ visualTransitionBeatMs: Date.now() });
    mockAnimEB.isComplete.mockReturnValue(false); // keep guard locked — UI.show not called
    // getCurrentState must return a valid object to avoid null reference in _stepAnimationPhases
    mockAnimEB.getCurrentState.mockReturnValue({ phase: 'gleam_hold', phaseIndex: 3 });
    mockAnimEB.getVisualTransitionBeatMs.mockReturnValue(Date.now());

    // Capture the listener registered on the event bus
    const listener = eventBus.on.mock.calls[0][1];
    listener({ preTexture: 'dirty', postTexture: 'clean' });
    // isRevealing is true now; second trigger is discarded
    listener({ preTexture: 'dirty', postTexture: 'clean' });

    expect(mockAnimEB.play).toHaveBeenCalledTimes(1);
  });
});

// ─── Scenario 8 (AC5): Guard releases after sequence completes ───────────────

describe('Scenario 8 — Guard release: isRevealing resets after sequence completes', () => {
  test('isRevealing resets to false after onDismiss callback fires', () => {
    let capturedOnDismiss = null;
    mockUI.show.mockImplementation((pre, post, layout, onDismiss) => {
      capturedOnDismiss = onDismiss;
    });
    mockUI.getDisplayState.mockReturnValue({ lastDismissWasEarly: false });
    mockAnimation.isComplete.mockReturnValue(true);

    seq.triggerReveal('dirty', 'clean');
    expect(seq.isRevealing()).toBe(true);

    // Simulate the UI auto-dismissing
    capturedOnDismiss();
    expect(seq.isRevealing()).toBe(false);
  });

  test('after guard releases, a new triggerReveal succeeds', () => {
    let capturedOnDismiss = null;
    mockUI.show.mockImplementation((pre, post, layout, onDismiss) => {
      capturedOnDismiss = onDismiss;
    });
    mockUI.getDisplayState.mockReturnValue({ lastDismissWasEarly: false });
    mockAnimation.isComplete.mockReturnValue(true);

    seq.triggerReveal('dirty', 'clean');
    capturedOnDismiss();

    const secondResult = seq.triggerReveal('dirty', 'clean');
    expect(secondResult).toBe(true);
    expect(mockAnimation.play).toHaveBeenCalledTimes(2);
  });
});

// ─── Scenario 9 (AC4): Early dismiss ─────────────────────────────────────────

describe('Scenario 9 — Early dismiss: dismissEarly() delegates to BeforeAfterUI', () => {
  test('dismissEarly() calls ui.dismissEarly()', () => {
    seq.dismissEarly();
    expect(mockUI.dismissEarly).toHaveBeenCalled();
  });
});

// ─── Scenario 10 (AC5/boundary): telemetry emitted on dismiss ────────────────

describe('Scenario 10 — Sequence boundary: telemetry emitted on sequence completion', () => {
  test('cleaning_reveal_auto_dismissed emitted when auto-dismissed', () => {
    let capturedOnDismiss = null;
    mockUI.show.mockImplementation((pre, post, layout, onDismiss) => {
      capturedOnDismiss = onDismiss;
    });
    mockUI.getDisplayState.mockReturnValue({ lastDismissWasEarly: false });
    mockAnimation.isComplete.mockReturnValue(true);

    seq.triggerReveal('dirty', 'clean');
    capturedOnDismiss();

    expect(mockTelemetry.emit).toHaveBeenCalledWith('cleaning_reveal_auto_dismissed', {});
  });

  test('cleaning_reveal_dismissed emitted when dismissed early', () => {
    let capturedOnDismiss = null;
    mockUI.show.mockImplementation((pre, post, layout, onDismiss) => {
      capturedOnDismiss = onDismiss;
    });
    mockUI.getDisplayState.mockReturnValue({ lastDismissWasEarly: true });
    mockAnimation.isComplete.mockReturnValue(true);

    seq.triggerReveal('dirty', 'clean');
    capturedOnDismiss();

    expect(mockTelemetry.emit).toHaveBeenCalledWith('cleaning_reveal_dismissed', {});
  });

  test('audio.onCueComplete() is called when sequence ends', () => {
    let capturedOnDismiss = null;
    mockUI.show.mockImplementation((pre, post, layout, onDismiss) => {
      capturedOnDismiss = onDismiss;
    });
    mockUI.getDisplayState.mockReturnValue({ lastDismissWasEarly: false });
    mockAnimation.isComplete.mockReturnValue(true);

    seq.triggerReveal('dirty', 'clean');
    capturedOnDismiss();

    expect(mockAudio.onCueComplete).toHaveBeenCalled();
  });
});

// ─── destroy() ────────────────────────────────────────────────────────────────

describe('CleaningRevealSequence — destroy()', () => {
  test('unsubscribes from the event bus on destroy()', () => {
    const eventBus = makeEventBus();
    const seqD = makeSequence({ eventBus });
    seqD.destroy();
    expect(eventBus.off).toHaveBeenCalledWith('cleaning_phase_complete', expect.any(Function));
  });

  test('destroy() is a no-op when no event bus was provided', () => {
    const seqNoEB = makeSequence({ eventBus: null });
    expect(() => seqNoEB.destroy()).not.toThrow();
  });
});

// ─── Accessor methods ─────────────────────────────────────────────────────────

describe('CleaningRevealSequence — accessor methods', () => {
  test('getAnimation() returns the internal animation instance', () => {
    expect(seq.getAnimation()).toBe(mockAnimation);
  });

  test('getAudio() returns the internal audio controller instance', () => {
    expect(seq.getAudio()).toBe(mockAudio);
  });

  test('getUI() returns the internal BeforeAfterUI instance', () => {
    expect(seq.getUI()).toBe(mockUI);
  });

  test('getTelemetry() returns the internal TelemetryEmitter instance', () => {
    expect(seq.getTelemetry()).toBe(mockTelemetry);
  });
});
