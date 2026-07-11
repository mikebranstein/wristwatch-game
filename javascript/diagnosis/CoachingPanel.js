/**
 * CoachingPanel — in-session adaptive coaching overlay for the diagnosis phase.
 *
 * Issue #296: Adaptive Coaching UI Panel — In-Session Coaching Delivery (Phase 1 MVP)
 *
 * Responsibilities:
 *   - Render a dismissible, non-blocking coaching overlay at the workbench in
 *     direct response to `coaching_trigger` events from AdaptiveCoachingController
 *     (#293), appearing within one animation frame (≤16ms) of the trigger (AC1).
 *   - Provide coaching copy for the 3 tracked diagnosis-phase mistake types:
 *       • wrong_tool        — contextual tip referencing the step and correct tool category
 *       • misidentification — gentle reframe prompting reconsideration of fault type
 *       • undo_overuse      — brief suggestion to inspect the step before committing
 *   - Explicit dismissal (AC2): player closes the panel; the same step+type combination
 *     is not re-shown for the rest of the current session.
 *   - Auto-dismiss (AC3): when the player successfully completes the triggering step,
 *     the panel self-dismisses via dismissIfStepMatches(stepId).
 *   - Non-blocking (AC4): panel tracks state only; the render layer is responsible for
 *     ensuring workbench interactions pass through (pointer-events: none equivalent).
 *   - Gentle tone compliance (AC5): all authored copy uses helpful framing with a
 *     specific actionable suggestion (see COACHING_COPY below; gate documented here).
 *   - No duplicate stacking (AC6): show() is a no-op if panel is already VISIBLE or
 *     the step+type combination is already in the dismissed set.
 *
 * State machine:
 *   HIDDEN → VISIBLE → DISMISSED
 *   (Panel resets to HIDDEN on each new trigger that passes the guard checks.)
 *
 * This module is a pure state/data layer (no DOM or canvas dependency) so it is
 * fully testable in isolation.  The UI render layer consumes getViewModel() to
 * decide what to paint.
 *
 * Acceptance criteria covered:
 *   AC1 — show() is called by the event-bus coaching_trigger handler; returns
 *          synchronously so the rendering layer can react within one frame.
 *   AC2 — dismiss() transitions VISIBLE → DISMISSED; adds step+type key to the
 *          session-scoped dismissed set; subsequent show() calls for the same
 *          key are no-ops.
 *   AC3 — dismissIfStepMatches(stepId) self-dismisses when the triggering step
 *          completes; called from DiagnosisScreen on step-success callback.
 *   AC4 — Panel is purely a state layer; the render layer must not assign click
 *          capture to the coaching panel region.
 *   AC5 — Gentle-tone copy gate: all three variants use helpful framing;
 *          designer/content-owner review must be documented as an issue comment
 *          or "copy-approved" label before shipping (pre-release gate).
 *   AC6 — show() guards: no-op if isVisible() or if dismissalKey already dismissed.
 *
 * Test scenarios covered:
 *   Scenario 1  — Happy path: coaching_trigger fires → panel appears with correct copy.
 *   Scenario 2  — Explicit dismissal → same step+type does not reappear.
 *   Scenario 3  — Auto-dismiss on step completion.
 *   Scenario 5  — Rapid trigger suppression (AC6 duplicate guard).
 *   Scenario 7  — Session isolation: new session resets dismissed state.
 *   Scenario 9  — Contextual copy varies by stepId.
 *   Scenario 10 — Regression: HintSystem is unmodified (no coupling in this module).
 */

'use strict';

// ── Panel states ─────────────────────────────────────────────────────────────

const PANEL_STATE = Object.freeze({
  HIDDEN:    'hidden',
  VISIBLE:   'visible',
  DISMISSED: 'dismissed',
});

// ── Valid mistake types (Phase 1 MVP — diagnosis phase) ───────────────────────

const MISTAKE_TYPE = Object.freeze({
  WRONG_TOOL:       'wrong_tool',
  MISIDENTIFICATION:'misidentification',
  UNDO_OVERUSE:     'undo_overuse',
});

const VALID_MISTAKE_TYPES = new Set(Object.values(MISTAKE_TYPE));

// ── Coaching copy registry ────────────────────────────────────────────────────
//
// All copy has been authored with gentle-tone guidelines:
//   • No accusatory or condescending framing ("You did X wrong").
//   • Each variant includes a specific actionable suggestion.
//   • Step-context placeholder {stepId} is replaced at render time
//     via getViewModel() so copy is always contextual (AC1, Scenario 9).
//
// AC5 pre-release gate: a designer or content owner MUST review and approve all
// three variants before this feature ships.  Approval is documented by:
//   (a) a comment on Issue #296 from a design/content stakeholder, OR
//   (b) applying a "copy-approved" label to Issue #296.
// Do NOT remove this comment — it is the code-level record of the gate.

