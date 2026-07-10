/**
 * CosmeticRestorationController — Phase 2 top-level orchestrator for the
 * cosmetic restoration phase, extending Phase 1 (strap swap) with crystal
 * replacement.
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2
 * (AC1, AC2, AC3, AC4, AC5)
 *
 * Wires together:
 *   1. CosmeticPhaseController     — Phase 1 strap swap (reused, not replaced)
 *   2. CrystalConditionStates      — derive crystal_condition from watch data (AC1)
 *   3. CrystalMeshMaterialSwap     — texture/shader swap on existing mesh (AC2, AC8)
 *   4. CrystalReplacementMechanic  — remove/install two-step interaction (AC2, AC6)
 *   5. StrapBeforeAfterDisplay     — reused from Phase 1 for crystal display (AC3)
 *   6. PlayerSaveState             — crystal_outcome persisted (AC4, AC5)
 *
 * Sequencing:
 *   1. enterPhase()              — enter Phase 1 strap step; derive crystal condition
 *   2. (Phase 1 strap flow via CosmeticPhaseController)
 *   3. completeStrapStep()       — commit strap, move to crystal step
 *   4. (if crystal needs replacement) replaceCrystal()
 *   5. exitPhase()               — collect full result for restoration summary (AC4, AC5)
 *
 * AC4 — clean crystal / no replacement needed:
 *   If the watch crystal is already clean, the crystal step is marked 'skipped'
 *   and presented with a clear "no replacement needed" indication.
 *
 * AC5 — full phase summary:
 *   exitPhase() returns both strap and crystal outcomes for the restoration summary.
 */

'use strict';

const { CosmeticPhaseController }    = require('./CosmeticPhaseController');
const { CrystalMeshMaterialSwap }    = require('./CrystalMeshMaterialSwap');
const { CrystalReplacementMechanic } = require('./CrystalReplacementMechanic');
const { StrapBeforeAfterDisplay }    = require('./StrapBeforeAfterDisplay');
const {
  resolveCrystalCondition,
  getCleanCrystalState,
} = require('./CrystalConditionStates');

class CosmeticRestorationController {
  /**
   * @param {Object}   opts
   * @param {Object}   opts.saveState             — PlayerSaveState instance
   * @param {Function} opts.swapStrapRigFn         — (assetKey: string) => void (Phase 1)
   * @param {Function} opts.swapCrystalMaterialFn  — (assetKey: string) => void (Phase 2)
   * @param {Function} [opts.cacheFn]              — (assetKey: string) => void (pre-cache)
   * @param {Function} [opts.onStrapBeforeAfter]   — (payload) => void
   * @param {Function} [opts.onCrystalBeforeAfter] — (payload) => void
   * @param {Function} [opts.nowFn]                — () => number (timestamp override)
   * @param {string}   [opts.displayMode]          — 'side_by_side' | 'sequential_reveal'
   * @param {Object}   [opts.watchData]            — raw watch data (for crystal_condition)
   */
  constructor({
    saveState,
    swapStrapRigFn,
    swapCrystalMaterialFn,
    cacheFn = null,
    onStrapBeforeAfter = null,
    onCrystalBeforeAfter = null,
    nowFn = null,
    displayMode = 'side_by_side',
    watchData = null,
  }) {
    this._saveState = saveState;
    this._watchData = watchData;
    this._onCrystalBeforeAfter = onCrystalBeforeAfter;

    // Phase 1 controller (strap swap)
    this._strapController = new CosmeticPhaseController({
      saveState,
      swapRigFn: swapStrapRigFn,
      cacheFn,
      onBeforeAfter: onStrapBeforeAfter,
      nowFn,
      displayMode,
    });

    // Phase 2 components
    this._crystalMaterialSwap = new CrystalMeshMaterialSwap({
      swapMeshMaterialFn: swapCrystalMaterialFn,
      cacheFn,
      nowFn,
    });

    // Crystal before/after display — REUSES StrapBeforeAfterDisplay from Phase 1 (AC3)
    this._crystalBeforeAfter = new StrapBeforeAfterDisplay({
      phaseId: 'crystal',
      displayMode,
    });

    this._crystalMechanic = null; // created in enterCrystalStep()
    this._crystalConditionState = null;
    this._crystalOutcome = null; // 'replaced' | 'skipped'
    this._lastCrystalBeforeAfterPayload = null;
    this._phaseActive = false;
    this._strapStepComplete = false;
  }

  // ── Phase 1: Strap step ───────────────────────────────────────────────────

