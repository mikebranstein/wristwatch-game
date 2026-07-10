'use strict';

const DEFAULT_COOLDOWN_MS = 300;
const TOOL_PICKUP_CUE = 'tool_pickup';

class ToolPickupAudioController {
  constructor(audioHook, audioEnabled = true, cooldownMs = DEFAULT_COOLDOWN_MS, audioDesignSystem = null) {
    if (typeof audioHook !== 'function' && (!audioDesignSystem || typeof audioDesignSystem.enqueue !== 'function')) {
      throw new Error('ToolPickupAudioController requires an audioHook function.');
    }

    this._audioHook = audioHook;
    this._audioEnabled = Boolean(audioEnabled);
    this._cooldownMs = Math.max(0, cooldownMs);
    this._audioDesignSystem = audioDesignSystem;
    this._isPlaying = false;
    this._cooldownTimer = null;
    this._lastFireMs = null;
  }

  fireToolPickupCue() {
    if (this._isPlaying) {
      const elapsed = this._lastFireMs !== null ? Date.now() - this._lastFireMs : this._cooldownMs;
      return {
        fired: false,
        cooldownRemaining: Math.max(0, this._cooldownMs - elapsed),
      };
    }

    this._isPlaying = true;
    this._lastFireMs = Date.now();

    if (this._audioEnabled) {
      this._emitCue(TOOL_PICKUP_CUE);
    }

    this._cooldownTimer = setTimeout(() => {
      this._isPlaying = false;
      this._cooldownTimer = null;
      this._releaseCue(TOOL_PICKUP_CUE);
    }, this._cooldownMs);

    return { fired: true, cooldownRemaining: 0 };
  }

  stop() {
    if (this._cooldownTimer !== null) {
      clearTimeout(this._cooldownTimer);
      this._cooldownTimer = null;
    }

    this._isPlaying = false;
    this._lastFireMs = null;
    this._releaseCue(TOOL_PICKUP_CUE);
  }

  isPlaying() {
    return this._isPlaying;
  }

  isAudioEnabled() {
    return this._audioEnabled;
  }

  getCooldownMs() {
    return this._cooldownMs;
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

module.exports = { ToolPickupAudioController, TOOL_PICKUP_CUE, DEFAULT_COOLDOWN_MS };