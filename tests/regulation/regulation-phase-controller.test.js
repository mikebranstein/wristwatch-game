/**
 * Tests: RegulationPhaseController — main orchestrator for the regulation phase.
 * Issue #294 — Movement Regulation Phase 1
 *
 * Covers:
 *   AC1 — Phase entry: display visible, regulator interactive, deviation shown in real time
 *   AC2 — submitCalibration(): grade awarded when in Acceptable band; player may re-submit
 *   AC3 — Visual indicator ON by default (delegated to TimegrapherDisplay)
 *   AC4 — executeAssistMode(): auto-adjusts; display and grade sequence play out in full
 *   AC6 — Four telemetry events fire with correct grade and attempt_number payloads
 *   Test Scenarios 1, 2, 3, 4, 7
 *
 * Run with: npm test
 */
'use strict';

const { RegulationPhaseController, PHASE_STATE } = require('../../src/regulation/RegulationPhaseController');
const { GRADES } = require('../../src/regulation/RegulationConfig');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSaveState(initial = {}) {
  const store = { regulation_tutorial_seen: false, ...initial };
  return {
    get:  (k) => store[k] !== undefined ? store[k] : null,
    set:  (k, v) => { store[k] = v; },
    _store: store,
  };
}

function makeTelemetry() {
  const events = [];
  return {
    emit: (name, payload) => events.push({ name, payload }),
    events,
  };
}

function makeController(opts = {}) {
  const renders = [];
  const saveState = opts.saveState || makeSaveState();
  const telemetry = opts.telemetry || makeTelemetry();
  const renderFn  = (vm) => renders.push(vm);

  const controller = new RegulationPhaseController({
    saveState,
    telemetryEmitter: telemetry,
    renderFn,
    initialDeviation: opts.initialDeviation !== undefined ? opts.initialDeviation : 60,
    audioHook:  opts.audioHook  || null,
    audioEnabled: opts.audioEnabled !== undefined ? opts.audioEnabled : true,
    visualIndicatorOn: opts.visualIndicatorOn !== undefined ? opts.visualIndicatorOn : true,
  });

  return { controller, renders, saveState, telemetry };
}

// ---------------------------------------------------------------------------
// AC1 — Phase entry
// ---------------------------------------------------------------------------

