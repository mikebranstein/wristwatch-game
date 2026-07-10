'use strict';

const MAX_AUDIO_BUNDLE_BYTES = 2 * 1024 * 1024;

const AUDIO_EVENT_LIBRARY = Object.freeze({
  case_screw_removal: Object.freeze({
    cueId: 'case_screw_removal',
    phase: 'disassembly',
    priority: 35,
    assetPath: 'audio/disassembly/case-screw-removal.webm',
    fallbackAssetPath: 'audio/disassembly/case-screw-removal.mp3',
    sizeBytes: 42000,
    baseGain: 0.68,
  }),
  case_back_pry: Object.freeze({
    cueId: 'case_back_pry',
    phase: 'disassembly',
    priority: 50,
    assetPath: 'audio/disassembly/case-back-pry.webm',
    fallbackAssetPath: 'audio/disassembly/case-back-pry.mp3',
    sizeBytes: 56000,
    baseGain: 0.78,
  }),
  crown_pull: Object.freeze({
    cueId: 'crown_pull',
    phase: 'disassembly',
    priority: 40,
    assetPath: 'audio/disassembly/crown-pull.webm',
    fallbackAssetPath: 'audio/disassembly/crown-pull.mp3',
    sizeBytes: 30000,
    baseGain: 0.62,
  }),
  stem_removal: Object.freeze({
    cueId: 'stem_removal',
    phase: 'disassembly',
    priority: 40,
    assetPath: 'audio/disassembly/stem-removal.webm',
    fallbackAssetPath: 'audio/disassembly/stem-removal.mp3',
    sizeBytes: 31000,
    baseGain: 0.6,
  }),
  tool_pickup: Object.freeze({
    cueId: 'tool_pickup',
    phase: 'disassembly',
    priority: 20,
    assetPath: 'audio/common/tool-pickup.webm',
    fallbackAssetPath: 'audio/common/tool-pickup.mp3',
    sizeBytes: 18000,
    baseGain: 0.54,
    legacyPhase1: true,
  }),
  metal_cleaning_brush: Object.freeze({
    cueId: 'metal_cleaning_brush',
    phase: 'cleaning',
    priority: 32,
    assetPath: 'audio/cleaning/metal-cleaning-brush.webm',
    fallbackAssetPath: 'audio/cleaning/metal-cleaning-brush.mp3',
    sizeBytes: 44000,
    baseGain: 0.7,
  }),
  crystal_polish: Object.freeze({
    cueId: 'crystal_polish',
    phase: 'cleaning',
    priority: 34,
    assetPath: 'audio/cleaning/crystal-polish.webm',
    fallbackAssetPath: 'audio/cleaning/crystal-polish.mp3',
    sizeBytes: 46000,
    baseGain: 0.66,
  }),
  gasket_rinse: Object.freeze({
    cueId: 'gasket_rinse',
    phase: 'cleaning',
    priority: 30,
    assetPath: 'audio/cleaning/gasket-rinse.webm',
    fallbackAssetPath: 'audio/cleaning/gasket-rinse.mp3',
    sizeBytes: 36000,
    baseGain: 0.63,
  }),
  reveal_cue: Object.freeze({
    cueId: 'reveal_cue',
    phase: 'cleaning',
    priority: 76,
    assetPath: 'audio/cleaning/reveal-cue.webm',
    fallbackAssetPath: 'audio/cleaning/reveal-cue.mp3',
    sizeBytes: 54000,
    baseGain: 0.82,
    legacyPhase1: true,
  }),
  loupe_place: Object.freeze({
    cueId: 'loupe_place',
    phase: 'inspection',
    priority: 28,
    assetPath: 'audio/inspection/loupe-place.webm',
    fallbackAssetPath: 'audio/inspection/loupe-place.mp3',
    sizeBytes: 19000,
    baseGain: 0.5,
  }),
  movement_holder_set: Object.freeze({
    cueId: 'movement_holder_set',
    phase: 'inspection',
    priority: 29,
    assetPath: 'audio/inspection/movement-holder-set.webm',
    fallbackAssetPath: 'audio/inspection/movement-holder-set.mp3',
    sizeBytes: 24000,
    baseGain: 0.55,
  }),
  barrel_install_click: Object.freeze({
    cueId: 'barrel_install_click',
    phase: 'reassembly',
    priority: 60,
    assetPath: 'audio/reassembly/barrel-install-click.webm',
    fallbackAssetPath: 'audio/reassembly/barrel-install-click.mp3',
    sizeBytes: 33000,
    baseGain: 0.73,
  }),
  gear_train_seat: Object.freeze({
    cueId: 'gear_train_seat',
    phase: 'reassembly',
    priority: 58,
    assetPath: 'audio/reassembly/gear-train-seat.webm',
    fallbackAssetPath: 'audio/reassembly/gear-train-seat.mp3',
    sizeBytes: 35000,
    baseGain: 0.7,
  }),
  lever_settle: Object.freeze({
    cueId: 'lever_settle',
    phase: 'reassembly',
    priority: 55,
    assetPath: 'audio/reassembly/lever-settle.webm',
    fallbackAssetPath: 'audio/reassembly/lever-settle.mp3',
    sizeBytes: 26000,
    baseGain: 0.67,
  }),
  pallet_set: Object.freeze({
    cueId: 'pallet_set',
    phase: 'reassembly',
    priority: 57,
    assetPath: 'audio/reassembly/pallet-set.webm',
    fallbackAssetPath: 'audio/reassembly/pallet-set.mp3',
    sizeBytes: 25000,
    baseGain: 0.67,
  }),
  balance_wheel_drop: Object.freeze({
    cueId: 'balance_wheel_drop',
    phase: 'reassembly',
    priority: 90,
    assetPath: 'audio/reassembly/balance-wheel-drop.webm',
    fallbackAssetPath: 'audio/reassembly/balance-wheel-drop.mp3',
    sizeBytes: 38000,
    baseGain: 0.8,
  }),
  first_tick_tension_ramp: Object.freeze({
    cueId: 'first_tick_tension_ramp',
    phase: 'reassembly',
    priority: 88,
    assetPath: 'audio/reassembly/first-tick-tension-ramp.webm',
    fallbackAssetPath: 'audio/reassembly/first-tick-tension-ramp.mp3',
    sizeBytes: 62000,
    baseGain: 0.74,
    legacyPhase1: true,
  }),
  first_tick_one_shot: Object.freeze({
    cueId: 'first_tick_one_shot',
    phase: 'reassembly',
    priority: 96,
    assetPath: 'audio/reassembly/first-tick-one-shot.webm',
    fallbackAssetPath: 'audio/reassembly/first-tick-one-shot.mp3',
    sizeBytes: 40000,
    baseGain: 0.9,
    legacyPhase1: true,
  }),
  first_tick_ticking_loop: Object.freeze({
    cueId: 'first_tick_ticking_loop',
    phase: 'reassembly',
    priority: 45,
    assetPath: 'audio/reassembly/first-tick-ticking-loop.webm',
    fallbackAssetPath: 'audio/reassembly/first-tick-ticking-loop.mp3',
    sizeBytes: 59000,
    baseGain: 0.6,
    legacyPhase1: true,
  }),
  first_tick_stop_all: Object.freeze({
    cueId: 'first_tick_stop_all',
    phase: 'control',
    priority: 99,
    assetPath: null,
    fallbackAssetPath: null,
    sizeBytes: 0,
    baseGain: 1,
    controlCue: true,
  }),
  dial_place_click: Object.freeze({
    cueId: 'dial_place_click',
    phase: 'reassembly',
    priority: 61,
    assetPath: 'audio/reassembly/dial-place-click.webm',
    fallbackAssetPath: 'audio/reassembly/dial-place-click.mp3',
    sizeBytes: 32000,
    baseGain: 0.72,
  }),
  hand_press_hour: Object.freeze({
    cueId: 'hand_press_hour',
    phase: 'reassembly',
    priority: 62,
    assetPath: 'audio/reassembly/hand-press-hour.webm',
    fallbackAssetPath: 'audio/reassembly/hand-press-hour.mp3',
    sizeBytes: 27000,
    baseGain: 0.71,
  }),
  hand_press_minute: Object.freeze({
    cueId: 'hand_press_minute',
    phase: 'reassembly',
    priority: 63,
    assetPath: 'audio/reassembly/hand-press-minute.webm',
    fallbackAssetPath: 'audio/reassembly/hand-press-minute.mp3',
    sizeBytes: 28000,
    baseGain: 0.72,
  }),
  hand_press_seconds: Object.freeze({
    cueId: 'hand_press_seconds',
    phase: 'reassembly',
    priority: 64,
    assetPath: 'audio/reassembly/hand-press-seconds.webm',
    fallbackAssetPath: 'audio/reassembly/hand-press-seconds.mp3',
    sizeBytes: 29000,
    baseGain: 0.73,
  }),
  crystal_press: Object.freeze({
    cueId: 'crystal_press',
    phase: 'casing_up',
    priority: 72,
    assetPath: 'audio/casing/crystal-press.webm',
    fallbackAssetPath: 'audio/casing/crystal-press.mp3',
    sizeBytes: 48000,
    baseGain: 0.8,
  }),
  case_back_thread_engage: Object.freeze({
    cueId: 'case_back_thread_engage',
    phase: 'casing_up',
    priority: 68,
    assetPath: 'audio/casing/case-back-thread-engage.webm',
    fallbackAssetPath: 'audio/casing/case-back-thread-engage.mp3',
    sizeBytes: 35000,
    baseGain: 0.75,
  }),
  case_back_close: Object.freeze({
    cueId: 'case_back_close',
    phase: 'casing_up',
    priority: 84,
    assetPath: 'audio/casing/case-back-close.webm',
    fallbackAssetPath: 'audio/casing/case-back-close.mp3',
    sizeBytes: 39000,
    baseGain: 0.84,
    legacyPhase1: true,
  }),
  crown_push_in: Object.freeze({
    cueId: 'crown_push_in',
    phase: 'casing_up',
    priority: 44,
    assetPath: 'audio/casing/crown-push-in.webm',
    fallbackAssetPath: 'audio/casing/crown-push-in.mp3',
    sizeBytes: 26000,
    baseGain: 0.61,
  }),
  time_setting_click: Object.freeze({
    cueId: 'time_setting_click',
    phase: 'qa_delivery',
    priority: 52,
    assetPath: 'audio/qa/time-setting-click.webm',
    fallbackAssetPath: 'audio/qa/time-setting-click.mp3',
    sizeBytes: 21000,
    baseGain: 0.57,
  }),
  water_resistance_test: Object.freeze({
    cueId: 'water_resistance_test',
    phase: 'qa_delivery',
    priority: 53,
    assetPath: 'audio/qa/water-resistance-test.webm',
    fallbackAssetPath: 'audio/qa/water-resistance-test.mp3',
    sizeBytes: 28000,
    baseGain: 0.58,
  }),
  final_polish: Object.freeze({
    cueId: 'final_polish',
    phase: 'qa_delivery',
    priority: 36,
    assetPath: 'audio/qa/final-polish.webm',
    fallbackAssetPath: 'audio/qa/final-polish.mp3',
    sizeBytes: 33000,
    baseGain: 0.6,
  }),
  packaging_close: Object.freeze({
    cueId: 'packaging_close',
    phase: 'qa_delivery',
    priority: 47,
    assetPath: 'audio/qa/packaging-close.webm',
    fallbackAssetPath: 'audio/qa/packaging-close.mp3',
    sizeBytes: 31000,
    baseGain: 0.63,
  }),
  delivery_confirmation: Object.freeze({
    cueId: 'delivery_confirmation',
    phase: 'qa_delivery',
    priority: 100,
    assetPath: 'audio/qa/delivery-confirmation.webm',
    fallbackAssetPath: 'audio/qa/delivery-confirmation.mp3',
    sizeBytes: 38000,
    baseGain: 0.9,
    legacyPhase1: true,
  }),
});

