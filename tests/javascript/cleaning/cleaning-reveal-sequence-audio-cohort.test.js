jest.mock('../../../javascript/cleaning/RevealAnimation');
jest.mock('../../../javascript/cleaning/RevealAudioController');
jest.mock('../../../javascript/cleaning/BeforeAfterUI');
jest.mock('../../../javascript/cleaning/CinematicCameraController');
jest.mock('../../../javascript/cleaning/ClipSequencePacer');
jest.mock('../../../javascript/telemetry/TelemetryEmitter');
const { CleaningRevealSequence } = require('../../../javascript/cleaning/CleaningRevealSequence');
const { RevealAnimation } = require('../../../javascript/cleaning/RevealAnimation');
const { RevealAudioController } = require('../../../javascript/cleaning/RevealAudioController');
const { BeforeAfterUI } = require('../../../javascript/cleaning/BeforeAfterUI');
const { CinematicCameraController } = require('../../../javascript/cleaning/CinematicCameraController');
const { ClipSequencePacer } = require('../../../javascript/cleaning/ClipSequencePacer');
const { TelemetryEmitter } = require('../../../javascript/telemetry/TelemetryEmitter');
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