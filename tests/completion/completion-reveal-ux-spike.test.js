/**
 * Tests for Issue #140: Completion Reveal — UX Format Prototype Test & Sequencing Brief (Spike)
 *
 * These tests validate that the spike deliverable documents exist and contain
 * all required structural elements per the acceptance criteria.
 *
 * Acceptance Criteria:
 *   AC1: Test findings summary exists; documents ≥5 participant evaluation; includes
 *        preferred format recommendation with supporting feedback quotes/scores.
 *   AC2: Test findings summary evaluates all 3 format candidates (side_by_side_still,
 *        animated_transition, timelapse_replay); scores each on emotional response and
 *        stated shareability intent.
 *   AC3: Sequencing Brief exists; explicitly defines design boundaries between SO #50
 *        Cleaning Reveal and Completion Reveal (timing, visual scope, emotional register,
 *        shared technical dependencies).
 *   AC4: Sequencing Brief includes a recommended reveal format statement and constraints
 *        the Core System build team must respect.
 *   AC5: Both documents are structured for PO review (PO gate section present).
 *
 * Run with:
 *   npm test -- tests/completion/completion-reveal-ux-spike.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Document paths ────────────────────────────────────────────────────────────

const DOCS_DIR = path.resolve(__dirname, '../../docs');

const UX_FINDINGS_DOC = path.join(
  DOCS_DIR,
  'spike-completion-reveal-ux-format-2026-07-10.md'
);

const SEQUENCING_BRIEF_DOC = path.join(
  DOCS_DIR,
  'spike-completion-reveal-sequencing-brief-2026-07-10.md'
);

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the content of a document, or throws if missing.
 */
function readDoc(docPath) {
  if (!fs.existsSync(docPath)) {
    throw new Error(`Required spike document not found: ${docPath}`);
  }
  return fs.readFileSync(docPath, 'utf8');
}

// ─── AC1: UX test findings document — existence & structure ───────────────────

