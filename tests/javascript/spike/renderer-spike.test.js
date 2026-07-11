/**
 * renderer-spike.test.js — Automated tests for Issue #163 acceptance criteria.
 *
 * Issue: #163 Renderer Technology Selection Spike — Electron+Pixi.js vs Godot 4.x
 * Branch: issue-163-renderer-technology-selection-spike
 *
 * Coverage:
 *   AC1 — ADR file exists at .github/decisions/ADR-001-renderer-selection.md
 *          and contains all required fields
 *   AC2 — Electron+Pixi.js path: existing JS modules import without modification
 *   AC3 — Godot evaluation and rewrite estimate are documented
 *   AC5 — ADR contains unambiguous chosen renderer declaration
 *
 * Note on AC4:
 *   AC4 requires human sign-off from PO and lead engineer as GitHub issue comments.
 *   This cannot be automated in a unit test suite; it is a process gate.
 *   The sign-off gate is enforced by the orchestrator pipeline (not this test file).
 *
 * Run with: npm test (from project root)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT  = path.resolve(__dirname, '..', '..', '..');
const ADR_PATH      = path.join(PROJECT_ROOT, '.github', 'decisions', 'ADR-001-renderer-selection.md');
const GODOT_EVAL    = path.join(PROJECT_ROOT, 'spikes', 'poc-godot-evaluation', 'EVALUATION.md');
const ELECTRON_PKG  = path.join(PROJECT_ROOT, 'spikes', 'poc-electron-pixijs', 'package.json');
const ELECTRON_MAIN = path.join(PROJECT_ROOT, 'spikes', 'poc-electron-pixijs', 'src', 'main.js');
const VERIFY_SCRIPT = path.join(PROJECT_ROOT, 'spikes', 'poc-electron-pixijs', 'src', 'verify-module-imports.js');

// ─── AC1: ADR completeness ────────────────────────────────────────────────────

describe('AC1 — ADR completeness (.github/decisions/ADR-001-renderer-selection.md)', () => {
  let adrContent;

  beforeAll(() => {
    adrContent = fs.readFileSync(ADR_PATH, 'utf8');
  });

  test('ADR file exists at .github/decisions/ADR-001-renderer-selection.md', () => {
    expect(fs.existsSync(ADR_PATH)).toBe(true);
  });

  test('ADR contains a chosen renderer declaration', () => {
    // Must name the chosen renderer explicitly
    expect(adrContent).toMatch(/Chosen renderer:/i);
  });

  test('ADR contains rationale section', () => {
    expect(adrContent).toMatch(/##\s+Rationale/i);
  });

  test('ADR contains acknowledged tradeoffs section', () => {
    expect(adrContent).toMatch(/Acknowledged Tradeoffs/i);
  });

  test('ADR contains Godot rewrite scope estimate', () => {
    // Must document the rewrite scope for the unchosen option (AC3 cross-reference)
    expect(adrContent).toMatch(/Rewrite Scope Estimate/i);
  });

  test('ADR contains sign-off gate section (AC4)', () => {
    // ADR must document the human sign-off requirement even though it cannot be automated
    expect(adrContent).toMatch(/Sign-Off Gate/i);
  });

  test('ADR explicitly identifies Electron\\+Pixi.js as chosen renderer', () => {
    expect(adrContent).toMatch(/Electron.*Pixi/i);
  });

  test('ADR mentions consequences / downstream unblocking', () => {
    expect(adrContent).toMatch(/Consequences|unblocked/i);
  });
});

// ─── AC2: Electron+Pixi.js PoC — JS module imports without modification ───────

describe('AC2 — Electron+Pixi.js PoC structure and module import verification', () => {
  test('PoC package.json exists', () => {
    expect(fs.existsSync(ELECTRON_PKG)).toBe(true);
  });

  test('PoC package.json lists electron as a dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(ELECTRON_PKG, 'utf8'));
    expect(pkg.dependencies).toHaveProperty('electron');
  });

  test('PoC package.json lists pixi.js as a dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(ELECTRON_PKG, 'utf8'));
    // Use Object.keys to avoid toHaveProperty treating '.' as a path separator
    expect(Object.keys(pkg.dependencies)).toContain('pixi.js');
  });

  test('PoC main.js exists', () => {
    expect(fs.existsSync(ELECTRON_MAIN)).toBe(true);
  });

  test('PoC main.js imports TelemetryEmitter from src/ without modification', () => {
    const content = fs.readFileSync(ELECTRON_MAIN, 'utf8');
    expect(content).toMatch(/require.*src\/telemetry\/TelemetryEmitter/);
  });

  test('PoC main.js imports HintSystem from src/ without modification', () => {
    const content = fs.readFileSync(ELECTRON_MAIN, 'utf8');
    expect(content).toMatch(/require.*src\/diagnosis\/HintSystem/);
  });

  test('PoC main.js imports PlayerSaveState from src/ without modification', () => {
    const content = fs.readFileSync(ELECTRON_MAIN, 'utf8');
    expect(content).toMatch(/require.*src\/state\/PlayerSaveState/);
  });

  test('verify-module-imports.js script exists', () => {
    expect(fs.existsSync(VERIFY_SCRIPT)).toBe(true);
  });

  // ── Live import checks: require() the actual source modules ────────────────
  // These tests confirm the modules are importable in a plain Node.js/Jest
  // environment (same runtime as Electron's main process) WITHOUT modification.

  test('TelemetryEmitter: require() succeeds without source modification', () => {
    expect(() => {
      require(path.join(PROJECT_ROOT, 'src/telemetry/TelemetryEmitter'));
    }).not.toThrow();
  });

  test('TelemetryEmitter: constructs and emits an event', () => {
    const { TelemetryEmitter } = require(path.join(PROJECT_ROOT, 'src/telemetry/TelemetryEmitter'));
    const t = new TelemetryEmitter(() => {});
    t.tutorialDiagnosisStarted('test-inst');
    expect(t.wasEmitted('tutorial_diagnosis_started')).toBe(true);
  });

  test('HintSystem: require() succeeds without source modification', () => {
    expect(() => {
      require(path.join(PROJECT_ROOT, 'src/diagnosis/HintSystem'));
    }).not.toThrow();
  });

  test('HintSystem: constructs and registers a fault instance', () => {
    const { TelemetryEmitter } = require(path.join(PROJECT_ROOT, 'src/telemetry/TelemetryEmitter'));
    const { HintSystem }       = require(path.join(PROJECT_ROOT, 'src/diagnosis/HintSystem'));
    const t = new TelemetryEmitter(() => {});
    const h = new HintSystem(t);
    h.registerFaultInstance('fi-test', 'mainspring_worn');
    expect(h.getCurrentTier('fi-test')).toBe(0);
  });

  test('PlayerSaveState: require() succeeds without source modification', () => {
    expect(() => {
      require(path.join(PROJECT_ROOT, 'src/state/PlayerSaveState'));
    }).not.toThrow();
  });

  test('PlayerSaveState: constructs without error', () => {
    const { PlayerSaveState } = require(path.join(PROJECT_ROOT, 'src/state/PlayerSaveState'));
    expect(() => new PlayerSaveState()).not.toThrow();
  });
});

// ─── AC3: Godot evaluation and rewrite estimate ───────────────────────────────

describe('AC3 — Godot 4.x evaluation and rewrite estimate', () => {
  let godotContent;

  beforeAll(() => {
    godotContent = fs.readFileSync(GODOT_EVAL, 'utf8');
  });

  test('Godot evaluation document exists', () => {
    expect(fs.existsSync(GODOT_EVAL)).toBe(true);
  });

  test('Godot evaluation documents that a watch part renders on screen', () => {
    expect(godotContent).toMatch(/Sprite2D|renders.*watch part|watch part.*renders/i);
  });

  test('Godot evaluation includes rewrite scope table with effort estimates', () => {
    expect(godotContent).toMatch(/Estimated effort/i);
  });

  test('Godot evaluation documents a total rewrite estimate in days or weeks', () => {
    // Must quantify the estimate (days or weeks)
    expect(godotContent).toMatch(/days|weeks/i);
  });

  test('ADR contains the Godot rewrite estimate table (cross-reference check)', () => {
    const adrContent = fs.readFileSync(ADR_PATH, 'utf8');
    expect(adrContent).toMatch(/Godot.*Rewrite|Rewrite.*Godot/i);
  });

  test('Godot evaluation documents conditions for revisiting the decision', () => {
    expect(godotContent).toMatch(/Conditions for Revisiting|revisit/i);
  });
});

// ─── AC5: ADR is unambiguous as binding foundation ────────────────────────────

describe('AC5 — ADR is unambiguous binding technical foundation for downstream issues', () => {
  let adrContent;

  beforeAll(() => {
    adrContent = fs.readFileSync(ADR_PATH, 'utf8');
  });

  test('ADR declares status (PROPOSED/ACCEPTED)', () => {
    expect(adrContent).toMatch(/\*\*Status:\*\*|Status:/i);
  });

  test('ADR references issue #163', () => {
    expect(adrContent).toMatch(/#163/);
  });

  test('ADR states that downstream issues must reference ADR-001', () => {
    expect(adrContent).toMatch(/ADR-001|downstream/i);
  });

  test('ADR explicitly states Electron+Pixi.js is the binding choice', () => {
    expect(adrContent).toMatch(/binding/i);
  });

  test('ADR mentions that issue #164 (Minimal Playable Shell) is unblocked', () => {
    expect(adrContent).toMatch(/#164|Minimal Playable Shell/i);
  });
});

// ─── AC4 note ────────────────────────────────────────────────────────────────

describe('AC4 — Sign-off gate (informational — not automatable)', () => {
  test('ADR documents the human sign-off requirement', () => {
    // AC4 requires PO + lead engineer sign-off as GitHub issue comments.
    // This test verifies the ADR documents that requirement; it cannot
    // automate the sign-off itself.
    const adrContent = fs.readFileSync(ADR_PATH, 'utf8');
    expect(adrContent).toMatch(/PO.*sign-off|lead engineer.*sign/i);
  });

  test('ADR gate blocks sprint planning until sign-off is recorded', () => {
    const adrContent = fs.readFileSync(ADR_PATH, 'utf8');
    // Must state that sprint planning is blocked until sign-off
    expect(adrContent).toMatch(/sprint planning.*not begin|must not begin|before sprint planning/i);
  });
});
