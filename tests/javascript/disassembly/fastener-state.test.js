/**
 * Tests for FastenerState.js and DisassemblyFlow — Issue #84.
 *
 * Acceptance Criteria covered:
 *   AC2: Given a watch with Rust-Fused Fasteners state, when the player attempts standard
 *        disassembly, then fused fasteners resist removal and the game surfaces a contextual
 *        cue indicating specialised extraction is required.
 *   AC5 (Test Scenario 5 — no softlock): Player attempts to skip penetrant step and force
 *        extraction → game surfaces soft warning → player can apply penetrant and retry.
 *   Test Scenario 2 (Happy path): penetrant → extractor → disassembly sequence works end-to-end.
 */

'use strict';

const { FastenerState, DisassemblyFlow, VALID_FASTENER_STATES } = require('../../../src/disassembly/FastenerState');

// ─── FastenerState enum ───────────────────────────────────────────────────────

describe('FastenerState — enum values', () => {
  test('FastenerState has exactly 4 values: standard, fused, treated, extracted', () => {
    expect(FastenerState.STANDARD).toBe('standard');
    expect(FastenerState.FUSED).toBe('fused');
    expect(FastenerState.TREATED).toBe('treated');
    expect(FastenerState.EXTRACTED).toBe('extracted');
  });

  test('VALID_FASTENER_STATES contains all 4 enum values', () => {
    expect(VALID_FASTENER_STATES).toContain('standard');
    expect(VALID_FASTENER_STATES).toContain('fused');
    expect(VALID_FASTENER_STATES).toContain('treated');
    expect(VALID_FASTENER_STATES).toContain('extracted');
    expect(VALID_FASTENER_STATES).toHaveLength(4);
  });

  test('FastenerState is frozen (immutable)', () => {
    expect(() => { FastenerState.NEW_STATE = 'new'; }).toThrow();
  });
});

// ─── AC2: canRemoveFastener — fused fasteners block standard disassembly ─────

describe('DisassemblyFlow — AC2: canRemoveFastener blocks fused fasteners', () => {
  const flow = new DisassemblyFlow();

  test('canRemoveFastener returns true for standard fasteners', () => {
    expect(flow.canRemoveFastener(FastenerState.STANDARD)).toBe(true);
  });

  test('canRemoveFastener returns false for fused fasteners (AC2: blocked)', () => {
    expect(flow.canRemoveFastener(FastenerState.FUSED)).toBe(false);
  });

  test('canRemoveFastener returns false for treated fasteners (not yet extracted)', () => {
    expect(flow.canRemoveFastener(FastenerState.TREATED)).toBe(false);
  });

  test('canRemoveFastener returns true for extracted fasteners', () => {
    expect(flow.canRemoveFastener(FastenerState.EXTRACTED)).toBe(true);
  });
});

// ─── AC2: isDisassemblyBlocked — any fused fastener blocks the full disassembly ──

describe('DisassemblyFlow — AC2: isDisassemblyBlocked', () => {
  const flow = new DisassemblyFlow();

  test('all standard fasteners — disassembly NOT blocked', () => {
    expect(flow.isDisassemblyBlocked({
      screw_a: FastenerState.STANDARD,
      screw_b: FastenerState.STANDARD,
    })).toBe(false);
  });

  test('one fused fastener — disassembly IS blocked (AC2)', () => {
    expect(flow.isDisassemblyBlocked({
      screw_a: FastenerState.STANDARD,
      screw_b: FastenerState.FUSED,
    })).toBe(true);
  });

  test('all fused fasteners — disassembly IS blocked', () => {
    expect(flow.isDisassemblyBlocked({
      screw_a: FastenerState.FUSED,
      screw_b: FastenerState.FUSED,
    })).toBe(true);
  });

  test('all extracted fasteners — disassembly NOT blocked', () => {
    expect(flow.isDisassemblyBlocked({
      screw_a: FastenerState.EXTRACTED,
      screw_b: FastenerState.EXTRACTED,
    })).toBe(false);
  });

  test('treated but not extracted — disassembly still blocked', () => {
    expect(flow.isDisassemblyBlocked({
      screw_a: FastenerState.TREATED,
    })).toBe(true);
  });
});