describe('RegulationPhaseController — AC1: Phase entry', () => {
  it('starts in IDLE state', () => {
    const { controller } = makeController();
    expect(controller.getPhaseState()).toBe(PHASE_STATE.IDLE);
  });

  it('transitions to ACTIVE on enterPhase()', () => {
    const { controller } = makeController();
    controller.enterPhase('job-1');
    expect(controller.getPhaseState()).toBe(PHASE_STATE.ACTIVE);
  });

  it('renders timegrapher display on enterPhase (display visible)', () => {
    const { controller, renders } = makeController();
    controller.enterPhase('job-1');
    expect(renders.length).toBeGreaterThan(0);
  });

  it('AC1: initial render shows deviation in real time', () => {
    const { controller, renders } = makeController({ initialDeviation: 60 });
    controller.enterPhase('job-1');
    const lastRender = renders[renders.length - 1];
    expect(lastRender.deviation).toBeCloseTo(60, 1);
  });

  it('adjustRegulator() re-renders display with updated deviation (real-time)', () => {
    const { controller, renders } = makeController({ initialDeviation: 60 });
    controller.enterPhase('job-1');
    const rendersBefore = renders.length;
    controller.adjustRegulator(25); // retard to reduce deviation
    expect(renders.length).toBeGreaterThan(rendersBefore);
    const latest = renders[renders.length - 1];
    expect(latest.regulatorIndex).toBe(25);
  });

  it('shows tutorial for first-time player (Test Scenario 1)', () => {
    const saveState = makeSaveState({ regulation_tutorial_seen: false });
    const { controller } = makeController({ saveState });
    const result = controller.enterPhase('job-1');
    expect(result.tutorialShown).toBe(true);
  });

  it('does NOT show tutorial for returning player (Test Scenario 7)', () => {
    const saveState = makeSaveState({ regulation_tutorial_seen: true });
    const { controller } = makeController({ saveState });
    const result = controller.enterPhase('job-1');
    expect(result.tutorialShown).toBe(false);
  });

  it('throws if enterPhase called twice', () => {
    const { controller } = makeController();
    controller.enterPhase('job-1');
    expect(() => controller.enterPhase('job-1')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC2 — submitCalibration(): grade awarded; player may re-submit
// ---------------------------------------------------------------------------

describe('RegulationPhaseController — AC2: Grade award on submission', () => {
  it('awards Acceptable grade when deviation ≤ 30 s/day', () => {
    // Set deviation to exactly 20 s/day
    const { controller } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-1');
    const result = controller.submitCalibration();
    expect(result.grade).toBe(GRADES.ACCEPTABLE);
    expect(result.isPassing).toBe(true);
  });

  it('phase is SUBMITTED after successful submission', () => {
    const { controller } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-1');
    controller.submitCalibration();
    expect(controller.getPhaseState()).toBe(PHASE_STATE.SUBMITTED);
  });

  it('AC2: returns null grade when deviation > 30 s/day (not passing)', () => {
    const { controller } = makeController({ initialDeviation: 60 });
    controller.enterPhase('job-1');
    const result = controller.submitCalibration();
    expect(result.grade).toBeNull();
    expect(result.isPassing).toBe(false);
  });

  it('AC2: player may continue adjusting and re-submit to reach higher grade', () => {
    const { controller } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-1');
    const firstSubmit = controller.submitCalibration();
    expect(firstSubmit.grade).toBe(GRADES.ACCEPTABLE);

    // Player adjusts to improve grade
    controller.adjustRegulator(46); // deviation = 20 + (46-50)*2.4 = 20-9.6 = 10.4 → Good
    const secondSubmit = controller.submitCalibration();
    expect(secondSubmit.grade).toBe(GRADES.GOOD);
    expect(secondSubmit.attemptNumber).toBe(2);
  });

  it('Test Scenario 2: Certified Chronometer on first attempt (±5 s/day)', () => {
    const { controller } = makeController({ initialDeviation: 3 });
    controller.enterPhase('job-1');
    const result = controller.submitCalibration();
    expect(result.grade).toBe(GRADES.CERTIFIED_CHRONOMETER);
  });

  it('increments attemptNumber on each submit', () => {
    const { controller } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-1');
    const r1 = controller.submitCalibration();
    const r2 = controller.submitCalibration();
    expect(r1.attemptNumber).toBe(1);
    expect(r2.attemptNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AC3 — Visual indicator ON by default
// ---------------------------------------------------------------------------

describe('RegulationPhaseController — AC3: Visual indicator default', () => {
  it('visual indicator is ON by default', () => {
    const { controller } = makeController();
    expect(controller.getDisplay().isVisualIndicatorOn()).toBe(true);
  });

  it('Test Scenario 4: Acceptable zone highlighted on first render', () => {
    const { controller, renders } = makeController({ initialDeviation: 60 });
    controller.enterPhase('job-1');
    const vm = renders[renders.length - 1];
    expect(vm.acceptableZone.highlighted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC4 — Assist mode: auto-adjusts, display plays out in full
// ---------------------------------------------------------------------------

describe('RegulationPhaseController — AC4: Assist Mode', () => {
  it('executeAssistMode() auto-adjusts regulator to Acceptable or better', () => {
    const { controller } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-1');
    const result = controller.executeAssistMode();
    expect(result.grade).not.toBeNull();
    expect(Math.abs(result.deviation)).toBeLessThanOrEqual(30);
  });

  it('Test Scenario 3: assist mode still renders timegrapher display (NOT silently skipped)', () => {
    const { controller, renders } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-1');
    const rendersBefore = renders.length;
    controller.executeAssistMode();
    // Display must have been rendered during assist execution
    expect(renders.length).toBeGreaterThan(rendersBefore);
  });

  it('AC4: assist mode results in SUBMITTED state (grade was awarded)', () => {
    const { controller } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-1');
    controller.executeAssistMode();
    expect(controller.getPhaseState()).toBe(PHASE_STATE.SUBMITTED);
  });

  it('wasAssistModeUsed() returns true after executeAssistMode', () => {
    const { controller } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-1');
    controller.executeAssistMode();
    expect(controller.wasAssistModeUsed()).toBe(true);
  });

  it('AC4: completePhase() can be called after assist mode', () => {
    const { controller } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-1');
    controller.executeAssistMode();
    const result = controller.completePhase();
    expect(result.regulationGrade).not.toBeNull();
    expect(controller.getPhaseState()).toBe(PHASE_STATE.COMPLETED);
  });
});

// ---------------------------------------------------------------------------
// AC5 — completePhase() returns grade for delivery injection
// ---------------------------------------------------------------------------

describe('RegulationPhaseController — AC5: completePhase() output', () => {
  it('returns regulationGrade and accuracyScore', () => {
    const { controller } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-1');
    controller.submitCalibration();
    const result = controller.completePhase();
    expect(result.regulationGrade).toBe(GRADES.ACCEPTABLE);
    expect(result.accuracyScore).toBe(50); // GRADE_TO_ACCURACY_SCORE[ACCEPTABLE]
  });

  it('transitions to COMPLETED state', () => {
    const { controller } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-1');
    controller.submitCalibration();
    controller.completePhase();
    expect(controller.getPhaseState()).toBe(PHASE_STATE.COMPLETED);
  });

  it('throws if completePhase called before submitCalibration', () => {
    const { controller } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-1');
    expect(() => controller.completePhase()).toThrow();
  });

  it('Test Scenario 8: null grade returned when phase completed without passing (backward compat)', () => {
    const { controller } = makeController({ initialDeviation: 60 });
    controller.enterPhase('job-1');
    controller.submitCalibration(); // not passing
    const result = controller.completePhase();
    expect(result.regulationGrade).toBeNull();
    expect(result.accuracyScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC6 — Telemetry events
// ---------------------------------------------------------------------------

describe('RegulationPhaseController — AC6: Telemetry events', () => {
  it('emits regulation_phase_started on enterPhase', () => {
    const { controller, telemetry } = makeController();
    controller.enterPhase('job-42');
    const startEvent = telemetry.events.find(e => e.name === 'regulation_phase_started');
    expect(startEvent).toBeDefined();
    expect(startEvent.payload.jobId).toBe('job-42');
  });

  it('emits regulation_grade_achieved with correct grade and attempt_number on submitCalibration', () => {
    const { controller, telemetry } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-42');
    controller.submitCalibration();
    const event = telemetry.events.find(e => e.name === 'regulation_grade_achieved');
    expect(event).toBeDefined();
    expect(event.payload.grade).toBe(GRADES.ACCEPTABLE);
    expect(event.payload.attemptNumber).toBe(1);
    expect(event.payload.isPassing).toBe(true);
  });

  it('emits regulation_assist_mode_used when assist mode is executed', () => {
    const { controller, telemetry } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-42');
    controller.executeAssistMode();
    const event = telemetry.events.find(e => e.name === 'regulation_assist_mode_used');
    expect(event).toBeDefined();
    expect(event.payload.grade).not.toBeNull();
  });

  it('emits regulation_grade_achieved on assist mode execution', () => {
    const { controller, telemetry } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-42');
    controller.executeAssistMode();
    const event = telemetry.events.find(e => e.name === 'regulation_grade_achieved');
    expect(event).toBeDefined();
    expect(event.payload.attemptNumber).toBe(1);
  });

  it('emits regulation_phase_completed on completePhase', () => {
    const { controller, telemetry } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-42');
    controller.submitCalibration();
    controller.completePhase();
    const event = telemetry.events.find(e => e.name === 'regulation_phase_completed');
    expect(event).toBeDefined();
    expect(event.payload.regulationGrade).toBe(GRADES.ACCEPTABLE);
    expect(typeof event.payload.attemptCount).toBe('number');
  });

  it('all four telemetry events fire on happy path (AC6 smoke test)', () => {
    const { controller, telemetry } = makeController({ initialDeviation: 20 });
    controller.enterPhase('job-42');
    controller.submitCalibration();
    controller.completePhase();

    const names = telemetry.events.map(e => e.name);
    expect(names).toContain('regulation_phase_started');
    expect(names).toContain('regulation_grade_achieved');
    expect(names).toContain('regulation_phase_completed');
  });

  it('Test Scenario 10: all four events fire on assist mode path', () => {
    const { controller, telemetry } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-42');
    controller.executeAssistMode();
    controller.completePhase();

    const names = telemetry.events.map(e => e.name);
    expect(names).toContain('regulation_phase_started');
    expect(names).toContain('regulation_assist_mode_used');
    expect(names).toContain('regulation_grade_achieved');
    expect(names).toContain('regulation_phase_completed');
  });

  it('regulation_phase_completed payload includes assistModeUsed flag', () => {
    const { controller, telemetry } = makeController({ initialDeviation: 75 });
    controller.enterPhase('job-42');
    controller.executeAssistMode();
    controller.completePhase();
    const event = telemetry.events.find(e => e.name === 'regulation_phase_completed');
    expect(event.payload.assistModeUsed).toBe(true);
  });
});
