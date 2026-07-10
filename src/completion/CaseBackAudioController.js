const CASE_BACK_CUE = 'case_back_close';
class CaseBackAudioController {
  constructor({ audioHook, audioEnabled = true } = {}) {
    this._audioHook = typeof audioHook === 'function' ? audioHook : null;
    this._audioEnabled = audioEnabled;
    this._isPlaying = false;
  }
  playCaseBackCue() {
    if (!this._audioEnabled || !this._audioHook || this._isPlaying) return;
    this._isPlaying = true;
    this._audioHook(CASE_BACK_CUE);
  }
  onCueComplete() { this._isPlaying = false; }
  stop() { this._isPlaying = false; }
  isPlaying() { return this._isPlaying; }
}
module.exports = { CaseBackAudioController, CASE_BACK_CUE };