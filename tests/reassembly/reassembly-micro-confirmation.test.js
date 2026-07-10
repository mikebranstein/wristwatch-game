/**
 * Tests for ReassemblyMicroConfirmationController and ReassemblyScreen integration.
 * Issue #122 — Reassembly Micro-Confirmation Prototype, Phase 1.
 *
 * Covers all 8 test scenarios from the acceptance criteria:
 *   Scenario 1 — Happy path (feedback-ON): correct seating -> audio + visual + analytics
 *   Scenario 2 — No false positive: incorrect placement -> no feedback
 *   Scenario 3 — Control cohort, correct seating: no audio, no highlight, no event
 *   Scenario 4 — Abandonment tracking: exit mid-session -> reassembly_session_abandoned fires
 *   Scenario 5 — Audio muted: no audio BUT visual highlight still fires
 *   Scenario 6 — Rapid undo/re-seat: each correct seating triggers feedback once
 *   Scenario 7 — Analytics integrity: exactly one event per seating action, no duplicates
 *   Scenario 8 — Session pause/resume: cohort assignment preserved
 */

const {
  ReassemblyMicroConfirmationController,
  PROTOTYPE_COMPONENT_ID,
  COHORTS,
  AUDIO_CUE,
  DEFAULT_HIGHLIGHT_DURATION_MS,
} = require('../../src/reassembly/ReassemblyMicroConfirmationController');
const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');
const { ReassemblyScreen }         = require('../../src/reassembly/ReassemblyScreen');
const { STATES }                   = require('../../src/reassembly/AssemblyFeedbackStateMachine');

function makeTelemetry() {
  const log = [];
  const emitter = new TelemetryEmitter((name, payload) => log.push({ name, payload }));
  return { emitter, log };
}

function makeController(overrides = {}) {
  const { emitter, log } = makeTelemetry();
  const audioLog     = [];
  const highlightLog = [];
  const controller = new ReassemblyMicroConfirmationController({
    telemetry:        emitter,
    playAudio:        (cue) => audioLog.push(cue),
    renderHighlight:  (evt) => highlightLog.push(evt),
    isMuted:          () => false,
    setTimeoutFn:     (fn) => fn(),
    ...overrides,
  });
  return { controller, emitter, log, audioLog, highlightLog };
}

function forceCohort(cohort) {
  return cohort === COHORTS.FEEDBACK_ON ? () => 0.0 : () => 0.9;
}

function makeScreenWithController(cohort = COHORTS.FEEDBACK_ON, extraOpts = {}) {
  const hookLog      = [];
  const audioLog     = [];
  const visualLog    = [];
  const highlightLog = [];
  const { emitter }  = makeTelemetry();

  const controller = new ReassemblyMicroConfirmationController({
    telemetry:        emitter,
    playAudio:        (cue) => audioLog.push(cue),
    renderHighlight:  (evt) => highlightLog.push(evt),
    isMuted:          extraOpts.isMuted || (() => false),
    randomFn:         forceCohort(cohort),
    setTimeoutFn:     (fn) => fn(),
  });

  const screen = new ReassemblyScreen({
    instrumentationHook:         (name, payload) => hookLog.push({ name, payload }),
    playAudio:                   (cue) => audioLog.push(cue),
    renderVisual:                (v) => visualLog.push(v),
    sessionId:                   'test-session',
    minDwellMs:                  0,
    microConfirmationController: controller,
  });

  return { screen, controller, hookLog, audioLog, visualLog, highlightLog, emitter };
}

// ── EVENTS constants ──────────────────────────────────────────────────────────