const COACHING_COPY = Object.freeze({
  [MISTAKE_TYPE.WRONG_TOOL]: {
    headline: 'Need a different tool?',
    body: (stepId) =>
      `It looks like the selected tool may not be the right fit for the "${stepId}" step. ` +
      `Try switching to a different tool category — check what the step's component needs.`,
    actionHint: 'Tap the tool rack to switch tools.',
  },
  [MISTAKE_TYPE.MISIDENTIFICATION]: {
    headline: 'Worth a second look?',
    body: (stepId) =>
      `The diagnosis for "${stepId}" doesn't quite match the symptoms. ` +
      `Take another look at the visible indicators — you may be seeing a different fault type.`,
    actionHint: 'Re-examine the symptom panel before confirming.',
  },
  [MISTAKE_TYPE.UNDO_OVERUSE]: {
    headline: 'Feeling uncertain?',
    body: (stepId) =>
      `Lots of undos on "${stepId}" — that's okay! ` +
      `Before committing, try inspecting the component closely first. A careful look often makes the path forward clear.`,
    actionHint: 'Inspect the part before your next action.',
  },
});

// ── CoachingPanel ─────────────────────────────────────────────────────────────

class CoachingPanel {
  /**
   * @param {Object}   [opts]
   * @param {Function} [opts.eventBus]  — Optional { on(event, handler) } event-bus
   *                                      reference.  If provided, CoachingPanel
   *                                      registers itself to receive
   *                                      `coaching_trigger` events automatically.
   *                                      The event bus is injected here to keep
   *                                      the module renderer-agnostic and testable.
   * @param {Function} [opts.onStateChange] — Optional callback invoked with the new
   *                                      view-model snapshot whenever state changes.
   *                                      Allows the render layer to react without
   *                                      polling.
   */
  constructor({ eventBus = null, onStateChange = null } = {}) {
    this._state           = PANEL_STATE.HIDDEN;
    this._currentEvent    = null;   // The coaching_trigger payload currently shown
    this._dismissedKeys   = new Set(); // session-scoped: "stepId:mistakeType" composites
    this._onStateChange   = onStateChange;

    // Auto-subscribe to the event bus if one is provided (AC1 wiring)
    if (eventBus && typeof eventBus.on === 'function') {
      eventBus.on('coaching_trigger', (payload) => this.show(payload));
    }
  }

  // ── Core API ─────────────────────────────────────────────────────────────────

  /**
   * Show the coaching panel for a given coaching_trigger event payload (AC1).
   *
   * Guards (AC6):
   *   • No-op if panel is already VISIBLE (prevents duplicate stacking).
   *   • No-op if the step+type combination has already been dismissed this session.
   *
   * Transitions: HIDDEN → VISIBLE  (or DISMISSED → VISIBLE for a new trigger key).
   *
   * @param {{ type: string, stepId: string, [key: string]: any }} triggerPayload
   *   Coaching event payload from AdaptiveCoachingController.
   * @returns {boolean} True if the panel became visible as a result of this call.
   */
  show(triggerPayload) {
    if (!triggerPayload || typeof triggerPayload !== 'object') {
      throw new TypeError('CoachingPanel.show(): triggerPayload must be a non-null object.');
    }

    const { type, stepId } = triggerPayload;

    if (!VALID_MISTAKE_TYPES.has(type)) {
      throw new Error(
        `CoachingPanel.show(): unknown mistake type "${type}". ` +
        `Valid types: ${[...VALID_MISTAKE_TYPES].join(', ')}.`
      );
    }

    if (!stepId || typeof stepId !== 'string') {
      throw new TypeError('CoachingPanel.show(): triggerPayload.stepId must be a non-empty string.');
    }

    // AC6: no-op if already visible (prevents duplicate overlay stacking)
    if (this._state === PANEL_STATE.VISIBLE) return false;

    // AC6 / AC2: no-op if this step+type was already dismissed this session
    const key = _dismissalKey(stepId, type);
    if (this._dismissedKeys.has(key)) return false;

    this._state        = PANEL_STATE.VISIBLE;
    this._currentEvent = { ...triggerPayload };

    this._notify();
    return true;
  }

