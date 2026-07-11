/**
 * Tests for Unified Completion Reveal — Wire Cosmetic State into Hero Shot
 * Issue #256
 *
 * Acceptance criteria covered:
 *   AC1  — Player who completed all three cosmetic phases sees distinct visual
 *           acknowledgement of each completed phase in the completion hero shot.
 *   AC2  — Player who skipped all cosmetic phases sees no cosmetic badges —
 *           behavior identical to the current implementation (non-breaking).
 *   AC3  — Player who completed only a subset sees acknowledgement only for
 *           completed phases — partial completion correctly and independently reflected.
 *   AC4  — WatchStateCapture before-snapshot captures cosmetic before-state fields
 *           (strapCondition, crystalCondition, casePolishGrade) alongside existing fields.
 *   AC5  — CompletionRevealSequence.triggerReveal() accepts an optional cosmeticSummary
 *           parameter; when omitted, reveal behaves identically with no regression.
 *
 * Test scenarios mapped to Issue #256:
 *   Scenario 1  — Happy path — full cosmetic completion: all 3 badges in payload.
 *   Scenario 2  — Happy path — no cosmetic work: no badges, identical to pre-feature.
 *   Scenario 3  — Partial — strap only: only strap badge shown.
 *   Scenario 4  — Partial — crystal + case, no strap: crystal + case badges only.
 *   Scenario 5  — Backward compatibility — existing callers with no cosmeticSummary param.
 *   Scenario 6  — WatchStateCapture snapshot integrity: cosmeticBefore captured correctly.
 *   Scenario 7  — Reveal payload completeness: cosmeticSummary in payload when provided.
 *   Scenario 8  — Edge case: getSummaryState() returns null → graceful degradation.
 *   Scenario 9  — Edge case: getSummaryState() throws → graceful degradation, no crash.
 *   Scenario 10 — SharePromptOverlay regression: state machine unaffected by changes.
 */

'use strict';

const { CompletionRevealSequence, REVEAL_EVENTS, COMPLETION_AUDIO_CUES } = require('../../../src/completion/CompletionRevealSequence');
const { CompletionRevealScreen }  = require('../../../src/completion/CompletionRevealScreen');
const { WatchStateCapture }       = require('../../../src/completion/WatchStateCapture');
const { CosmeticRestorationSummary, PHASES } = require('../../../src/cosmetic/CosmeticRestorationSummary');
const { SharePromptOverlay, OVERLAY_STATE }  = require('../../../src/completion/SharePromptOverlay');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSequence(opts = {}) {
  const audioHook     = jest.fn();
  const telemetry     = [];
  const revealPayloads = [];

  const seq = new CompletionRevealSequence({
    audioHook,
    instrumentationHook: (name, payload) => telemetry.push({ name, payload }),
    onReveal: (p) => revealPayloads.push(p),
    ...opts,
  });

  return { seq, audioHook, telemetry, revealPayloads };
}

/** Minimal mechanical before-snapshot (existing shape). */
function makeBeforeSnapshot(overrides = {}) {
  return Object.assign(
    { watchId: 'w-001', watchName: 'Vintage Diver', condition: 'worn', damageState: 'water_ingress' },
    overrides,
  );
}

/** Minimal before-snapshot extended with cosmetic before-state fields (Issue #256 AC4). */
function makeBeforeSnapshotWithCosmetic(cosmeticOverrides = {}) {
  return Object.assign(makeBeforeSnapshot(), {
    cosmeticBefore: Object.assign(
      { strapCondition: 'worn', crystalCondition: 'scratched', casePolishGrade: 'worn' },
      cosmeticOverrides,
    ),
  });
}

/** Minimal after-snapshot. */
function makeAfterSnapshot(overrides = {}) {
  return Object.assign(
    { watchId: 'w-001', condition: 'restored', damageState: null },
    overrides,
  );
}

/** Build a CosmeticRestorationSummary with specified phases completed. */
function makeCosmeticSummary({ strap = false, crystal = false, case: casePhase = false } = {}) {
  const summary = new CosmeticRestorationSummary(jest.fn(), jest.fn());
  if (strap)      summary.markPhaseComplete(PHASES.STRAP);
  if (crystal)    summary.markPhaseComplete(PHASES.CRYSTAL);
  if (casePhase)  summary.markPhaseComplete(PHASES.CASE);
  return summary;
}

// ─── AC1 / Scenario 1 — Full cosmetic completion ─────────────────────────────

