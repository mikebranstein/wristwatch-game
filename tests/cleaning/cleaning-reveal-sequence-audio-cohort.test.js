jest.mock('../../src/cleaning/RevealAnimation');
jest.mock('../../src/cleaning/RevealAudioController');
jest.mock('../../src/cleaning/BeforeAfterUI');
jest.mock('../../src/cleaning/CinematicCameraController');
jest.mock('../../src/cleaning/ClipSequencePacer');
jest.mock('../../src/telemetry/TelemetryEmitter');
const { CleaningRevealSequence } = require('../../src/cleaning/CleaningRevealSequence');
const { RevealAnimation } = require('../../src/cleaning/RevealAnimation');
const { RevealAudioController } = require('../../src/cleaning/RevealAudioController');
const { BeforeAfterUI } = require('../../src/cleaning/BeforeAfterUI');
const { CinematicCameraController } = require('../../src/cleaning/CinematicCameraController');
const { ClipSequencePacer } = require('../../src/cleaning/ClipSequencePacer');
const { TelemetryEmitter } = require('../../src/telemetry/TelemetryEmitter');
function mkSeq(fn) { return new CleaningRevealSequence({ renderReveal:jest.fn(),clearReveal:jest.fn(),audioHook:jest.fn(),instrumentationHook:jest.fn(),cameraOverrideHook:jest.fn(),cameraRestoreHook:jest.fn(),audioCohortFn:fn }); }
function setup(fn) {
  jest.clearAllMocks(); const seq = mkSeq(fn);
  const anim=RevealAnimation.mock.instances[0], audio=RevealAudioController.mock.instances[0], cam=CinematicCameraController.mock.instances[0], pacer=ClipSequencePacer.mock.instances[0], bau=BeforeAfterUI.mock.instances[0];
  if (bau) bau.isVisible.mockReturnValue(false); if (cam) cam.isAtRest.mockReturnValue(true);
  if (pacer) { pacer.computeSequenceTiming.mockReturnValue({ totalDurationS: 22 }); pacer.isWithinClipWindow.mockReturnValue(true); }
  return { seq, anim, audio, cam };
}
describe('Backward-compatible default (no audioCohortFn)', () => {
  test('play called and playRevealCue fires', () => {
    const { seq, anim, audio } = setup(undefined);
    seq.onCleaningComplete('s','a.png','b.png'); expect(anim.play).toHaveBeenCalled();
    anim.play.mock.calls[0][2](); expect(audio.playRevealCue).toHaveBeenCalled();
  });
});
describe('audio-on cohort', () => {
  test('playRevealCue fires', () => {
    const { seq, anim, audio } = setup(() => 'audio-on');
    seq.onCleaningComplete('s','a.png','b.png'); anim.play.mock.calls[0][2]();
    expect(audio.playRevealCue).toHaveBeenCalled();
  });
});
describe('audio-off cohort', () => {
  test('playRevealCue NOT called', () => {
    const { seq, anim, audio } = setup(() => 'audio-off');
    seq.onCleaningComplete('s','a.png','b.png'); anim.play.mock.calls[0][2]();
    expect(audio.playRevealCue).not.toHaveBeenCalled();
  });
  test('no error thrown', () => {
    const { seq, anim } = setup(() => 'audio-off');
    expect(() => { seq.onCleaningComplete('s','a.png','b.png'); if (anim.play.mock.calls[0]) anim.play.mock.calls[0][2](); }).not.toThrow();
  });
  test('camera still fires (not gated)', () => {
    const { seq, anim, cam } = setup(() => 'audio-off');
    seq.onCleaningComplete('s','a.png','b.png'); anim.play.mock.calls[0][2]();
    if (cam) expect(cam.playRevealMove).toHaveBeenCalled();
  });
});