describe('EVENTS constants — micro-confirmation event names defined (Issue #122)', () => {
  test('REASSEMBLY_COMPONENT_SEATED_SUCCESS is defined', () => {
    expect(EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS).toBe('reassembly_component_seated_success');
  });
  test('REASSEMBLY_SESSION_ABANDONED is defined', () => {
    expect(EVENTS.REASSEMBLY_SESSION_ABANDONED).toBe('reassembly_session_abandoned');
  });
  test('all pre-existing EVENTS constants are still present (backward-compat)', () => {
    expect(EVENTS.UNDO_ATTEMPTED).toBe('undo_attempted');
    expect(EVENTS.REASSEMBLY_PART_CONFIRMED).toBe('reassembly_part_confirmed');
    expect(EVENTS.REASSEMBLY_COMPLETED).toBe('reassembly_completed');
    expect(EVENTS.TUTORIAL_DIAGNOSIS_STARTED).toBe('tutorial_diagnosis_started');
  });
});

// ── TelemetryEmitter new methods ──────────────────────────────────────────────

describe('TelemetryEmitter — reassemblyComponentSeatedSuccess()', () => {
  test('fires reassembly_component_seated_success event', () => {
    const { emitter, log } = makeTelemetry();
    emitter.reassemblyComponentSeatedSuccess('balance_wheel', 'feedback-on');
    expect(log[0].name).toBe(EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS);
  });
  test('payload includes componentId', () => {
    const { emitter, log } = makeTelemetry();
    emitter.reassemblyComponentSeatedSuccess('balance_wheel', 'feedback-on');
    expect(log[0].payload.componentId).toBe('balance_wheel');
  });
  test('payload includes cohortId', () => {
    const { emitter, log } = makeTelemetry();
    emitter.reassemblyComponentSeatedSuccess('balance_wheel', 'feedback-on');
    expect(log[0].payload.cohortId).toBe('feedback-on');
  });
  test('payload includes timestamp', () => {
    const { emitter, log } = makeTelemetry();
    const before = Date.now();
    emitter.reassemblyComponentSeatedSuccess('balance_wheel', 'feedback-on');
    const after = Date.now();
    expect(log[0].payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(log[0].payload.timestamp).toBeLessThanOrEqual(after);
  });
  test('wasEmitted returns true after firing', () => {
    const { emitter } = makeTelemetry();
    emitter.reassemblyComponentSeatedSuccess('balance_wheel', 'feedback-on');
    expect(emitter.wasEmitted(EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBe(true);
  });
});

describe('TelemetryEmitter — reassemblySessionAbandoned()', () => {
  test('fires reassembly_session_abandoned event', () => {
    const { emitter, log } = makeTelemetry();
    emitter.reassemblySessionAbandoned('control');
    expect(log[0].name).toBe(EVENTS.REASSEMBLY_SESSION_ABANDONED);
  });
  test('payload includes cohortId', () => {
    const { emitter, log } = makeTelemetry();
    emitter.reassemblySessionAbandoned('control');
    expect(log[0].payload.cohortId).toBe('control');
  });
  test('payload includes timestamp', () => {
    const { emitter, log } = makeTelemetry();
    const before = Date.now();
    emitter.reassemblySessionAbandoned('feedback-on');
    const after = Date.now();
    expect(log[0].payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(log[0].payload.timestamp).toBeLessThanOrEqual(after);
  });
});

// ── Controller construction ───────────────────────────────────────────────────

describe('ReassemblyMicroConfirmationController — construction', () => {
  test('constructs successfully with valid options', () => {
    expect(() => makeController()).not.toThrow();
  });
  test('throws if telemetry missing required methods', () => {
    expect(() =>
      new ReassemblyMicroConfirmationController({
        telemetry:       { notTheRightMethod: () => {} },
        playAudio:       () => {},
        renderHighlight: () => {},
      })
    ).toThrow();
  });
  test('throws if playAudio is not a function', () => {
    const { emitter } = makeTelemetry();
    expect(() =>
      new ReassemblyMicroConfirmationController({
        telemetry:       emitter,
        playAudio:       'not-a-function',
        renderHighlight: () => {},
      })
    ).toThrow();
  });
  test('throws if renderHighlight is not a function', () => {
    const { emitter } = makeTelemetry();
    expect(() =>
      new ReassemblyMicroConfirmationController({
        telemetry:       emitter,
        playAudio:       () => {},
        renderHighlight: null,
      })
    ).toThrow();
  });
  test('cohort is null before startSession()', () => {
    const { controller } = makeController();
    expect(controller.getCohort()).toBeNull();
  });
  test('session is not active before startSession()', () => {
    const { controller } = makeController();
    expect(controller.isSessionActive()).toBe(false);
  });
  test('prototype component defaults to PROTOTYPE_COMPONENT_ID', () => {
    const { controller } = makeController();
    expect(controller.getPrototypeComponentId()).toBe(PROTOTYPE_COMPONENT_ID);
    expect(PROTOTYPE_COMPONENT_ID).toBe('balance_wheel');
  });
});

// ── AC3 — A/B cohort assignment ───────────────────────────────────────────────

describe('AC3 — startSession() assigns A/B cohort', () => {
  test('returns feedback-on when randomFn < 0.5', () => {
    const { controller } = makeController({ randomFn: () => 0.0 });
    expect(controller.startSession()).toBe(COHORTS.FEEDBACK_ON);
    expect(controller.getCohort()).toBe(COHORTS.FEEDBACK_ON);
  });
  test('returns control when randomFn >= 0.5', () => {
    const { controller } = makeController({ randomFn: () => 0.9 });
    expect(controller.startSession()).toBe(COHORTS.CONTROL);
    expect(controller.getCohort()).toBe(COHORTS.CONTROL);
  });
  test('session becomes active after startSession()', () => {
    const { controller } = makeController();
    controller.startSession();
    expect(controller.isSessionActive()).toBe(true);
  });
  test('cohort can only be feedback-on or control', () => {
    const { controller } = makeController({ randomFn: () => Math.random() });
    expect([COHORTS.FEEDBACK_ON, COHORTS.CONTROL]).toContain(controller.startSession());
  });
});

// ── Scenario 8 — Cohort persists across pause/resume ─────────────────────────

describe('Scenario 8 — Cohort assignment persists for session duration (AC3)', () => {
  test('cohort does not change when onComponentSeated is called after startSession()', () => {
    const { controller } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    const before = controller.getCohort();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(controller.getCohort()).toBe(before);
  });
  test('cohort is preserved after onComponentUnseated (simulated pause/resume)', () => {
    const { controller } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    const assigned = controller.getCohort();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentUnseated(PROTOTYPE_COMPONENT_ID);
    expect(controller.getCohort()).toBe(assigned);
    expect(controller.isSessionActive()).toBe(true);
  });
  test('cohort remains the same for the entire session regardless of multiple events', () => {
    const { controller } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onSessionAbandoned();
    expect(controller.getCohort()).toBe(COHORTS.CONTROL);
  });
});

// ── Scenario 1 — Happy path (feedback-ON cohort) ─────────────────────────────

describe('Scenario 1 — Happy path: feedback-ON cohort, correct seating (AC1, AC2, AC4)', () => {
  test('onComponentSeated fires reassembly_component_seated_success event', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(log.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBeDefined();
  });
  test('analytics event payload includes componentId', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    const evt = log.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS);
    expect(evt.payload.componentId).toBe(PROTOTYPE_COMPONENT_ID);
  });
  test('analytics event payload includes cohortId', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    const evt = log.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS);
    expect(evt.payload.cohortId).toBe(COHORTS.FEEDBACK_ON);
  });
  test('analytics event payload includes timestamp', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    const before = Date.now();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    const after = Date.now();
    const evt = log.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS);
    expect(evt.payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(evt.payload.timestamp).toBeLessThanOrEqual(after);
  });
  test('audio click plays (AC1)', () => {
    const { controller, audioLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(audioLog).toContain(AUDIO_CUE);
  });
  test('visual highlight active=true fires immediately (AC2)', () => {
    const { controller, highlightLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(highlightLog.find((h) => h.active === true && h.partId === PROTOTYPE_COMPONENT_ID)).toBeDefined();
  });
  test('visual highlight active=false fires after duration (AC2 — auto-clearing)', () => {
    const { controller, highlightLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(highlightLog.find((h) => h.active === false && h.partId === PROTOTYPE_COMPONENT_ID)).toBeDefined();
  });
});

// ── Scenario 2 — No false positive (AC5) ─────────────────────────────────────

describe('Scenario 2 — No false positive: incorrect placement -> no feedback', () => {
  test('confirmSnap failure (wrong state) does not call onComponentSeated', () => {
    const { screen, highlightLog, audioLog } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    const result = screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(result.success).toBe(false);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(0);
  });
  test('wrong orientation state does not trigger feedback', () => {
    const { screen, highlightLog, audioLog } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    const now = Date.now();
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 40, false, now);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 40, false, now + 1);
    const result = screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(result.success).toBe(false);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(0);
  });
  test('proximity state (not locked) does not trigger feedback', () => {
    const { screen, highlightLog, audioLog } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 40, true);
    const result = screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(result.success).toBe(false);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(0);
  });
  test('non-prototype components do not trigger micro-confirmation feedback', () => {
    const { controller, audioLog, highlightLog, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated('mainspring');
    controller.onComponentSeated('escapement');
    expect(audioLog).toHaveLength(0);
    expect(highlightLog).toHaveLength(0);
    expect(log.filter((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toHaveLength(0);
  });
});

// ── Scenario 3 — Control cohort ───────────────────────────────────────────────

describe('Scenario 3 — Control cohort: no audio, no highlight, no seated_success event', () => {
  test('no audio for control cohort on correct seating', () => {
    const { controller, audioLog } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(audioLog).toHaveLength(0);
  });
  test('no visual highlight for control cohort on correct seating', () => {
    const { controller, highlightLog } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(highlightLog).toHaveLength(0);
  });
  test('reassembly_component_seated_success NOT emitted for control cohort', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(log.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBeUndefined();
  });
  test('control cohort session is active after seating (abandonment tracking remains live)', () => {
    const { controller } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(controller.isSessionActive()).toBe(true);
  });
});

// ── Scenario 4 — Abandonment tracking ────────────────────────────────────────

describe('Scenario 4 — Abandonment tracking: reassembly_session_abandoned fires (AC4)', () => {
  test('onSessionAbandoned emits reassembly_session_abandoned for control cohort', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onSessionAbandoned();
    expect(log.find((e) => e.name === EVENTS.REASSEMBLY_SESSION_ABANDONED)).toBeDefined();
  });
  test('abandonment event payload includes cohortId for control cohort', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onSessionAbandoned();
    const evt = log.find((e) => e.name === EVENTS.REASSEMBLY_SESSION_ABANDONED);
    expect(evt.payload.cohortId).toBe(COHORTS.CONTROL);
  });
  test('onSessionAbandoned emits reassembly_session_abandoned for feedback-ON cohort too', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onSessionAbandoned();
    const evt = log.find((e) => e.name === EVENTS.REASSEMBLY_SESSION_ABANDONED);
    expect(evt).toBeDefined();
    expect(evt.payload.cohortId).toBe(COHORTS.FEEDBACK_ON);
  });
  test('abandonment deactivates session', () => {
    const { controller } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onSessionAbandoned();
    expect(controller.isSessionActive()).toBe(false);
  });
  test('onSessionAbandoned is idempotent — only one event emitted on repeated calls', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.CONTROL) });
    controller.startSession();
    controller.onSessionAbandoned();
    controller.onSessionAbandoned();
    expect(log.filter((e) => e.name === EVENTS.REASSEMBLY_SESSION_ABANDONED)).toHaveLength(1);
  });
  test('abandonment before startSession() is a safe no-op', () => {
    const { controller, log } = makeController();
    expect(() => controller.onSessionAbandoned()).not.toThrow();
    expect(log.filter((e) => e.name === EVENTS.REASSEMBLY_SESSION_ABANDONED)).toHaveLength(0);
  });
  test('ReassemblyScreen.abandonReassembly() triggers abandonment event via controller', () => {
    const { screen, emitter } = makeScreenWithController(COHORTS.CONTROL);
    screen.abandonReassembly();
    expect(emitter.wasEmitted(EVENTS.REASSEMBLY_SESSION_ABANDONED)).toBe(true);
  });
  test('ReassemblyScreen.abandonReassembly() is a no-op with no controller', () => {
    const screen = new ReassemblyScreen({
      instrumentationHook: () => {},
      playAudio:           () => {},
      renderVisual:        () => {},
    });
    expect(() => screen.abandonReassembly()).not.toThrow();
  });
});

