/**
 * verify-module-imports.js — AC2 import verification script.
 * Issue #163: Renderer Technology Selection Spike.
 *
 * PURPOSE: Confirm that all targeted existing JS game logic modules can be
 * imported and instantiated in a plain Node.js context (and therefore in
 * Electron's main process) WITHOUT ANY MODIFICATION to the source files.
 *
 * Run with: node src/verify-module-imports.js
 * Expected: prints PASS lines and exits with code 0.
 *
 * This script is also exercised by the Jest test suite in
 * tests/spike/renderer-spike.test.js.
 */

'use strict';

const path = require('path');

// Resolve to the project root (two directories above spikes/poc-electron-pixijs/)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

let allPassed = true;

function check(label, fn) {
  try {
    fn();
    console.log(`  [PASS] ${label}`);
  } catch (err) {
    console.error(`  [FAIL] ${label}: ${err.message}`);
    allPassed = false;
  }
}

console.log('\n=== AC2 Module Import Verification ===');
console.log(`Project root: ${PROJECT_ROOT}\n`);

// ── TelemetryEmitter ────────────────────────────────────────────────────────
check('TelemetryEmitter: require', () => {
  const { TelemetryEmitter } = require(path.join(PROJECT_ROOT, 'src/telemetry/TelemetryEmitter'));
  if (typeof TelemetryEmitter !== 'function') throw new Error('Not a constructor');
});
check('TelemetryEmitter: construct + call method', () => {
  const { TelemetryEmitter } = require(path.join(PROJECT_ROOT, 'src/telemetry/TelemetryEmitter'));
  const t = new TelemetryEmitter(() => {});
  t.tutorialDiagnosisStarted('inst-001');
  if (!t.wasEmitted('tutorial_diagnosis_started')) throw new Error('Event not emitted');
});

// ── HintSystem ──────────────────────────────────────────────────────────────
check('HintSystem: require', () => {
  const { HintSystem } = require(path.join(PROJECT_ROOT, 'src/diagnosis/HintSystem'));
  if (typeof HintSystem !== 'function') throw new Error('Not a constructor');
});
check('HintSystem: construct + registerFaultInstance', () => {
  const { TelemetryEmitter } = require(path.join(PROJECT_ROOT, 'src/telemetry/TelemetryEmitter'));
  const { HintSystem }       = require(path.join(PROJECT_ROOT, 'src/diagnosis/HintSystem'));
  const t = new TelemetryEmitter(() => {});
  const h = new HintSystem(t);
  h.registerFaultInstance('fi-001', 'mainspring_worn');
  if (h.getCurrentTier('fi-001') !== 0) throw new Error('Expected tier 0 after registration');
});

// ── PlayerSaveState ─────────────────────────────────────────────────────────
check('PlayerSaveState: require', () => {
  const { PlayerSaveState } = require(path.join(PROJECT_ROOT, 'src/state/PlayerSaveState'));
  if (typeof PlayerSaveState !== 'function') throw new Error('Not a constructor');
});
check('PlayerSaveState: construct', () => {
  const { PlayerSaveState } = require(path.join(PROJECT_ROOT, 'src/state/PlayerSaveState'));
  const s = new PlayerSaveState();
  if (s === null || s === undefined) throw new Error('Constructor returned null/undefined');
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n=== Result ===');
if (allPassed) {
  console.log('ALL CHECKS PASSED — AC2 confirmed: existing JS modules import without modification.\n');
  process.exit(0);
} else {
  console.error('ONE OR MORE CHECKS FAILED — review output above.\n');
  process.exit(1);
}
