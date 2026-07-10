/**
 * Tests for LoupeFaultCueController — Issue #117 Scaffolded Fault-Signal System
 *
 * Covers:
 *   AC3 — A/B arm assignment: ~50/50, session-consistent, no re-randomisation on restore
 *   AC4 — Telemetry: loupe_cue_arm_assigned, loupe_time_before_first_hint,
 *          loupe_diagnosis_without_hint_sample captured and segmented by arm
 *   AC1/AC2 — Treatment arm activates loupe overlay; control arm preserves baseline
 */

const { LoupeFaultCueController, VALID_ARMS, AB_SUCCESS_THRESHOLD_PCT } = require('../../src/diagnosis/LoupeFaultCueController');
const { PlayerSaveState } = require('../../src/state/PlayerSaveState');
const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');
const { LoupeViewportRenderer } = require('../../src/diagnosis/LoupeViewportRenderer');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHook() {
  return jest.fn();
}

function makeController({ initialSaveState = {}, randomFn } = {}) {
  const saveState = new PlayerSaveState(initialSaveState);
  const hook = makeHook();
  const telemetry = new TelemetryEmitter(hook);
  const renderOverlay = jest.fn();
  const clearOverlay = jest.fn();
  const renderer = new LoupeViewportRenderer(renderOverlay, clearOverlay);
  const ctrl = new LoupeFaultCueController(
    saveState,
    telemetry,
    renderer,
    randomFn || Math.random,
  );
  return { ctrl, saveState, telemetry, hook, renderer, renderOverlay, clearOverlay };
}

// ─── Module constants ─────────────────────────────────────────────────────────

describe('LoupeFaultCueController — module constants', () => {
  test('VALID_ARMS contains treatment and control', () => {
    expect(VALID_ARMS).toContain('treatment');
    expect(VALID_ARMS).toContain('control');
  });

  test('AB_SUCCESS_THRESHOLD_PCT is 15', () => {
    expect(AB_SUCCESS_THRESHOLD_PCT).toBe(15);
  });
});

// ─── AC3: A/B arm assignment ──────────────────────────────────────────────────

describe('LoupeFaultCueController — AC3: A/B arm assignment', () => {
  test('assignArm returns treatment when randomFn returns < 0.5', () => {
    const { ctrl } = makeController({ randomFn: () => 0.4 });
    expect(ctrl.assignArm()).toBe('treatment');
  });

  test('assignArm returns control when randomFn returns >= 0.5', () => {
    const { ctrl } = makeController({ randomFn: () => 0.6 });
    expect(ctrl.assignArm()).toBe('control');
  });

  test('assignArm writes the arm to PlayerSaveState', () => {
    const { ctrl, saveState } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    expect(saveState.get('ab_loupe_cues_arm')).toBe('treatment');
  });

  test('assignArm is idempotent — second call returns existing arm without re-randomising', () => {
    let callCount = 0;
    const deterministicRng = () => {
      callCount++;
      return callCount === 1 ? 0.3 : 0.8; // first call → treatment, second would → control
    };
    const { ctrl } = makeController({ randomFn: deterministicRng });
    const first = ctrl.assignArm();
    const second = ctrl.assignArm();
    expect(first).toBe('treatment');
    expect(second).toBe('treatment'); // not re-randomised
  });

  test('assignArm on session restore returns existing arm from saveState without re-randomising', () => {
    // Simulate a pre-loaded save state (session restore scenario)
    const { ctrl } = makeController({
      initialSaveState: { ab_loupe_cues_arm: 'control' },
      randomFn: () => 0.0, // would assign 'treatment' if re-randomised
    });
    const arm = ctrl.assignArm();
    expect(arm).toBe('control'); // existing arm preserved
  });

  test('assignArm emits loupe_cue_arm_assigned event', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.4 });
    ctrl.assignArm('session-xyz');
    expect(telemetry.wasEmitted(EVENTS.LOUPE_CUE_ARM_ASSIGNED)).toBe(true);
  });

  test('loupe_cue_arm_assigned event carries the assigned arm and sessionId', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.4 });
    ctrl.assignArm('session-abc');
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_CUE_ARM_ASSIGNED
    );
    expect(event.payload.arm).toBe('treatment');
    expect(event.payload.sessionId).toBe('session-abc');
  });

  test('assignArm does NOT emit loupe_cue_arm_assigned on session restore (arm already exists)', () => {
    const { ctrl, telemetry } = makeController({
      initialSaveState: { ab_loupe_cues_arm: 'control' },
    });
    ctrl.assignArm();
    expect(telemetry.wasEmitted(EVENTS.LOUPE_CUE_ARM_ASSIGNED)).toBe(false);
  });

  test('isInTreatment returns true for treatment arm', () => {
    const { ctrl } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    expect(ctrl.isInTreatment()).toBe(true);
  });

  test('isInTreatment returns false for control arm', () => {
    const { ctrl } = makeController({ randomFn: () => 0.7 });
    ctrl.assignArm();
    expect(ctrl.isInTreatment()).toBe(false);
  });

  test('getArm returns null before arm is assigned', () => {
    const { ctrl } = makeController();
    expect(ctrl.getArm()).toBeNull();
  });

  test('getArm returns the assigned arm after assignArm()', () => {
    const { ctrl } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    expect(ctrl.getArm()).toBe('treatment');
  });
});

