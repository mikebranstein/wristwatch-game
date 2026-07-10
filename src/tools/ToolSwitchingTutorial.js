/**
 * ToolSwitchingTutorial — first-time tutorial overlay introducing tool switching
 * and correct-tool selection to new players.
 *
 * Issue #131 — Tool-Switching MVP: Core Repair Loop (6-8 Tools)
 *
 * Design contract:
 *   - Shown automatically on the player's first repair session entry (AC4).
 *   - Dismissible with a single action (dismiss()).
 *   - NEVER shown again after first dismissal — flag persisted in PlayerSaveState
 *     under key 'tutorial_tool_switching_seen' (Constraint: Tutorial persistence —
 *     stored in player profile/save file, not in-memory only).
 *   - shouldShow(): deterministic, side-effect-free check.
 *   - tryShow(sessionId): shows if not seen; returns true/false; emits telemetry.
 *   - dismiss(): persists seen flag; emits telemetry.
 *
 * AC4: Given a player has never used the tool panel before, when they first enter a
 *      repair session, then a tutorial prompt introduces tool switching; it is dismissible
 *      and does not reappear after the first dismissal.
 * Scenario 4: New player → tutorial prompt appears; player dismisses → prompt does not reappear.
 */

/** Tutorial steps shown in the overlay */
const TOOL_SWITCHING_TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Choose Your Tool',
    body: 'Real watchmaking is a multi-tool craft. Use the Tool Panel to select the right instrument for each operation. Every component requires a specific tool.',
  },
  {
    step: 2,
    title: 'Right Tool, Right Job',
    body: 'Applying the wrong tool will block the operation and tell you which tool to use. Watch for the green glow — that means the current tool is compatible with the highlighted part.',
  },
  {
    step: 3,
    title: 'Navigate the Panel',
    body: 'Switch tools with Tab/arrow keys or your gamepad D-pad. All 8 tools are available from the start — no unlocking required. Good luck.',
  },
];

const SAVE_KEY = 'tutorial_tool_switching_seen';

class ToolSwitchingTutorial {
  /**
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   */
  constructor(saveState, telemetry) {
    this._saveState = saveState;
    this._telemetry = telemetry;
    this._isVisible = false;
    this._currentStep = 0;
  }

  // ── Visibility Control ─────────────────────────────────────────────────────

  /**
   * Returns true when the tutorial should be shown.
   * Deterministic and side-effect-free (reads only from save state).
   * @returns {boolean}
   */
  shouldShow() {
    return !this._saveState.get(SAVE_KEY);
  }

  /**
   * Shows the tutorial if it has not been seen before (AC4).
   * Emits tool_switching_tutorial_started telemetry.
   * No-ops if already seen — never shown again after first dismissal.
   *
   * @param {string} sessionId
   * @returns {boolean} true if shown, false if suppressed (already seen)
   */
  tryShow(sessionId) {
    if (!this.shouldShow()) {
      return false;
    }
    this._isVisible = true;
    this._currentStep = 1;
    this._telemetry.emit('tool_switching_tutorial_started', { sessionId });
    return true;
  }

  /**
   * Dismiss the tutorial with a single action (AC4 — dismissible).
   * Persists the seen flag to PlayerSaveState so it is NEVER shown again
   * (Constraint: stored in player profile/save file, not in-memory only).
   * Emits tool_switching_tutorial_dismissed telemetry.
   */
  dismiss() {
    this._isVisible = false;
    // Persist flag — survives session close and game restart (Constraint: Tutorial persistence)
    this._saveState.set(SAVE_KEY, true);
    this._telemetry.emit('tool_switching_tutorial_dismissed', {
      lastStep: this._currentStep,
    });
  }

  /**
   * Advance to the next tutorial step.
   * Auto-dismisses when the last step is passed.
   * @returns {{ step: number, title: string, body: string }|null}
   */
  nextStep() {
    if (!this._isVisible) return null;
    if (this._currentStep >= TOOL_SWITCHING_TUTORIAL_STEPS.length) {
      this.dismiss();
      return null;
    }
    this._currentStep += 1;
    return this.getCurrentStepData();
  }

  /**
   * Returns the data for the currently displayed step, or null if not visible.
   * @returns {{ step: number, title: string, body: string }|null}
   */
  getCurrentStepData() {
    if (!this._isVisible || this._currentStep === 0) return null;
    return TOOL_SWITCHING_TUTORIAL_STEPS[this._currentStep - 1] || null;
  }

  /**
   * Returns true if the tutorial overlay is currently visible.
   * @returns {boolean}
   */
  isVisible() {
    return this._isVisible;
  }

  /**
   * Returns the total number of tutorial steps.
   * @returns {number}
   */
  getTotalSteps() {
    return TOOL_SWITCHING_TUTORIAL_STEPS.length;
  }
}

module.exports = { ToolSwitchingTutorial, TOOL_SWITCHING_TUTORIAL_STEPS, SAVE_KEY };
