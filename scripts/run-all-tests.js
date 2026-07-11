#!/usr/bin/env node
/**
 * run-all-tests.js
 *
 * Unified test runner for the dual-toolchain project (Jest + pytest).
 *
 * Both suites ALWAYS run — the script never short-circuits on first failure.
 * Exit code reflects the combined result: 0 only when BOTH suites pass.
 *
 * Usage (via npm scripts):
 *   npm run test:all              — runs both suites (standard)
 *   npm run test:all:coverage     — runs both suites with coverage reporting
 *
 * Exit-code contract:
 *   0  — both Jest and pytest exited 0
 *   1+ — at least one suite failed; both still ran to completion
 */

'use strict';

const { spawnSync } = require('child_process');

// Determine mode from CLI args
const args = process.argv.slice(2);
const withCoverage = args.includes('--coverage');

// --- Jest command -----------------------------------------------------------
const jestArgs = withCoverage ? ['test', '--coverage'] : ['test'];
// Use shell:true on Windows so npm.cmd resolves correctly in all environments.
const npmCmd = process.platform === 'win32' ? 'npm' : 'npm';

console.log('\n========================================');
console.log('  Running JavaScript tests (Jest)');
console.log('========================================\n');

const jestResult = spawnSync(npmCmd, jestArgs, {
  stdio: 'inherit',
  shell: true, // required on Windows for npm/npm.cmd resolution
});

const jestExit = jestResult.status !== null ? jestResult.status : 1;

if (jestResult.error) {
  console.error('Failed to start Jest:', jestResult.error.message);
}

// --- pytest command ----------------------------------------------------------
// Use `python -m pytest` for reliable cross-platform PATH resolution.
const pytestArgs = ['python', '-m', 'pytest'];
if (withCoverage) {
  pytestArgs.push('--cov=src', '--cov-report=term-missing');
}
const pytestCmd = pytestArgs.shift(); // 'python'

console.log('\n========================================');
console.log('  Running Python tests (pytest)');
console.log('========================================\n');

const pytestResult = spawnSync(pytestCmd, pytestArgs, {
  stdio: 'inherit',
  shell: true, // consistent cross-platform behavior
});

const pytestExit = pytestResult.status !== null ? pytestResult.status : 1;

if (pytestResult.error) {
  console.error('Failed to start pytest:', pytestResult.error.message);
}

// --- Combined result ---------------------------------------------------------
const combinedExit = jestExit !== 0 || pytestExit !== 0 ? 1 : 0;

console.log('\n========================================');
console.log('  Test Summary');
console.log('========================================');
console.log(`  Jest:   ${jestExit === 0 ? 'PASSED ✓' : 'FAILED ✗'} (exit ${jestExit})`);
console.log(`  pytest: ${pytestExit === 0 ? 'PASSED ✓' : 'FAILED ✗'} (exit ${pytestExit})`);
console.log(`  Result: ${combinedExit === 0 ? 'ALL PASSED ✓' : 'SOME FAILURES ✗'}`);
console.log('========================================\n');

process.exit(combinedExit);