describe('AC1 / Scenario 1 — Full cosmetic completion: all three badges in hero shot payload', () => {
  test('payload.cosmeticSummary.strap.complete is true when strap phase done', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.strap.complete).toBe(true);
  });

  test('payload.cosmeticSummary.crystal.complete is true when crystal phase done', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.crystal.complete).toBe(true);
  });

  test('payload.cosmeticSummary.case.complete is true when case phase done', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.case.complete).toBe(true);
  });

  test('payload.cosmeticSummary.isCosmeticallyRestored is true for full completion', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.isCosmeticallyRestored).toBe(true);
  });

  test('payload.cosmeticSummary.strap.displayLabel is "New Strap" (from getSummaryState)', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.strap.displayLabel).toBe('New Strap');
  });

  test('payload.cosmeticSummary.crystal.displayLabel is "Clean Crystal" (from getSummaryState)', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.crystal.displayLabel).toBe('Clean Crystal');
  });

  test('payload.cosmeticSummary.case.displayLabel is "Polished Case" (from getSummaryState)', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.case.displayLabel).toBe('Polished Case');
  });
});

// ─── AC2 / Scenario 2 — No cosmetic work: no badges, backward-compat ─────────

describe('AC2 / Scenario 2 — No cosmetic work: no badges, identical to pre-feature behavior', () => {
  test('payload.cosmeticSummary is null when cosmeticSummary param omitted (AC2/AC5)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());  // no 3rd arg
    expect(revealPayloads[0].cosmeticSummary).toBeNull();
  });

  test('payload.cosmeticSummary is null when null explicitly passed (AC2)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), null);
    expect(revealPayloads[0].cosmeticSummary).toBeNull();
  });

  test('payload.cosmeticSummary.strap.complete is false when no phases completed', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary();  // all phases incomplete

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.strap.complete).toBe(false);
    expect(revealPayloads[0].cosmeticSummary.crystal.complete).toBe(false);
    expect(revealPayloads[0].cosmeticSummary.case.complete).toBe(false);
  });

  test('payload still has fullScreen and fullWatchView true (base reveal intact, AC2)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());

    expect(revealPayloads[0].fullScreen).toBe(true);
    expect(revealPayloads[0].fullWatchView).toBe(true);
  });
});

// ─── AC3 / Scenario 3 — Partial: strap only ───────────────────────────────────

describe('AC3 / Scenario 3 — Partial completion: strap only, no crystal or case badge', () => {
  test('strap.complete is true', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.strap.complete).toBe(true);
  });

  test('crystal.complete is false when crystal phase not done', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.crystal.complete).toBe(false);
  });

  test('case.complete is false when case phase not done', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.case.complete).toBe(false);
  });
});

// ─── AC3 / Scenario 4 — Partial: crystal + case, no strap ────────────────────

describe('AC3 / Scenario 4 — Partial completion: crystal + case, no strap badge', () => {
  test('crystal.complete is true', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.crystal.complete).toBe(true);
  });

  test('case.complete is true', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.case.complete).toBe(true);
  });

  test('strap.complete is false (strap not done)', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.strap.complete).toBe(false);
  });

  test('isCosmeticallyRestored is false (strap missing)', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ crystal: true, case: true });

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].cosmeticSummary.isCosmeticallyRestored).toBe(false);
  });
});

// ─── AC5 / Scenario 5 — Backward compatibility: existing callers ─────────────

describe('AC5 / Scenario 5 — Backward compatibility: existing triggerReveal callers unaffected', () => {
  test('triggerReveal(jobId, after) — no 3rd param — does not throw', () => {
    const { seq } = makeSequence();
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    expect(() => seq.triggerReveal('job-001', makeAfterSnapshot())).not.toThrow();
  });

  test('existing callers: onReveal fires with correct jobId', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].jobId).toBe('job-001');
  });

  test('existing callers: payload.cosmeticSummary is null (no regression)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].cosmeticSummary).toBeNull();
  });

  test('existing callers: audio fanfare still fires (AC3 from #141)', () => {
    const { seq, audioHook } = makeSequence();
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(audioHook).toHaveBeenCalledWith(COMPLETION_AUDIO_CUES.FANFARE);
  });

  test('buildRevealPayload with 3 args (no cosmeticSummary) — no throw', () => {
    const screen = new CompletionRevealScreen();
    expect(() =>
      screen.buildRevealPayload('job-001',
        { watchId: 'w-001', condition: 'worn' },
        { watchId: 'w-001', condition: 'restored' })
    ).not.toThrow();
  });

  test('buildRevealPayload with 3 args returns cosmeticSummary: null', () => {
    const screen  = new CompletionRevealScreen();
    const payload = screen.buildRevealPayload('job-001',
      { watchId: 'w-001', condition: 'worn' },
      { watchId: 'w-001', condition: 'restored' });
    expect(payload.cosmeticSummary).toBeNull();
  });
});

