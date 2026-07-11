'use strict';

const CASE_BACK_CUE = 'case_back_close';

class CaseBackAudioController {
  constructor(audioHook, audioEnabled = true, audioDesignSystem = null) {
    if (typeof audioHook !== 'function' && (!audioDesignSystem || typeof audioDesignSystem.enqueue !== 'function')) {
      throw new Error('CaseBackAudioController requires an audioHook function.');
    }
    this._audioHook = audioHook;
    this._audioEnabled = Boolean(audioEnabled);
    this._audioDesignSystem = audioDesignSystem;
    this._isPlaying = false;
  }

  fireCaseBackCue() {
    if (this._isPlaying) {
      return { fired: false };
    }

    this._isPlaying = true;
    if (this._audioEnabled) {
      this._emitCue(CASE_BACK_CUE);
    }

    return { fired: true };
  }

  onCueComplete() {
    this._isPlaying = false;
    this._releaseCue(CASE_BACK_CUE);
  }

  stop() {
    this._isPlaying = false;
    this._releaseCue(CASE_BACK_CUE);
  }

  isPlaying() {
    return this._isPlaying;
  }

  isAudioEnabled() {
    return this._audioEnabled;
  }

  _emitCue(cueId) {
    if (this._audioDesignSystem && typeof this._audioDesignSystem.enqueue === 'function') {
      this._audioDesignSystem.enqueue(cueId);
      return;
    }

    this._audioHook(cueId);
  }

  _releaseCue(cueId) {
    if (this._audioDesignSystem && typeof this._audioDesignSystem.releaseCue === 'function') {
      this._audioDesignSystem.releaseCue(cueId);
    }
  }
}

module.exports = { CaseBackAudioController, CASE_BACK_CUE };