// ─── AC2: getBlockedDisassemblyCue — contextual cue surface on blockage ──────

describe('DisassemblyFlow — AC2: getBlockedDisassemblyCue surfaces contextual cue', () => {
  const flow = new DisassemblyFlow();

  test('returns a non-null string when any fastener is fused (AC2)', () => {
    const cue = flow.getBlockedDisassemblyCue({ screw_a: FastenerState.FUSED });
    expect(typeof cue).toBe('string');
    expect(cue.length).toBeGreaterThan(0);
  });

  test('contextual cue mentions penetrant (guides player to correct tool)', () => {
    const cue = flow.getBlockedDisassemblyCue({ screw_a: FastenerState.FUSED });
    expect(cue.toLowerCase()).toMatch(/penetrant/);
  });

  test('contextual cue mentions the number of fused fasteners', () => {
    const cue = flow.getBlockedDisassemblyCue({
      screw_a: FastenerState.FUSED,
      screw_b: FastenerState.FUSED,
    });
    expect(cue).toMatch(/2 fasteners/);
  });

  test('returns null when no fasteners are fused', () => {
    const cue = flow.getBlockedDisassemblyCue({
      screw_a: FastenerState.STANDARD,
      screw_b: FastenerState.EXTRACTED,
    });
    expect(cue).toBeNull();
  });
});

// ─── applyPenetrant — fused → treated transition ─────────────────────────────

describe('DisassemblyFlow — applyPenetrant: fused → treated', () => {
  const flow = new DisassemblyFlow();

  test('applyPenetrant transitions FUSED to TREATED', () => {
    expect(flow.applyPenetrant(FastenerState.FUSED)).toBe(FastenerState.TREATED);
  });

  test('applyPenetrant is a no-op on STANDARD', () => {
    expect(flow.applyPenetrant(FastenerState.STANDARD)).toBe(FastenerState.STANDARD);
  });

  test('applyPenetrant is a no-op on already TREATED', () => {
    expect(flow.applyPenetrant(FastenerState.TREATED)).toBe(FastenerState.TREATED);
  });

  test('applyPenetrant is a no-op on EXTRACTED', () => {
    expect(flow.applyPenetrant(FastenerState.EXTRACTED)).toBe(FastenerState.EXTRACTED);
  });
});

// ─── applyExtractor — treated → extracted transition ─────────────────────────

describe('DisassemblyFlow — applyExtractor: treated → extracted', () => {
  const flow = new DisassemblyFlow();

  test('applyExtractor transitions TREATED to EXTRACTED with no warning', () => {
    const result = flow.applyExtractor(FastenerState.TREATED);
    expect(result.newState).toBe(FastenerState.EXTRACTED);
    expect(result.warning).toBeNull();
  });

  test('applyExtractor on STANDARD returns no-op with no warning', () => {
    const result = flow.applyExtractor(FastenerState.STANDARD);
    expect(result.newState).toBe(FastenerState.STANDARD);
    expect(result.warning).toBeNull();
  });

  test('applyExtractor on EXTRACTED returns no-op with no warning', () => {
    const result = flow.applyExtractor(FastenerState.EXTRACTED);
    expect(result.newState).toBe(FastenerState.EXTRACTED);
    expect(result.warning).toBeNull();
  });
});

// ─── AC5 / Test Scenario 5: No-softlock — skip penetrant, force extraction ───