// ─── AC4 / Scenario 6 — WatchStateCapture cosmetic before-state ──────────────

describe('AC4 / Scenario 6 — WatchStateCapture: cosmeticBefore fields captured in before-snapshot', () => {
  test('before-snapshot includes cosmeticBefore.strapCondition', () => {
    const capture = new WatchStateCapture();
    const snapshot = makeBeforeSnapshotWithCosmetic({ strapCondition: 'worn' });
    capture.captureJobStart('job-001', snapshot);
    const before = capture.getBeforeState('job-001');
    expect(before.cosmeticBefore.strapCondition).toBe('worn');
  });

  test('before-snapshot includes cosmeticBefore.crystalCondition', () => {
    const capture = new WatchStateCapture();
    const snapshot = makeBeforeSnapshotWithCosmetic({ crystalCondition: 'scratched' });
    capture.captureJobStart('job-001', snapshot);
    const before = capture.getBeforeState('job-001');
    expect(before.cosmeticBefore.crystalCondition).toBe('scratched');
  });

  test('before-snapshot includes cosmeticBefore.casePolishGrade', () => {
    const capture = new WatchStateCapture();
    const snapshot = makeBeforeSnapshotWithCosmetic({ casePolishGrade: 'worn' });
    capture.captureJobStart('job-001', snapshot);
    const before = capture.getBeforeState('job-001');
    expect(before.cosmeticBefore.casePolishGrade).toBe('worn');
  });

  test('cosmeticBefore after-state fields captured correctly at job end (via payload)', () => {
    const { seq, revealPayloads } = makeSequence();
    const snapshot = makeBeforeSnapshotWithCosmetic({ strapCondition: 'original' });
    seq.prepareForJob('job-001', snapshot);
    seq.triggerReveal('job-001', makeAfterSnapshot());

    expect(revealPayloads[0].beforeState.cosmeticBefore.strapCondition).toBe('original');
  });

  test('existing before-snapshot fields (watchId, condition) still captured alongside cosmeticBefore (AC4)', () => {
    const capture = new WatchStateCapture();
    const snapshot = makeBeforeSnapshotWithCosmetic();
    capture.captureJobStart('job-001', snapshot);
    const before = capture.getBeforeState('job-001');
    expect(before.watchId).toBe('w-001');
    expect(before.condition).toBe('worn');
    expect(before.cosmeticBefore).toBeDefined();
  });
});

// ─── Scenario 7 — Reveal payload completeness ────────────────────────────────

describe('Scenario 7 — Reveal payload completeness: cosmeticSummary included / excluded correctly', () => {
  test('cosmeticSummary present in payload when provided', () => {
    const screen  = new CompletionRevealScreen();
    const cosmetic = makeCosmeticSummary({ strap: true });
    const payload = screen.buildRevealPayload('job-001',
      { watchId: 'w-001' }, { watchId: 'w-001' },
      cosmetic.getSummaryState());
    expect(payload.cosmeticSummary).not.toBeNull();
    expect(payload.cosmeticSummary.strap.complete).toBe(true);
  });

  test('cosmeticSummary null in payload when not provided (backward-compat)', () => {
    const screen  = new CompletionRevealScreen();
    const payload = screen.buildRevealPayload('job-001',
      { watchId: 'w-001' }, { watchId: 'w-001' });
    expect(payload.cosmeticSummary).toBeNull();
  });

  test('cosmeticSummary in payload is a copy (immutable — no reference leak)', () => {
    const screen   = new CompletionRevealScreen();
    const state    = makeCosmeticSummary({ strap: true }).getSummaryState();
    const payload  = screen.buildRevealPayload('job-001',
      { watchId: 'w-001' }, { watchId: 'w-001' }, state);
    // Mutate the payload copy — original state must be unaffected
    payload.cosmeticSummary.strap.complete = false;
    expect(state.strap.complete).toBe(true);
  });

  test('payload still has jobId, fullScreen, fullWatchView when cosmeticSummary provided', () => {
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    expect(revealPayloads[0].jobId).toBe('job-001');
    expect(revealPayloads[0].fullScreen).toBe(true);
    expect(revealPayloads[0].fullWatchView).toBe(true);
  });
});

// ─── Scenario 8 — Edge case: getSummaryState() returns null ──────────────────