  /**
   * Enter the cosmetic restoration phase.
   * Starts Phase 1 strap swap and resolves the crystal condition from watch data.
   *
   * @returns {{
   *   strapVariants: StrapVariant[],
   *   currentStrapId: string,
   *   crystalCondition: CrystalConditionState,
   * }}
   */
  enterPhase() {
    this._phaseActive = true;
    const strapResult = this._strapController.enterPhase();

    // Resolve crystal condition from watch data (AC1, AC7)
    this._crystalConditionState = resolveCrystalCondition(this._watchData);

    // Pre-cache crystal materials alongside strap pre-cache (design mitigation AC8)
    this._crystalMaterialSwap.preCacheAll();

    // Apply initial crystal material so the watch renders the correct condition on entry
    this._crystalMaterialSwap.swap(this._crystalConditionState.assetKey);

    return {
      strapVariants: strapResult.variants,
      currentStrapId: strapResult.currentStrapId,
      crystalCondition: { ...this._crystalConditionState },
    };
  }

  /**
   * Player selects (previews) a strap variant.
   * Delegates to Phase 1 CosmeticPhaseController.
   *
   * @param {string} strapId
   */
  selectStrap(strapId) {
    this._assertPhaseActive();
    return this._strapController.selectStrap(strapId);
  }

  /**
   * Player confirms strap selection and moves on to the crystal step.
   * Phase 1 is committed here; Phase 2 crystal step becomes active.
   *
   * @returns {{ strapResult: Object, crystalStepRequired: boolean, crystalCondition: CrystalConditionState }}
   */
  completeStrapStep() {
    this._assertPhaseActive();
    const strapResult = this._strapController.confirmStrap();
    this._strapStepComplete = true;

    const crystalStepRequired = this._crystalConditionState.needsReplacement;

    if (!crystalStepRequired) {
      // AC4: clean crystal — mark crystal step as skipped immediately
      this._crystalOutcome = 'skipped';
    }

    return {
      strapResult,
      crystalStepRequired,
      crystalCondition: { ...this._crystalConditionState },
    };
  }

  // ── Phase 2: Crystal step ─────────────────────────────────────────────────

  /**
   * Enter the crystal replacement step.
   * - Captures the "before" snapshot for the before/after display (AC3).
   * - Initialises the replacement mechanic ready for player interaction.
   * - Returns 'skip' status when crystal is already clean (AC4).
   *
   * @returns {{
   *   status: 'requires_replacement' | 'skip',
   *   crystalCondition: CrystalConditionState,
   *   reason: string|null
   * }}
   */
  enterCrystalStep() {
    this._assertPhaseActive();
    this._assertStrapStepComplete();

    if (!this._crystalConditionState.needsReplacement) {
      // AC4: clean crystal — skip with clear indication
      return {
        status: 'skip',
        crystalCondition: { ...this._crystalConditionState },
        reason: 'Crystal is already clean — no replacement needed.',
      };
    }

    // Capture before-state for the before/after display (AC3)
    this._crystalBeforeAfter.captureBeforeState({
      assetKey: this._crystalConditionState.assetKey,
      label: this._crystalConditionState.label,
      description: this._crystalConditionState.description,
    });

    // Initialise the replacement mechanic (create once; on re-do the existing
    // mechanic is already reset to idle by redoCrystalReplacement, so reuse it
    // to preserve completionCount for TS6 assertions).
    if (!this._crystalMechanic) {
      this._crystalMechanic = new CrystalReplacementMechanic({
        onStateChange: (state) => this._onMechanicStateChange(state),
      });
    }

    return {
      status: 'requires_replacement',
      crystalCondition: { ...this._crystalConditionState },
      reason: null,
    };
  }

  /**
   * Player removes the damaged crystal (step 1 of 2).
   * @returns {{ success: boolean, reason: string|null, state: string }}
   */
  beginRemoveCrystal() {
    this._assertPhaseActive();
    this._assertMechanicReady();
    return this._crystalMechanic.beginRemove();
  }

  /**
   * Player completes removal of the damaged crystal.
   * @returns {{ success: boolean, reason: string|null, state: string }}
   */
  completeRemoveCrystal() {
    this._assertPhaseActive();
    this._assertMechanicReady();
    return this._crystalMechanic.completeRemove();
  }

  /**
   * Player begins installing the new clean crystal (step 2 of 2).
   * @returns {{ success: boolean, reason: string|null, state: string }}
   */
  beginInstallCrystal() {
    this._assertPhaseActive();
    this._assertMechanicReady();
    return this._crystalMechanic.beginInstall();
  }

