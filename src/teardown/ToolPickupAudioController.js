const TOOL_PICKUP_CUE = 'tool_pickup';
const DEFAULT_COOLDOWN_MS = 300;
class ToolPickupAudioController {
  constructor({ audioHook, audioEnabled = true, cooldownMs = DEFAULT_COOLDOWN_MS, timerFn = setTimeout } = {}) {
    this._audioHook = typeof audioHook === 'function' ? audioHook : null;
    this._audioEnabled = audioEnabled;
    this._cooldownMs = cooldownMs;
    this._timerFn = timerFn;
    this._inCooldown = false;
  }
  playPickupCue() {
    if (!this._audioEnabled || !this._audioHook || this._inCooldown) return;
    this._inCooldown = true;
    this._audioHook(TOOL_PICKUP_CUE);
    this._timerFn(() => { this._inCooldown = false; }, this._cooldownMs);
  }
  isInCooldown() { return this._inCooldown; }
  reset() { this._inCooldown = false; }
}
module.exports = { ToolPickupAudioController, TOOL_PICKUP_CUE, DEFAULT_COOLDOWN_MS };