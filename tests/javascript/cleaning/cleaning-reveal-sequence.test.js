/**
 * Integration tests for CleaningRevealSequence — Issue #53 + #54
 *
 * All subsystems are mocked so this file tests only the orchestration logic:
 * correct delegation, call ordering, guard behaviour, and telemetry.
 *
 * AC#53-1: animation plays on cleaning completion
 * AC#53-2: audio fires synchronously at the reveal beat
 * AC#53-3: before/after UI shows after animation completes
 * AC#53-4: early dismiss delegates cleanly
 * AC#53-5: concurrency guard prevents stacking
 * AC#54-1: ClipSequencePacer consulted and timing emitted in telemetry
 * AC#54-2: cinematic camera fires at reveal beat
 * AC#54-3: clip-in/clip-out markers accessible via getPacer()
 * AC#54-5: camera restored at sequence end; no snap/overshoot
 */

jest.mock('../../../javascript/cleaning/RevealAnimation');
jest.mock('../../../javascript/cleaning/RevealAudioController');
jest.mock('../../../javascript/cleaning/BeforeAfterUI');
jest.mock('../../../javascript/cleaning/CinematicCameraController');
jest.mock('../../../javascript/cleaning/ClipSequencePacer');
jest.mock('../../../javascript/telemetry/TelemetryEmitter');

const { CleaningRevealSequence, REVEAL_EVENTS } =
  require('../../../javascript/cleaning/CleaningRevealSequence');
const { RevealAnimation }            = require('../../../javascript/cleaning/RevealAnimation');
const { RevealAudioController }      = require('../../../javascript/cleaning/RevealAudioController');
const { BeforeAfterUI }              = require('../../../javascript/cleaning/BeforeAfterUI');
const { CinematicCameraController }  = require('../../../javascript/cleaning/CinematicCameraController');
const { ClipSequencePacer }          = require('../../../javascript/cleaning/ClipSequencePacer');
const { TelemetryEmitter }           = require('../../../javascript/telemetry/TelemetryEmitter');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSequence(overrides = {}) {
  return new CleaningRevealSequence({
    renderReveal:       jest.fn(),
    clearReveal:        jest.fn(),
    audioHook:          jest.fn(),
    instrumentationHook: jest.fn(),
    cameraOverrideHook: jest.fn(),
    cameraRestoreHook:  jest.fn(),
    ...overrides,
  });
}

let seq;
let mockTelemetry, mockAnimation, mockAudio, mockUI, mockCamera, mockPacer;

beforeEach(() => {
  jest.clearAllMocks();
  seq = makeSequence();

  // Mock instances are created in constructor order:
  // TelemetryEmitter, RevealAnimation, RevealAudioController,
  // BeforeAfterUI, CinematicCameraController, ClipSequencePacer
  mockTelemetry = TelemetryEmitter.mock.instances[0];
  mockAnimation = RevealAnimation.mock.instances[0];
  mockAudio     = RevealAudioController.mock.instances[0];
  mockUI        = BeforeAfterUI.mock.instances[0];
  mockCamera    = CinematicCameraController.mock.instances[0];
  mockPacer     = ClipSequencePacer.mock.instances[0];

  // Default mock behaviours
  mockUI.isVisible.mockReturnValue(false);
  mockCamera.isAtRest.mockReturnValue(true);
  mockPacer.computeSequenceTiming.mockReturnValue({
    totalDurationS: 22,
    isWithinClipWindow: true,
    clipInDurationS: 3,
    cinematicMoveDurationS: 3,
    coreRevealDurationS: 5,
    beforeAfterDurationS: 6,
    clipOutDurationS: 5,
  });
  mockPacer.isWithinClipWindow.mockReturnValue(true);
});

// ── AC#53-1: animation plays on cleaning completion ───────────────────────────

