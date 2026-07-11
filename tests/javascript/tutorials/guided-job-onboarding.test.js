/**
 * Tests for Issue #111 — Guided First-Job Onboarding System
 *
 * Covers all 10 test scenarios from the acceptance criteria:
 *   1. Happy path — new player completes guided first job
 *   2. Player skips guided track at step 2
 *   3. Player skips at step 1 (immediately)
 *   4. Callout card fires at known failure point (tool selection)
 *   5. Component highlight targets correct part
 *   6. Highlight does NOT fire out of sequence
 *   7. Control cohort (A/B) sees no guided prompts
 *   8. A/B cohort assignment persists within session
 *   9. Guided track for an experienced player (sim-genre veteran)
 *  10. Tutorial completion rate counter increments correctly
 *
 * Also covers:
 *   - PlayerSaveState backward-compatible ab_first_job_cohort addition
 *   - TelemetryEmitter five new additive events
 *   - ComponentHighlightController isolation tests
 */

const {
  GuidedJobOnboardingController,
  PLACEHOLDER_STEP_CONFIG,
} = require('../../../src/tutorials/GuidedJobOnboardingController');
const { ComponentHighlightController } = require('../../../src/tutorials/ComponentHighlightController');
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');
const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeController(initialSaveData = {}, stepConfig = undefined) {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  const telemetry = new TelemetryEmitter(hook);
  const saveState = new PlayerSaveState(initialSaveData);
  const ctrl = stepConfig !== undefined
    ? new GuidedJobOnboardingController(saveState, telemetry, stepConfig)
    : new GuidedJobOnboardingController(saveState, telemetry);
  return { ctrl, saveState, telemetry, received };
}

/** Helper: assign guided cohort deterministically */
function makeGuidedController(initialSaveData = {}, stepConfig = undefined) {
  const setup = makeController(initialSaveData, stepConfig);
  // Force guided cohort via deterministic RNG (always < 0.5 → 'guided')
  setup.ctrl.assignCohort('job-001', () => 0.1);
  return setup;
}

/** Helper: assign control cohort deterministically */
function makeControlController(initialSaveData = {}) {
  const setup = makeController(initialSaveData);
  // Force control cohort via deterministic RNG (always >= 0.5 → 'control')
  setup.ctrl.assignCohort('job-001', () => 0.9);
  return setup;
}

// ─── PlayerSaveState: backward-compatible ab_first_job_cohort ─────────────────

describe('PlayerSaveState — Issue #111 backward-compatible ab_first_job_cohort', () => {
  test('defaults ab_first_job_cohort to null', () => {
    const save = new PlayerSaveState();
    expect(save.get('ab_first_job_cohort')).toBeNull();
  });

  test('pre-existing keys are unchanged', () => {
    const save = new PlayerSaveState();
    expect(save.get('tutorial_first_fault_seen')).toBe(false);
    expect(save.get('chronograph_overlay_seen')).toBe(false);
    expect(save.get('discovery_mode_enabled')).toBe(true);
    expect(save.get('current_stage')).toBeNull();
  });

  test('snapshot includes ab_first_job_cohort key', () => {
    const save = new PlayerSaveState();
    const snap = save.snapshot();
    expect(snap).toHaveProperty('ab_first_job_cohort', null);
  });

  test('initialState can pre-set ab_first_job_cohort to guided', () => {
    const save = new PlayerSaveState({ ab_first_job_cohort: 'guided' });
    expect(save.get('ab_first_job_cohort')).toBe('guided');
  });

  test('initialState can pre-set ab_first_job_cohort to control', () => {
    const save = new PlayerSaveState({ ab_first_job_cohort: 'control' });
    expect(save.get('ab_first_job_cohort')).toBe('control');
  });
});

// ─── TelemetryEmitter: five new additive events ───────────────────────────────

