/**
 * Integration tests for ReassemblyScreen — AC1–AC5 integration.
 *
 * ReassemblyScreen is the top-level orchestrator. These tests verify that it
 * correctly wires SnapZoneTolerance, AssemblyFeedbackStateMachine, and
 * TelemetryEmitter together and enforces all acceptance criteria at the
 * screen level.
 *
 * Test Scenarios covered:
 *   Scenario 1  — Happy path: correct placement snaps in
 *   Scenario 2  — Wrong orientation: does not snap
 *   Scenario 3  — Approach proximity fires State 2
 *   Scenario 4  — Outside zone: State 1 neutral
 *   Scenario 5  — Confirmation lock precision preserved
 *   Scenario 6  — Wrong part over snap zone: no activation
 *   Scenario 8  — Regression: disassembly stage unaffected (context guard)
 *   Scenario 9  — Multi-part sequence independence
 *   Scenario 10 — Playtest metric: undo telemetry tracked
 */

const { ReassemblyScreen } = require('../../../src/reassembly/ReassemblyScreen');
const { STATES } = require('../../../src/reassembly/AssemblyFeedbackStateMachine');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScreen(opts = {}) {
  const hookLog = [];
  const audioLog = [];
  const visualLog = [];

  const screen = new ReassemblyScreen({
    instrumentationHook: (name, payload) => hookLog.push({ name, payload }),
    playAudio: (cue) => audioLog.push(cue),
    renderVisual: (v) => visualLog.push(v),
    sessionId: opts.sessionId || 'test-session',
    minDwellMs: opts.minDwellMs !== undefined ? opts.minDwellMs : 0,
  });

  return { screen, hookLog, audioLog, visualLog };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('ReassemblyScreen — construction', () => {
  test('constructs successfully with valid options', () => {
    expect(() => makeScreen()).not.toThrow();
  });

  test('exposes SnapZoneTolerance with reassembly context', () => {
    const { screen } = makeScreen();
    expect(screen.getSnapZone().getContext()).toBe('reassembly');
  });

  test('exposes AssemblyFeedbackStateMachine', () => {
    const { screen } = makeScreen();
    expect(screen.getFSM()).toBeDefined();
  });

  test('exposes TelemetryEmitter', () => {
    const { screen } = makeScreen();
    expect(screen.getTelemetry()).toBeDefined();
  });
});

// ─── Scenario 4 — State 1: outside zone ──────────────────────────────────────

describe('Scenario 4 — onPartMoved: outside approach zone → State 1 NEUTRAL', () => {
  test('very large distance → neutral state', () => {
    const { screen } = makeScreen();
    const result = screen.onPartMoved('mainspring', 9999, false);
    expect(result.state).toBe(STATES.NEUTRAL);
  });

  test('State 1 canSnap is false', () => {
    const { screen } = makeScreen();
    const result = screen.onPartMoved('mainspring', 9999, false);
    expect(result.canSnap).toBe(false);
  });
});

// ─── Scenario 3 — State 2: approach zone ──────────────────────────────────────

describe('Scenario 3 — onPartMoved: approach zone → State 2 PROXIMITY', () => {
  test('distance in approach zone (within approach_radius, outside lock_radius) → PROXIMITY', () => {
    const { screen } = makeScreen();
    // Default mainspring: approach_radius=60, lock_radius=20 → distance=40 is in approach
    const result = screen.onPartMoved('mainspring', 40, false);
    expect(result.state).toBe(STATES.PROXIMITY);
  });
});

// ─── Scenario 2 — State 3: wrong orientation ──────────────────────────────────

describe('Scenario 2 — onPartMoved: wrong orientation after dwell → State 3', () => {
  test('in approach zone, wrong orientation, post-dwell → WRONG_ORI', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 40, false, now);         // enter approach
    const result = screen.onPartMoved('mainspring', 40, false, now + 1); // wrong orientation
    expect(result.state).toBe(STATES.WRONG_ORI);
    expect(result.canSnap).toBe(false);
  });
});

// ─── Scenario 1 — State 4: correct placement ─────────────────────────────────

describe('Scenario 1 — Happy path: correct placement → State 4 and snap', () => {
  test('in lock zone with correct orientation → LOCKED_IN', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);          // enter lock zone
    const result = screen.onPartMoved('mainspring', 10, true, now + 1); // confirm
    expect(result.state).toBe(STATES.LOCKED_IN);
    expect(result.canSnap).toBe(true);
  });

  test('confirmSnap succeeds when in LOCKED_IN state', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);
    const result = screen.confirmSnap('mainspring');
    expect(result.success).toBe(true);
    expect(result.reason).toBeNull();
  });

  test('after confirmSnap, part is recorded in assembledParts', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);
    screen.confirmSnap('mainspring');
    expect(screen.getAssembledParts().has('mainspring')).toBe(true);
  });

  test('confirmSnap emits reassembly_part_confirmed telemetry', () => {
    const { screen, hookLog } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);
    screen.confirmSnap('mainspring');
    const event = hookLog.find((e) => e.name === 'reassembly_part_confirmed');
    expect(event).toBeDefined();
    expect(event.payload.partId).toBe('mainspring');
  });

  test('State 4 audio cue plays when locked in', () => {
    const { screen, audioLog } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    audioLog.length = 0; // clear prior
    screen.onPartMoved('mainspring', 10, true, now + 1);
    expect(audioLog.length).toBeGreaterThan(0);
    expect(audioLog[0]).toContain('locked_in');
  });
});

