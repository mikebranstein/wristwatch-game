/**
 * Tests for backstory-templates.js — Issue #126: Client Backstory Card System
 *
 * Validates the template data file: schema correctness, coverage, word counts,
 * and the getTemplatesForWatchType() helper.
 *
 * Run with: npm test
 */

'use strict';

const {
  BACKSTORY_TEMPLATES,
  WATCH_TYPES,
  getTemplatesForWatchType,
} = require('../../src/data/backstory-templates');

// ─── Schema validation ────────────────────────────────────────────────────────

describe('backstory-templates — schema', () => {
  test('exports at least 20 templates', () => {
    expect(BACKSTORY_TEMPLATES.length).toBeGreaterThanOrEqual(20);
  });

  test('exports no more than 30 templates', () => {
    expect(BACKSTORY_TEMPLATES.length).toBeLessThanOrEqual(30);
  });

  test.each(BACKSTORY_TEMPLATES)(
    'template "$id" has required shape {id, watchType, templateText, variables}',
    ({ id, watchType, templateText, variables }) => {
      expect(typeof id).toBe('string');
      expect(id.trim().length).toBeGreaterThan(0);
      expect(typeof watchType).toBe('string');
      expect(WATCH_TYPES).toContain(watchType);
      expect(typeof templateText).toBe('string');
      expect(templateText.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(variables)).toBe(true);
    },
  );

  test('all template IDs are unique', () => {
    const ids = BACKSTORY_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('variables array lists only known substitution keys', () => {
    const KNOWN_KEYS = ['clientName', 'relationshipContext', 'timeBroken', 'occasion'];
    for (const { id, variables } of BACKSTORY_TEMPLATES) {
      for (const v of variables) {
        expect(KNOWN_KEYS).toContain(v);
      }
    }
  });

  test('every variable in the variables array appears in templateText', () => {
    for (const { id, templateText, variables } of BACKSTORY_TEMPLATES) {
      for (const v of variables) {
        expect(templateText).toContain(`{{${v}}}`);
      }
    }
  });

  test('no templateText references a variable not listed in the variables array', () => {
    for (const { id, templateText, variables } of BACKSTORY_TEMPLATES) {
      const tokensInText = [...templateText.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const token of tokensInText) {
        expect(variables).toContain(token);
      }
    }
  });
});

// ─── Word-count gate (AC4) ────────────────────────────────────────────────────

describe('backstory-templates — AC4: word count ≤80', () => {
  test.each(BACKSTORY_TEMPLATES)(
    'template "$id" is ≤80 words (substituting tokens with a placeholder word)',
    ({ id, templateText }) => {
      const cleaned = templateText.replace(/\{\{[^}]+\}\}/g, 'word');
      const wordCount = cleaned.trim().split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(80);
    },
  );
});

// ─── Watch type coverage ──────────────────────────────────────────────────────

describe('backstory-templates — Scenario 4: watch type coverage', () => {
  test.each(WATCH_TYPES)(
    'watch type "%s" has at least one template',
    (watchType) => {
      const matches = BACKSTORY_TEMPLATES.filter((t) => t.watchType === watchType);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    },
  );

  test('every template watchType is in WATCH_TYPES', () => {
    for (const { id, watchType } of BACKSTORY_TEMPLATES) {
      expect(WATCH_TYPES).toContain(watchType);
    }
  });
});

// ─── getTemplatesForWatchType() ───────────────────────────────────────────────

describe('backstory-templates — getTemplatesForWatchType()', () => {
  test('returns templates for a known watchType', () => {
    const result = getTemplatesForWatchType('dive_watch');
    expect(result.length).toBeGreaterThanOrEqual(1);
    result.forEach((t) => expect(t.watchType).toBe('dive_watch'));
  });

  test('returns templates for all known WATCH_TYPES', () => {
    for (const wt of WATCH_TYPES) {
      const result = getTemplatesForWatchType(wt);
      expect(result.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('returns fallback (not empty array) for unknown watchType in production mode', () => {
    // devMode=false → graceful fallback, not an error
    const result = getTemplatesForWatchType('unknown_type', false);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test('throws for unknown watchType when devMode=true', () => {
    expect(() => getTemplatesForWatchType('unknown_type', true)).toThrow();
  });
});
