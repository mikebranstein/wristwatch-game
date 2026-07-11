/**
 * Tests for CompletionRevealSequence — top-level orchestrator (Issue #141)
 *
 * Acceptance criteria covered:
 *   AC1  — reveal triggers automatically at job-complete (triggerReveal).
 *   AC2  — payload fullScreen=true, fullWatchView=true (AC2).
 *   AC3  — completion audio fanfare fires on triggerReveal.
 *   AC4  — before-state captured once at job-start; mid-repair no-op.
 *   AC5  — dismiss() unblocks game flow; abort() stops audio cleanly.
 *
 * Test scenarios mapped to Issue #141:
 *   Scenario 1  — Happy path: full sequence fires correctly.
 *   Scenario 3  — State accuracy: mid-repair capture rejected; before = job-start snapshot.
 *   Scenario 4  — Multiple consecutive jobs: each reveal uses correct isolated state.
 *   Scenario 5  — Abandoned job: abandonJob() clears state; no bleed to next reveal.
 *   Scenario 6  — Reveal is dismissable: dismiss() invokes hook, clears reveal.
 *   Scenario 8  — Minimal-damage: reveal fires even with subtle contrast.
 */

'use strict';

const { CompletionRevealSequence, REVEAL_EVENTS, COMPLETION_AUDIO_CUES } = require('../../../src/completion/CompletionRevealSequence');
const { COMPLETION_AUDIO_STATE } = require('../../../src/completion/CompletionRevealAudioController');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSequence(opts = {}) {
  const audioHook = jest.fn();
  const telemetry = [];
  const revealPayloads = [];
  const dismissCalls = [];
  const abortCalls = [];

  const seq = new CompletionRevealSequence({
    audioHook,
    instrumentationHook: (name, payload) => telemetry.push({ name, payload }),
    onReveal:  (p) => revealPayloads.push(p),
    onDismiss: (d) => dismissCalls.push(d),
    onAbort:   (a) => abortCalls.push(a),
    ...opts,
  });

  return { seq, audioHook, telemetry, revealPayloads, dismissCalls, abortCalls };
}

function makeSnapshot(overrides = {}) {
  return Object.assign({ watchId: 'w-001', condition: 'worn', damageState: 'water_ingress' }, overrides);
}

function makeAfterSnapshot(overrides = {}) {
  return Object.assign({ watchId: 'w-001', condition: 'restored', damageState: null }, overrides);
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('CompletionRevealSequence — construction', () => {
  test('constructs without errors', () => {
    expect(() => makeSequence()).not.toThrow();
  });

  test('exposes state capture accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getStateCapture()).toBeDefined();
  });

  test('exposes reveal screen accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getRevealScreen()).toBeDefined();
  });

  test('exposes audio controller accessor', () => {
    const { seq } = makeSequence();
    expect(seq.getAudioController()).toBeDefined();
  });
});

// ─── Scenario 1 — Happy path ─────────────────────────────────────────────────

describe('Scenario 1 — Happy path: prepareForJob → triggerReveal → reveal fires (AC1-AC4)', () => {
  test('prepareForJob() returns true on first call', () => {
    const { seq } = makeSequence();
    expect(seq.prepareForJob('job-001', makeSnapshot())).toBe(true);
  });

  test('triggerReveal() invokes onReveal hook with payload', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads).toHaveLength(1);
  });

  test('onReveal payload has correct jobId', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].jobId).toBe('job-001');
  });

  test('payload fullScreen is true (AC2)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].fullScreen).toBe(true);
  });

  test('payload fullWatchView is true (AC2 — whole watch, not parts)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].fullWatchView).toBe(true);
  });

  test('audio fanfare fires on triggerReveal (AC3)', () => {
    const { seq, audioHook } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(audioHook).toHaveBeenCalledWith(COMPLETION_AUDIO_CUES.FANFARE);
  });

  test('isRevealActive() is true after triggerReveal', () => {
    const { seq } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(seq.isRevealActive('job-001')).toBe(true);
  });

  test('REVEAL_TRIGGERED telemetry emitted', () => {
    const { seq, telemetry } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    const event = telemetry.find(e => e.name === REVEAL_EVENTS.REVEAL_TRIGGERED);
    expect(event).toBeDefined();
    expect(event.payload.jobId).toBe('job-001');
  });
});

// ─── Scenario 3 — State accuracy: before-state = job-start snapshot (AC4) ────