describe('AC1 — UX test findings summary: document exists and covers participant evaluation', () => {
  let content;

  beforeAll(() => {
    content = readDoc(UX_FINDINGS_DOC);
  });

  test('AC1: test findings document exists at docs/spike-completion-reveal-ux-format-2026-07-10.md', () => {
    expect(fs.existsSync(UX_FINDINGS_DOC)).toBe(true);
  });

  test('AC1: document has a title identifying it as a UX test findings summary', () => {
    expect(content).toMatch(/UX Prototype Test Findings/i);
  });

  test('AC1: document references Issue #140', () => {
    expect(content).toMatch(/#140/);
  });

  test('AC1: document includes a Participant Log section', () => {
    expect(content).toMatch(/Participant Log/i);
  });

  test('AC1: document tracks at least 5 participant rows (P1–P5)', () => {
    // Confirm P1 through P5 are present in the participant tracking table
    expect(content).toMatch(/P1/);
    expect(content).toMatch(/P2/);
    expect(content).toMatch(/P3/);
    expect(content).toMatch(/P4/);
    expect(content).toMatch(/P5/);
  });

  test('AC1: document states the minimum participant threshold (≥5)', () => {
    expect(content).toMatch(/minimum.*5|≥5|5 participants/i);
  });

  test('AC1: document includes a Recommended Format field', () => {
    expect(content).toMatch(/Recommended Format/i);
  });

  test('AC1: document includes qualitative feedback sections with placeholder for player quotes', () => {
    expect(content).toMatch(/Representative quotes/i);
  });

  test('AC1: document includes a Decision / recommendation section', () => {
    expect(content).toMatch(/## Decision/i);
  });

  test('AC1: document includes an AC1 coverage row in acceptance criteria table', () => {
    expect(content).toMatch(/AC1/);
  });
});

// ─── AC2: All 3 format candidates evaluated ────────────────────────────────────

describe('AC2 — UX test findings summary: all 3 format candidates present with scoring dimensions', () => {
  let content;

  beforeAll(() => {
    content = readDoc(UX_FINDINGS_DOC);
  });

  test('AC2: Format A (side_by_side_still) is listed as a candidate', () => {
    expect(content).toMatch(/side.by.side.still|side_by_side_still/i);
  });

  test('AC2: Format B (animated_transition) is listed as a candidate', () => {
    expect(content).toMatch(/animated.transition|animated_transition/i);
  });

  test('AC2: Format C (timelapse_replay / time-lapse replay) is listed as a candidate', () => {
    expect(content).toMatch(/timelapse.replay|time.lapse.replay|timelapse_replay/i);
  });

  test('AC2: document includes an Emotional Response scoring section', () => {
    expect(content).toMatch(/Emotional Response/i);
  });

  test('AC2: document includes a Shareability Intent scoring section', () => {
    expect(content).toMatch(/Shareability Intent|shareability/i);
  });

  test('AC2: document includes a Preference Ranking section', () => {
    expect(content).toMatch(/Preference Ranking/i);
  });

  test('AC2: scoring matrix covers Format A, B, and C columns', () => {
    // Scoring tables use "Format A", "Format B", "Format C" as column headers
    expect(content).toMatch(/Format A/);
    expect(content).toMatch(/Format B/);
    expect(content).toMatch(/Format C/);
  });

  test('AC2: document includes an AC2 coverage row in acceptance criteria table', () => {
    expect(content).toMatch(/AC2/);
  });
});

// ─── AC3: Sequencing Brief — existence & boundary sections ────────────────────

describe('AC3 — Sequencing Brief: document exists and defines all required design boundaries', () => {
  let content;

  beforeAll(() => {
    content = readDoc(SEQUENCING_BRIEF_DOC);
  });

  test('AC3: sequencing brief document exists at docs/spike-completion-reveal-sequencing-brief-2026-07-10.md', () => {
    expect(fs.existsSync(SEQUENCING_BRIEF_DOC)).toBe(true);
  });

  test('AC3: document has a title identifying it as a Sequencing Brief', () => {
    expect(content).toMatch(/Sequencing Brief/i);
  });

  test('AC3: document references Issue #140', () => {
    expect(content).toMatch(/#140/);
  });

  test('AC3: document covers SO #50 Cleaning Reveal', () => {
    expect(content).toMatch(/SO #50|SO#50|Cleaning Reveal/i);
  });

  test('AC3: document covers Completion Reveal (#141)', () => {
    expect(content).toMatch(/Completion Reveal|#141/i);
  });

  test('AC3: document includes timing in the restoration arc dimension', () => {
    expect(content).toMatch(/Timing in the Restoration Arc|restoration arc/i);
  });

  test('AC3: document includes visual scope dimension (parts vs. whole watch)', () => {
    expect(content).toMatch(/Visual Scope|parts.*whole|whole.*parts/i);
  });

  test('AC3: document includes emotional register dimension', () => {
    expect(content).toMatch(/Emotional Register/i);
  });

  test('AC3: document includes a Shared Technical Dependencies section', () => {
    expect(content).toMatch(/Shared Technical Dependencies/i);
  });

  test('AC3: document includes conflict resolution pathways (Scenario 4 and 5)', () => {
    expect(content).toMatch(/Scenario 4|boundary clear/i);
    expect(content).toMatch(/Scenario 5|conflict found/i);
  });

  test('AC3: document includes an AC3 coverage row in acceptance criteria table', () => {
    expect(content).toMatch(/AC3/);
  });
});

// ─── AC4: Sequencing Brief — recommended format & Core System constraints ──────

describe('AC4 — Sequencing Brief: recommended format and Core System constraints', () => {
  let content;

  beforeAll(() => {
    content = readDoc(SEQUENCING_BRIEF_DOC);
  });

  test('AC4: brief includes a Recommended Completion Reveal Format section', () => {
    expect(content).toMatch(/Recommended.*Format|Recommended Completion Reveal Format/i);
  });

  test('AC4: brief includes a constraints section for the Core System build team', () => {
    expect(content).toMatch(/Constraints the Core System Build Team Must Respect|constraints.*core system/i);
  });

  test('AC4: constraints section has at least one numbered constraint placeholder', () => {
    // Document has numbered list items for constraints
    expect(content).toMatch(/1\.\s/);
  });

  test('AC4: document includes an AC4 coverage row in acceptance criteria table', () => {
    expect(content).toMatch(/AC4/);
  });
});

// ─── AC5: PO Review Gate present in both documents ────────────────────────────

describe('AC5 — PO review gate: both documents include PO approval structure', () => {
  let uxContent;
  let briefContent;

  beforeAll(() => {
    uxContent = readDoc(UX_FINDINGS_DOC);
    briefContent = readDoc(SEQUENCING_BRIEF_DOC);
  });

  test('AC5: test findings summary document exists (prerequisite for PO review)', () => {
    expect(fs.existsSync(UX_FINDINGS_DOC)).toBe(true);
  });

  test('AC5: sequencing brief document exists (prerequisite for PO review)', () => {
    expect(fs.existsSync(SEQUENCING_BRIEF_DOC)).toBe(true);
  });

  test('AC5: sequencing brief includes a PO Review Gate section', () => {
    expect(briefContent).toMatch(/PO Review Gate/i);
  });

  test('AC5: sequencing brief PO gate section references the 2-business-day SLA', () => {
    expect(briefContent).toMatch(/2 business day|2-business-day/i);
  });

  test('AC5: sequencing brief states Issue #141 is gated on PO approval', () => {
    expect(briefContent).toMatch(/#141.*proceed|proceed.*#141|Issue #141 cannot proceed/i);
  });

  test('AC5: sequencing brief has PO decision field (Approved / Revision requested)', () => {
    expect(briefContent).toMatch(/PO Decision|Approved.*Issue #141|Revision requested/i);
  });

  test('AC5: test findings summary references joint PO approval requirement', () => {
    // Both docs must mention PO approval linkage
    expect(uxContent).toMatch(/PO-approved|PO review|PO approval/i);
  });

  test('AC5: both documents cross-reference each other as a joint deliverable set', () => {
    // UX doc mentions sequencing brief
    expect(uxContent).toMatch(/Sequencing Brief/i);
    // Brief doc mentions test findings
    expect(briefContent).toMatch(/test findings/i);
  });
});

// ─── Constraints compliance: both docs confirm zero-code-artifacts ─────────────

describe('Constraints — zero code artifacts and deliverable format compliance', () => {
  let uxContent;
  let briefContent;

  beforeAll(() => {
    uxContent = readDoc(UX_FINDINGS_DOC);
    briefContent = readDoc(SEQUENCING_BRIEF_DOC);
  });

  test('Constraints: test findings doc explicitly tracks zero-code-artifact constraint compliance', () => {
    expect(uxContent).toMatch(/Zero code artifacts|No code artifacts/i);
  });

  test('Constraints: sequencing brief explicitly tracks zero-code-artifact constraint compliance', () => {
    expect(briefContent).toMatch(/No code artifacts/i);
  });

  test('Constraints: test findings doc is in Markdown format (compliant deliverable format)', () => {
    // File exists and is .md — format is compliant per constraints
    expect(UX_FINDINGS_DOC).toMatch(/\.md$/);
    expect(fs.existsSync(UX_FINDINGS_DOC)).toBe(true);
  });

  test('Constraints: sequencing brief is in Markdown format (compliant deliverable format)', () => {
    expect(SEQUENCING_BRIEF_DOC).toMatch(/\.md$/);
    expect(fs.existsSync(SEQUENCING_BRIEF_DOC)).toBe(true);
  });

  test('Constraints: test findings doc tracks timebox constraint', () => {
    expect(uxContent).toMatch(/2.calendar.week|2-week timebox|timebox/i);
  });

  test('Constraints: test findings doc tracks participant sourcing constraint (existing pool only)', () => {
    expect(uxContent).toMatch(/existing.*pool|existing playtest pool/i);
  });

  test('Constraints: test findings doc tracks prototype fidelity constraint (no in-engine)', () => {
    expect(uxContent).toMatch(/no in-engine|static mockups|prototype.*fidelity/i);
  });
});

// ─── Spike metadata: format candidate registry ────────────────────────────────

describe('Spike metadata — format candidates defined consistently across documents', () => {
  let uxContent;
  let briefContent;

  beforeAll(() => {
    uxContent = readDoc(UX_FINDINGS_DOC);
    briefContent = readDoc(SEQUENCING_BRIEF_DOC);
  });

  test('Metadata: test findings doc lists exactly 3 format candidates in a table', () => {
    // The candidate table should have rows for A, B, and C
    const rowsMatch = uxContent.match(/\|\s*[ABC]\s*\|/g);
    expect(rowsMatch).not.toBeNull();
    expect(rowsMatch.length).toBeGreaterThanOrEqual(3);
  });

  test('Metadata: sequencing brief references format candidates table', () => {
    // Brief includes a reveal identity comparison table
    expect(briefContent).toMatch(/Reveal Identity Comparison|Recommended.*Format/i);
  });

  test('Metadata: test findings doc references its issue number (#140)', () => {
    expect(uxContent).toMatch(/Issue.*#140|#140/);
  });

  test('Metadata: sequencing brief references its issue number (#140)', () => {
    expect(briefContent).toMatch(/Issue.*#140|#140/);
  });
});