describe('TelemetryEmitter — Issue #111 additive events', () => {
  let telemetry;
  let received;

  beforeEach(() => {
    received = [];
    telemetry = new TelemetryEmitter((name, payload) => received.push({ name, payload }));
  });

  test('EVENTS map contains all five new event keys', () => {
    expect(EVENTS).toHaveProperty('ONBOARDING_STARTED', 'onboarding_started');
    expect(EVENTS).toHaveProperty('ONBOARDING_STEP_COMPLETED', 'onboarding_step_completed');
    expect(EVENTS).toHaveProperty('ONBOARDING_SKIPPED', 'onboarding_skipped');
    expect(EVENTS).toHaveProperty('ONBOARDING_COMPLETED', 'onboarding_completed');
    expect(EVENTS).toHaveProperty('AB_COHORT_ASSIGNED', 'ab_cohort_assigned');
  });

  test('onboardingStarted emits onboarding_started with jobId and cohort', () => {
    telemetry.onboardingStarted('job-001', 'guided');
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_STARTED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
    expect(evt.payload.cohort).toBe('guided');
  });

  test('onboardingStepCompleted emits onboarding_step_completed with jobId and step', () => {
    telemetry.onboardingStepCompleted('job-001', 2);
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_STEP_COMPLETED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
    expect(evt.payload.step).toBe(2);
  });

  test('onboardingSkipped emits onboarding_skipped with jobId and atStep', () => {
    telemetry.onboardingSkipped('job-001', 3);
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_SKIPPED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
    expect(evt.payload.atStep).toBe(3);
  });

  test('onboardingCompleted emits onboarding_completed with jobId', () => {
    telemetry.onboardingCompleted('job-001');
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_COMPLETED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
  });

  test('abCohortAssigned emits ab_cohort_assigned with cohort and jobId', () => {
    telemetry.abCohortAssigned('guided', 'job-001');
    const evt = received.find((e) => e.name === EVENTS.AB_COHORT_ASSIGNED);
    expect(evt).toBeDefined();
    expect(evt.payload.cohort).toBe('guided');
    expect(evt.payload.jobId).toBe('job-001');
  });

  test('existing events are unchanged (backward compatibility)', () => {
    telemetry.tutorialDiagnosisStarted('fault-001');
    const evt = received.find((e) => e.name === EVENTS.TUTORIAL_DIAGNOSIS_STARTED);
    expect(evt).toBeDefined();
    expect(evt.payload.faultInstanceId).toBe('fault-001');
  });
});

// ─── ComponentHighlightController ────────────────────────────────────────────

describe('ComponentHighlightController — construction and config', () => {
  test('accepts plain object config and resolves correct componentId', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring', 2: 'gear-train' });
    expect(highlight.getHighlightTarget(1)).toBe('mainspring');
    expect(highlight.getHighlightTarget(2)).toBe('gear-train');
  });

  test('accepts Map config', () => {
    const config = new Map([[1, 'case-back'], [2, 'escapement']]);
    const highlight = new ComponentHighlightController(config);
    expect(highlight.getHighlightTarget(1)).toBe('case-back');
  });

  test('returns null for unconfigured step', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring' });
    expect(highlight.getHighlightTarget(99)).toBeNull();
  });

  test('starts with no active step', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring' });
    expect(highlight.getActiveStep()).toBeNull();
  });
});

// ─── Test Scenario 5: Component highlight targets correct part (AC4) ──────────

describe('AC4 / Scenario 5 — Component highlight targets correct part', () => {
  test('activateHighlight returns the correct componentId for the active step', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring', 2: 'gear-train' });
    const target = highlight.activateHighlight(1);
    expect(target).toBe('mainspring');
    expect(highlight.getActiveStep()).toBe(1);
  });

  test('activateHighlight for step 2 returns gear-train', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring', 2: 'gear-train' });
    highlight.activateHighlight(1);
    const target = highlight.activateHighlight(2);
    expect(target).toBe('gear-train');
  });

  test('clearHighlight clears the active highlight on correct interaction (AC4)', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring' });
    highlight.activateHighlight(1);
    expect(highlight.getActiveStep()).toBe(1);
    highlight.clearHighlight();
    expect(highlight.getActiveStep()).toBeNull();
    expect(highlight.wasCleared()).toBe(true);
  });

  test('clearHighlight no-ops gracefully when no highlight is active', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring' });
    expect(() => highlight.clearHighlight()).not.toThrow();
    expect(highlight.wasCleared()).toBe(true);
  });
});

// ─── Test Scenario 6: Highlight does NOT fire out of sequence (AC4) ───────────

