/**
 * Tests for AC3 — Horology Jargon Tooltips
 *
 * AC3: Every horology technical term appearing in the diagnosis UI has an
 * inline tooltip that shows a plain-language definition on hover/tap;
 * no term in the diagnosis screen is left undefined.
 *
 * Scenario 5 (tooltip coverage audit): QA inspects every technical horology
 * term visible in the diagnosis UI across all fault types; every term must
 * surface a tooltip with a plain-language definition; zero missing or broken
 * tooltips.
 */

const { TooltipSystem } = require('../../../src/tooltips/TooltipSystem');
const { GLOSSARY, getAllTermKeys } = require('../../../src/tooltips/HorologyGlossary');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// The canonical list of terms that appear in the diagnosis UI — this is the
// list QA validates against the glossary (Scenario 5).
const DIAGNOSIS_UI_TERMS = [
  'mainspring',
  'escapement',
  'pallet_fork',
  'balance_wheel',
  'hairspring',
  'escape_wheel',
  'barrel',
  'crown',
  'stem',
  'setting_lever',
  'cannon_pinion',
  'center_wheel',
  'click_spring',
  'ratchet_wheel',
  'date_disc',
  'date_jumper',
  'date_driving_wheel',
  'seconds_wheel',
  'crystal',
  'dial',
  'gasket',
  'gear_train',
  'jewel',
  'endshake',
];

// ─── AC3 core ─────────────────────────────────────────────────────────────────

describe('AC3 — TooltipSystem: every diagnosis UI term has an inline tooltip', () => {
  const tooltips = new TooltipSystem();

  test('all terms registered in the glossary have a non-empty definition', () => {
    const keys = tooltips.getAllRegisteredTerms();
    expect(keys.length).toBeGreaterThan(0);
    keys.forEach((key) => {
      const entry = tooltips.getTooltip(key);
      expect(entry).not.toBeNull();
      expect(typeof entry.definition).toBe('string');
      expect(entry.definition.length).toBeGreaterThan(0);
    });
  });

  test('all terms registered in the glossary have a non-empty term name', () => {
    const keys = tooltips.getAllRegisteredTerms();
    keys.forEach((key) => {
      const entry = tooltips.getTooltip(key);
      expect(typeof entry.term).toBe('string');
      expect(entry.term.length).toBeGreaterThan(0);
    });
  });

  test('getTooltip returns null for an unknown term key', () => {
    const result = tooltips.getTooltip('nonexistent_term_xyz');
    expect(result).toBeNull();
  });

  test('hasTooltip returns true for known terms', () => {
    expect(tooltips.hasTooltip('mainspring')).toBe(true);
    expect(tooltips.hasTooltip('balance_wheel')).toBe(true);
    expect(tooltips.hasTooltip('escapement')).toBe(true);
  });

  test('hasTooltip returns false for unknown terms', () => {
    expect(tooltips.hasTooltip('not_a_real_term')).toBe(false);
  });
});

// ─── Scenario 5: Tooltip coverage audit ───────────────────────────────────────

describe('Scenario 5 — Tooltip coverage audit: zero missing or broken tooltips', () => {
  const tooltips = new TooltipSystem();

  test('validateCoverage passes for the full diagnosis UI term list', () => {
    expect(() => tooltips.validateCoverage(DIAGNOSIS_UI_TERMS)).not.toThrow();
  });

  test('validateCoverage throws when an uncovered term is included', () => {
    expect(() =>
      tooltips.validateCoverage([...DIAGNOSIS_UI_TERMS, 'undefined_new_term'])
    ).toThrow(/AC3 violation/);
  });

  test('every term in DIAGNOSIS_UI_TERMS is individually covered', () => {
    DIAGNOSIS_UI_TERMS.forEach((term) => {
      expect(tooltips.hasTooltip(term)).toBe(true);
    });
  });

  test('each tooltip definition is plain-language (no blank definitions)', () => {
    DIAGNOSIS_UI_TERMS.forEach((term) => {
      const entry = tooltips.getTooltip(term);
      expect(entry).not.toBeNull();
      expect(entry.definition.trim().length).toBeGreaterThan(10);
    });
  });
});

// ─── GLOSSARY integrity ───────────────────────────────────────────────────────

describe('HorologyGlossary — data integrity', () => {
  test('every key in GLOSSARY maps to an object with term and definition', () => {
    Object.entries(GLOSSARY).forEach(([key, entry]) => {
      expect(typeof entry.term).toBe('string');
      expect(typeof entry.definition).toBe('string');
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(0);
    });
  });

  test('getAllTermKeys returns all glossary keys', () => {
    const keys = getAllTermKeys();
    expect(keys.length).toBe(Object.keys(GLOSSARY).length);
  });

  test('the glossary covers at least 20 distinct horology terms', () => {
    expect(getAllTermKeys().length).toBeGreaterThanOrEqual(20);
  });
});
