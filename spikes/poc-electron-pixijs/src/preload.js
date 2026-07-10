/**
 * THROWAWAY — Electron preload script for the Pixi.js PoC.
 * Issue #163: Renderer Technology Selection Spike.
 *
 * Exposes a minimal bridge (no game logic here — logic stays in main process
 * via IPC or direct Node.js require in the renderer with nodeIntegration).
 *
 * NOT FOR PRODUCTION USE.
 */

'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('spike', {
  version: '0.0.1-spike',
  issue: 163,
  note: 'Throwaway PoC — Electron+Pixi.js renderer spike for ADR-001',
});
