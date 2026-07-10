/**
 * ContextualHighlightController — observes tool-selection changes and updates
 * component visual highlight state (eligible/ineligible/neutral).
 *
 * Issue #131 — Tool-Switching MVP: Core Repair Loop (6-8 Tools)
 *
 * Design contract (from approved design):
 *   - Event-driven (dirty-flag) — subscribes to ToolPanel.onToolChange() to trigger
 *     highlight re-evaluation rather than polling every frame. This satisfies the
 *     60 FPS frame-rate floor constraint (no per-frame polling pressure).
 *   - getHighlightState(componentId): returns 'eligible' | 'ineligible' | 'neutral'.
 *       - 'eligible'   — component has operations the current tool can perform → glow
 *       - 'ineligible' — component has operations but none match the current tool → grey out
 *       - 'neutral'    — component has no registered operations → no highlight
 *   - componentOperationMap: injected at construction; maps componentId → operationId[].
 *     Declarative; no runtime discovery.
 *
 * AC5: Given any tool is selected, when the player hovers over an operable watch component,
 *      then eligible operations highlight; ineligible operations are visually de-emphasised.
 * Scenario 5: Case knife selected → case back = eligible; dial hands, movement plate = ineligible.
 */

const { canToolPerformOperation } = require('./ToolRegistry');

/** @typedef {'eligible' | 'ineligible' | 'neutral'} HighlightState */

class ContextualHighlightController {
  /**
   * @param {ToolPanel} toolPanel
   *   The ToolPanel instance to subscribe to for tool-change events.
   * @param {Object.<string, string[]>} componentOperationMap
   *   Maps componentId → array of operationIds that component supports.
   *   Components not in this map are treated as 'neutral' (no operable actions).
   */
  constructor(toolPanel, componentOperationMap = {}) {
    this._componentOperationMap = { ...componentOperationMap };
    this._currentToolId = toolPanel ? toolPanel.getActiveTool() : null;
    this._dirtyFlag = true;

    // Subscribe to tool-change events (event-driven, not polling)
    if (toolPanel) {
      this._unsubscribe = toolPanel.onToolChange((newToolId) => {
        this._currentToolId = newToolId;
        this._dirtyFlag = true;
      });
    } else {
      this._unsubscribe = () => {};
    }
  }

  // ── Highlight State ────────────────────────────────────────────────────────

  /**
   * Returns the highlight state for the given component based on the active tool.
   *
   * @param {string} componentId
   * @returns {HighlightState}
   */
  getHighlightState(componentId) {
    const operations = this._componentOperationMap[componentId];

    // No registered operations → neutral (Scenario 8: no-action component)
    if (!operations || operations.length === 0) {
      return 'neutral';
    }

    // No active tool selected
    if (!this._currentToolId) {
      return 'neutral';
    }

    // Check if the active tool can perform any of this component's operations
    const hasEligibleOperation = operations.some((opId) =>
      canToolPerformOperation(this._currentToolId, opId)
    );

    return hasEligibleOperation ? 'eligible' : 'ineligible';
  }

  /**
   * Returns highlight states for all registered components at once.
   * Useful for batch UI updates (more efficient than repeated getHighlightState calls).
   *
   * @returns {Object.<string, HighlightState>}
   */
  getAllHighlightStates() {
    const result = {};
    for (const componentId of Object.keys(this._componentOperationMap)) {
      result[componentId] = this.getHighlightState(componentId);
    }
    return result;
  }

  /**
   * Returns the IDs of all components currently in 'eligible' state.
   * @returns {string[]}
   */
  getEligibleComponents() {
    return Object.keys(this._componentOperationMap).filter(
      (id) => this.getHighlightState(id) === 'eligible'
    );
  }

  /**
   * Returns the IDs of all components currently in 'ineligible' state.
   * @returns {string[]}
   */
  getIneligibleComponents() {
    return Object.keys(this._componentOperationMap).filter(
      (id) => this.getHighlightState(id) === 'ineligible'
    );
  }

  /**
   * Returns the currently observed tool ID.
   * @returns {string|null}
   */
  getCurrentToolId() {
    return this._currentToolId;
  }

  /**
   * Returns true if a tool-change event has fired since the last dirty-flag clear.
   * Lets the renderer know a UI repaint is needed (event-driven frame budget).
   * @returns {boolean}
   */
  isDirty() {
    return this._dirtyFlag;
  }

  /**
   * Clears the dirty flag after the renderer has consumed the update.
   */
  clearDirty() {
    this._dirtyFlag = false;
  }

  /**
   * Registers or updates a component's operation list (for dynamic scene setup).
   * @param {string} componentId
   * @param {string[]} operationIds
   */
  registerComponent(componentId, operationIds) {
    this._componentOperationMap[componentId] = [...operationIds];
    this._dirtyFlag = true;
  }

  /**
   * Releases the subscription to the ToolPanel.
   * Call when disposing the controller (e.g., on scene unload).
   */
  dispose() {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  }
}

/**
 * Default component-operation map for the MVP repair loop.
 * Maps watch component IDs to the operations they support.
 * The highlight controller uses this to determine eligible/ineligible state per tool.
 */
const DEFAULT_COMPONENT_OPERATION_MAP = {
  'hour-hand':          ['handle-hour-hand', 'set-hour-hand'],
  'minute-hand':        ['handle-minute-hand', 'set-minute-hand'],
  'second-hand':        ['handle-second-hand', 'set-second-hand'],
  'dial':               ['handle-dial'],
  'movement-plate':     ['remove-movement-plate-screw', 'install-movement-plate-screw'],
  'bridge':             ['remove-bridge-screw', 'install-bridge-screw'],
  'case-back':          ['open-snap-back-case', 'close-snap-back-case', 'remove-case-back-screw', 'install-case-back-screw'],
  'spring-bar-lug':     ['remove-spring-bar', 'install-spring-bar', 'detach-strap', 'attach-strap'],
  'movement':           ['seat-movement', 'lift-movement', 'stabilise-movement'],
  'movement-component': ['pick-up-component'],
  'cannon-pinion':      ['set-hour-hand', 'set-minute-hand', 'set-second-hand'],
  'debris-area':        ['clear-debris', 'clean-dial-surface', 'clean-crystal'],
  'jewel-setting':      ['position-jewel'],
};

module.exports = { ContextualHighlightController, DEFAULT_COMPONENT_OPERATION_MAP };
