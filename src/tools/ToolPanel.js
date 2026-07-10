/**
 * ToolPanel — HUD component for displaying and switching between the 8 MVP tools.
 *
 * Issue #131 — Tool-Switching MVP: Core Repair Loop (6-8 Tools)
 *
 * Responsibilities:
 *   1. Track the currently selected tool (activeToolId).
 *   2. Allow tool switching via selectTool(), navigateNext(), navigatePrev()
 *      (supports keyboard Tab/arrow and gamepad D-pad/bumper navigation — AC keyboard, Constraint).
 *   3. Provide tooltip data for hover/focus events (AC1).
 *   4. Notify subscribers (observers) when the active tool changes (drives AC5 highlight system).
 *   5. Validate tool count constraint: panel is hard-capped at 8 tools.
 *
 * AC1: All 8 tools visible with name and one-line purpose via getTooltip().
 * AC keyboard: All 8 tools reachable via Tab/arrow (navigateNext/navigatePrev).
 * Scenario 7: Keyboard-only navigation — all 8 tools reachable and tooltips display.
 * Scenario 9: Selected tool persists until explicitly changed; no ghost-selection.
 */

const { getAllTools, getToolById, getAllToolIds } = require('./ToolRegistry');

const MAX_TOOLS = 8;

class ToolPanel {
  /**
   * @param {string[]} [toolIds]
   *   Ordered list of tool IDs to display in the panel.
   *   Defaults to all 8 MVP tools from the registry.
   *   Must not exceed MAX_TOOLS (hard cap per Constraint).
   */
  constructor(toolIds = null) {
    const ids = toolIds !== null ? toolIds : getAllToolIds();

    if (ids.length > MAX_TOOLS) {
      throw new Error(
        `ToolPanel tool count hard cap exceeded: ${ids.length} tools provided, maximum is ${MAX_TOOLS}. ` +
        'Adding a 9th tool requires a formal QA surface-area assessment and PM/QA lead sign-off.'
      );
    }

    // Validate all provided IDs exist in the registry
    for (const id of ids) {
      if (!getToolById(id)) {
        throw new Error(`ToolPanel: unknown tool ID '${id}' — register it in ToolRegistry before adding to panel.`);
      }
    }

    this._toolIds = [...ids];
    this._activeToolId = this._toolIds[0] || null;
    this._subscribers = [];
    /** @type {import('./ProficiencyEngine').ProficiencyEngine|null} — Issue #297 */
    this._proficiencyEngine = null;
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  /**
   * Select a tool by ID. No-ops if the tool is already selected.
   * Notifies all subscribers on change.
   *
   * @param {string} toolId
   * @returns {boolean} true if the selection changed, false if already selected or not in panel
   */
  selectTool(toolId) {
    if (!this._toolIds.includes(toolId)) return false;
    if (this._activeToolId === toolId) return false;
    this._activeToolId = toolId;
    this._notifySubscribers();
    return true;
  }

  /**
   * Move selection to the next tool in the panel (wraps around).
   * Maps to Tab/arrow-right/D-pad-right navigation (Scenario 7).
   * @returns {string} The new active tool ID
   */
  navigateNext() {
    const idx = this._toolIds.indexOf(this._activeToolId);
    const nextIdx = (idx + 1) % this._toolIds.length;
    this._activeToolId = this._toolIds[nextIdx];
    this._notifySubscribers();
    return this._activeToolId;
  }

  /**
   * Move selection to the previous tool in the panel (wraps around).
   * Maps to Shift+Tab/arrow-left/D-pad-left navigation (Scenario 7).
   * @returns {string} The new active tool ID
   */
  navigatePrev() {
    const idx = this._toolIds.indexOf(this._activeToolId);
    const prevIdx = (idx - 1 + this._toolIds.length) % this._toolIds.length;
    this._activeToolId = this._toolIds[prevIdx];
    this._notifySubscribers();
    return this._activeToolId;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /**
   * Returns the currently selected tool ID.
   * Persists until explicitly changed (Scenario 9 — no ghost-selection).
   * @returns {string|null}
   */
  getActiveTool() {
    return this._activeToolId;
  }

  /**
   * Returns the full tool definition for the currently selected tool.
   * @returns {import('./ToolRegistry').ToolDefinition|null}
   */
  getActiveToolDefinition() {
    if (!this._activeToolId) return null;
    return getToolById(this._activeToolId);
  }

  /**
   * Returns tooltip data (name + purpose) for the given tool ID.
   * Used by the UI on hover/focus (AC1).
   *
   * @param {string} toolId
   * @returns {{ name: string, purpose: string, ariaLabel: string }|null}
   */
  getTooltip(toolId) {
    const tool = getToolById(toolId);
    if (!tool || !this._toolIds.includes(toolId)) return null;
    return {
      name: tool.name,
      purpose: tool.purpose,
      ariaLabel: tool.ariaLabel,
    };
  }

  /**
   * Returns tooltip data for all tools in the panel (AC1 — all 8 tools visible).
   * @returns {Array<{ id: string, name: string, purpose: string, ariaLabel: string }>}
   */
  getAllTooltips() {
    return this._toolIds.map((id) => {
      const tool = getToolById(id);
      return {
        id,
        name: tool.name,
        purpose: tool.purpose,
        ariaLabel: tool.ariaLabel,
      };
    });
  }

  /**
   * Returns all tool IDs visible in the panel (in panel order).
   * @returns {string[]}
   */
  getToolIds() {
    return [...this._toolIds];
  }

  /**
   * Returns the count of tools in the panel.
   * @returns {number}
   */
  getToolCount() {
    return this._toolIds.length;
  }

  // ── Observer / Subscription ────────────────────────────────────────────────

  /**
   * Subscribe to tool-selection change events.
   * The callback receives the new active tool ID.
   * Used by ContextualHighlightController (AC5 — event-driven, not polling).
   *
   * @param {function(string): void} callback
   * @returns {function(): void} Unsubscribe function
   */
  onToolChange(callback) {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter((s) => s !== callback);
    };
  }

  // ── Proficiency Bar (Issue #297 — Per-Tool Mastery Progression) ───────────────

  /**
   * Inject the ProficiencyEngine so ToolPanel can expose proficiency bar data.
   * Called during game initialisation after the engine is loaded from save state.
   * Additive — does not alter existing ToolPanel behaviour when not set.
   *
   * @param {import('./ProficiencyEngine').ProficiencyEngine|null} engine
   */
  setProficiencyEngine(engine) {
    this._proficiencyEngine = engine;
  }

  /**
   * Returns proficiency bar data for the given tool ID (AC5 — ToolPanel display accuracy).
   *
   * Returns null when:
   *   - No proficiency engine is attached (pre-FR1 code paths).
   *   - The tool is not in the Phase 1 designated set (out-of-scope tools show no bar).
   *
   * Returns bar data when:
   *   - Engine is attached AND toolId is a designated proficiency tool.
   *
   * @param {string} toolId
   * @returns {{ tier: number, tierName: string, progressFraction: number,
   *             isMaxTier: boolean, label: string }|null}
   */
  getProficiencyBarData(toolId) {
    if (!this._proficiencyEngine) return null;
    return this._proficiencyEngine.getProficiencyBarData(toolId);
  }

  /**
   * Returns proficiency bar data for all tools in the panel.
   * Tools without proficiency (non-designated) will have null entries.
   * Suitable for bulk rendering of all proficiency bars in the panel UI.
   *
   * @returns {Array<{ id: string, proficiencyBar: Object|null }>}
   */
  getAllProficiencyBarData() {
    return this._toolIds.map((id) => ({
      id,
      proficiencyBar: this.getProficiencyBarData(id),
    }));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _notifySubscribers() {
    for (const sub of this._subscribers) {
      sub(this._activeToolId);
    }
  }
}

module.exports = { ToolPanel, MAX_TOOLS };
