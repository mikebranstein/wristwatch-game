/**
 * tests/boundary/check-boundary.test.js
 *
 * Automated tests for the JS/Python language boundary checker.
 *
 * Acceptance criteria covered:
 *   - Scenario 1: Python file in JS-only path → non-zero exit + offending path reported
 *   - Scenario 2: JS file in Python-only path → non-zero exit + offending path reported
 *   - Scenario 3: Clean baseline (unmodified repo) → exits 0
 *   - check:boundary script classification correctness (path lists)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const {
  checkBoundary,
  PYTHON_ONLY_DIRS,
  JS_ONLY_DIRS,
} = require('../../scripts/check-boundary');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(layout) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-'));
  for (const [relPath, content] of Object.entries(layout)) {
    const absPath = path.join(tmp, relPath.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content);
  }
  return tmp;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Scenario 1 — Python file in JS-only path
// ---------------------------------------------------------------------------

describe('Scenario 1 — Boundary violation: Python file in JS-only path', () => {
  const jsOnlyPaths = ['src/audio', 'src/completion', 'src/economy', 'src/intake'];

  test.each(jsOnlyPaths)(
    'reports violation for .py file under %s',
    (jsDir) => {
      const tmp = makeTempRepo({
        [`${jsDir}/ValidModule.js`]: 'module.exports = {};',
        [`${jsDir}/intruder.py`]: '# should not be here\n',
      });
      try {
        const violations = checkBoundary(tmp);
        const pyViolations = violations.filter(v => v.file.endsWith('intruder.py'));
        expect(pyViolations.length).toBeGreaterThan(0);
        expect(pyViolations[0].rule).toMatch(/Python file found in JS-only path/);
        expect(pyViolations[0].file).toContain('intruder.py');
      } finally {
        cleanup(tmp);
      }
    }
  );

  test('violation includes the offending file path', () => {
    const tmp = makeTempRepo({
      'src/audio/unexpected.py': '# wrong layer\n',
    });
    try {
      const violations = checkBoundary(tmp);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toMatch(/unexpected\.py$/);
    } finally {
      cleanup(tmp);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — JS file in Python-only path
// ---------------------------------------------------------------------------

describe('Scenario 2 — Boundary violation: JS file in Python-only path', () => {
  const pyOnlyPaths = ['src/analytics', 'src/catalog', 'src/orders', 'src/config'];

  test.each(pyOnlyPaths)(
    'reports violation for .js file under %s',
    (pyDir) => {
      const tmp = makeTempRepo({
        [`${pyDir}/valid_module.py`]: '# correct layer\n',
        [`${pyDir}/intruder.js`]: 'module.exports = {};',
      });
      try {
        const violations = checkBoundary(tmp);
        const jsViolations = violations.filter(v => v.file.endsWith('intruder.js'));
        expect(jsViolations.length).toBeGreaterThan(0);
        expect(jsViolations[0].rule).toMatch(/JS file found in Python-only path/);
        expect(jsViolations[0].file).toContain('intruder.js');
      } finally {
        cleanup(tmp);
      }
    }
  );

  test('violation includes the offending file path', () => {
    const tmp = makeTempRepo({
      'src/analytics/unexpected.js': 'module.exports = {};',
    });
    try {
      const violations = checkBoundary(tmp);
      expect(violations).toHaveLength(1);
      expect(violations[0].file).toMatch(/unexpected\.js$/);
    } finally {
      cleanup(tmp);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Clean baseline: no violations in unmodified repo
// ---------------------------------------------------------------------------

describe('Scenario 3 — Clean baseline: no boundary violations in unmodified repository', () => {
  test('check:boundary exits clean against the actual repository', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const violations = checkBoundary(repoRoot);

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.rule}\n    ${v.file}`)
        .join('\n');
      throw new Error(
        `Boundary violations found in unmodified repository — update docs/language-boundary.md:\n${details}`
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Path classification correctness
// ---------------------------------------------------------------------------

describe('Path classification', () => {
  test('PYTHON_ONLY_DIRS contains required Python data/persistence paths', () => {
    expect(PYTHON_ONLY_DIRS).toContain('src/analytics');
    expect(PYTHON_ONLY_DIRS).toContain('src/catalog');
    expect(PYTHON_ONLY_DIRS).toContain('src/config');
    expect(PYTHON_ONLY_DIRS).toContain('src/economy_analytics');
    expect(PYTHON_ONLY_DIRS).toContain('src/orders');
    expect(PYTHON_ONLY_DIRS).toContain('src/reputation');
    expect(PYTHON_ONLY_DIRS).toContain('src/upgrade_tree');
  });

  test('JS_ONLY_DIRS contains required JS runtime paths', () => {
    expect(JS_ONLY_DIRS).toContain('src/audio');
    expect(JS_ONLY_DIRS).toContain('src/cleaning');
    expect(JS_ONLY_DIRS).toContain('src/completion');
    expect(JS_ONLY_DIRS).toContain('src/economy');
    expect(JS_ONLY_DIRS).toContain('src/intake');
    expect(JS_ONLY_DIRS).toContain('src/regulation');
    expect(JS_ONLY_DIRS).toContain('src/workbench');
  });

  test('mixed co-resident directories are absent from both restricted lists', () => {
    const allRestricted = [...PYTHON_ONLY_DIRS, ...JS_ONLY_DIRS];
    // These dirs are mixed by design — both languages co-reside in them
    const mixedDirs = [
      'src/accessibility',
      'src/clients',
      'src/cosmetic',
      'src/save',
      'src/ui',
      'src/workshop',
    ];
    for (const dir of mixedDirs) {
      expect(allRestricted).not.toContain(dir);
    }
  });

  test('no directory appears in both PYTHON_ONLY_DIRS and JS_ONLY_DIRS', () => {
    const pySet = new Set(PYTHON_ONLY_DIRS);
    for (const dir of JS_ONLY_DIRS) {
      expect(pySet.has(dir)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  test('empty repo root produces zero violations', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-empty-'));
    try {
      const violations = checkBoundary(tmp);
      expect(violations).toHaveLength(0);
    } finally {
      cleanup(tmp);
    }
  });

  test('non-existent repo root produces zero violations (no crash)', () => {
    const violations = checkBoundary('/nonexistent/path/repo');
    expect(violations).toHaveLength(0);
  });

  test('multiple violations are all reported', () => {
    const tmp = makeTempRepo({
      'src/audio/bad1.py': '# wrong\n',
      'src/completion/bad2.py': '# wrong\n',
      'src/analytics/bad3.js': 'module.exports = {};',
    });
    try {
      const violations = checkBoundary(tmp);
      expect(violations.length).toBe(3);
    } finally {
      cleanup(tmp);
    }
  });

  test('__pycache__ contents are ignored', () => {
    const tmp = makeTempRepo({
      'src/audio/__pycache__/something.pyc': 'binary',
      'src/audio/ValidModule.js': 'module.exports = {};',
    });
    try {
      const violations = checkBoundary(tmp);
      // .pyc files are in __pycache__ which is skipped, and .pyc is not .py
      expect(violations).toHaveLength(0);
    } finally {
      cleanup(tmp);
    }
  });
});
