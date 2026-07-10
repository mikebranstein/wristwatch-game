/**
 * FunctionalTestPanel — Phase 2 interactive functional tests for watch intake.
 *
 * Responsibilities (AC1, AC2 — Issue #149):
 *   - Make 3–5 functional test tools available after the MVP visual checklist
 *     is complete and before disassembly begins (AC1).
 *   - Run each interactive test and return a structured result that can be
 *     recorded on the job card as a functional finding (AC2).
 *   - Each test reports a result enum, a severity, and whether the finding
 *     should be offered to the player as a pre-existing-damage candidate.
 *
 * Tests included:
 *   1. crown_wind          — feel simulated mainspring resistance
 *   2. audible_tick        — stethoscope on caseback, listen for beat
 *   3. pusher_crown_func   — chronograph / complication pusher & crown positions
 *   4. visual_shake        — rotor movement on automatic watches
 *   5. water_resistance    — gasket / seal condition
 *
 * Design constraints:
 *   - Tests are accessible only after MVP checklist completion flag is set.
 *   - Each test is independently runnable; no forced ordering.
 *   - Accepts injectable RNG for deterministic testing.
 *   - #77 integration is NOT required here — trust scoring is handled by
 *     ScopeNegotiationScreen.
 *   - Keyboard-navigable by design: each test is a discrete callable action
 *     (no mouse-only requirement), satisfying the accessibility constraint.
 */

'use strict';

// ─── Test definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {'stiff'|'normal'|'broken'} CrownWindResult
 * @typedef {'ticking'|'erratic'|'silent'} AudibleTickResult
 * @typedef {'functional'|'sticky'|'non_functional'} PusherCrownResult
 * @typedef {'rotor_free'|'rotor_sluggish'|'rotor_stuck'} VisualShakeResult
 * @typedef {'sealed'|'gasket_worn'|'seal_failed'} WaterResistanceResult
 */

/**
 * Canonical set of functional test IDs available in Phase 2.
 * Always exactly 5; the UI may choose to surface 3–5 depending on watch type.
 * @type {string[]}
 */
const FUNCTIONAL_TEST_IDS = [
  'crown_wind',
  'audible_tick',
  'pusher_crown_func',
  'visual_shake',
  'water_resistance',
];

/**
 * Metadata for each functional test — label, tool required, possible results,
 * and which results represent a finding worth flagging as pre-existing damage.
 */
const FUNCTIONAL_TEST_DEFINITIONS = {
  crown_wind: {
    id: 'crown_wind',
    label: 'Crown Wind Test',
    toolId: 'crown-winding-tool',
    description: 'Wind the crown to feel simulated mainspring resistance.',
    accessibilityHint: 'Press Space or Enter to wind the crown; result is announced via aria-live.',
    possibleResults: ['stiff', 'normal', 'broken'],
    findingResults: ['stiff', 'broken'], // results that warrant pre-existing flag
  },
  audible_tick: {
    id: 'audible_tick',
    label: 'Audible Tick Test',
    toolId: 'stethoscope-tool',
    description: 'Place stethoscope on caseback to listen for movement beat.',
    accessibilityHint: 'Activate tool with Space/Enter; audio cue is accompanied by on-screen text status.',
    possibleResults: ['ticking', 'erratic', 'silent'],
    findingResults: ['erratic', 'silent'],
  },
  pusher_crown_func: {
    id: 'pusher_crown_func',
    label: 'Pusher & Crown Function Test',
    toolId: null, // direct interaction only — no dedicated tool
    description: 'Test chronograph pushers and crown positions for complications.',
    accessibilityHint: 'Tab to each pusher/crown position and activate with Space/Enter.',
    possibleResults: ['functional', 'sticky', 'non_functional'],
    findingResults: ['sticky', 'non_functional'],
  },
  visual_shake: {
    id: 'visual_shake',
    label: 'Visual Shake / Rotor Test',
    toolId: null, // gesture or keyboard tilt
    description: 'Tilt/shake watch case to observe automatic rotor movement.',
    accessibilityHint: 'Use arrow keys to simulate tilt; rotor movement is described in screen-reader text.',
    possibleResults: ['rotor_free', 'rotor_sluggish', 'rotor_stuck'],
    findingResults: ['rotor_sluggish', 'rotor_stuck'],
  },
  water_resistance: {
    id: 'water_resistance',
    label: 'Water Resistance Indicator',
    toolId: 'loupe-tool',
    description: 'Inspect gasket and seal condition visually and by feel.',
    accessibilityHint: 'Activate loupe with Space/Enter; condition text is exposed to screen readers.',
    possibleResults: ['sealed', 'gasket_worn', 'seal_failed'],
    findingResults: ['gasket_worn', 'seal_failed'],
  },
};

