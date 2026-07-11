'use strict';

const {
  AudioEventLibrary,
  MAX_AUDIO_BUNDLE_BYTES,
  WORKFLOW_EVENT_IDS,
  PHASE_1_REGRESSION_CUE_IDS,
} = require('../../../javascript/audio/AudioEventLibrary');

describe('AudioEventLibrary — AC1 full contextual event coverage', () => {
  test('defines 20–30+ restoration cues spanning the entire workflow', () => {
    expect(WORKFLOW_EVENT_IDS.length).toBeGreaterThanOrEqual(20);
    expect(WORKFLOW_EVENT_IDS.length).toBeLessThanOrEqual(31);
  });

  test('every workflow cue resolves to a concrete asset mapping', () => {
    for (const cueId of WORKFLOW_EVENT_IDS) {
      const cue = AudioEventLibrary.getCue(cueId);
      expect(cue).not.toBeNull();
      expect(cue.assetPath).toEqual(expect.any(String));
      expect(cue.fallbackAssetPath).toEqual(expect.any(String));
      expect(cue.priority).toEqual(expect.any(Number));
    }
  });

  test('workflow coverage includes disassembly, cleaning, inspection, reassembly, casing, and QA/delivery', () => {
    expect(AudioEventLibrary.getDefinedPhases()).toEqual(expect.arrayContaining([
      'disassembly',
      'cleaning',
      'inspection',
      'reassembly',
      'casing_up',
      'qa_delivery',
    ]));
  });
});

describe('AudioEventLibrary — AC4 bundle budget', () => {
  test('compressed audio bundle stays within the 2MB ceiling', () => {
    expect(AudioEventLibrary.getTotalCompressedSizeBytes()).toBeLessThanOrEqual(MAX_AUDIO_BUNDLE_BYTES);
  });
});

describe('AudioEventLibrary — AC5 phase 1 regression hooks', () => {
  test('retains canonical cue IDs for all Phase 1 events', () => {
    expect(PHASE_1_REGRESSION_CUE_IDS).toEqual(expect.arrayContaining([
      'reveal_cue',
      'first_tick_one_shot',
      'case_back_close',
      'tool_pickup',
      'delivery_confirmation',
    ]));
  });
});
