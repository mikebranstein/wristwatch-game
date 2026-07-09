/**
 * Tests for Issue #111 — Guided First-Job Onboarding System
 *
 * Covers all 10 test scenarios from the issue spec plus acceptance criteria:
 *
 * AC2: Callout cards display at correct steps (data-driven step config)
 * AC3: Skip/dismiss works correctly (session-scoped, step-2+ gate)
 * AC4: Component highlights are accurate (ComponentHighlightController)
 * AC5: A/B test data captured (telemetry events emitted correctly)
 *
 * Test Scenarios:
 *  1. Happy path — new player completes guided first job
 *  2. Player skips guided track at step 2
 *  3. Player skips at step 1 (immediately — should be blocked, step 2+ gate)
 *  4. Callout card fires at known failure point (tool selection step)
 *  5. Component highlight targets correct part
 *  6. Highlight does NOT fire out of sequence
 *  7. Control cohort (A/B) sees no guided prompts
 *  8. A/B cohort assignment persists within session
 *  9. Guided track for an experienced player (skip path does not impede job)
 * 10. Tutorial completion rate counter increments correctly (telemetry events)
 *
 * Plus: PlayerSaveState backward-compatibility, TelemetryEmitter new events
 */

const {
  GuidedJobOnboardingController,
  DEFAULT_STEP_CONFIG,
  COHORTS,
} = require('../../src/tutorials/GuidedJobOnboardingController');
const { ComponentHighlightController } = require('../../src/tutorials/ComponentHighlightController');
const { PlayerSaveState } = require('../../src/state/PlayerSaveState');
const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a wired set of collaborators for testing.
 * @param {Object} initialSaveData  Pre-populated save state
 * @returns {{ controller, saveState, telemetry, received, hook }}
 */
function makeController(initialSaveData = {}) {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  const telemetry = new TelemetryEmitter(hook);
  const saveState = new PlayerSaveState(initialSaveData);
  const controller = new GuidedJobOnboardingController(saveState, telemetry);
  return { controller, saveState, telemetry, received, hook };
}

/** Make a guided-cohort controller (already assigned) */
function makeGuidedController(extraSave = {}) {
  return makeController({ ab_first_job_cohort: COHORTS.GUIDED, ...extraSave });
}

/** Make a control-cohort controller (already assigned) */
function makeControlController(extraSave = {}) {
  return makeController({ ab_first_job_cohort: COHORTS.CONTROL, ...extraSave });
}

/** Create a ComponentHighlightController with a simple 5-step config */
function makeHighlightController() {
  const stepConfig = {
    1: 'mainspring',
    2: 'gear-train',
    3: 'escapement',
    4: 'tool-tray',
    5: 'delivery-slot',
  };
  return new ComponentHighlightController(stepConfig);
}

// ═════════════════════════════════════════════════════════════════════════════
// A/B Cohort Assignment
// ═════════════════════════════════════════════════════════════════════════════