// ─── AC1/AC2: loupe viewport activation per arm ───────────────────────────────

describe('LoupeFaultCueController — AC1/AC2: loupe activation by arm', () => {
  test('activateLoupe activates the renderer for treatment arm', () => {
    const { ctrl, renderer } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.activateLoupe();
    expect(renderer.isLoupeActive()).toBe(true);
  });

  test('activateLoupe does NOT activate the renderer for control arm', () => {
    const { ctrl, renderer } = makeController({ randomFn: () => 0.7 });
    ctrl.assignArm();
    ctrl.activateLoupe();
    expect(renderer.isLoupeActive()).toBe(false);
  });

  test('deactivateLoupe always calls renderer.deactivateLoupe (both arms)', () => {
    const { ctrl, clearOverlay } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.activateLoupe();
    ctrl.deactivateLoupe();
    expect(clearOverlay).toHaveBeenCalled();
  });

  test('renderComponentInLoupe applies signal for treatment arm with known fault type', () => {
    const { ctrl, renderOverlay } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.activateLoupe();
    const result = ctrl.renderComponentInLoupe('balance-wheel', 'balance_wheel_fault');
    expect(result.signalApplied).toBe(true);
    expect(renderOverlay).toHaveBeenCalledWith('balance-wheel', 'faint-tint');
  });

  test('renderComponentInLoupe returns signalApplied:false for control arm', () => {
    const { ctrl, renderOverlay } = makeController({ randomFn: () => 0.7 });
    ctrl.assignArm();
    ctrl.activateLoupe();
    const result = ctrl.renderComponentInLoupe('balance-wheel', 'balance_wheel_fault');
    expect(result.signalApplied).toBe(false);
    expect(renderOverlay).not.toHaveBeenCalled();
  });

  test('renderComponentInLoupe returns signalApplied:false for healthy component in treatment arm', () => {
    const { ctrl, renderOverlay } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.activateLoupe();
    const result = ctrl.renderComponentInLoupe('healthy-part', null);
    expect(result.signalApplied).toBe(false);
    expect(renderOverlay).not.toHaveBeenCalled();
  });
});

// ─── AC4: telemetry — time-before-first-hint ─────────────────────────────────

describe('LoupeFaultCueController — AC4: loupe_time_before_first_hint telemetry', () => {
  test('recordFirstHint emits loupe_time_before_first_hint event', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-1');
    ctrl.recordFirstHint('fi-1');
    expect(telemetry.wasEmitted(EVENTS.LOUPE_TIME_BEFORE_FIRST_HINT)).toBe(true);
  });

  test('loupe_time_before_first_hint event contains faultInstanceId and arm', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-2');
    ctrl.recordFirstHint('fi-2');
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_TIME_BEFORE_FIRST_HINT
    );
    expect(event.payload.faultInstanceId).toBe('fi-2');
    expect(event.payload.arm).toBe('treatment');
    expect(typeof event.payload.elapsedMs).toBe('number');
  });

  test('loupe_time_before_first_hint event carries arm=control for control sessions', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.7 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-3');
    ctrl.recordFirstHint('fi-3');
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_TIME_BEFORE_FIRST_HINT
    );
    expect(event.payload.arm).toBe('control');
  });

  test('recordFirstHint is idempotent — only one event emitted per diagnosis', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-4');
    ctrl.recordFirstHint('fi-4');
    ctrl.recordFirstHint('fi-4');  // second call — should be suppressed
    const events = telemetry.getEmittedEvents().filter(
      (e) => e.name === EVENTS.LOUPE_TIME_BEFORE_FIRST_HINT
    );
    expect(events.length).toBe(1);
  });

  test('recordFirstHint fires again after startDiagnosis resets per-diagnosis state', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-5');
    ctrl.recordFirstHint('fi-5');
    ctrl.startDiagnosis('fi-6'); // new diagnosis — state reset
    ctrl.recordFirstHint('fi-6');
    const events = telemetry.getEmittedEvents().filter(
      (e) => e.name === EVENTS.LOUPE_TIME_BEFORE_FIRST_HINT
    );
    expect(events.length).toBe(2);
  });

  test('elapsedMs is null when startDiagnosis was not called', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    // startDiagnosis not called
    ctrl.recordFirstHint('fi-no-start');
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_TIME_BEFORE_FIRST_HINT
    );
    expect(event.payload.elapsedMs).toBeNull();
  });
});

