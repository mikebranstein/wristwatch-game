/**
 * Tests for JobLogReplayController.js — Issue #142 Completion Reveal Shareability Layer
 *
 * Acceptance criteria covered:
 *   AC3 — Replay Reveal available for completed jobs with stored states;
 *          triggerReplay() starts the full reveal sequence on demand.
 *   AC5 — triggerReplay() uses the same before/after watch states as the
 *          original completion reveal (no data drift or state mismatch).
 *   AC6 — Jobs without stored states return a graceful fallback message;
 *          no crashes, blank screens, or broken UI.
 *
 * Test scenarios covered:
 *   Scenario 4 — Single job replay: correct states used.
 *   Scenario 5 — Multiple jobs: no cross-contamination between replays.
 *   Scenario 6 — No stored states: graceful message, no throw.
 *
 * Run with: npm test
 */

'use strict';

const { JobLogReplayController, UNAVAILABLE_MSG } = require('../../../javascript/completion/JobLogReplayController');
const { TRIGGER_SOURCES }  = require('../../../javascript/completion/RevealSequenceController');
const { PlayerSaveState }  = require('../../../javascript/state/PlayerSaveState');

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Build a mock RevealSequenceController that records trigger() calls.
 */
function mockRevealController() {
  const calls = [];
  return {
    trigger: jest.fn((opts) => { calls.push(opts); }),
    getCalls: () => calls,
  };
}

/**
 * Build a save state with the given completed-watch entries.
 * Entries with `before_portrait_url` simulate Issue #141 stored states.
 */
function makeSaveStateWith(entries) {
  const saveState = new PlayerSaveState();
  entries.forEach(e => saveState.appendCompletedWatch(e));
  return saveState;
}

function makeWatchEntry({ watchId, watchName = 'Watch', clientName = 'Client',
  completionDate = '2026-07-10', before_portrait_url = null,
  portraitAssetKey = null } = {}) {
  return { watchId, watchName, clientName, completionDate, before_portrait_url, portraitAssetKey };
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('JobLogReplayController — construction', () => {
  test('constructs with no arguments', () => {
    expect(() => new JobLogReplayController()).not.toThrow();
  });

  test('constructs with instrumentationHook', () => {
    const hook = jest.fn();
    expect(() => new JobLogReplayController({ instrumentationHook: hook })).not.toThrow();
  });
});

// ── canReplay ─────────────────────────────────────────────────────────────────

describe('JobLogReplayController — canReplay()', () => {
  const ctrl = new JobLogReplayController();

  test('returns true when entry has before_portrait_url', () => {
    const entry = makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'before.png' });
    expect(ctrl.canReplay(entry)).toBe(true);
  });

  test('returns false when before_portrait_url is null (no stored states)', () => {
    const entry = makeWatchEntry({ watchId: 'w-001', before_portrait_url: null });
    expect(ctrl.canReplay(entry)).toBe(false);
  });

  test('returns false when before_portrait_url is missing', () => {
    const entry = { watchId: 'w-001', watchName: 'W', clientName: 'C', completionDate: '2026-01-01' };
    expect(ctrl.canReplay(entry)).toBe(false);
  });

  test('returns false when before_portrait_url is empty string', () => {
    const entry = makeWatchEntry({ watchId: 'w-001', before_portrait_url: '' });
    expect(ctrl.canReplay(entry)).toBe(false);
  });
});

// ── getReplayEntries ──────────────────────────────────────────────────────────