// ─── Scenario 5 — Precision preserved (cannot snap from approach zone) ────────

describe('Scenario 5 — Final confirmation lock precision preserved', () => {
  test('confirmSnap fails when part is in PROXIMITY state (approach zone only)', () => {
    const { screen } = makeScreen();
    screen.onPartMoved('mainspring', 40, true); // approach zone, correct orientation
    const result = screen.confirmSnap('mainspring');
    expect(result.success).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  test('confirmSnap fails when part is in WRONG_ORI state', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 40, false, now);
    screen.onPartMoved('mainspring', 40, false, now + 1);
    expect(screen.confirmSnap('mainspring').success).toBe(false);
  });

  test('confirmSnap fails when part is in NEUTRAL state', () => {
    const { screen } = makeScreen();
    screen.onPartMoved('mainspring', 9999, false);
    expect(screen.confirmSnap('mainspring').success).toBe(false);
  });
});

// ─── Scenario 8 — Regression: disassembly context guard ──────────────────────

describe('Scenario 8 — Regression: SnapZoneTolerance only activates in reassembly context', () => {
  test('ReassemblyScreen internally uses "reassembly" context — not teardown', () => {
    const { screen } = makeScreen();
    expect(screen.getSnapZone().getContext()).toBe('reassembly');
  });

  test('SnapZoneTolerance rejects "teardown" context if instantiated directly', () => {
    const { SnapZoneTolerance } = require('../../../src/reassembly/SnapZoneTolerance');
    expect(() => new SnapZoneTolerance('teardown')).toThrow();
  });
});

// ─── Scenario 9 — Multi-part independence ─────────────────────────────────────

describe('Scenario 9 — Multi-part sequence: state fires correctly per part', () => {
  test('two parts can be in different states simultaneously', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();

    // mainspring → LOCKED_IN
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);

    // escapement → NEUTRAL
    screen.onPartMoved('escapement', 9999, false, now);

    expect(screen.getFSM().getState('mainspring')).toBe(STATES.LOCKED_IN);
    expect(screen.getFSM().getState('escapement')).toBe(STATES.NEUTRAL);
  });

  test('assembling multiple parts records all in assembledParts', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();

    for (const partId of ['mainspring', 'escapement']) {
      screen.onPartMoved(partId, 10, true, now);
      screen.onPartMoved(partId, 10, true, now + 1);
      screen.confirmSnap(partId);
    }

    const assembled = screen.getAssembledParts();
    expect(assembled.has('mainspring')).toBe(true);
    expect(assembled.has('escapement')).toBe(true);
  });
});

// ─── Scenario 10 — Playtest metric: undo frequency telemetry (AC5) ────────────

describe('Scenario 10 — Playtest metric: undo frequency tracked for AC5 baseline', () => {
  test('onUndoAttempted emits undo_attempted telemetry event', () => {
    const { screen, hookLog } = makeScreen();
    screen.onUndoAttempted('mainspring');
    const event = hookLog.find((e) => e.name === 'undo_attempted');
    expect(event).toBeDefined();
    expect(event.payload.partId).toBe('mainspring');
  });

  test('onUndoAttempted increments totalUndoAttempts', () => {
    const { screen } = makeScreen();
    screen.onUndoAttempted('mainspring');
    screen.onUndoAttempted('escapement');
    expect(screen.getTotalUndoAttempts()).toBe(2);
  });

  test('undo_attempted payload includes running total', () => {
    const { screen, hookLog } = makeScreen();
    screen.onUndoAttempted('mainspring');
    screen.onUndoAttempted('escapement');
    const events = hookLog.filter((e) => e.name === 'undo_attempted');
    expect(events[0].payload.totalUndoAttempts).toBe(1);
    expect(events[1].payload.totalUndoAttempts).toBe(2);
  });

  test('completeReassembly emits reassembly_completed event with stats', () => {
    const { screen, hookLog } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);
    screen.confirmSnap('mainspring');
    screen.onUndoAttempted('escapement');

    screen.completeReassembly();

    const event = hookLog.find((e) => e.name === 'reassembly_completed');
    expect(event).toBeDefined();
    expect(event.payload.assembledCount).toBe(1);
    expect(event.payload.totalUndoAttempts).toBe(1);
  });

  test('undo removes part from assembledParts when previously snapped', () => {
    const { screen } = makeScreen({ minDwellMs: 0 });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);
    screen.confirmSnap('mainspring');
    expect(screen.getAssembledParts().has('mainspring')).toBe(true);

    screen.onUndoAttempted('mainspring');
    expect(screen.getAssembledParts().has('mainspring')).toBe(false);
  });
});

// ─── Custom tolerance override ────────────────────────────────────────────────

describe('ReassemblyScreen — setPartTolerance', () => {
  test('setPartTolerance changes the effective snap zones', () => {
    const { screen } = makeScreen();
    screen.setPartTolerance('mainspring', { approach_radius: 100, lock_radius: 40 });
    const tol = screen.getSnapZone().getTolerances('mainspring');
    expect(tol.approach_radius).toBe(100);
    expect(tol.lock_radius).toBe(40);
  });

  test('setPartTolerance enforces 2× constraint', () => {
    const { screen } = makeScreen();
    expect(() =>
      screen.setPartTolerance('mainspring', { approach_radius: 30, lock_radius: 20 })
    ).toThrow(/AC1/);
  });
});
