'use strict';

const { AudioEventLibrary } = require('./AudioEventLibrary');

const DEFAULT_MAX_SIMULTANEOUS_EVENTS = 2;

class AudioDesignSystem {
  constructor({
    audioHook,
    stopHook = null,
    volumeSettings = null,
    eventLibrary = AudioEventLibrary,
    maxSimultaneousEvents = DEFAULT_MAX_SIMULTANEOUS_EVENTS,
    now = () => Date.now(),
  } = {}) {
    if (typeof audioHook !== 'function') {
      throw new Error('AudioDesignSystem requires an audioHook function.');
    }

    this._audioHook = audioHook;
    this._stopHook = typeof stopHook === 'function' ? stopHook : null;
    this._volumeSettings = volumeSettings;
    this._eventLibrary = eventLibrary;
    this._maxSimultaneousEvents = Math.max(1, Number(maxSimultaneousEvents) || DEFAULT_MAX_SIMULTANEOUS_EVENTS);
    this._now = typeof now === 'function' ? now : () => Date.now();

    this._interactionUnlocked = false;
    this._activeSlots = [];
    this._deferredQueue = [];
    this._assetAvailability = new Map();
  }

  unlockInteraction() {
    this._interactionUnlocked = true;
  }

  isInteractionUnlocked() {
    return this._interactionUnlocked;
  }

  enqueue(cueId, priorityOverride = null) {
    const cue = this._eventLibrary.getCue(cueId);
    if (!cue) {
      return { accepted: false, reason: 'unknown_cue', cueId };
    }

    if (!this._interactionUnlocked) {
      return { accepted: false, reason: 'interaction_locked', cueId };
    }

    if (this._assetAvailability.get(cueId) === false) {
      return { accepted: false, reason: 'asset_unavailable', cueId, silent: true };
    }

    const normalizedGain = this._getNormalizedGain(cue);
    if (cue.controlCue) {
      this._audioHook(cueId, this._buildPayload(cue, priorityOverride, normalizedGain));
      return { accepted: true, reason: 'control', cueId, audible: false };
    }

    if (normalizedGain <= 0) {
      return { accepted: true, reason: 'muted', cueId, audible: false };
    }

    const entry = {
      cueId,
      priority: priorityOverride !== null && priorityOverride !== undefined ? priorityOverride : cue.priority,
      startedAt: this._now(),
      normalizedGain,
      phase: cue.phase,
      assetPath: cue.assetPath,
      fallbackAssetPath: cue.fallbackAssetPath,
    };

    if (this._activeSlots.length < this._maxSimultaneousEvents) {
      this._startEntry(entry);
      return { accepted: true, reason: 'started', cueId, audible: true };
    }

    const lowestPriorityActive = this._selectLowestPriorityActive();
    if (lowestPriorityActive && entry.priority > lowestPriorityActive.priority) {
      this._cancelActive(lowestPriorityActive.cueId, 'preempted');
      this._startEntry(entry);
      return { accepted: true, reason: 'started_after_preempt', cueId, audible: true };
    }

    this._deferredQueue.push(entry);
    this._deferredQueue.sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }
      return left.startedAt - right.startedAt;
    });

    return { accepted: false, reason: 'deferred', cueId, audible: false };
  }

  releaseCue(cueId) {
    const index = this._activeSlots.findIndex((entry) => entry.cueId === cueId);
    if (index === -1) {
      return false;
    }

    this._activeSlots.splice(index, 1);

    if (this._deferredQueue.length > 0) {
      const nextEntry = this._deferredQueue.shift();
      this._startEntry(nextEntry);
    }

    return true;
  }

  stopAll() {
    [...this._activeSlots].forEach((entry) => this._cancelActive(entry.cueId, 'stop_all'));
    this._activeSlots = [];
    this._deferredQueue = [];
  }

  setAssetAvailability(cueId, isAvailable) {
    this._assetAvailability.set(cueId, Boolean(isAvailable));
  }

  buildControllerHook() {
    return (cueId) => this.enqueue(cueId);
  }

  getActiveSlots() {
    return this._activeSlots.map((entry) => Object.assign({}, entry));
  }

  getDeferredQueue() {
    return this._deferredQueue.map((entry) => Object.assign({}, entry));
  }

  _getNormalizedGain(cue) {
    const gain = this._volumeSettings && typeof this._volumeSettings.getGain === 'function'
      ? this._volumeSettings.getGain()
      : 1;
    return Number((gain * cue.baseGain).toFixed(3));
  }

  _buildPayload(cue, priorityOverride, normalizedGain) {
    return {
      cueId: cue.cueId,
      phase: cue.phase,
      priority: priorityOverride !== null && priorityOverride !== undefined ? priorityOverride : cue.priority,
      normalizedGain,
      assetPath: cue.assetPath,
      fallbackAssetPath: cue.fallbackAssetPath,
    };
  }

  _startEntry(entry) {
    this._activeSlots.push(entry);
    const cue = this._eventLibrary.getCue(entry.cueId);
    this._audioHook(entry.cueId, this._buildPayload(cue, entry.priority, entry.normalizedGain));
  }

  _cancelActive(cueId, reason) {
    const index = this._activeSlots.findIndex((entry) => entry.cueId === cueId);
    if (index === -1) {
      return;
    }

    this._activeSlots.splice(index, 1);
    if (this._stopHook) {
      this._stopHook(cueId, reason);
    }
  }

  _selectLowestPriorityActive() {
    return this._activeSlots.reduce((lowest, entry) => {
      if (!lowest) {
        return entry;
      }

      if (entry.priority < lowest.priority) {
        return entry;
      }

      if (entry.priority === lowest.priority && entry.startedAt < lowest.startedAt) {
        return entry;
      }

      return lowest;
    }, null);
  }
}

module.exports = {
  AudioDesignSystem,
  DEFAULT_MAX_SIMULTANEOUS_EVENTS,
};
