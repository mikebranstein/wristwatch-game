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
  'python/accessibility',
  'python/analytics',
  'python/catalog',
  'python/clients',
  'python/config',
  'python/cosmetic',
  'python/economy_analytics',
  'python/orders',
  'python/reputation',
  'python/save',
  'python/ui',
  'python/upgrade_tree',
  'python/workshop',
];

/**
 * Directories that belong exclusively to the JavaScript game-runtime layer.
 * No .py files are permitted anywhere under these paths.
 */
const JS_ONLY_DIRS = [
  'javascript/accessibility',
  'javascript/audio',
  'javascript/cleaning',
  'javascript/clients',
  'javascript/completion',
  'javascript/cosmetic',
  'javascript/damage',
  'javascript/data',
  'javascript/diagnosis',
  'javascript/disassembly',
  'javascript/economy',
  'javascript/gallery',
  'javascript/intake',
  'javascript/onboarding',
  'javascript/reassembly',
  'javascript/regulation',
  'javascript/save',
  'javascript/sourcing',
  'javascript/state',
  'javascript/teardown',
  'javascript/telemetry',
  'javascript/tools',
  'javascript/tooltips',
  'javascript/tutorials',
  'javascript/ui',
  'javascript/workbench',
  'javascript/workshop',
];

// Split-language directories now live under separate roots (python/ and
// javascript/) and are enforced independently.

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