  /**
   * Player completes installation of the new clean crystal.
   *
   * 1. Swaps the crystal mesh material to 'clean' in real time (AC2).
   * 2. Builds and fires the before/after display payload (AC3).
   * 3. Persists crystal_outcome to PlayerSaveState (AC4, AC5).
   *
   * @returns {{
   *   success: boolean,
   *   reason: string|null,
   *   beforeAfterPayload: BeforeAfterDisplayPayload|null
   * }}
   */
  completeInstallCrystal() {
    this._assertPhaseActive();
    this._assertMechanicReady();

    const result = this._crystalMechanic.completeInstall();
    if (!result.success) {
      return { success: false, reason: result.reason, beforeAfterPayload: null };
    }

    // Swap to clean crystal material in real time (AC2)
    const cleanState = getCleanCrystalState();
    this._crystalMaterialSwap.swap(cleanState.assetKey);

    // Build before/after display payload (AC3) — reusing StrapBeforeAfterDisplay
    const afterSnapshot = {
      assetKey: cleanState.assetKey,
      label: cleanState.label,
      description: cleanState.description,
    };
    const payload = this._crystalBeforeAfter.buildPayload(afterSnapshot);
    this._lastCrystalBeforeAfterPayload = payload;

    if (payload && this._onCrystalBeforeAfter) {
      this._onCrystalBeforeAfter(payload);
    }

    // Persist crystal outcome (AC4, AC5)
    this._crystalOutcome = 'replaced';
    this._saveState.set('crystal_outcome', 'replaced');
    this._saveState.set('crystal_condition_before', this._crystalConditionState.id);

    return { success: true, reason: null, beforeAfterPayload: payload };
  }

  /**
   * Re-do the crystal replacement (AC6: back-navigation, re-do without artifacts).
   * Resets the mechanic and the before/after display to their pre-replacement state.
   *
   * @returns {{ status: string }}
   */
  redoCrystalReplacement() {
    this._assertPhaseActive();
    this._assertMechanicReady();

    // Swap back to the damaged crystal material
    this._crystalMaterialSwap.swap(this._crystalConditionState.assetKey);

    // Re-capture before state (before/after component reset to damaged state)
    this._crystalBeforeAfter.captureBeforeState({
      assetKey: this._crystalConditionState.assetKey,
      label: this._crystalConditionState.label,
      description: this._crystalConditionState.description,
    });

    // Reset the mechanic (AC6)
    this._crystalMechanic.reset();
    this._crystalOutcome = null;
    this._lastCrystalBeforeAfterPayload = null;

    return { status: 'redo_ready' };
  }

  // ── Phase exit ────────────────────────────────────────────────────────────

  /**
   * Exit the full cosmetic restoration phase.
   * Returns the combined strap + crystal result for the restoration summary (AC5).
   *
   * @returns {{
   *   strapResult: { confirmedStrapId: string, confirmedStrap: Object, beforeAfterPayload: Object|null },
   *   crystalResult: {
   *     conditionBefore: string,
   *     conditionAfter: string,
   *     outcome: 'replaced' | 'skipped',
   *     beforeAfterPayload: BeforeAfterDisplayPayload|null,
   *   }
   * }}
   */
  exitPhase() {
    this._assertPhaseActive();
    this._phaseActive = false;

    const strapResult = this._strapController.exitPhase();

    const outcome = this._crystalOutcome || 'skipped';
    const crystalResult = {
      conditionBefore: this._crystalConditionState
        ? this._crystalConditionState.id
        : 'clean',
      conditionAfter: outcome === 'replaced' ? 'clean' : (this._crystalConditionState ? this._crystalConditionState.id : 'clean'),
      outcome,
      beforeAfterPayload: this._lastCrystalBeforeAfterPayload,
    };

    return { strapResult, crystalResult };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** @returns {CosmeticPhaseController} */
  getStrapController() { return this._strapController; }

  /** @returns {CrystalMeshMaterialSwap} */
  getCrystalMaterialSwap() { return this._crystalMaterialSwap; }

  /** @returns {CrystalReplacementMechanic|null} */
  getCrystalMechanic() { return this._crystalMechanic; }

  /** @returns {StrapBeforeAfterDisplay} */
  getCrystalBeforeAfterDisplay() { return this._crystalBeforeAfter; }

  /** @returns {BeforeAfterDisplayPayload|null} */
  getLastCrystalBeforeAfterPayload() { return this._lastCrystalBeforeAfterPayload; }

  /** @returns {CrystalConditionState|null} */
  getCrystalConditionState() { return this._crystalConditionState; }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * @private — called by CrystalReplacementMechanic.onStateChange
   */
  _onMechanicStateChange(state) {
    // Future: could fire additional hooks (telemetry, audio cues) on state transitions
    void state;
  }

  /**
   * @private
   */
  _assertPhaseActive() {
    if (!this._phaseActive) {
      throw new Error('CosmeticRestorationController: phase is not active — call enterPhase() first');
    }
  }

  /**
   * @private
   */
  _assertStrapStepComplete() {
    if (!this._strapStepComplete) {
      throw new Error('CosmeticRestorationController: strap step must be completed before entering crystal step');
    }
  }

  /**
   * @private
   */
  _assertMechanicReady() {
    if (!this._crystalMechanic) {
      throw new Error('CosmeticRestorationController: call enterCrystalStep() before interacting with the crystal mechanic');
    }
  }
}

module.exports = { CosmeticRestorationController };