/**
 * Default probability weights for each test result (per test type).
 * Weights are normalised at runtime; designers adjust to tune difficulty.
 * @type {Object.<string, Object.<string, number>>}
 */
const DEFAULT_RESULT_WEIGHTS = {
  crown_wind:       { stiff: 1, normal: 5, broken: 1 },
  audible_tick:     { ticking: 5, erratic: 1, silent: 1 },
  pusher_crown_func:{ functional: 5, sticky: 1, non_functional: 1 },
  visual_shake:     { rotor_free: 5, rotor_sluggish: 1, rotor_stuck: 1 },
  water_resistance: { sealed: 5, gasket_worn: 1, seal_failed: 1 },
};

// ─── FunctionalTestPanel ──────────────────────────────────────────────────────

class FunctionalTestPanel {
  /**
   * @param {{ resultWeights?: Object }} [config]  — override per-test result weights
   * @param {() => number}              [rng]      — injectable RNG ([0,1)); default Math.random
   */
  constructor(config = {}, rng = Math.random) {
    this._weights = {
      ...DEFAULT_RESULT_WEIGHTS,
      ...(config.resultWeights || {}),
    };
    this._rng = rng;
    this._checklistComplete = false;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Signal that the MVP visual checklist has been completed.
   * Until this is called, runTest() throws (tests are gated — AC1).
   */
  markChecklistComplete() {
    this._checklistComplete = true;
  }

  /**
   * Whether the panel is currently available (checklist complete, pre-disassembly).
   * @returns {boolean}
   */
  isAvailable() {
    return this._checklistComplete;
  }

  // ── Test discovery ───────────────────────────────────────────────────────────

  /**
   * Returns all functional test definitions (for UI registration — AC1).
   * Always returns all 5; the caller selects 3–5 based on watch type.
   * @returns {Object[]}
   */
  getAllTestDefinitions() {
    return FUNCTIONAL_TEST_IDS.map(id => FUNCTIONAL_TEST_DEFINITIONS[id]);
  }

  /**
   * Returns the definition for a single test.
   * @param {string} testId
   * @returns {Object|null}
   */
  getTestDefinition(testId) {
    return FUNCTIONAL_TEST_DEFINITIONS[testId] || null;
  }

  // ── Running tests ────────────────────────────────────────────────────────────

  /**
   * Run a functional test and return a structured result.
   *
   * AC1: Only available after MVP checklist completion.
   * AC2: result object is suitable for direct recording on the job card.
   *
   * @param {string} testId  — one of FUNCTIONAL_TEST_IDS
   * @returns {{ testId: string, result: string, isFinding: boolean, suggestPreExistingFlag: boolean }}
   * @throws {Error} if panel is not yet available (checklist not complete)
   * @throws {Error} if testId is unknown
   */
  runTest(testId) {
    if (!this._checklistComplete) {
      throw new Error(
        'FunctionalTestPanel: tests are not yet available — MVP checklist must be completed first (AC1).'
      );
    }
    const def = FUNCTIONAL_TEST_DEFINITIONS[testId];
    if (!def) {
      throw new Error(`FunctionalTestPanel: unknown test id "${testId}".`);
    }

    const result = this._selectWeightedResult(testId);
    const isFinding = def.findingResults.includes(result);

    return {
      testId,
      result,
      isFinding,
      suggestPreExistingFlag: isFinding,
      label: def.label,
      toolId: def.toolId,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Weighted random selection from possible results for a test.
   * @param {string} testId
   * @returns {string}
   */
  _selectWeightedResult(testId) {
    const weights = this._weights[testId] || {};
    const def = FUNCTIONAL_TEST_DEFINITIONS[testId];
    const results = def.possibleResults.filter(r => (weights[r] || 0) > 0);
    const total = results.reduce((sum, r) => sum + (weights[r] || 0), 0);

    let roll = this._rng() * total;
    for (const r of results) {
      roll -= weights[r] || 0;
      if (roll <= 0) return r;
    }
    return results[results.length - 1];
  }
}

module.exports = {
  FunctionalTestPanel,
  FUNCTIONAL_TEST_IDS,
  FUNCTIONAL_TEST_DEFINITIONS,
  DEFAULT_RESULT_WEIGHTS,
};
