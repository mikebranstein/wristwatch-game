/**
 * THROWAWAY — Electron+Pixi.js PoC main process.
 * Issue #163: Renderer Technology Selection Spike.
 *
 * PURPOSE: Demonstrate that:
 *   1. An Electron window can be created on Windows (AC2 / Scenario 2)
 *   2. Existing JS game logic modules are importable without modification (AC2)
 *   3. A watch part sprite can be rendered via Pixi.js in the renderer process (AC2)
 *
 * NOT FOR PRODUCTION USE. Superseded by Minimal Playable Shell sprint.
 */

'use strict';

const path = require('path');
const { app, BrowserWindow } = require('electron');

// ─── AC2: Import existing JS game logic modules without modification ───────────
// These require() calls import the framework-agnostic CommonJS modules directly
// from the source tree — zero changes made to any source file.
const { TelemetryEmitter } = require('../../src/telemetry/TelemetryEmitter');
const { HintSystem }       = require('../../src/diagnosis/HintSystem');
const { PlayerSaveState }  = require('../../src/state/PlayerSaveState');

// Verify the imports are callable (AC2 gate)
function verifyModuleImports() {
  // TelemetryEmitter: construct with a no-op hook
  const telemetry = new TelemetryEmitter((name, payload) => {
    console.log(`[spike-telemetry] ${name}`, payload);
  });
  telemetry.tutorialDiagnosisStarted('spike-fault-001');
  console.log('[AC2] TelemetryEmitter: import OK, tutorialDiagnosisStarted emitted');

  // HintSystem: construct with the telemetry instance
  const hintSystem = new HintSystem(telemetry);
  hintSystem.registerFaultInstance('spike-fault-001', 'mainspring_worn');
  console.log('[AC2] HintSystem: import OK, registerFaultInstance called without error');

  // PlayerSaveState: construct
  const saveState = new PlayerSaveState();
  console.log('[AC2] PlayerSaveState: import OK, constructed without error');
  console.log('[AC2] All module import checks PASSED — zero source modifications required.');

  return { telemetry, hintSystem, saveState };
}

// Run import verification at startup
verifyModuleImports();

// ─── Electron window setup ────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    title: 'Wristwatch PoC — Electron+Pixi.js Spike',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