const WORKFLOW_EVENT_IDS = Object.freeze([
  'case_screw_removal',
  'case_back_pry',
  'crown_pull',
  'stem_removal',
  'tool_pickup',
  'metal_cleaning_brush',
  'crystal_polish',
  'gasket_rinse',
  'reveal_cue',
  'loupe_place',
  'movement_holder_set',
  'barrel_install_click',
  'gear_train_seat',
  'lever_settle',
  'pallet_set',
  'balance_wheel_drop',
  'first_tick_tension_ramp',
  'first_tick_one_shot',
  'dial_place_click',
  'hand_press_hour',
  'hand_press_minute',
  'hand_press_seconds',
  'crystal_press',
  'case_back_thread_engage',
  'case_back_close',
  'crown_push_in',
  'time_setting_click',
  'water_resistance_test',
  'final_polish',
  'packaging_close',
  'delivery_confirmation',
]);

const PHASE_1_REGRESSION_CUE_IDS = Object.freeze([
  'reveal_cue',
  'first_tick_one_shot',
  'case_back_close',
  'tool_pickup',
  'delivery_confirmation',
]);

class AudioEventLibrary {
  static getCue(cueId) {
    const cue = AUDIO_EVENT_LIBRARY[cueId];
    return cue ? Object.assign({}, cue) : null;
  }

  static hasCue(cueId) {
    return Object.prototype.hasOwnProperty.call(AUDIO_EVENT_LIBRARY, cueId);
  }

  static getWorkflowEventIds() {
    return [...WORKFLOW_EVENT_IDS];
  }

  static getPhase1RegressionCueIds() {
    return [...PHASE_1_REGRESSION_CUE_IDS];
  }

  static getDefinedPhases() {
    return [...new Set(WORKFLOW_EVENT_IDS.map((cueId) => AUDIO_EVENT_LIBRARY[cueId].phase))];
  }

  static getTotalCompressedSizeBytes() {
    return WORKFLOW_EVENT_IDS.reduce((total, cueId) => total + AUDIO_EVENT_LIBRARY[cueId].sizeBytes, 0);
  }

  static getMaxBundleBytes() {
    return MAX_AUDIO_BUNDLE_BYTES;
  }
}

module.exports = {
  AUDIO_EVENT_LIBRARY,
  AudioEventLibrary,
  MAX_AUDIO_BUNDLE_BYTES,
  WORKFLOW_EVENT_IDS,
  PHASE_1_REGRESSION_CUE_IDS,
};
