#!/usr/bin/env node
/**
 * check-boundary.js
 *
 * Static file-extension scan enforcing the JS/Python language boundary
 * documented in docs/language-boundary.md.
 *
 * Usage (CLI):
 *   node scripts/check-boundary.js [repo-root]
 *
 * Exit codes:
 *   0 — no boundary violations (boundary-clean)
 *   1 — one or more boundary violations found (offending paths printed to stderr)
 *
 * No external dependencies. Requires Node.js 18+.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Path classification — sourced from docs/language-boundary.md
// ---------------------------------------------------------------------------

/**
 * Directories that belong exclusively to the Python data/persistence layer.
 * No .js files are permitted anywhere under these paths.
 */
const PYTHON_ONLY_DIRS = [
  'src/analytics',
  'src/catalog',
  'src/config',
  'src/economy_analytics',
  'src/orders',
  'src/reputation',
  'src/upgrade_tree',
];

/**
 * Directories that belong exclusively to the JavaScript game-runtime layer.
 * No .py files are permitted anywhere under these paths.
 */
const JS_ONLY_DIRS = [
  'src/audio',
  'src/cleaning',
  'src/completion',
  'src/damage',
  'src/data',
  'src/diagnosis',
  'src/disassembly',
  'src/economy',
  'src/gallery',
  'src/intake',
  'src/onboarding',
  'src/reassembly',
  'src/regulation',
  'src/sourcing',
  'src/state',
  'src/teardown',
  'src/telemetry',
  'src/tools',
  'src/tooltips',
  'src/tutorials',
  'src/workbench',
];

// Mixed (co-resident) directories — both languages are present by design;
// no enforcement is applied to these paths:
//   src/accessibility, src/clients, src/cosmetic, src/save, src/ui, src/workshop

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all file paths under `dir`.
 * Skips __pycache__ and node_modules to avoid false positives from compiled
 * artefacts.
 *
 * @param {string} dir
 * @param {string[]} [fileList]
 * @returns {string[]}
 */
function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return fileList;
  }
  for (const entry of entries) {
    if (entry.name === '__pycache__' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// ---------------------------------------------------------------------------
// Core checker
// ---------------------------------------------------------------------------

/**
 * Check the JS/Python language boundary for the given repository root.
 *
 * @param {string} repoRoot  Absolute path to the repository root.
 * @returns {{ file: string, rule: string }[]}  Array of violations (empty = clean).
 */
function checkBoundary(repoRoot) {
  const violations = [];

  // Rule A: no .js files in Python-only directories
  for (const dir of PYTHON_ONLY_DIRS) {
    const absDir = path.join(repoRoot, dir.replace(/\//g, path.sep));
    const files  = walkDir(absDir);
    for (const f of files) {
      if (f.endsWith('.js')) {
        violations.push({
          file: f,
          rule: `JS file found in Python-only path: ${dir}`,
        });
      }
    }
  }

  // Rule B: no .py files in JS-only directories
  for (const dir of JS_ONLY_DIRS) {
    const absDir = path.join(repoRoot, dir.replace(/\//g, path.sep));
    const files  = walkDir(absDir);
    for (const f of files) {
      if (f.endsWith('.py')) {
        violations.push({
          file: f,
          rule: `Python file found in JS-only path: ${dir}`,
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Exports (for unit tests)
// ---------------------------------------------------------------------------

module.exports = { checkBoundary, walkDir, PYTHON_ONLY_DIRS, JS_ONLY_DIRS };

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const repoRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..');

  const violations = checkBoundary(repoRoot);

  if (violations.length === 0) {
    console.log('boundary-clean: no cross-boundary file placements found.');
    process.exit(0);
  }

  console.error('Boundary violations detected:');
  for (const v of violations) {
    console.error(`  ${v.rule}`);
    console.error(`    ${v.file}`);
  }
  process.exit(1);
}
