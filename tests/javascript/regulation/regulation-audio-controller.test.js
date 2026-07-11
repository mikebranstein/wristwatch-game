/**
 * Tests: RegulationAudioController — audio tick feedback for the regulation phase.
 * Issue #294 — Movement Regulation Phase 1
 *
 * Covers Test Scenario 6: audio feedback changes as regulator is adjusted;
 * convergence toward target produces discernibly different audio state.
 *
 * Run with: npm test
 */
'use strict';

const {
  RegulationAudioController,
  REGULATION_AUDIO_CUES,
  REGULATION_AUDIO_STATE,
} = require('../../../javascript/regulation/RegulationAudioController');
const { GRADE_THRESHOLDS, GRADES } = require('../../../javascript/regulation/RegulationConfig');

function makeController(audioEnabled = true) {
  const cues = [];
  const audioHook = (cueId) => cues.push(cueId);
  const controller = new RegulationAudioController({ audioHook, audioEnabled });
  return { controller, cues };
}

describe('RegulationAudioController', () => {
  describe('constructor', () => {
    it('requires audioHook', () => {
      expect(() => new RegulationAudioController({ audioHook: 'not-a-fn' }))
        .toThrow('RegulationAudioController requires an audioHook function.');
    });

    it('starts in IDLE state', () => {
      const { controller } = makeController();
      expect(controller.getAudioState()).toBe(REGULATION_AUDIO_STATE.IDLE);
    });
  });

  describe('updateForDeviation() — Test Scenario 6', () => {
    it('transitions to IRREGULAR when far from target (> 2x Acceptable)', () => {
      const { controller } = makeController();
      const acceptableThreshold = GRADE_THRESHOLDS[GRADES.ACCEPTABLE];
      controller.updateForDeviation(acceptableThreshold * 3); // 3x Acceptable
      expect(controller.getAudioState()).toBe(REGULATION_AUDIO_STATE.IRREGULAR);
    });

    it('fires TICK_IRREGULAR cue when transitioning to IRREGULAR', () => {
      const { controller, cues } = makeController();
      controller.updateForDeviation(100); // far from target
      expect(cues).toContain(REGULATION_AUDIO_CUES.TICK_IRREGULAR);
    });

    it('transitions to CONVERGING when approaching target (within 2x Acceptable)', () => {
      const { controller } = makeController();
      const acceptableThreshold = GRADE_THRESHOLDS[GRADES.ACCEPTABLE];
      controller.updateForDeviation(acceptableThreshold * 3); // start IRREGULAR
      controller.updateForDeviation(acceptableThreshold * 1.5); // enter CONVERGING band
      expect(controller.getAudioState()).toBe(REGULATION_AUDIO_STATE.CONVERGING);
    });

    it('fires TICK_CONVERGING cue when transitioning to CONVERGING', () => {
      const { controller, cues } = makeController();
      const acceptableThreshold = GRADE_THRESHOLDS[GRADES.ACCEPTABLE];
      controller.updateForDeviation(acceptableThreshold * 3);  // IRREGULAR
      controller.updateForDeviation(acceptableThreshold * 1.5); // CONVERGING
      expect(cues).toContain(REGULATION_AUDIO_CUES.TICK_CONVERGING);
    });

    it('transitions to STABLE when within Acceptable zone (Test Scenario 6: smooth audio)', () => {
      const { controller } = makeController();
      controller.updateForDeviation(20); // within ±30
      expect(controller.getAudioState()).toBe(REGULATION_AUDIO_STATE.STABLE);
    });

    it('fires TICK_STABLE cue when entering Acceptable zone', () => {
      const { controller, cues } = makeController();
      controller.updateForDeviation(20);
      expect(cues).toContain(REGULATION_AUDIO_CUES.TICK_STABLE);
    });

    it('does not re-fire cue when state does not change', () => {
      const { controller, cues } = makeController();
      controller.updateForDeviation(100); // IRREGULAR
      const cuesAfterFirst = cues.length;
      controller.updateForDeviation(90);  // still IRREGULAR
      expect(cues.length).toBe(cuesAfterFirst); // no additional cue
    });

    it('when audio is disabled, no cues fire', () => {
      const { controller, cues } = makeController(false);
      controller.updateForDeviation(100);
      expect(cues).toHaveLength(0);
    });
  });

  describe('stop()', () => {
    it('emits STOP_ALL cue on stop', () => {
      const { controller, cues } = makeController();
      controller.updateForDeviation(100);
      controller.stop();
      expect(cues).toContain(REGULATION_AUDIO_CUES.STOP_ALL);
    });

    it('is IDLE after stop()', () => {
      const { controller } = makeController();
      controller.updateForDeviation(100);
      controller.stop();
      expect(controller.getAudioState()).toBe(REGULATION_AUDIO_STATE.IDLE);
    });

    it('no-ops additional updateForDeviation after stop', () => {
      const { controller, cues } = makeController();
      controller.stop();
      const lengthAfterStop = cues.length;
      controller.updateForDeviation(100);
      expect(cues.length).toBe(lengthAfterStop);
    });
  });

  describe('reset()', () => {
    it('allows updateForDeviation to fire again after reset', () => {
      const { controller, cues } = makeController();
      controller.stop();
      controller.reset();
      controller.updateForDeviation(100);
      expect(controller.getAudioState()).toBe(REGULATION_AUDIO_STATE.IRREGULAR);
    });
  });
});
