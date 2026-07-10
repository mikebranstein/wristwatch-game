'use strict';

const MIN_AUDIO_VOLUME = 0;
const MAX_AUDIO_VOLUME = 100;
const DEFAULT_AUDIO_VOLUME = 100;
const AUDIO_VOLUME_STORAGE_KEY = 'audio_volume';

function clampVolume(volumePct) {
  const numeric = Number(volumePct);
  if (!Number.isFinite(numeric)) {
    throw new RangeError(`Audio volume must be a finite number. Got: ${volumePct}`);
  }

  return Math.max(
    MIN_AUDIO_VOLUME,
    Math.min(MAX_AUDIO_VOLUME, Math.round(numeric))
  );
}

function isStorageLike(storage) {
  return storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function';
}

class AudioVolumeSettings {
  constructor({
    storage = null,
    storageKey = AUDIO_VOLUME_STORAGE_KEY,
    saveState = null,
    defaultVolume = DEFAULT_AUDIO_VOLUME,
    onChange = null,
  } = {}) {
    this._storage = isStorageLike(storage)
      ? storage
      : (typeof globalThis !== 'undefined' && isStorageLike(globalThis.localStorage) ? globalThis.localStorage : null);
    this._storageKey = storageKey;
    this._saveState = saveState;
    this._onChange = typeof onChange === 'function' ? onChange : null;

    const persistedVolume = this._readPersistedVolume();
    const fallbackVolume = Object.prototype.hasOwnProperty.call(saveState || {}, 'audio_volume')
      ? saveState.audio_volume
      : (saveState && typeof saveState.get === 'function' ? saveState.get('audio_volume') : defaultVolume);

    this._volumePct = clampVolume(
      persistedVolume !== null && persistedVolume !== undefined ? persistedVolume : fallbackVolume
    );

    this._persistVolume();
  }

  getVolume() {
    return this._volumePct;
  }

  getGain() {
    return this._volumePct / MAX_AUDIO_VOLUME;
  }

  setVolume(volumePct) {
    const nextVolume = clampVolume(volumePct);
    this._volumePct = nextVolume;
    this._persistVolume();
    this._emitChange();
    return this._volumePct;
  }

  toSaveData() {
    return {
      audio_volume: this._volumePct,
    };
  }

  _persistVolume() {
    if (this._storage) {
      this._storage.setItem(this._storageKey, String(this._volumePct));
    }

    if (this._saveState && typeof this._saveState.set === 'function') {
      this._saveState.set('audio_volume', this._volumePct);
    } else if (this._saveState && typeof this._saveState === 'object') {
      this._saveState.audio_volume = this._volumePct;
    }
  }

  _readPersistedVolume() {
    if (!this._storage) {
      return null;
    }

    const rawValue = this._storage.getItem(this._storageKey);
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : null;
  }

  _emitChange() {
    if (this._onChange) {
      this._onChange(this._volumePct);
    }
  }

  static createMemoryStorage(initialData = {}) {
    const data = Object.assign({}, initialData);
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem(key, value) {
        data[key] = String(value);
      },
      removeItem(key) {
        delete data[key];
      },
      dump() {
        return Object.assign({}, data);
      },
    };
  }
}

module.exports = {
  AudioVolumeSettings,
  AUDIO_VOLUME_STORAGE_KEY,
  DEFAULT_AUDIO_VOLUME,
  MIN_AUDIO_VOLUME,
  MAX_AUDIO_VOLUME,
  clampVolume,
};