// ─── AC4: telemetry — diagnosis-without-hint % ───────────────────────────────

describe('LoupeFaultCueController — AC4: loupe_diagnosis_without_hint_sample telemetry', () => {
  test('recordDiagnosisOutcome emits loupe_diagnosis_without_hint_sample', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-1');
    ctrl.recordDiagnosisOutcome('fi-1', false); // no hint used
    expect(telemetry.wasEmitted(EVENTS.LOUPE_DIAGNOSIS_WITHOUT_HINT_SAMPLE)).toBe(true);
  });

  test('first diagnosis without hint → 100% diagnosisWithoutHintPct', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-1');
    ctrl.recordDiagnosisOutcome('fi-1', false);
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_DIAGNOSIS_WITHOUT_HINT_SAMPLE
    );
    expect(event.payload.diagnosisWithoutHintPct).toBe(100);
  });

  test('first diagnosis WITH hint → 0% diagnosisWithoutHintPct', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-1');
    ctrl.recordDiagnosisOutcome('fi-1', true); // hint used
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_DIAGNOSIS_WITHOUT_HINT_SAMPLE
    );
    expect(event.payload.diagnosisWithoutHintPct).toBe(0);
  });

  test('running pct: 1 no-hint, 1 hint → 50% after second diagnosis', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-1');
    ctrl.recordDiagnosisOutcome('fi-1', false); // no hint
    ctrl.startDiagnosis('fi-2');
    ctrl.recordDiagnosisOutcome('fi-2', true);  // hint used
    const events = telemetry.getEmittedEvents().filter(
      (e) => e.name === EVENTS.LOUPE_DIAGNOSIS_WITHOUT_HINT_SAMPLE
    );
    expect(events[1].payload.diagnosisWithoutHintPct).toBe(50);
  });

  test('sample event carries the arm for segmentation', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.7 }); // control
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-1');
    ctrl.recordDiagnosisOutcome('fi-1', false);
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_DIAGNOSIS_WITHOUT_HINT_SAMPLE
    );
    expect(event.payload.arm).toBe('control');
  });

  test('sample event carries faultInstanceId', () => {
    const { ctrl, telemetry } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-99');
    ctrl.recordDiagnosisOutcome('fi-99', false);
    const event = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.LOUPE_DIAGNOSIS_WITHOUT_HINT_SAMPLE
    );
    expect(event.payload.faultInstanceId).toBe('fi-99');
  });
});

// ─── Session-level counters ───────────────────────────────────────────────────

describe('LoupeFaultCueController — session-level diagnosis counters', () => {
  test('getDiagnosisCount starts at 0', () => {
    const { ctrl } = makeController();
    expect(ctrl.getDiagnosisCount()).toBe(0);
  });

  test('getDiagnosisCount increments with each startDiagnosis', () => {
    const { ctrl } = makeController();
    ctrl.startDiagnosis('fi-1');
    ctrl.startDiagnosis('fi-2');
    expect(ctrl.getDiagnosisCount()).toBe(2);
  });

  test('getDiagnosisWithoutHintCount starts at 0', () => {
    const { ctrl } = makeController();
    expect(ctrl.getDiagnosisWithoutHintCount()).toBe(0);
  });

  test('getDiagnosisWithoutHintCount increments only on no-hint outcomes', () => {
    const { ctrl } = makeController({ randomFn: () => 0.3 });
    ctrl.assignArm();
    ctrl.startDiagnosis('fi-1'); ctrl.recordDiagnosisOutcome('fi-1', false);
    ctrl.startDiagnosis('fi-2'); ctrl.recordDiagnosisOutcome('fi-2', true);
    ctrl.startDiagnosis('fi-3'); ctrl.recordDiagnosisOutcome('fi-3', false);
    expect(ctrl.getDiagnosisWithoutHintCount()).toBe(2);
  });
});