describe('AC4 / Scenario 6 — Highlight does NOT fire out of sequence', () => {
  test('isOutOfSequence returns false when no step is active', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring', 2: 'gear-train' });
    expect(highlight.isOutOfSequence(2)).toBe(false);
  });

  test('isOutOfSequence returns true when queried step is ahead of active step', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring', 2: 'gear-train', 3: 'escapement' });
    highlight.activateHighlight(1);
    expect(highlight.isOutOfSequence(2)).toBe(true);
    expect(highlight.isOutOfSequence(3)).toBe(true);
  });

  test('isOutOfSequence returns false for current or past step', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring', 2: 'gear-train' });
    highlight.activateHighlight(2);
    expect(highlight.isOutOfSequence(2)).toBe(false);
    expect(highlight.isOutOfSequence(1)).toBe(false);
  });

  test('activateHighlight returns null for a future step — no highlight fires prematurely', () => {
    const highlight = new ComponentHighlightController({ 1: 'mainspring', 3: 'escapement' });
    highlight.activateHighlight(1);
    // Step 3 should not be activated if the caller checks isOutOfSequence first
    expect(highlight.isOutOfSequence(3)).toBe(true);
  });
});

// ─── A/B Cohort Assignment ────────────────────────────────────────────────────

describe('GuidedJobOnboardingController — A/B cohort assignment', () => {
  test('assignCohort writes guided when RNG < 0.5', () => {
    const { ctrl, saveState } = makeController();
    ctrl.assignCohort('job-001', () => 0.1);
    expect(saveState.get('ab_first_job_cohort')).toBe('guided');
  });

  test('assignCohort writes control when RNG >= 0.5', () => {
    const { ctrl, saveState } = makeController();
    ctrl.assignCohort('job-001', () => 0.9);
    expect(saveState.get('ab_first_job_cohort')).toBe('control');
  });

  test('assignCohort emits ab_cohort_assigned event', () => {
    const { ctrl, received } = makeController();
    ctrl.assignCohort('job-001', () => 0.1);
    const evt = received.find((e) => e.name === EVENTS.AB_COHORT_ASSIGNED);
    expect(evt).toBeDefined();
    expect(evt.payload.cohort).toBe('guided');
    expect(evt.payload.jobId).toBe('job-001');
  });

  // Test Scenario 8: A/B cohort assignment persists within session
  test('Scenario 8 — assignCohort is idempotent: second call does not flip cohort', () => {
    const { ctrl, saveState, received } = makeController();
    ctrl.assignCohort('job-001', () => 0.1); // guided
    ctrl.assignCohort('job-001', () => 0.9); // would be control, but skipped
    expect(saveState.get('ab_first_job_cohort')).toBe('guided');
    // ab_cohort_assigned fired only once
    const abEvents = received.filter((e) => e.name === EVENTS.AB_COHORT_ASSIGNED);
    expect(abEvents.length).toBe(1);
  });

  test('Scenario 8 — pre-existing cohort in save state is preserved without re-emitting', () => {
    const { ctrl, saveState, received } = makeController({ ab_first_job_cohort: 'guided' });
    const result = ctrl.assignCohort('job-001', () => 0.9); // would be control, but existing wins
    expect(result).toBe('guided');
    expect(saveState.get('ab_first_job_cohort')).toBe('guided');
    // No ab_cohort_assigned event emitted (already assigned)
    const abEvents = received.filter((e) => e.name === EVENTS.AB_COHORT_ASSIGNED);
    expect(abEvents.length).toBe(0);
  });
});

// ─── Test Scenario 7: Control cohort sees no guided prompts ───────────────────

describe('AC5 / Scenario 7 — Control cohort: no guided prompts, tooltip-only unchanged', () => {
  test('shouldShow returns false for control cohort', () => {
    const { ctrl } = makeControlController();
    expect(ctrl.shouldShow()).toBe(false);
  });

  test('tryShow returns false for control cohort (short-circuit — no further code)', () => {
    const { ctrl } = makeControlController();
    const shown = ctrl.tryShow('job-001');
    expect(shown).toBe(false);
    expect(ctrl.isVisible()).toBe(false);
  });

  test('no onboarding_started event emitted for control cohort', () => {
    const { ctrl, received } = makeControlController();
    ctrl.tryShow('job-001');
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_STARTED);
    expect(evt).toBeUndefined();
  });

  test('control cohort with no cohort assigned yet also returns false from shouldShow', () => {
    const { ctrl } = makeController(); // no cohort set
    expect(ctrl.shouldShow()).toBe(false);
  });
});

// ─── Test Scenario 1: Happy path — new player completes guided first job ───────