describe('Scenario — onCleaningComplete() starts the reveal animation (AC#53-1)', () => {
  test('animation.play() is called with the correct pre and post textures', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    expect(mockAnimation.play).toHaveBeenCalledWith(
      'pre.png', 'post.png', expect.any(Function), expect.any(Function)
    );
  });

  test('isRevealing() is true after onCleaningComplete()', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    expect(seq.isRevealing()).toBe(true);
  });

  test('telemetry cleaning_reveal_started fires on onCleaningComplete()', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    expect(mockTelemetry.emit).toHaveBeenCalledWith(
      REVEAL_EVENTS.CLEANING_REVEAL_STARTED,
      expect.objectContaining({ sessionId: 's-1' })
    );
  });

  test('AC#54-1: telemetry clip_sequence_started fires with timing payload', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    expect(mockTelemetry.emit).toHaveBeenCalledWith(
      REVEAL_EVENTS.CLIP_SEQUENCE_STARTED,
      expect.objectContaining({ sessionId: 's-1', timing: expect.any(Object) })
    );
  });
});

// ── AC#53-5: concurrency guard ────────────────────────────────────────────────

describe('Scenario — concurrency guard prevents stacking (AC#53-5)', () => {
  test('second onCleaningComplete() while revealing is silently ignored', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    mockAnimation.play.mockClear();
    seq.onCleaningComplete('s-2', 'pre2.png', 'post2.png');
    expect(mockAnimation.play).not.toHaveBeenCalled();
  });

  test('isRevealing() stays true after duplicate trigger is dropped', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    seq.onCleaningComplete('s-2', 'pre.png', 'post.png');
    expect(seq.isRevealing()).toBe(true);
  });
});

// ── AC#53-2 + AC#54-2: reveal beat fires audio + camera simultaneously ────────

describe('Scenario — reveal beat fires audio and cinematic camera (AC#53-2, AC#54-2)', () => {
  test('AC#53-2: audio.playRevealCue() fires at the reveal beat callback', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    const revealBeatCb = mockAnimation.play.mock.calls[0][2];
    revealBeatCb();
    expect(mockAudio.playRevealCue).toHaveBeenCalledTimes(1);
  });

  test('AC#54-2: camera.playRevealMove() fires at the reveal beat callback', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    const revealBeatCb = mockAnimation.play.mock.calls[0][2];
    revealBeatCb();
    expect(mockCamera.playRevealMove).toHaveBeenCalledTimes(1);
  });

  test('AC#53-2: audio and camera fire in the same beat callback (sync guarantee)', () => {
    const callOrder = [];
    mockAudio.playRevealCue.mockImplementation(() => callOrder.push('audio'));
    mockCamera.playRevealMove.mockImplementation(() => callOrder.push('camera'));

    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    const revealBeatCb = mockAnimation.play.mock.calls[0][2];
    revealBeatCb();

    // Both must fire — audio first, then camera
    expect(callOrder).toEqual(['audio', 'camera']);
  });

  test('telemetry cleaning_reveal_beat fires at the beat callback', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    const revealBeatCb = mockAnimation.play.mock.calls[0][2];
    revealBeatCb();
    expect(mockTelemetry.emit).toHaveBeenCalledWith(
      REVEAL_EVENTS.CLEANING_REVEAL_BEAT,
      expect.objectContaining({ sessionId: 's-1' })
    );
  });
});

// ── AC#53-3: before/after UI shows after animation completes ─────────────────

describe('Scenario — before/after UI appears after animation complete (AC#53-3)', () => {
  test('UI.show() is called with correct textures when animation completes', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    const onAnimComplete = mockAnimation.play.mock.calls[0][3];
    onAnimComplete();
    expect(mockUI.show).toHaveBeenCalledWith('pre.png', 'post.png', expect.any(Function));
  });

  test('telemetry cleaning_reveal_completed fires after animation completes', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    const onAnimComplete = mockAnimation.play.mock.calls[0][3];
    onAnimComplete();
    expect(mockTelemetry.emit).toHaveBeenCalledWith(
      REVEAL_EVENTS.CLEANING_REVEAL_COMPLETED,
      expect.objectContaining({ sessionId: 's-1' })
    );
  });
});

// ── AC#53-4: early dismiss ────────────────────────────────────────────────────

describe('Scenario — early dismiss of before/after UI (AC#53-4)', () => {
  test('dismiss() calls UI.dismiss() when UI is visible', () => {
    mockUI.isVisible.mockReturnValue(true);
    seq.dismiss();
    expect(mockUI.dismiss).toHaveBeenCalled();
  });

  test('dismiss() is a no-op when UI is not visible (no errors)', () => {
    mockUI.isVisible.mockReturnValue(false);
    seq.dismiss();
    expect(mockUI.dismiss).not.toHaveBeenCalled();
  });
});