describe('A/B Cohort Assignment', () => {
  test('assigns guided cohort when random < 0.5', () => {
    const { controller, saveState } = makeController();
    const cohort = controller.assignCohortIfNeeded(() => 0.4);
    expect(cohort).toBe(COHORTS.GUIDED);
    expect(saveState.get('ab_first_job_cohort')).toBe(COHORTS.GUIDED);
  });

  test('assigns control cohort when random >= 0.5', () => {
    const { controller, saveState } = makeController();
    const cohort = controller.assignCohortIfNeeded(() => 0.5);
    expect(cohort).toBe(COHORTS.CONTROL);
    expect(saveState.get('ab_first_job_cohort')).toBe(COHORTS.CONTROL);
  });

  test('emits ab_cohort_assigned event with cohort value', () => {
    const { controller, received } = makeController();
    controller.assignCohortIfNeeded(() => 0.3);
    const evt = received.find((e) => e.name === EVENTS.AB_COHORT_ASSIGNED);
    expect(evt).toBeDefined();
    expect(evt.payload.cohort).toBe(COHORTS.GUIDED);
  });

  // Test Scenario 8: A/B cohort assignment persists within session
  test('Scenario 8 — assignCohortIfNeeded is idempotent: second call returns same cohort', () => {
    const { controller } = makeController();
    const first = controller.assignCohortIfNeeded(() => 0.3);  // guided
    const second = controller.assignCohortIfNeeded(() => 0.9); // would be control, but skipped
    expect(second).toBe(first);
    expect(second).toBe(COHORTS.GUIDED);
  });

  test('Scenario 8 — no second ab_cohort_assigned event on repeat call', () => {
    const { controller, received } = makeController();
    controller.assignCohortIfNeeded(() => 0.3);
    controller.assignCohortIfNeeded(() => 0.9);
    const events = received.filter((e) => e.name === EVENTS.AB_COHORT_ASSIGNED);
    expect(events).toHaveLength(1);
  });

  test('getCohort returns null before assignment', () => {
    const { controller } = makeController();
    expect(controller.getCohort()).toBeNull();
  });

  test('getCohort returns assigned cohort after assignment', () => {
    const { controller } = makeController();
    controller.assignCohortIfNeeded(() => 0.1);
    expect(controller.getCohort()).toBe(COHORTS.GUIDED);
  });

  test('getCohort reads pre-seeded cohort from save state', () => {
    const { controller } = makeGuidedController();
    expect(controller.getCohort()).toBe(COHORTS.GUIDED);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// shouldShow / tryShow — Guided Cohort
// ═════════════════════════════════════════════════════════════════════════════

describe('shouldShow / tryShow — Guided Cohort (AC2)', () => {
  test('shouldShow returns true for guided cohort, not yet dismissed', () => {
    const { controller } = makeGuidedController();
    expect(controller.shouldShow()).toBe(true);
  });

  test('tryShow returns true for guided cohort player', () => {
    const { controller } = makeGuidedController();
    expect(controller.tryShow('job-001')).toBe(true);
  });

  test('tryShow makes overlay visible', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    expect(controller.isVisible()).toBe(true);
  });

  test('tryShow sets current step to 1', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    expect(controller.getCurrentStepIndex()).toBe(1);
  });

  test('tryShow emits onboarding_started with jobId and cohort', () => {
    const { controller, received } = makeGuidedController();
    controller.tryShow('job-001');
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_STARTED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
    expect(evt.payload.cohort).toBe(COHORTS.GUIDED);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Scenario 7: Control cohort sees no guided prompts (AC5)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scenario 7 — Control cohort: no guided prompts shown', () => {
  test('shouldShow returns false for control cohort', () => {
    const { controller } = makeControlController();
    expect(controller.shouldShow()).toBe(false);
  });

  test('tryShow returns false for control cohort', () => {
    const { controller } = makeControlController();
    expect(controller.tryShow('job-001')).toBe(false);
  });

  test('overlay is not visible after tryShow for control cohort', () => {
    const { controller } = makeControlController();
    controller.tryShow('job-001');
    expect(controller.isVisible()).toBe(false);
  });

  test('no onboarding_started emitted for control cohort', () => {
    const { controller, received } = makeControlController();
    controller.tryShow('job-001');
    expect(received.find((e) => e.name === EVENTS.ONBOARDING_STARTED)).toBeUndefined();
  });

  test('shouldShow returns false when cohort is null (not yet assigned)', () => {
    const { controller } = makeController(); // no cohort
    expect(controller.shouldShow()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Scenario 1: Happy path — new player completes guided first job (AC2)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scenario 1 — Happy path: new player completes guided first job', () => {
  test('getCurrentStepData returns step 1 data after tryShow', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    const step = controller.getCurrentStepData();
    expect(step).not.toBeNull();
    expect(step.step).toBe(1);
    expect(typeof step.title).toBe('string');
    expect(step.title.length).toBeGreaterThan(0);
    expect(typeof step.body).toBe('string');
    expect(step.body.length).toBeGreaterThan(0);
  });

  test('nextStep advances from step 1 to step 2', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    const step2 = controller.nextStep();
    expect(step2).not.toBeNull();
    expect(step2.step).toBe(2);
  });

  test('player can advance through all steps without skipping', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    const visited = [controller.getCurrentStepData().step];
    let next;
    while ((next = controller.nextStep()) !== null) {
      visited.push(next.step);
    }
    expect(visited).toHaveLength(DEFAULT_STEP_CONFIG.length);
    expect(visited[0]).toBe(1);
    expect(visited[visited.length - 1]).toBe(DEFAULT_STEP_CONFIG.length);
  });

  test('overlay is not visible after advancing past the last step', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    for (let i = 0; i <= DEFAULT_STEP_CONFIG.length; i++) {
      controller.nextStep();
    }
    expect(controller.isVisible()).toBe(false);
  });

  // Test Scenario 10: completion event fired at end of guided job (AC5)
  test('Scenario 10 — onboarding_completed emitted when all steps finished', () => {
    const { controller, received } = makeGuidedController();
    controller.tryShow('job-001');
    for (let i = 0; i <= DEFAULT_STEP_CONFIG.length; i++) {
      controller.nextStep();
    }
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_COMPLETED);
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
    expect(evt.payload.cohort).toBe(COHORTS.GUIDED);
  });

  test('Scenario 10 — onboarding_completed NOT emitted for incomplete session', () => {
    const { controller, received } = makeGuidedController();
    controller.tryShow('job-001');
    // Advance only part-way (simulate abandon)
    controller.nextStep();
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_COMPLETED);
    expect(evt).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Scenario 4: Callout card fires at known failure point (AC2)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scenario 4 — AC2: Callout card fires at designated step trigger', () => {
  test('step 4 (tool-selection) has componentId referencing tool tray', () => {
    const toolStep = DEFAULT_STEP_CONFIG.find((s) => s.step === 4);
    expect(toolStep).toBeDefined();
    expect(toolStep.componentId).toBe('tool-tray');
  });

  test('each DEFAULT_STEP_CONFIG entry has non-empty title, body, and componentId', () => {
    DEFAULT_STEP_CONFIG.forEach((s) => {
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(typeof s.body).toBe('string');
      expect(s.body.length).toBeGreaterThan(0);
      expect(typeof s.componentId).toBe('string');
      expect(s.componentId.length).toBeGreaterThan(0);
    });
  });

  test('custom stepConfig is used when injected at construction', () => {
    const received = [];
    const hook = (name, payload) => received.push({ name, payload });
    const telemetry = new TelemetryEmitter(hook);
    const saveState = new PlayerSaveState({ ab_first_job_cohort: COHORTS.GUIDED });
    const customConfig = [
      { step: 1, title: 'Custom Step 1', body: 'Custom body 1', componentId: 'custom-comp-1' },
      { step: 2, title: 'Custom Step 2', body: 'Custom body 2', componentId: 'custom-comp-2' },
    ];
    const controller = new GuidedJobOnboardingController(saveState, telemetry, customConfig);
    controller.tryShow('job-custom');
    const step = controller.getCurrentStepData();
    expect(step.title).toBe('Custom Step 1');
    expect(step.componentId).toBe('custom-comp-1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Scenario 2: Player skips guided track at step 2 (AC3)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scenario 2 — AC3: Player skips guided track at step 2', () => {
  test('skip() returns true at step 2', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // advance to step 2
    expect(controller.skip('job-001')).toBe(true);
  });

  test('overlay is not visible after skip at step 2', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // step 2
    controller.skip('job-001');
    expect(controller.isVisible()).toBe(false);
  });

  test('isDismissedThisSession is true after skip', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // step 2
    controller.skip('job-001');
    expect(controller.isDismissedThisSession()).toBe(true);
  });

  test('shouldShow returns false after skip (no further prompts this session)', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // step 2
    controller.skip('job-001');
    expect(controller.shouldShow()).toBe(false);
  });

  test('tryShow returns false on second attempt after skip', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // step 2
    controller.skip('job-001');
    expect(controller.tryShow('job-002')).toBe(false);
  });

  test('skip at step 2 emits onboarding_skipped with stepAtSkip=2', () => {
    const { controller, received } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // step 2
    controller.skip('job-001');
    const evt = received.find((e) => e.name === EVENTS.ONBOARDING_SKIPPED);
    expect(evt).toBeDefined();
    expect(evt.payload.stepAtSkip).toBe(2);
    expect(evt.payload.cohort).toBe(COHORTS.GUIDED);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Scenario 3: Player attempts to skip at step 1 (gate must block it) (AC3)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scenario 3 — AC3: Skip not available at step 1 (minimum skip gate)', () => {
  test('skip() returns false at step 1', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    // currentStep is 1 — skip should be blocked
    expect(controller.skip('job-001')).toBe(false);
  });

  test('overlay remains visible after failed skip at step 1', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.skip('job-001'); // returns false, no-op
    expect(controller.isVisible()).toBe(true);
  });

  test('no onboarding_skipped emitted when skip fails at step 1', () => {
    const { controller, received } = makeGuidedController();
    controller.tryShow('job-001');
    controller.skip('job-001');
    expect(received.find((e) => e.name === EVENTS.ONBOARDING_SKIPPED)).toBeUndefined();
  });

  test('skip() returns false when overlay is not visible', () => {
    const { controller } = makeGuidedController();
    // Never called tryShow
    expect(controller.skip('job-001')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Scenario 9: Experienced player skips and completes job without guidance (AC3)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scenario 9 — Experienced player: skip at step 2, job remains completable', () => {
  test('after skip, getCurrentStepData returns null', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // step 2
    controller.skip('job-001');
    expect(controller.getCurrentStepData()).toBeNull();
  });

  test('after skip, nextStep returns null (no more prompts)', () => {
    const { controller } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // step 2
    controller.skip('job-001');
    expect(controller.nextStep()).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// onboarding_step_completed telemetry (AC5)
// ═════════════════════════════════════════════════════════════════════════════

describe('AC5: onboarding_step_completed emitted on each nextStep call', () => {
  test('each nextStep call emits onboarding_step_completed', () => {
    const { controller, received } = makeGuidedController();
    controller.tryShow('job-001');
    controller.nextStep(); // leaves step 1
    const evt = received.find(
      (e) => e.name === EVENTS.ONBOARDING_STEP_COMPLETED && e.payload.step === 1,
    );
    expect(evt).toBeDefined();
    expect(evt.payload.jobId).toBe('job-001');
    expect(evt.payload.cohort).toBe(COHORTS.GUIDED);
  });

  test('correct step numbers emitted across all steps', () => {
    const { controller, received } = makeGuidedController();
    controller.tryShow('job-001');
    for (let i = 0; i < DEFAULT_STEP_CONFIG.length; i++) {
      controller.nextStep();
    }
    const stepEvents = received
      .filter((e) => e.name === EVENTS.ONBOARDING_STEP_COMPLETED)
      .map((e) => e.payload.step);
    // Should have one event per step (steps 1 through N)
    expect(stepEvents).toHaveLength(DEFAULT_STEP_CONFIG.length);
    for (let i = 1; i <= DEFAULT_STEP_CONFIG.length; i++) {
      expect(stepEvents).toContain(i);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test Scenario 5 & 6: ComponentHighlightController (AC4)
// ═════════════════════════════════════════════════════════════════════════════

describe('Scenario 5 — AC4: Component highlight targets correct part', () => {
  test('getHighlightTarget(1) returns mainspring for step 1', () => {
    const highlight = makeHighlightController();
    expect(highlight.getHighlightTarget(1)).toBe('mainspring');
  });

  test('getHighlightTarget(3) returns escapement for step 3', () => {
    const highlight = makeHighlightController();
    // Must clear steps 1 and 2 first (sequential order)
    highlight.clearHighlight(1);
    highlight.clearHighlight(2);
    expect(highlight.getHighlightTarget(3)).toBe('escapement');
  });

  test('getActiveHighlight returns current highlight target', () => {
    const highlight = makeHighlightController();
    highlight.getHighlightTarget(1);
    const active = highlight.getActiveHighlight();
    expect(active).not.toBeNull();
    expect(active.step).toBe(1);
    expect(active.componentId).toBe('mainspring');
  });

  test('clearHighlight removes active highlight', () => {
    const highlight = makeHighlightController();
    highlight.getHighlightTarget(1);
    highlight.clearHighlight(1);
    expect(highlight.getActiveHighlight()).toBeNull();
  });

  test('cleared step is no longer highlighted', () => {
    const highlight = makeHighlightController();
    highlight.getHighlightTarget(1);
    highlight.clearHighlight(1);
    expect(highlight.getHighlightTarget(1)).toBeNull();
  });

  test('isStepCleared returns true after clearHighlight', () => {
    const highlight = makeHighlightController();
    highlight.getHighlightTarget(1);
    highlight.clearHighlight(1);
    expect(highlight.isStepCleared(1)).toBe(true);
  });

  test('isStepCleared returns false before clearHighlight', () => {
    const highlight = makeHighlightController();
    expect(highlight.isStepCleared(1)).toBe(false);
  });
});

describe('Scenario 6 — AC4: Highlight does NOT fire out of sequence', () => {
  test('getHighlightTarget returns null for step 2 when step 1 has not been cleared', () => {
    const highlight = makeHighlightController();
    // Step 1 not cleared — step 2 is out of sequence
    expect(highlight.getHighlightTarget(2)).toBeNull();
  });

  test('getHighlightTarget returns null for step 3 when only step 1 is cleared', () => {
    const highlight = makeHighlightController();
    highlight.clearHighlight(1);
    // Step 2 not cleared — step 3 is out of sequence
    expect(highlight.getHighlightTarget(3)).toBeNull();
  });

  test('isOutOfSequence returns true for step 3 when only step 1 cleared', () => {
    const highlight = makeHighlightController();
    highlight.clearHighlight(1);
    expect(highlight.isOutOfSequence(3)).toBe(true);
  });

  test('isOutOfSequence returns false for step 1 (first valid step)', () => {
    const highlight = makeHighlightController();
    expect(highlight.isOutOfSequence(1)).toBe(false);
  });

  test('isOutOfSequence returns false for step 2 after step 1 cleared', () => {
    const highlight = makeHighlightController();
    highlight.clearHighlight(1);
    expect(highlight.isOutOfSequence(2)).toBe(false);
  });

  test('sequential clear enables next step highlight', () => {
    const highlight = makeHighlightController();
    highlight.getHighlightTarget(1);
    highlight.clearHighlight(1);
    expect(highlight.getHighlightTarget(2)).toBe('gear-train');
  });

  test('getHighlightTarget returns null for unknown step', () => {
    const highlight = makeHighlightController();
    // Clear first 4 steps to make step 99 in-sequence but undefined
    [1, 2, 3, 4].forEach((s) => highlight.clearHighlight(s));
    expect(highlight.getHighlightTarget(99)).toBeNull();
  });
});

describe('ComponentHighlightController — reset', () => {
  test('reset clears all state', () => {
    const highlight = makeHighlightController();
    highlight.getHighlightTarget(1);
    highlight.clearHighlight(1);
    highlight.reset();
    expect(highlight.getActiveHighlight()).toBeNull();
    expect(highlight.isStepCleared(1)).toBe(false);
  });

  test('after reset, step 1 is available again', () => {
    const highlight = makeHighlightController();
    highlight.getHighlightTarget(1);
    highlight.clearHighlight(1);
    highlight.reset();
    expect(highlight.getHighlightTarget(1)).toBe('mainspring');
  });
});

describe('ComponentHighlightController — empty config (Phase 1 not yet delivered)', () => {
  test('returns null for any step when config is empty', () => {
    const highlight = new ComponentHighlightController({});
    expect(highlight.getHighlightTarget(1)).toBeNull();
    expect(highlight.getHighlightTarget(2)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PlayerSaveState — Issue #111 backward-compatibility
// ═════════════════════════════════════════════════════════════════════════════

describe('PlayerSaveState — Issue #111 backward-compatible ab_first_job_cohort addition', () => {
  test('defaults ab_first_job_cohort to null', () => {
    const save = new PlayerSaveState();
    expect(save.get('ab_first_job_cohort')).toBeNull();
  });

  test('existing tutorial_first_fault_seen default is unchanged', () => {
    const save = new PlayerSaveState();
    expect(save.get('tutorial_first_fault_seen')).toBe(false);
  });

  test('existing discovery_mode_enabled default is unchanged', () => {
    const save = new PlayerSaveState();
    expect(save.get('discovery_mode_enabled')).toBe(true);
  });

  test('existing chronograph_overlay_seen default is unchanged', () => {
    const save = new PlayerSaveState();
    expect(save.get('chronograph_overlay_seen')).toBe(false);
  });

  test('initialState overrides ab_first_job_cohort', () => {
    const save = new PlayerSaveState({ ab_first_job_cohort: COHORTS.GUIDED });
    expect(save.get('ab_first_job_cohort')).toBe(COHORTS.GUIDED);
  });

  test('snapshot includes ab_first_job_cohort key', () => {
    const save = new PlayerSaveState();
    const snap = save.snapshot();
    expect(snap).toHaveProperty('ab_first_job_cohort', null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TelemetryEmitter — Issue #111 new events (additive)
// ═════════════════════════════════════════════════════════════════════════════

describe('TelemetryEmitter — Issue #111 additive events', () => {
  function makeTelemetry() {
    const received = [];
    const hook = (name, payload) => received.push({ name, payload });
    return { telemetry: new TelemetryEmitter(hook), received };
  }

  test('EVENTS.ONBOARDING_STARTED is defined', () => {
    expect(EVENTS.ONBOARDING_STARTED).toBe('onboarding_started');
  });

  test('EVENTS.ONBOARDING_STEP_COMPLETED is defined', () => {
    expect(EVENTS.ONBOARDING_STEP_COMPLETED).toBe('onboarding_step_completed');
  });

  test('EVENTS.ONBOARDING_SKIPPED is defined', () => {
    expect(EVENTS.ONBOARDING_SKIPPED).toBe('onboarding_skipped');
  });

  test('EVENTS.ONBOARDING_COMPLETED is defined', () => {
    expect(EVENTS.ONBOARDING_COMPLETED).toBe('onboarding_completed');
  });

  test('EVENTS.AB_COHORT_ASSIGNED is defined', () => {
    expect(EVENTS.AB_COHORT_ASSIGNED).toBe('ab_cohort_assigned');
  });

  test('onboardingStarted emits correct payload', () => {
    const { telemetry, received } = makeTelemetry();
    telemetry.onboardingStarted('job-1', COHORTS.GUIDED);
    const evt = received.find((e) => e.name === 'onboarding_started');
    expect(evt).toBeDefined();
    expect(evt.payload).toEqual({ jobId: 'job-1', cohort: COHORTS.GUIDED });
  });

  test('onboardingStepCompleted emits correct payload', () => {
    const { telemetry, received } = makeTelemetry();
    telemetry.onboardingStepCompleted('job-1', 3, COHORTS.GUIDED);
    const evt = received.find((e) => e.name === 'onboarding_step_completed');
    expect(evt).toBeDefined();
    expect(evt.payload).toEqual({ jobId: 'job-1', step: 3, cohort: COHORTS.GUIDED });
  });

  test('onboardingSkipped emits correct payload', () => {
    const { telemetry, received } = makeTelemetry();
    telemetry.onboardingSkipped('job-1', 2, COHORTS.GUIDED);
    const evt = received.find((e) => e.name === 'onboarding_skipped');
    expect(evt).toBeDefined();
    expect(evt.payload).toEqual({ jobId: 'job-1', stepAtSkip: 2, cohort: COHORTS.GUIDED });
  });

  test('onboardingCompleted emits correct payload', () => {
    const { telemetry, received } = makeTelemetry();
    telemetry.onboardingCompleted('job-1', COHORTS.GUIDED);
    const evt = received.find((e) => e.name === 'onboarding_completed');
    expect(evt).toBeDefined();
    expect(evt.payload).toEqual({ jobId: 'job-1', cohort: COHORTS.GUIDED });
  });

  test('abCohortAssigned emits correct payload', () => {
    const { telemetry, received } = makeTelemetry();
    telemetry.abCohortAssigned(COHORTS.CONTROL);
    const evt = received.find((e) => e.name === 'ab_cohort_assigned');
    expect(evt).toBeDefined();
    expect(evt.payload).toEqual({ cohort: COHORTS.CONTROL });
  });

  test('new events do not affect wasEmitted for pre-existing events', () => {
    const { telemetry } = makeTelemetry();
    // None of the old events are emitted
    expect(telemetry.wasEmitted('tutorial_diagnosis_started')).toBe(false);
    expect(telemetry.wasEmitted('reassembly_completed')).toBe(false);
    expect(telemetry.wasEmitted('chronograph_overlay_shown')).toBe(false);
  });
});
