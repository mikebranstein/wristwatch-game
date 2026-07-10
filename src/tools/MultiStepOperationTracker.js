/**
 * MultiStepOperationTracker — enforces ordered multi-tool operation sequences.
 *
 * Issue #131 — Tool-Switching MVP: Core Repair Loop (6-8 Tools)
 *
 * Design contract (from approved design):
 *   "Represent multi-step operation progress as an ordered step-index field on the
 *   operation instance, not inferred from component state." (Design Risk Mitigation)
 *
 * Responsibilities:
 *   - Tracks the current step index for each named multi-step operation sequence.
 *   - advanceStep(sequenceId, toolId): gate — only advances if the correct tool is
 *     selected for the current step; blocks skip attempts.
 *   - getProgress(sequenceId): returns { currentStep, totalSteps, completed }.
 *   - isComplete(sequenceId): true when all steps have been completed in order.
 *
 * Scenario 6 (Multi-tool sequence):
 *   Player completes a multi-step operation requiring 3 different tools in sequence.
 *   Each step correctly gates progress until the right tool is selected; no step can be skipped.
 */

class MultiStepOperationTracker {
  /**
   * @param {Object.<string, Array<{ stepIndex: number, requiredTool: string, description: string }>>} sequences
   *   Named sequences of ordered steps. Each step has:
   *     stepIndex    — 1-based; must be sequential starting from 1
   *     requiredTool — tool ID required to advance this step
   *     description  — human-readable step description
   */
  constructor(sequences = {}) {
    this._sequences = {};
    this._progress = {};
    /** @type {Object.<string, number>} — cumulative retry count per sequence (Issue #297) */
    this._retryCounts = {};

    for (const [seqId, steps] of Object.entries(sequences)) {
      this._registerSequence(seqId, steps);
    }
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a new named multi-step operation sequence.
   * @param {string} sequenceId
   * @param {Array<{ stepIndex: number, requiredTool: string, description: string }>} steps
   */
  registerSequence(sequenceId, steps) {
    this._registerSequence(sequenceId, steps);
  }

  // ── Step Advancement ───────────────────────────────────────────────────────

  /**
   * Attempt to advance the given sequence with the current tool.
   *
   * @param {string} sequenceId
   * @param {string} toolId  Currently selected tool
   * @returns {{ advanced: boolean, completed: boolean, message: string, currentStep: number, totalSteps: number }}
   */
  advanceStep(sequenceId, toolId) {
    const seq = this._sequences[sequenceId];
    if (!seq) {
      return { advanced: false, completed: false, message: `Unknown sequence: ${sequenceId}`, currentStep: 0, totalSteps: 0 };
    }

    const progress = this._progress[sequenceId];
    if (progress.completed) {
      return { advanced: false, completed: true, message: 'Sequence already completed.', currentStep: progress.currentStep, totalSteps: seq.length };
    }

    const stepDef = seq[progress.currentStep]; // 0-based index into steps array
    if (!stepDef) {
      return { advanced: false, completed: false, message: 'No step defined at current index.', currentStep: progress.currentStep, totalSteps: seq.length };
    }

    if (toolId !== stepDef.requiredTool) {
      // Wrong tool — blocked, cannot skip (Scenario 6); increment retry counter (Issue #297)
      if (typeof this._retryCounts[sequenceId] === 'number') {
        this._retryCounts[sequenceId] += 1;
      }
      const { getToolById } = require('./ToolRegistry');
      const requiredTool = getToolById(stepDef.requiredTool);
      const requiredName = requiredTool ? requiredTool.name : stepDef.requiredTool;
      return {
        advanced: false,
        completed: false,
        message: `Step ${stepDef.stepIndex}: Use the ${requiredName} to ${stepDef.description}.`,
        currentStep: progress.currentStep + 1,
        totalSteps: seq.length,
      };
    }

    // Correct tool — advance
    progress.currentStep += 1;
    const completed = progress.currentStep >= seq.length;
    progress.completed = completed;

    return {
      advanced: true,
      completed,
      message: completed ? 'Sequence complete.' : `Step ${stepDef.stepIndex} complete.`,
      currentStep: progress.currentStep,
      totalSteps: seq.length,
    };
  }

  // ── Progress Queries ───────────────────────────────────────────────────────

  /**
   * Returns the progress state for the given sequence.
   * @param {string} sequenceId
   * @returns {{ currentStep: number, totalSteps: number, completed: boolean }|null}
   */
  getProgress(sequenceId) {
    const seq = this._sequences[sequenceId];
    const progress = this._progress[sequenceId];
    if (!seq || !progress) return null;
    return {
      currentStep: progress.currentStep,
      totalSteps: seq.length,
      completed: progress.completed,
    };
  }

  /**
   * Returns true if the given sequence has been fully completed in order.
   * @param {string} sequenceId
   * @returns {boolean}
   */
  isComplete(sequenceId) {
    return this._progress[sequenceId]?.completed === true;
  }

  /**
   * Resets the progress for the given sequence back to step 1.
   * @param {string} sequenceId
   */
  resetSequence(sequenceId) {
    if (this._progress[sequenceId]) {
      this._progress[sequenceId] = { currentStep: 0, completed: false };
    }
    if (typeof this._retryCounts[sequenceId] === 'number') {
      this._retryCounts[sequenceId] = 0;
    }
  }

  // ── Retry Counter (Issue #297 — ProficiencyEngine accuracy-weighted gain) ────

  /**
   * Returns the cumulative retry/wrong-tool count for the given sequence since
   * last reset. Used by ProficiencyEngine to compute accuracy-weighted gain.
   *
   * @param {string} sequenceId
   * @returns {number} Retry count, or 0 if sequence unknown.
   */
  getRetryCount(sequenceId) {
    return this._retryCounts[sequenceId] || 0;
  }

  /**
   * Resets the retry counter for the given sequence to zero.
   * Call after recording proficiency for a completed operation to prevent
   * stale retry data from affecting the next operation's gain calculation.
   *
   * @param {string} sequenceId
   */
  resetRetryCount(sequenceId) {
    if (typeof this._retryCounts[sequenceId] === 'number') {
      this._retryCounts[sequenceId] = 0;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _registerSequence(sequenceId, steps) {
    // Sort by stepIndex to ensure correct order regardless of input order
    const sorted = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
    this._sequences[sequenceId] = sorted;
    this._progress[sequenceId] = { currentStep: 0, completed: false };
    this._retryCounts[sequenceId] = 0;
  }
}

module.exports = { MultiStepOperationTracker };