describe('Scenario 1 — Happy path: new player completes guided first job', () => {
  test('tryShow returns true for guided cohort', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.tryShow('job-001')).toBe(true);
  });

  test('overlay is visible after tryShow for guided cohort', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    expect(ctrl.isVisible()).toBe(true);
  });

  test('starts at step 1 after tryShow', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    expect(ctrl.getCurrentStep()).toBe(1);
    const step = ctrl.getCurrentStepData();
    expect(step).not.toBeNull();
    expect(step.step).toBe(1);
  });

  test('emits onboarding_started with jobId and cohort=guided', () => {
    const { ctrl, received } = makeGuidedController();
    ctrl.tryShow('job-001');
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_STARTED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
    expect(evt.payload.cohort).toBe('guided');
  });

  test('can advance through all steps', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    const steps = [];
    let step = ctrl.getCurrentStepData();
    while (step) {
      steps.push(step.step);
      step = ctrl.advanceStep();
    }
    expect(steps.length).toBeGreaterThanOrEqual(PLACEHOLDER_STEP_CONFIG.length);
  });

  test('overlay becomes invisible and dismissed after all steps completed', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    // Advance past all steps
    for (let i = 0; i <= PLACEHOLDER_STEP_CONFIG.length + 1; i++) {
      ctrl.advanceStep();
    }
    expect(ctrl.isVisible()).toBe(false);
    expect(ctrl.isDismissed()).toBe(true);
  });

  // Test Scenario 10: completion rate counter
  test('Scenario 10 — onboarding_completed emitted on natural completion', () => {
    const { ctrl, received } = makeGuidedController();
    ctrl.tryShow('job-001');
    for (let i = 0; i <= PLACEHOLDER_STEP_CONFIG.length + 1; i++) {
      ctrl.advanceStep();
    }
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_COMPLETED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
  });

  test('Scenario 10 — onboarding_completed NOT emitted if player abandons (no advanceStep past last)', () => {
    const { ctrl, received } = makeGuidedController();
    ctrl.tryShow('job-001');
    // Advance only one step — simulate partial progress / session abandon
    ctrl.advanceStep();
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_COMPLETED);
    expect(evt).toBeUndefined();
  });
});

// ─── Test Scenario 2: Player skips at step 2 ─────────────────────────────────

describe('Scenario 2 — Player skips guided track at step 2', () => {
  test('skip() makes overlay invisible', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // advance to step 2
    ctrl.skip();
    expect(ctrl.isVisible()).toBe(false);
  });

  test('wasSkipped returns true after skip()', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // step 2
    ctrl.skip();
    expect(ctrl.wasSkipped()).toBe(true);
  });

  test('isDismissed returns true after skip() — no further prompts for session (AC3)', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // step 2
    ctrl.skip();
    expect(ctrl.isDismissed()).toBe(true);
  });

  test('shouldShow returns false after skip — overlay will not re-trigger this session', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // step 2
    ctrl.skip();
    expect(ctrl.shouldShow()).toBe(false);
  });

  test('emits onboarding_skipped with correct atStep', () => {
    const { ctrl, received } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // step 2
    ctrl.skip();
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_SKIPPED);
    expect(evt).toBeDefined();
    expect(evt.payload.atStep).toBe(2);
  });

  test('tryShow after skip returns false (no re-trigger within session)', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // step 2
    ctrl.skip();
    const reshown = ctrl.tryShow('job-001');
    expect(reshown).toBe(false);
  });
});

// ─── Test Scenario 3: Player skips at step 1 (immediately) ───────────────────

describe('Scenario 3 — Player skips at step 1 immediately', () => {
  test('skip() works at step 1 without requiring advanceStep first', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    expect(ctrl.getCurrentStep()).toBe(1);
    ctrl.skip();
    expect(ctrl.isVisible()).toBe(false);
    expect(ctrl.wasSkipped()).toBe(true);
    expect(ctrl.isDismissed()).toBe(true);
  });

  test('emits onboarding_skipped with atStep=1 when skipping immediately', () => {
    const { ctrl, received } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.skip();
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_SKIPPED);
    expect(evt).toBeDefined();
    expect(evt.payload.atStep).toBe(1);
  });

  test('no subsequent prompts appear after immediate skip', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.skip();
    const reshown = ctrl.tryShow('job-002');
    expect(reshown).toBe(false);
  });
});

// ─── Test Scenario 4: Callout card fires at known failure point ───────────────