describe('DisassemblyFlow — AC5/Scenario 5: no-softlock — skip penetrant soft warning', () => {
  const flow = new DisassemblyFlow();

  test('applyExtractor on FUSED returns warning (no-softlock: player alerted)', () => {
    const result = flow.applyExtractor(FastenerState.FUSED);
    expect(typeof result.warning).toBe('string');
    expect(result.warning.length).toBeGreaterThan(0);
  });

  test('warning mentions penetrant (guides player to correct next step)', () => {
    const result = flow.applyExtractor(FastenerState.FUSED);
    expect(result.warning.toLowerCase()).toMatch(/penetrant/);
  });

  test('fastener remains FUSED after failed extraction attempt (path stays open)', () => {
    const result = flow.applyExtractor(FastenerState.FUSED);
    expect(result.newState).toBe(FastenerState.FUSED);
  });

  test('after receiving warning, player can apply penetrant and then extract', () => {
    // No-softlock: full path remains open even after failed extraction
    let state = FastenerState.FUSED;
    const failResult = flow.applyExtractor(state);
    expect(failResult.warning).not.toBeNull();
    expect(failResult.newState).toBe(FastenerState.FUSED); // still fused

    state = flow.applyPenetrant(failResult.newState);      // apply penetrant
    expect(state).toBe(FastenerState.TREATED);

    const successResult = flow.applyExtractor(state);      // now extract
    expect(successResult.newState).toBe(FastenerState.EXTRACTED);
    expect(successResult.warning).toBeNull();
  });
});

// ─── Test Scenario 2 (Happy path): full penetrant → extractor end-to-end ─────

describe('DisassemblyFlow — Scenario 2: happy path rust-fused repair sequence', () => {
  const flow = new DisassemblyFlow();

  test('full sequence: fused → penetrant → treated → extractor → extracted', () => {
    let state = FastenerState.FUSED;

    expect(flow.canRemoveFastener(state)).toBe(false);
    expect(flow.getBlockedDisassemblyCue({ screw_a: state })).not.toBeNull();

    state = flow.applyPenetrant(state);
    expect(state).toBe(FastenerState.TREATED);
    expect(flow.isDisassemblyBlocked({ screw_a: state })).toBe(true); // still blocked until extracted

    const result = flow.applyExtractor(state);
    expect(result.newState).toBe(FastenerState.EXTRACTED);
    expect(result.warning).toBeNull();

    expect(flow.areAllFastenersCleared({ screw_a: result.newState })).toBe(true);
  });

  test('applyPenetrantToAll transitions all fused fasteners to treated', () => {
    const map = {
      screw_a: FastenerState.FUSED,
      screw_b: FastenerState.FUSED,
      screw_c: FastenerState.STANDARD,
    };
    const updated = flow.applyPenetrantToAll(map);
    expect(updated.screw_a).toBe(FastenerState.TREATED);
    expect(updated.screw_b).toBe(FastenerState.TREATED);
    expect(updated.screw_c).toBe(FastenerState.STANDARD); // standard unchanged
  });

  test('applyExtractorToAll transitions all treated fasteners to extracted', () => {
    const map = {
      screw_a: FastenerState.TREATED,
      screw_b: FastenerState.TREATED,
    };
    const { updatedMap, warnings } = flow.applyExtractorToAll(map);
    expect(updatedMap.screw_a).toBe(FastenerState.EXTRACTED);
    expect(updatedMap.screw_b).toBe(FastenerState.EXTRACTED);
    expect(warnings).toHaveLength(0);
  });

  test('getPendingFastenerIds returns IDs of fused + treated fasteners', () => {
    const map = {
      screw_a: FastenerState.FUSED,
      screw_b: FastenerState.TREATED,
      screw_c: FastenerState.EXTRACTED,
    };
    const pending = flow.getPendingFastenerIds(map);
    expect(pending).toContain('screw_a');
    expect(pending).toContain('screw_b');
    expect(pending).not.toContain('screw_c');
  });
});

// ─── validateFastenerState ────────────────────────────────────────────────────

describe('DisassemblyFlow — validateFastenerState defensive guard', () => {
  const flow = new DisassemblyFlow();

  test.each(VALID_FASTENER_STATES)('valid state "%s" does not throw', (state) => {
    expect(() => flow.validateFastenerState(state)).not.toThrow();
    expect(flow.validateFastenerState(state)).toBe(state);
  });

  test('unknown state throws error', () => {
    expect(() => flow.validateFastenerState('rusted')).toThrow(/unknown state/i);
  });
});
