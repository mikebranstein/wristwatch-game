/**
 * Tests: RegulationTutorial — first-run contextual tutorial.
 * Issue #294 — Movement Regulation Phase 1
 *
 * Covers Test Scenario 7: Tutorial dismissed → does not re-appear on subsequent phases.
 *
 * Run with: npm test
 */
'use strict';

const { RegulationTutorial, TUTORIAL_STEPS } = require('../../src/regulation/RegulationTutorial');

function makeSaveState(initial = {}) {
  const store = { regulation_tutorial_seen: false, ...initial };
  return {
    get: (k) => store[k] !== undefined ? store[k] : null,
    set: (k, v) => { store[k] = v; },
    _store: store,
  };
}

describe('RegulationTutorial', () => {
  describe('shouldShow()', () => {
    it('returns true when regulation_tutorial_seen is false (new player)', () => {
      const saveState = makeSaveState({ regulation_tutorial_seen: false });
      const tutorial = new RegulationTutorial({ saveState });
      expect(tutorial.shouldShow()).toBe(true);
    });

    it('returns false when regulation_tutorial_seen is true (returning player)', () => {
      const saveState = makeSaveState({ regulation_tutorial_seen: true });
      const tutorial = new RegulationTutorial({ saveState });
      expect(tutorial.shouldShow()).toBe(false);
    });
  });

  describe('tryShow()', () => {
    it('shows tutorial and returns true for first-time player', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      expect(tutorial.tryShow()).toBe(true);
      expect(tutorial.isVisible()).toBe(true);
    });

    it('returns false and does not show for returning player (Test Scenario 7)', () => {
      const saveState = makeSaveState({ regulation_tutorial_seen: true });
      const tutorial = new RegulationTutorial({ saveState });
      expect(tutorial.tryShow()).toBe(false);
      expect(tutorial.isVisible()).toBe(false);
    });
  });

  describe('dismiss() — Test Scenario 7', () => {
    it('persists regulation_tutorial_seen = true after dismiss', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      tutorial.tryShow();
      tutorial.dismiss();
      expect(saveState._store.regulation_tutorial_seen).toBe(true);
    });

    it('hides tutorial after dismiss', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      tutorial.tryShow();
      tutorial.dismiss();
      expect(tutorial.isVisible()).toBe(false);
    });

    it('Test Scenario 7: dismissed tutorial does not re-appear on new instance', () => {
      const saveState = makeSaveState();
      const tutorial1 = new RegulationTutorial({ saveState });
      tutorial1.tryShow();
      tutorial1.dismiss();

      // Simulate new session — new instance with same save state
      const tutorial2 = new RegulationTutorial({ saveState });
      expect(tutorial2.shouldShow()).toBe(false);
      expect(tutorial2.tryShow()).toBe(false);
    });

    it('wasDismissed() returns true after dismiss', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      tutorial.tryShow();
      tutorial.dismiss();
      expect(tutorial.wasDismissed()).toBe(true);
    });
  });

  describe('nextStep()', () => {
    it('advances to step 2 on first call after tryShow', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      tutorial.tryShow();
      const step = tutorial.nextStep();
      expect(step.step).toBe(2);
    });

    it('returns null and completes tutorial after last step', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      tutorial.tryShow();
      // Advance past last step
      for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
        tutorial.nextStep();
      }
      expect(tutorial.isVisible()).toBe(false);
      expect(saveState._store.regulation_tutorial_seen).toBe(true);
    });

    it('returns null if tutorial is not visible', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      expect(tutorial.nextStep()).toBeNull();
    });
  });

  describe('getCurrentStepData()', () => {
    it('returns step 1 data after tryShow', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      tutorial.tryShow();
      const stepData = tutorial.getCurrentStepData();
      expect(stepData.step).toBe(1);
      expect(typeof stepData.title).toBe('string');
      expect(typeof stepData.body).toBe('string');
    });

    it('returns null when tutorial is not visible', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      expect(tutorial.getCurrentStepData()).toBeNull();
    });
  });

  describe('getTotalSteps()', () => {
    it('returns 4 (one step per regulation concept)', () => {
      const saveState = makeSaveState();
      const tutorial = new RegulationTutorial({ saveState });
      expect(tutorial.getTotalSteps()).toBe(4);
    });
  });
});