// ── Scenario 5 — Audio muted ──────────────────────────────────────────────────

describe('Scenario 5 — Audio muted: no audio, but visual highlight still fires (AC independence)', () => {
  test('audio does NOT play when isMuted returns true', () => {
    const { controller, audioLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON), isMuted: () => true });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(audioLog).toHaveLength(0);
  });
  test('visual highlight DOES fire even when audio is muted', () => {
    const { controller, highlightLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON), isMuted: () => true });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(highlightLog.find((h) => h.active === true)).toBeDefined();
  });
  test('analytics event DOES fire even when audio is muted', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON), isMuted: () => true });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(log.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBeDefined();
  });
  test('ReassemblyScreen integration: audio muted -> no audio, highlight fires', () => {
    const { screen, audioLog, highlightLog } = makeScreenWithController(COHORTS.FEEDBACK_ON, { isMuted: () => true });
    const now = Date.now();
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 1);
    screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(1);
  });
});

// ── Scenario 6 — Rapid undo/re-seat ──────────────────────────────────────────

describe('Scenario 6 — Rapid undo/re-seat: one feedback per seating action', () => {
  test('two correct seatings after undo each produce one analytics event', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentUnseated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(log.filter((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toHaveLength(2);
  });
  test('each re-seat after undo plays audio once', () => {
    const { controller, audioLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentUnseated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(2);
  });
  test('each re-seat after undo fires visual highlight once', () => {
    const { controller, highlightLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentUnseated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(2);
  });
  test('ReassemblyScreen integration: undo then re-seat fires feedback each time', () => {
    const { screen, audioLog } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    const now = Date.now();
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 1);
    screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    screen.onUndoAttempted(PROTOTYPE_COMPONENT_ID);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 2);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 3);
    screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(2);
  });
});

// ── Scenario 7 — Analytics integrity (deduplication) ─────────────────────────

describe('Scenario 7 — Analytics integrity: exactly one event per seating action', () => {
  test('duplicate onComponentSeated calls without undo produce only one event', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(log.filter((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toHaveLength(1);
  });
  test('duplicate onComponentSeated without undo produces only one audio play', () => {
    const { controller, audioLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(1);
  });
  test('duplicate onComponentSeated without undo produces only one highlight', () => {
    const { controller, highlightLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(1);
  });
  test('three distinct undo/re-seat cycles produce exactly three events (plus final)', () => {
    const { controller, log } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    for (let i = 0; i < 3; i++) {
      controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
      controller.onComponentUnseated(PROTOTYPE_COMPONENT_ID);
    }
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(log.filter((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toHaveLength(4);
  });
});

// ── ReassemblyScreen integration ──────────────────────────────────────────────

describe('ReassemblyScreen — microConfirmationController integration (Issue #122)', () => {
  test('getMicroConfirmation() returns injected controller', () => {
    const { screen, controller } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    expect(screen.getMicroConfirmation()).toBe(controller);
  });
  test('constructor calls startSession() on injected controller', () => {
    const { controller } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    expect(controller.isSessionActive()).toBe(true);
    expect([COHORTS.FEEDBACK_ON, COHORTS.CONTROL]).toContain(controller.getCohort());
  });
  test('getMicroConfirmation() returns null when no controller injected', () => {
    const screen = new ReassemblyScreen({
      instrumentationHook: () => {},
      playAudio:           () => {},
      renderVisual:        () => {},
    });
    expect(screen.getMicroConfirmation()).toBeNull();
  });
  test('confirmSnap success (feedback-ON) triggers micro-confirmation feedback', () => {
    const { screen, audioLog } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    const now = Date.now();
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 1);
    const result = screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(result.success).toBe(true);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(1);
  });
  test('confirmSnap success emits reassembly_component_seated_success analytics', () => {
    const { screen, emitter } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    const now = Date.now();
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 1);
    screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(emitter.wasEmitted(EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBe(true);
  });
  test('onUndoAttempted resets dedup guard so re-seat fires analytics again', () => {
    const { screen, emitter } = makeScreenWithController(COHORTS.FEEDBACK_ON);
    const now = Date.now();
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 1);
    screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    screen.onUndoAttempted(PROTOTYPE_COMPONENT_ID);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 2);
    screen.onPartMoved(PROTOTYPE_COMPONENT_ID, 10, true, now + 3);
    screen.confirmSnap(PROTOTYPE_COMPONENT_ID);
    expect(emitter.getEmittedEvents().filter((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toHaveLength(2);
  });
  test('existing ReassemblyScreen behavior is unchanged (backward-compat)', () => {
    const hookLog = [];
    const screen = new ReassemblyScreen({
      instrumentationHook: (name, payload) => hookLog.push({ name, payload }),
      playAudio:           () => {},
      renderVisual:        () => {},
      minDwellMs:          0,
    });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);
    const result = screen.confirmSnap('mainspring');
    expect(result.success).toBe(true);
    expect(hookLog.find((e) => e.name === 'reassembly_part_confirmed')).toBeDefined();
  });
});

// ── AC2 — Visual highlight timing ─────────────────────────────────────────────

describe('AC2 — Visual highlight duration contract', () => {
  test('highlight active=true fires before clear when setTimeoutFn delays callback', () => {
    const { emitter } = makeTelemetry();
    const audioLog     = [];
    const highlightLog = [];
    let pendingClear   = null;
    const controller = new ReassemblyMicroConfirmationController({
      telemetry:        emitter,
      playAudio:        (cue) => audioLog.push(cue),
      renderHighlight:  (evt) => highlightLog.push(evt),
      randomFn:         forceCohort(COHORTS.FEEDBACK_ON),
      setTimeoutFn:     (fn, ms) => { pendingClear = { fn, ms }; },
    });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(1);
    expect(highlightLog.filter((h) => h.active === false)).toHaveLength(0);
    pendingClear.fn();
    expect(highlightLog.filter((h) => h.active === false)).toHaveLength(1);
  });
  test('DEFAULT_HIGHLIGHT_DURATION_MS is within AC2 spec range (500-2000 ms)', () => {
    expect(DEFAULT_HIGHLIGHT_DURATION_MS).toBeGreaterThanOrEqual(500);
    expect(DEFAULT_HIGHLIGHT_DURATION_MS).toBeLessThanOrEqual(2000);
  });
  test('highlight clear payload includes correct partId', () => {
    const { controller, highlightLog } = makeController({ randomFn: forceCohort(COHORTS.FEEDBACK_ON) });
    controller.startSession();
    controller.onComponentSeated(PROTOTYPE_COMPONENT_ID);
    const clearCall = highlightLog.find((h) => h.active === false);
    expect(clearCall.partId).toBe(PROTOTYPE_COMPONENT_ID);
  });
});