describe('JobLogReplayController — getReplayEntries()', () => {
  const ctrl = new JobLogReplayController();

  test('AC3 — returns one entry per completed watch', () => {
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'before.png' }),
      makeWatchEntry({ watchId: 'w-002', before_portrait_url: null }),
    ]);
    const entries = ctrl.getReplayEntries(saveState);
    expect(entries).toHaveLength(2);
  });

  test('AC3 — replayAvailable is true for entries with stored states', () => {
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'before.png' }),
    ]);
    const [entry] = ctrl.getReplayEntries(saveState);
    expect(entry.replayAvailable).toBe(true);
    expect(entry.unavailableMessage).toBeNull();
  });

  test('AC6 — replayAvailable is false for entries without stored states', () => {
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-002', before_portrait_url: null }),
    ]);
    const [entry] = ctrl.getReplayEntries(saveState);
    expect(entry.replayAvailable).toBe(false);
    expect(entry.unavailableMessage).toBe(UNAVAILABLE_MSG);
  });

  test('entries include watchId and watchName from save state', () => {
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-007', watchName: 'Rolex Oyster', before_portrait_url: 'b.png' }),
    ]);
    const [entry] = ctrl.getReplayEntries(saveState);
    expect(entry.watchId).toBe('w-007');
    expect(entry.watchName).toBe('Rolex Oyster');
  });

  test('returns empty array for save state with no completed watches', () => {
    const saveState = new PlayerSaveState();
    expect(ctrl.getReplayEntries(saveState)).toHaveLength(0);
  });

  test('Scenario 5 — multiple jobs: each entry correctly labeled', () => {
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'b1.png' }),
      makeWatchEntry({ watchId: 'w-002', before_portrait_url: 'b2.png' }),
      makeWatchEntry({ watchId: 'w-003', before_portrait_url: null }),  // pre-feature
      makeWatchEntry({ watchId: 'w-004', before_portrait_url: 'b4.png' }),
    ]);
    const entries = ctrl.getReplayEntries(saveState);
    expect(entries[0].replayAvailable).toBe(true);
    expect(entries[1].replayAvailable).toBe(true);
    expect(entries[2].replayAvailable).toBe(false);
    expect(entries[3].replayAvailable).toBe(true);
  });
});

// ── triggerReplay — AC3, AC5: happy path ──────────────────────────────────────

describe('JobLogReplayController — triggerReplay() happy path (AC3, AC5)', () => {
  test('AC3 — triggerReplay() returns success:true for entry with stored states', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'before.png', portraitAssetKey: 'after.png' }),
    ]);

    const result = ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    expect(result.success).toBe(true);
    expect(result.message).toBeNull();
    expect(result.watchId).toBe('w-001');
  });

  test('AC3 — triggerReplay() calls revealSequenceController.trigger()', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'before.png', portraitAssetKey: 'after.png' }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    expect(revealCtrl.trigger).toHaveBeenCalledTimes(1);
  });

  test('AC3 — trigger source is job_log_replay (AC8 pacing consistency)', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'before.png' }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    const triggerCall = revealCtrl.trigger.mock.calls[0][0];
    expect(triggerCall.triggerSource).toBe(TRIGGER_SOURCES.JOB_LOG_REPLAY);
  });

  test('AC5 — before state passed as before_portrait_url from save entry (no data drift)', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'my-before.png', portraitAssetKey: 'my-after.png' }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    const { beforeState } = revealCtrl.trigger.mock.calls[0][0];
    expect(beforeState).toBe('my-before.png');
  });

  test('AC5 — watchId forwarded unchanged to reveal controller (no state mismatch)', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-special-42', before_portrait_url: 'b.png' }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-special-42', saveState, revealSequenceController: revealCtrl });
    const { watchId } = revealCtrl.trigger.mock.calls[0][0];
    expect(watchId).toBe('w-special-42');
  });
});

// ── Scenario 5 — Multiple jobs: no cross-contamination ────────────────────────