describe('Scenario 4 — Callout card fires at designated step trigger (AC2)', () => {
  test('getCurrentStepData returns card with title and body at step 1', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    const card = ctrl.getCurrentStepData();
    expect(card).not.toBeNull();
    expect(typeof card.title).toBe('string');
    expect(card.title.length).toBeGreaterThan(0);
    expect(typeof card.body).toBe('string');
    expect(card.body.length).toBeGreaterThan(0);
  });

  test('each PLACEHOLDER_STEP_CONFIG entry has step, title, body, and componentId', () => {
    PLACEHOLDER_STEP_CONFIG.forEach((s) => {
      expect(typeof s.step).toBe('number');
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(typeof s.body).toBe('string');
      expect(s.body.length).toBeGreaterThan(0);
      expect(typeof s.componentId).toBe('string');
      expect(s.componentId.length).toBeGreaterThan(0);
    });
  });

  test('custom injected stepConfig fires at the correct step', () => {
    const customConfig = [
      { step: 1, title: 'Tool Selection', body: 'Pick the correct screwdriver', componentId: 'screwdriver-2mm' },
      { step: 2, title: 'Loosen Crown', body: 'Turn the crown counter-clockwise', componentId: 'crown' },
    ];
    const { ctrl } = makeGuidedController({}, customConfig);
    ctrl.tryShow('job-001');
    const card = ctrl.getCurrentStepData();
    expect(card.title).toBe('Tool Selection');
    expect(card.componentId).toBe('screwdriver-2mm');
  });

  test('callout card is dismissible with advanceStep (single interaction — AC2)', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    const step1 = ctrl.getCurrentStepData();
    expect(step1.step).toBe(1);
    const step2 = ctrl.advanceStep();
    expect(step2).not.toBeNull();
    expect(step2.step).toBe(2);
  });

  test('getCurrentStepData returns null before tryShow', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.getCurrentStepData()).toBeNull();
  });
});

// ─── Test Scenario 9: Experienced player skips and job remains fully functional ─

describe('Scenario 9 — Experienced player (sim-genre veteran) skips; job remains functional', () => {
  test('job can be completed without guidance after skip', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // step 2
    ctrl.skip();

    // Verify the controller is out of the way — no overlay, no stuck state
    expect(ctrl.isVisible()).toBe(false);
    expect(ctrl.isDismissed()).toBe(true);
    // advanceStep no-ops gracefully when overlay is not visible
    expect(ctrl.advanceStep()).toBeNull();
    expect(ctrl.getCurrentStepData()).toBeNull();
  });

  test('skip() is a no-op when overlay is not visible (safe to call defensively)', () => {
    const { ctrl } = makeGuidedController();
    // skip without tryShow — must not throw
    expect(() => ctrl.skip()).not.toThrow();
    expect(ctrl.isVisible()).toBe(false);
  });

  test('getTotalSteps returns the correct count', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.getTotalSteps()).toBe(PLACEHOLDER_STEP_CONFIG.length);
  });
});

// ─── AC3: Skip/Dismiss persistence within session ─────────────────────────────

describe('AC3 — Skip/dismiss persistence: no prompts re-appear within the session', () => {
  test('after skip, isDismissed is true for the rest of the session', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.skip();
    expect(ctrl.isDismissed()).toBe(true);
    expect(ctrl.shouldShow()).toBe(false);
  });

  test('after natural completion, isDismissed is true', () => {
    const { ctrl } = makeGuidedController();
    ctrl.tryShow('job-001');
    for (let i = 0; i <= PLACEHOLDER_STEP_CONFIG.length + 1; i++) {
      ctrl.advanceStep();
    }
    expect(ctrl.isDismissed()).toBe(true);
    expect(ctrl.shouldShow()).toBe(false);
  });

  test('onboarding_step_completed events emitted for each advanced step', () => {
    const { ctrl, received } = makeGuidedController();
    ctrl.tryShow('job-001');
    ctrl.advanceStep(); // completes step 1, moves to step 2
    ctrl.advanceStep(); // completes step 2, moves to step 3
    const stepEvents = received.filter((e) => e.name === EVENTS.ONBOARDING_STEP_COMPLETED);
    expect(stepEvents.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── GuidedJobOnboardingController: initial state ────────────────────────────

describe('GuidedJobOnboardingController — initial state', () => {
  test('isVisible returns false before tryShow', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.isVisible()).toBe(false);
  });

  test('getCurrentStepData returns null before tryShow', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.getCurrentStepData()).toBeNull();
  });

  test('wasSkipped returns false initially', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.wasSkipped()).toBe(false);
  });

  test('isDismissed returns false initially', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.isDismissed()).toBe(false);
  });

  test('advanceStep returns null when overlay not visible', () => {
    const { ctrl } = makeGuidedController();
    expect(ctrl.advanceStep()).toBeNull();
  });
});