// ── AC#54-5: camera restore at sequence end ───────────────────────────────────

describe('Scenario — camera restored at sequence end (AC#54-5)', () => {
  function runToUIShow() {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    const onAnimComplete = mockAnimation.play.mock.calls[0][3];
    onAnimComplete();
    return mockUI.show.mock.calls[0][2]; // the UI dismiss callback
  }

  test('AC#54-5: camera.restore() is called when camera is not at rest at sequence end', () => {
    mockCamera.isAtRest.mockReturnValue(false);
    const uiDismissCb = runToUIShow();
    uiDismissCb();
    expect(mockCamera.restore).toHaveBeenCalled();
  });

  test('camera.restore() is NOT called when camera is already at rest', () => {
    mockCamera.isAtRest.mockReturnValue(true);
    const uiDismissCb = runToUIShow();
    uiDismissCb();
    expect(mockCamera.restore).not.toHaveBeenCalled();
  });

  test('isRevealing() is false after sequence ends', () => {
    const uiDismissCb = runToUIShow();
    uiDismissCb();
    expect(seq.isRevealing()).toBe(false);
  });

  test('telemetry cleaning_reveal_dismissed fires at sequence end', () => {
    const uiDismissCb = runToUIShow();
    uiDismissCb();
    expect(mockTelemetry.emit).toHaveBeenCalledWith(
      REVEAL_EVENTS.CLEANING_REVEAL_DISMISSED,
      expect.objectContaining({ sessionId: 's-1' })
    );
  });

  test('telemetry clip_sequence_ended fires with sessionId and timing data', () => {
    const uiDismissCb = runToUIShow();
    uiDismissCb();
    expect(mockTelemetry.emit).toHaveBeenCalledWith(
      REVEAL_EVENTS.CLIP_SEQUENCE_ENDED,
      expect.objectContaining({ sessionId: 's-1', totalDurationS: expect.any(Number) })
    );
  });
});

// ── AC#54-3: clip markers accessible via getPacer() ──────────────────────────

describe('Scenario — clip-in/clip-out markers via getPacer() (AC#54-3)', () => {
  test('getPacer() returns the ClipSequencePacer mock instance', () => {
    expect(seq.getPacer()).toBe(mockPacer);
  });

  test('pacer.computeSequenceTiming() returns timing with totalDurationS in [20,60]', () => {
    const timing = seq.getPacer().computeSequenceTiming();
    expect(timing.totalDurationS).toBeGreaterThanOrEqual(20);
    expect(timing.totalDurationS).toBeLessThanOrEqual(60);
  });
});

// ── Accessor methods ──────────────────────────────────────────────────────────

describe('CleaningRevealSequence — accessor methods', () => {
  test('getTelemetry() returns the TelemetryEmitter mock instance', () => {
    expect(seq.getTelemetry()).toBe(mockTelemetry);
  });

  test('getCamera() returns the CinematicCameraController mock instance', () => {
    expect(seq.getCamera()).toBe(mockCamera);
  });

  test('getAnimation() returns the RevealAnimation mock instance', () => {
    expect(seq.getAnimation()).toBe(mockAnimation);
  });

  test('getBeforeAfterUI() returns the BeforeAfterUI mock instance', () => {
    expect(seq.getBeforeAfterUI()).toBe(mockUI);
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────────

describe('CleaningRevealSequence — destroy()', () => {
  test('destroy() clears animation, destroys UI, destroys camera, resets isRevealing', () => {
    seq.onCleaningComplete('s-1', 'pre.png', 'post.png');
    seq.destroy();

    expect(mockAnimation.clear).toHaveBeenCalled();
    expect(mockUI.destroy).toHaveBeenCalled();
    expect(mockCamera.destroy).toHaveBeenCalled();
    expect(seq.isRevealing()).toBe(false);
  });

  test('destroy() when idle (never started) does not throw', () => {
    expect(() => seq.destroy()).not.toThrow();
  });
});