describe('Scenario 3 — State accuracy: before-state reflects job-start, not mid-repair (AC4)', () => {
  test('payload beforeState matches job-start snapshot (not mid-repair attempt)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot({ condition: 'heavy damage' }));
    // Mid-repair overwrite attempt — should be rejected
    seq.prepareForJob('job-001', makeSnapshot({ condition: 'mid-repair state' }));
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].beforeState.condition).toBe('heavy damage');
  });

  test('payload beforeAvailable is true (before-state captured at job-start)', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].beforeAvailable).toBe(true);
  });

  test('payload beforeAvailable is false when no prepareForJob was called', () => {
    const { seq, revealPayloads } = makeSequence();
    // No prepareForJob — no before-state available (pre-feature / crash recovery)
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads[0].beforeAvailable).toBe(false);
  });
});

// ─── Scenario 4 — Multiple consecutive jobs ───────────────────────────────────

describe('Scenario 4 — Multiple consecutive jobs: each reveal isolated (AC4)', () => {
  test('each job reveal carries its own before-state', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot({ condition: 'damaged-001' }));
    seq.prepareForJob('job-002', makeSnapshot({ condition: 'damaged-002' }));
    seq.triggerReveal('job-001', makeAfterSnapshot({ watchId: 'w-001' }));
    seq.triggerReveal('job-002', makeAfterSnapshot({ watchId: 'w-002' }));
    expect(revealPayloads[0].beforeState.condition).toBe('damaged-001');
    expect(revealPayloads[1].beforeState.condition).toBe('damaged-002');
  });

  test('three consecutive jobs each fire their own reveals', () => {
    const { seq, revealPayloads } = makeSequence();
    for (let i = 1; i <= 3; i++) {
      seq.prepareForJob(`job-00${i}`, makeSnapshot({ condition: `damage-${i}` }));
      seq.triggerReveal(`job-00${i}`, makeAfterSnapshot());
    }
    expect(revealPayloads).toHaveLength(3);
    expect(revealPayloads[0].beforeState.condition).toBe('damage-1');
    expect(revealPayloads[2].beforeState.condition).toBe('damage-3');
  });
});

// ─── Scenario 5 — Abandoned job: abandonJob() clears state ───────────────────

describe('Scenario 5 — Abandoned job: abandonJob() prevents before-state bleed', () => {
  test('hasBeforeState() is false after abandonJob()', () => {
    const { seq } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.abandonJob('job-001');
    expect(seq.hasBeforeState('job-001')).toBe(false);
  });

  test('reveal for new job after abandon shows no before-state bleed', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot({ condition: 'abandoned-job-damage' }));
    seq.abandonJob('job-001');
    // New job
    seq.prepareForJob('job-002', makeSnapshot({ condition: 'new-job-damage' }));
    seq.triggerReveal('job-002', makeAfterSnapshot());
    expect(revealPayloads[0].beforeState.condition).toBe('new-job-damage');
  });

  test('JOB_ABANDONED telemetry emitted', () => {
    const { seq, telemetry } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.abandonJob('job-001');
    const event = telemetry.find(e => e.name === REVEAL_EVENTS.JOB_ABANDONED);
    expect(event).toBeDefined();
    expect(event.payload.jobId).toBe('job-001');
  });
});

// ─── Scenario 6 — Reveal is dismissable (AC5) ────────────────────────────────

describe('Scenario 6 — Reveal is dismissable: dismiss() clears state (AC5)', () => {
  test('dismiss() invokes onDismiss hook', () => {
    const { seq, dismissCalls } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.dismiss('job-001');
    expect(dismissCalls).toHaveLength(1);
    expect(dismissCalls[0].jobId).toBe('job-001');
  });

  test('isRevealActive() is false after dismiss()', () => {
    const { seq } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.dismiss('job-001');
    expect(seq.isRevealActive('job-001')).toBe(false);
  });

  test('dismiss() fires stop_all audio cue (no orphaned audio, AC5)', () => {
    const { seq, audioHook } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.dismiss('job-001');
    expect(audioHook).toHaveBeenCalledWith(COMPLETION_AUDIO_CUES.STOP_ALL);
  });

  test('REVEAL_DISMISSED telemetry emitted', () => {
    const { seq, telemetry } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.dismiss('job-001');
    const event = telemetry.find(e => e.name === REVEAL_EVENTS.REVEAL_DISMISSED);
    expect(event).toBeDefined();
    expect(event.payload.jobId).toBe('job-001');
  });
});

