/**
 * Tests for StrapBeforeAfterDisplay.js — Issue #143, AC3
 *
 * Acceptance Criterion 3:
 *   Given a player has applied a new strap, when the before/after display is
 *   triggered, then both the original worn strap state and the newly applied
 *   strap state are shown in the same screen (split-view or sequential), and
 *   the player can identify the visual difference clearly.
 *
 * Test Scenario 8 (Before/after legibility):
 *   Before and after states are visually distinguishable (hasChange: true when
 *   a different strap is applied).
 *
 * Covers:
 *   - captureBeforeState() stores a before snapshot
 *   - buildPayload() returns a payload with before, after, displayMode, hasChange, phaseId
 *   - hasChange: true when assetKeys differ, false when same (no-op swap)
 *   - displayMode defaults to side_by_side
 *   - sequential_reveal display mode respected
 *   - Invalid snapshot throws an error
 *   - buildPayload() returns null if captureBeforeState not yet called
 *   - getBeforeSnapshot() returns copy (no aliasing)
 *   - Generic interface — phaseId is customisable for Phase 2/3 reuse
 */

'use strict';

const {
  StrapBeforeAfterDisplay,
  VALID_DISPLAY_MODES,
  DEFAULT_DISPLAY_MODE,
} = require('../../src/cosmetic/StrapBeforeAfterDisplay');

const WORN_SNAPSHOT = {
  assetKey: 'strap_worn_original',
  label: 'Original (Worn)',
  description: 'The original aged strap.',
};

const NEW_STRAP_SNAPSHOT = {
  assetKey: 'strap_leather_black',
  label: 'Leather — Jet Black',
  description: 'Formal jet-black leather.',
};

// ─── AC3: buildPayload produces required fields ────────────────────────────

describe('StrapBeforeAfterDisplay — AC3: buildPayload fields', () => {
  test('buildPayload() returns a non-null payload after captureBeforeState', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload).not.toBeNull();
  });

  test('payload has a before field', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload.before).toBeDefined();
    expect(payload.before.assetKey).toBe(WORN_SNAPSHOT.assetKey);
  });

  test('payload has an after field', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload.after).toBeDefined();
    expect(payload.after.assetKey).toBe(NEW_STRAP_SNAPSHOT.assetKey);
  });

  test('payload.displayMode defaults to side_by_side', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload.displayMode).toBe('side_by_side');
  });

  test('payload.phaseId defaults to "strap"', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload.phaseId).toBe('strap');
  });

  test('payload has hasChange field', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(typeof payload.hasChange).toBe('boolean');
  });
});

// ─── AC3: hasChange correctly signals visual difference ───────────────────

describe('StrapBeforeAfterDisplay — AC3: hasChange reflects visual difference', () => {
  test('hasChange is true when before and after assetKeys differ', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload.hasChange).toBe(true);
  });

  test('hasChange is false when before and after assetKeys are the same (no-op)', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(WORN_SNAPSHOT); // same strap — no change
    expect(payload.hasChange).toBe(false);
  });
});

// ─── Display mode ─────────────────────────────────────────────────────────

describe('StrapBeforeAfterDisplay — display mode', () => {
  test('sequential_reveal displayMode is respected', () => {
    const d = new StrapBeforeAfterDisplay({ displayMode: 'sequential_reveal' });
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload.displayMode).toBe('sequential_reveal');
  });

  test('unknown displayMode falls back to side_by_side', () => {
    const d = new StrapBeforeAfterDisplay({ displayMode: 'explode_view' });
    d.captureBeforeState(WORN_SNAPSHOT);
    const payload = d.buildPayload(NEW_STRAP_SNAPSHOT);
    expect(payload.displayMode).toBe('side_by_side');
  });

  test('VALID_DISPLAY_MODES includes side_by_side and sequential_reveal', () => {
    expect(VALID_DISPLAY_MODES).toContain('side_by_side');
    expect(VALID_DISPLAY_MODES).toContain('sequential_reveal');
  });

  test('DEFAULT_DISPLAY_MODE is side_by_side', () => {
    expect(DEFAULT_DISPLAY_MODE).toBe('side_by_side');
  });
});

// ─── Defensive: no before state captured ─────────────────────────────────

describe('StrapBeforeAfterDisplay — defensive: before state not captured', () => {
  test('buildPayload() returns null if captureBeforeState was never called', () => {
    const d = new StrapBeforeAfterDisplay();
    expect(d.buildPayload(NEW_STRAP_SNAPSHOT)).toBeNull();
  });

  test('isReady() returns false before captureBeforeState', () => {
    const d = new StrapBeforeAfterDisplay();
    expect(d.isReady()).toBe(false);
  });

  test('isReady() returns true after captureBeforeState', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    expect(d.isReady()).toBe(true);
  });
});

// ─── Snapshot validation ──────────────────────────────────────────────────

describe('StrapBeforeAfterDisplay — snapshot validation', () => {
  test('captureBeforeState throws for missing assetKey', () => {
    const d = new StrapBeforeAfterDisplay();
    expect(() => d.captureBeforeState({ label: 'No key', description: '' })).toThrow();
  });

  test('captureBeforeState throws for empty assetKey', () => {
    const d = new StrapBeforeAfterDisplay();
    expect(() => d.captureBeforeState({ assetKey: '', label: 'x', description: '' })).toThrow();
  });

  test('buildPayload throws for invalid after snapshot', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    expect(() => d.buildPayload({ assetKey: '', label: 'x', description: '' })).toThrow();
  });
});

// ─── getBeforeSnapshot() returns a copy ───────────────────────────────────

describe('StrapBeforeAfterDisplay — getBeforeSnapshot() isolation', () => {
  test('returns null before captureBeforeState', () => {
    const d = new StrapBeforeAfterDisplay();
    expect(d.getBeforeSnapshot()).toBeNull();
  });

  test('returns a copy of the snapshot — mutation does not affect stored state', () => {
    const d = new StrapBeforeAfterDisplay();
    d.captureBeforeState(WORN_SNAPSHOT);
    const snapshot = d.getBeforeSnapshot();
    snapshot.assetKey = 'mutated';
    expect(d.getBeforeSnapshot().assetKey).toBe(WORN_SNAPSHOT.assetKey);
  });
});

// ─── Generic interface (Phase 2 / Phase 3 reuse) ─────────────────────────

describe('StrapBeforeAfterDisplay — generic interface: phaseId customisation', () => {
  test('phaseId "crystal" is passed through to payload (Phase 2 reuse)', () => {
    const d = new StrapBeforeAfterDisplay({ phaseId: 'crystal' });
    d.captureBeforeState({ assetKey: 'crystal_cracked', label: 'Cracked Crystal', description: '' });
    const payload = d.buildPayload({ assetKey: 'crystal_new', label: 'New Crystal', description: '' });
    expect(payload.phaseId).toBe('crystal');
  });

  test('phaseId "case" is passed through to payload (Phase 3 reuse)', () => {
    const d = new StrapBeforeAfterDisplay({ phaseId: 'case' });
    d.captureBeforeState({ assetKey: 'case_scratched', label: 'Scratched Case', description: '' });
    const payload = d.buildPayload({ assetKey: 'case_polished', label: 'Polished Case', description: '' });
    expect(payload.phaseId).toBe('case');
  });
});
