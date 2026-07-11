/**
 * Tests for AC4 — First-Time Tutorial Overlay
 *
 * AC4: First-time players encounter a guided walkthrough overlay on their very
 * first fault diagnosis; the overlay is skippable with a single action and
 * never shown again after the first playthrough.
 *
 * Scenario 3: First session, first fault → overlay shown automatically.
 * Scenario 4: Player clicks "Skip" → overlay dismisses; skip is persisted.
 * Scenario 8: Second fault in same session → overlay does NOT re-trigger.
 */

const { TutorialOverlay, WALKTHROUGH_STEPS } = require('../../../src/tutorials/TutorialOverlay');
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');
const { TelemetryEmitter } = require('../../../src/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTutorial(initialSaveData = {}) {
  const events = [];
  const hook = (name, payload) => events.push({ name, payload });
  const telemetry = new TelemetryEmitter(hook);
  const saveState = new PlayerSaveState(initialSaveData);
  const tutorial = new TutorialOverlay(saveState, telemetry);
  return { tutorial, saveState, telemetry, events };
}

// ─── Scenario 3: First-time player sees overlay automatically ─────────────────

describe('Scenario 3 — First-time player sees tutorial overlay automatically', () => {
  test('shouldShow returns true for brand-new player (tutorial_first_fault_seen = false)', () => {
    const { tutorial } = makeTutorial();
    expect(tutorial.shouldShow()).toBe(true);
  });

  test('tryShow returns true and makes overlay visible for first-time player', () => {
    const { tutorial } = makeTutorial();
    const shown = tutorial.tryShow('fault-inst-1');
    expect(shown).toBe(true);
    expect(tutorial.isVisible()).toBe(true);
  });

  test('tryShow emits tutorial_diagnosis_started event', () => {
    const { tutorial, events } = makeTutorial();
    tutorial.tryShow('fault-inst-1');
    const event = events.find((e) => e.name === 'tutorial_diagnosis_started');
    expect(event).toBeDefined();
    expect(event.payload.faultInstanceId).toBe('fault-inst-1');
  });

  test('tutorial starts at step 1 after tryShow', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi');
    const step = tutorial.getCurrentStepData();
    expect(step).not.toBeNull();
    expect(step.step).toBe(1);
  });
});

// ─── Scenario 4: Skip dismisses overlay and persists the flag ─────────────────

describe('Scenario 4 — Player skips tutorial; skip is persisted; overlay never appears again', () => {
  test('skip() dismisses the overlay immediately', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi');
    tutorial.skip();
    expect(tutorial.isVisible()).toBe(false);
  });

  test('skip() writes tutorial_first_fault_seen = true to save state', () => {
    const { tutorial, saveState } = makeTutorial();
    tutorial.tryShow('fi');
    tutorial.skip();
    expect(saveState.get('tutorial_first_fault_seen')).toBe(true);
  });

  test('wasSkipped returns true after skip()', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi');
    tutorial.skip();
    expect(tutorial.wasSkipped()).toBe(true);
  });

  test('after skip, shouldShow returns false', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi');
    tutorial.skip();
    expect(tutorial.shouldShow()).toBe(false);
  });

  test('tryShow on subsequent fault after skip returns false (never shown again)', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi-1');
    tutorial.skip();
    const shown = tutorial.tryShow('fi-2');
    expect(shown).toBe(false);
    expect(tutorial.isVisible()).toBe(false);
  });
});

// ─── Scenario 8: Already-diagnosed fault re-examined — overlay does not re-trigger ──

describe('Scenario 8 — Re-examining a fault does not re-trigger tutorial overlay', () => {
  test('second fault in same session does not show overlay after first was completed', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi-1');
    // Advance through all steps
    while (tutorial.isVisible()) {
      tutorial.nextStep();
    }
    // Second fault — overlay should NOT appear
    const shown = tutorial.tryShow('fi-2');
    expect(shown).toBe(false);
    expect(tutorial.isVisible()).toBe(false);
  });

  test('player with save data already set never sees the tutorial', () => {
    const { tutorial } = makeTutorial({ tutorial_first_fault_seen: true });
    const shown = tutorial.tryShow('fi');
    expect(shown).toBe(false);
  });
});

// ─── Walkthrough step navigation ──────────────────────────────────────────────

describe('TutorialOverlay — step navigation', () => {
  test('has the correct total number of steps', () => {
    const { tutorial } = makeTutorial();
    expect(tutorial.getTotalSteps()).toBe(WALKTHROUGH_STEPS.length);
  });

  test('nextStep advances through all walkthrough steps', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi');
    const steps = [];
    let step = tutorial.getCurrentStepData();
    while (step) {
      steps.push(step.step);
      step = tutorial.nextStep();
    }
    expect(steps).toEqual(WALKTHROUGH_STEPS.map((s) => s.step));
  });

  test('overlay is no longer visible after advancing past the last step', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('fi');
    for (let i = 0; i <= WALKTHROUGH_STEPS.length; i++) {
      tutorial.nextStep();
    }
    expect(tutorial.isVisible()).toBe(false);
  });

  test('tutorial_first_fault_seen is persisted after completing all steps', () => {
    const { tutorial, saveState } = makeTutorial();
    tutorial.tryShow('fi');
    for (let i = 0; i <= WALKTHROUGH_STEPS.length; i++) {
      tutorial.nextStep();
    }
    expect(saveState.get('tutorial_first_fault_seen')).toBe(true);
  });

  test('each walkthrough step has a non-empty title and body', () => {
    WALKTHROUGH_STEPS.forEach((step) => {
      expect(typeof step.title).toBe('string');
      expect(step.title.length).toBeGreaterThan(0);
      expect(typeof step.body).toBe('string');
      expect(step.body.length).toBeGreaterThan(0);
    });
  });
});

// ─── PlayerSaveState ──────────────────────────────────────────────────────────

describe('PlayerSaveState', () => {
  test('defaults tutorial_first_fault_seen to false', () => {
    const save = new PlayerSaveState();
    expect(save.get('tutorial_first_fault_seen')).toBe(false);
  });

  test('set and get round-trip correctly', () => {
    const save = new PlayerSaveState();
    save.set('tutorial_first_fault_seen', true);
    expect(save.get('tutorial_first_fault_seen')).toBe(true);
  });

  test('snapshot returns a copy of the state', () => {
    const save = new PlayerSaveState({ tutorial_first_fault_seen: true });
    const snap = save.snapshot();
    expect(snap.tutorial_first_fault_seen).toBe(true);
  });
});