describe('Scenario 5 — Multiple jobs: triggerReplay uses correct states per job', () => {
  test('replaying job 2 out of 4 uses job-2 states (no cross-contamination)', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'b1.png', portraitAssetKey: 'a1.png' }),
      makeWatchEntry({ watchId: 'w-002', before_portrait_url: 'b2.png', portraitAssetKey: 'a2.png' }),
      makeWatchEntry({ watchId: 'w-003', before_portrait_url: 'b3.png', portraitAssetKey: 'a3.png' }),
      makeWatchEntry({ watchId: 'w-004', before_portrait_url: 'b4.png', portraitAssetKey: 'a4.png' }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-002', saveState, revealSequenceController: revealCtrl });
    const { beforeState, watchId } = revealCtrl.trigger.mock.calls[0][0];
    expect(watchId).toBe('w-002');
    expect(beforeState).toBe('b2.png');
  });

  test('replaying job 4 out of 4 uses job-4 states', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'b1.png' }),
      makeWatchEntry({ watchId: 'w-002', before_portrait_url: 'b2.png' }),
      makeWatchEntry({ watchId: 'w-003', before_portrait_url: 'b3.png' }),
      makeWatchEntry({ watchId: 'w-004', before_portrait_url: 'b4.png' }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-004', saveState, revealSequenceController: revealCtrl });
    const { beforeState, watchId } = revealCtrl.trigger.mock.calls[0][0];
    expect(watchId).toBe('w-004');
    expect(beforeState).toBe('b4.png');
  });
});

// ── Scenario 6 — No stored states: graceful degradation (AC6) ────────────────

describe('Scenario 6 — No stored states: graceful message, no crash (AC6)', () => {
  test('AC6 — triggerReplay returns success:false for entry without stored states', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: null }),
    ]);

    const result = ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    expect(result.success).toBe(false);
  });

  test('AC6 — result message is UNAVAILABLE_MSG for entry without stored states', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: null }),
    ]);

    const result = ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    expect(result.message).toBe(UNAVAILABLE_MSG);
  });

  test('AC6 — revealSequenceController.trigger() is NOT called when states absent', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: null }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    expect(revealCtrl.trigger).not.toHaveBeenCalled();
  });

  test('AC6 — triggerReplay does not throw for entry without stored states', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: null }),
    ]);

    expect(() =>
      ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl })
    ).not.toThrow();
  });

  test('AC6 — triggerReplay returns graceful result when watchId not found', () => {
    const ctrl      = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = new PlayerSaveState();  // empty save state

    const result = ctrl.triggerReplay({ watchId: 'unknown', saveState, revealSequenceController: revealCtrl });
    expect(result.success).toBe(false);
    expect(result.message).toBe(UNAVAILABLE_MSG);
    expect(revealCtrl.trigger).not.toHaveBeenCalled();
  });

  test('AC6 — UNAVAILABLE_MSG is a non-empty string', () => {
    expect(typeof UNAVAILABLE_MSG).toBe('string');
    expect(UNAVAILABLE_MSG.length).toBeGreaterThan(0);
  });
});

// ── Instrumentation ───────────────────────────────────────────────────────────

describe('JobLogReplayController — instrumentation', () => {
  test('replay_triggered event fires on successful triggerReplay()', () => {
    const hook    = jest.fn();
    const ctrl    = new JobLogReplayController({ instrumentationHook: hook });
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'b.png' }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    expect(hook).toHaveBeenCalledWith('replay_triggered', expect.objectContaining({
      watchId: 'w-001',
      triggerSource: TRIGGER_SOURCES.JOB_LOG_REPLAY,
    }));
  });

  test('replay_unavailable event fires when stored states absent', () => {
    const hook    = jest.fn();
    const ctrl    = new JobLogReplayController({ instrumentationHook: hook });
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: null }),
    ]);

    ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl });
    expect(hook).toHaveBeenCalledWith('replay_unavailable', expect.objectContaining({
      watchId: 'w-001',
    }));
  });

  test('no throw if instrumentationHook not provided', () => {
    const ctrl    = new JobLogReplayController();
    const revealCtrl = mockRevealController();
    const saveState = makeSaveStateWith([
      makeWatchEntry({ watchId: 'w-001', before_portrait_url: 'b.png' }),
    ]);
    expect(() =>
      ctrl.triggerReplay({ watchId: 'w-001', saveState, revealSequenceController: revealCtrl })
    ).not.toThrow();
  });
});