// ─── abort() ─────────────────────────────────────────────────────────────────

describe('abort() — emergency stop: audio stopped, onAbort called', () => {
  test('abort() fires stop_all audio cue', () => {
    const { seq, audioHook } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.abort();
    expect(audioHook).toHaveBeenCalledWith(COMPLETION_AUDIO_CUES.STOP_ALL);
  });

  test('abort() invokes onAbort hook', () => {
    const { seq, abortCalls } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.abort();
    expect(abortCalls).toHaveLength(1);
  });

  test('abort() clears all active reveals', () => {
    const { seq } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.abort();
    expect(seq.isRevealActive('job-001')).toBe(false);
  });

  test('REVEAL_ABORTED telemetry emitted', () => {
    const { seq, telemetry } = makeSequence();
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    seq.abort();
    const event = telemetry.find(e => e.name === REVEAL_EVENTS.REVEAL_ABORTED);
    expect(event).toBeDefined();
  });
});

// ─── Scenario 8 — Minimal-damage job ─────────────────────────────────────────

describe('Scenario 8 — Minimal-damage job: reveal fires even with subtle contrast', () => {
  test('reveal fires for a lightly damaged watch', () => {
    const { seq, revealPayloads } = makeSequence();
    seq.prepareForJob('job-lite', makeSnapshot({ condition: 'light wear', damageState: null }));
    seq.triggerReveal('job-lite', makeAfterSnapshot({ condition: 'polished' }));
    expect(revealPayloads).toHaveLength(1);
    expect(revealPayloads[0].jobId).toBe('job-lite');
  });
});

// ─── saveState integration ────────────────────────────────────────────────────

describe('saveState integration — before/after persisted (Constraint: existing save system)', () => {
  function makeSaveState() {
    const store = {};
    return {
      get: (k) => store[k],
      set: (k, v) => { store[k] = v; },
      store,
    };
  }

  test('before-state is persisted to saveState on prepareForJob()', () => {
    const saveState = makeSaveState();
    const { seq } = makeSequence({ saveState });
    seq.prepareForJob('job-001', makeSnapshot({ condition: 'at-intake' }));
    const captures = saveState.get('job_state_captures');
    expect(captures['job-001'].before.condition).toBe('at-intake');
  });

  test('after-state is persisted to saveState on triggerReveal()', () => {
    const saveState = makeSaveState();
    const { seq } = makeSequence({ saveState });
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot({ condition: 'at-complete' }));
    const captures = saveState.get('job_state_captures');
    expect(captures['job-001'].after.condition).toBe('at-complete');
  });

  test('persisted captures for different jobs are independent', () => {
    const saveState = makeSaveState();
    const { seq } = makeSequence({ saveState });
    seq.prepareForJob('job-001', makeSnapshot({ condition: 'damage-A' }));
    seq.prepareForJob('job-002', makeSnapshot({ condition: 'damage-B' }));
    const captures = saveState.get('job_state_captures');
    expect(captures['job-001'].before.condition).toBe('damage-A');
    expect(captures['job-002'].before.condition).toBe('damage-B');
  });

  test('sequence works without a saveState (no errors)', () => {
    const { seq, revealPayloads } = makeSequence({ saveState: null });
    expect(() => {
      seq.prepareForJob('job-001', makeSnapshot());
      seq.triggerReveal('job-001', makeAfterSnapshot());
    }).not.toThrow();
    expect(revealPayloads).toHaveLength(1);
  });
});

// ─── Audio disabled (AC5) ─────────────────────────────────────────────────────

describe('Audio disabled — game functional, no music cues fire (AC5)', () => {
  test('no fanfare fires when audioEnabled=false', () => {
    const { seq, audioHook } = makeSequence({ audioEnabled: false });
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    const fanfareCalls = audioHook.mock.calls.filter(c => c[0] === COMPLETION_AUDIO_CUES.FANFARE);
    expect(fanfareCalls).toHaveLength(0);
  });

  test('reveal payload still produced when audio is disabled', () => {
    const { seq, revealPayloads } = makeSequence({ audioEnabled: false });
    seq.prepareForJob('job-001', makeSnapshot());
    seq.triggerReveal('job-001', makeAfterSnapshot());
    expect(revealPayloads).toHaveLength(1);
  });
});