describe('Scenario 8 — Edge case: getSummaryState() returns null → graceful degradation', () => {
  test('hero shot renders without badges when getSummaryState() returns null', () => {
    const { seq, revealPayloads } = makeSequence();
    const badSummary = { getSummaryState: () => null };  // returns null

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    expect(() => seq.triggerReveal('job-001', makeAfterSnapshot(), badSummary)).not.toThrow();
    expect(revealPayloads[0].cosmeticSummary).toBeNull();
  });

  test('base reveal (fullScreen, fullWatchView, afterState) still renders when getSummaryState() returns null', () => {
    const { seq, revealPayloads } = makeSequence();
    const badSummary = { getSummaryState: () => null };

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), badSummary);

    expect(revealPayloads[0].fullScreen).toBe(true);
    expect(revealPayloads[0].afterState).toBeDefined();
  });
});

// ─── Scenario 9 — Edge case: getSummaryState() throws ───────────────────────

describe('Scenario 9 — Edge case: getSummaryState() throws → no crash, graceful degradation', () => {
  test('no exception propagated when getSummaryState() throws', () => {
    const { seq } = makeSequence();
    const throwingSummary = { getSummaryState: () => { throw new Error('DB unavailable'); } };

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    expect(() => seq.triggerReveal('job-001', makeAfterSnapshot(), throwingSummary)).not.toThrow();
  });

  test('payload.cosmeticSummary is null when getSummaryState() throws', () => {
    const { seq, revealPayloads } = makeSequence();
    const throwingSummary = { getSummaryState: () => { throw new Error('DB unavailable'); } };

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), throwingSummary);

    expect(revealPayloads[0].cosmeticSummary).toBeNull();
  });

  test('onReveal fires (base reveal not blocked) when getSummaryState() throws', () => {
    const { seq, revealPayloads } = makeSequence();
    const throwingSummary = { getSummaryState: () => { throw new Error('network error'); } };

    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), throwingSummary);

    expect(revealPayloads).toHaveLength(1);
  });
});

// ─── Scenario 10 — SharePromptOverlay regression ─────────────────────────────

describe('Scenario 10 — SharePromptOverlay regression: state machine unaffected', () => {
  test('SharePromptOverlay constructs and starts HIDDEN', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.getState()).toBe(OVERLAY_STATE.HIDDEN);
  });

  test('SharePromptOverlay HIDDEN → VISIBLE on show()', () => {
    const overlay = new SharePromptOverlay();
    const result  = overlay.show();
    expect(result).toBe(true);
    expect(overlay.getState()).toBe(OVERLAY_STATE.VISIBLE);
  });

  test('SharePromptOverlay VISIBLE → DISMISSED on dismiss()', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    const result = overlay.dismiss();
    expect(result).toBe(true);
    expect(overlay.getState()).toBe(OVERLAY_STATE.DISMISSED);
  });

  test('SharePromptOverlay show() no-op when already VISIBLE', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    expect(overlay.show()).toBe(false);
  });

  test('SharePromptOverlay dismiss() no-op when already DISMISSED', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.dismiss();
    expect(overlay.dismiss()).toBe(false);
  });

  test('SharePromptOverlay isVisible() reflects current state', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.isVisible()).toBe(false);
    overlay.show();
    expect(overlay.isVisible()).toBe(true);
    overlay.dismiss();
    expect(overlay.isVisible()).toBe(false);
  });

  test('SharePromptOverlay screenAreaPercent does not exceed 15% (Constraint)', () => {
    const overlay = new SharePromptOverlay({ screenAreaPercent: 15 });
    expect(overlay.getScreenAreaPercent()).toBeLessThanOrEqual(15);
  });

  test('SharePromptOverlay overlapsComparison is false (Constraint)', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.getOverlapsComparison()).toBe(false);
  });

  test('SharePromptOverlay getViewModel() returns correct fields', () => {
    const overlay = new SharePromptOverlay({ copyKey: 'capture_moment' });
    const vm      = overlay.getViewModel();
    expect(vm.state).toBe(OVERLAY_STATE.HIDDEN);
    expect(vm.isVisible).toBe(false);
    expect(vm.copyKey).toBe('capture_moment');
  });

  test('SharePromptOverlay: cosmeticSummary in hero shot payload has no effect on overlay state', () => {
    // Simulate the full flow: reveal with cosmetic summary, then show overlay
    const { seq, revealPayloads } = makeSequence();
    const cosmetic = makeCosmeticSummary({ strap: true, crystal: true, case: true });
    seq.prepareForJob('job-001', makeBeforeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot(), cosmetic);

    // Overlay is a separate module — its state is independent of payload content
    const overlay = new SharePromptOverlay();
    overlay.show();
    expect(overlay.isVisible()).toBe(true);
    expect(revealPayloads[0].cosmeticSummary).not.toBeNull();  // payload has cosmetic data
  });
});