  /**
   * Explicitly dismiss the coaching panel (AC2).
   * Records the step+type combination in the session-scoped dismissed set so it
   * will not reappear for the remainder of the session.
   *
   * Transitions: VISIBLE → DISMISSED.
   * No-op if panel is not currently visible.
   *
   * @returns {boolean} True if the panel was dismissed as a result of this call.
   */
  dismiss() {
    if (this._state !== PANEL_STATE.VISIBLE) return false;

    // Add to dismissed set before changing state (atomicity)
    if (this._currentEvent) {
      const key = _dismissalKey(this._currentEvent.stepId, this._currentEvent.type);
      this._dismissedKeys.add(key);
    }

    this._state = PANEL_STATE.DISMISSED;
    this._notify();
    return true;
  }

  /**
   * Auto-dismiss the panel when the triggering step completes successfully (AC3).
   * Called from DiagnosisScreen (or equivalent) on its step-success callback,
   * mirroring the HintSystem registration pattern.
   *
   * Dismisses and records the key only if:
   *   • The panel is currently visible, AND
   *   • The completed stepId matches the stepId in the active trigger payload.
   *
   * @param {string} stepId — The step that just completed successfully.
   * @returns {boolean} True if auto-dismiss fired as a result of this call.
   */
  dismissIfStepMatches(stepId) {
    if (this._state !== PANEL_STATE.VISIBLE) return false;
    if (!this._currentEvent || this._currentEvent.stepId !== stepId) return false;

    return this.dismiss();
  }

  // ── Session lifecycle ────────────────────────────────────────────────────────

  /**
   * Reset the panel for a new session (Scenario 7 — session isolation).
   * Clears the dismissed-keys set and returns the panel to HIDDEN.
   * Must be called when a new game session starts so previous-session
   * dismissal state is not carried forward.
   *
   * @returns {void}
   */
  resetSession() {
    this._state         = PANEL_STATE.HIDDEN;
    this._currentEvent  = null;
    this._dismissedKeys = new Set();
    this._notify();
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  /** @returns {string} Current panel state (PANEL_STATE constant). */
  getState() { return this._state; }

  /** @returns {boolean} True when the panel is currently visible. */
  isVisible() { return this._state === PANEL_STATE.VISIBLE; }

  /** @returns {boolean} True after explicit or auto-dismiss. */
  isDismissed() { return this._state === PANEL_STATE.DISMISSED; }

  /** @returns {boolean} True before any show() has been called (or after resetSession). */
  isHidden() { return this._state === PANEL_STATE.HIDDEN; }

  /**
   * Returns true when a specific step+type combination has been dismissed this session.
   * @param {string} stepId
   * @param {string} mistakeType
   * @returns {boolean}
   */
  isDismissedFor(stepId, mistakeType) {
    return this._dismissedKeys.has(_dismissalKey(stepId, mistakeType));
  }

  /**
   * Returns the current active coaching trigger payload, or null when hidden.
   * @returns {{ type: string, stepId: string }|null}
   */
  getCurrentTrigger() {
    return this._currentEvent ? { ...this._currentEvent } : null;
  }

  /**
   * Build a clean view-model for the UI render layer (AC1).
   * The render layer calls this each frame (or on change callback) to decide
   * what to paint.  All step-contextual copy is resolved here so the render layer
   * only needs to display strings.
   *
   * @returns {{
   *   state: string,
   *   isVisible: boolean,
   *   mistakeType: string|null,
   *   stepId: string|null,
   *   headline: string|null,
   *   body: string|null,
   *   actionHint: string|null,
   * }}
   */
  getViewModel() {
    if (!this._currentEvent || this._state !== PANEL_STATE.VISIBLE) {
      return {
        state:       this._state,
        isVisible:   false,
        mistakeType: null,
        stepId:      null,
        headline:    null,
        body:        null,
        actionHint:  null,
      };
    }

    const { type, stepId } = this._currentEvent;
    const copy = COACHING_COPY[type];

    return {
      state:       this._state,
      isVisible:   true,
      mistakeType: type,
      stepId,
      headline:    copy.headline,
      body:        copy.body(stepId),   // step-contextual (Scenario 9)
      actionHint:  copy.actionHint,
    };
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  _notify() {
    if (typeof this._onStateChange === 'function') {
      this._onStateChange(this.getViewModel());
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Produce a composite dismissal key from a stepId and mistakeType.
 * Using a colon separator; stepId and mistakeType values must not contain colons.
 *
 * @param {string} stepId
 * @param {string} mistakeType
 * @returns {string}
 */
function _dismissalKey(stepId, mistakeType) {
  return `${stepId}:${mistakeType}`;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  CoachingPanel,
  PANEL_STATE,
  MISTAKE_TYPE,
  COACHING_COPY,
};
