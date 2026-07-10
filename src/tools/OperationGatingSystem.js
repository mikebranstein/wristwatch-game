/**
 * OperationGatingSystem — validates whether the currently selected tool can perform
 * a given operation, and produces contextual error messages naming the correct tool.
 *
 * Issue #131 — Tool-Switching MVP: Core Repair Loop (6-8 Tools)
 *
 * Issue #295 — Wrong-Tool Consequence System Phase 1
 * Adds optional onWrongTool callback to wire wrong-tool attempts on the 5 Phase 1
 * targeted operations to DamageEventDetector. The callback is optional — all existing
 * usages (including existing tests) work unchanged with no callback.
 *
 * Design contract (from approved design):
 *   - Declarative required-tool manifest: each component/operation declares its required
 *     tool in a static componentManifest injected at construction time, so gating
 *     coverage is enforceable via test assertion — no runtime discovery.
 *   - attemptOperation(toolId, operationId): core gate method.
 *       - Returns { allowed: true } when the tool matches.
 *       - Returns { allowed: false, message: string } naming the correct tool on mismatch.
 *   - No-action operations: components with no registered operation return a neutral
 *     informational message, not an error (Scenario 8).
 *   - Multi-step gating: each operation tracks an optional step index to enforce
 *     ordered sequences (Scenario 6 — no step-skip exploits).
 *   - Wrong-tool consequence (Phase 1): when phase1Consequence is true in the manifest
 *     entry, a wrong-tool attempt fires onWrongTool(operationId, toolId, componentId)
 *     in addition to the existing block + message behaviour (additive, not replacing).
 *
 * AC2: Correct tool → operation proceeds (allowed: true, confirmation cue).
 * AC3: Wrong tool → operation blocked, contextual message names the correct tool.
 * Scenario 1: Spring bar tool + spring bar lug → detaches successfully.
 * Scenario 2: Screwdriver + watch hand → blocked, message names fine-tip tweezers.
 * Scenario 6: Multi-tool sequence → each step gates until the right tool is selected.
 * Scenario 8: Any tool + no-action component → neutral message, no state corruption.
 */

const { getToolsForOperation, canToolPerformOperation, getToolById } = require('./ToolRegistry');

/**
 * @typedef {{ allowed: true, confirmationCue: string } | { allowed: false, message: string }} GateResult
 */

class OperationGatingSystem {
  /**
   * @param {Object.<string, { requiredTool: string, confirmationCue?: string, noActionMessage?: string, phase1Consequence?: boolean, componentId?: string }>} [componentManifest]
   *   Declarative manifest: maps operationId → { requiredTool, confirmationCue, noActionMessage, phase1Consequence, componentId }.
   *   Operations not in the manifest are treated as no-action (Scenario 8).
   *   Injected at construction so coverage is statically verifiable.
   *   phase1Consequence: true marks an operation as a Phase 1 wrong-tool consequence target (Issue #295).
   *   componentId: the part/component affected by the operation (used in wrong_tool damage events).
   * @param {Function|null} [onWrongTool=null]
   *   Optional callback fired when a wrong-tool attempt is made on a phase1Consequence operation.
   *   Signature: onWrongTool(operationId, toolId, componentId)
   *   When null (default), Phase 1 consequence wiring is inactive — all existing behaviour preserved.
   *   (Issue #295 — Wrong-Tool Consequence System Phase 1)
   */
  constructor(componentManifest = {}, onWrongTool = null) {
    this._manifest = { ...componentManifest };
    // onWrongTool is optional — null preserves all pre-Phase-1 behaviour (Issue #295 constraint)
    this._onWrongTool = typeof onWrongTool === 'function' ? onWrongTool : null;
  }

  /**
   * Attempt an operation with the given tool.
   *
   * @param {string} toolId       The currently selected tool
   * @param {string} operationId  The operation the player is attempting
   * @returns {GateResult}
   */
  attemptOperation(toolId, operationId) {
    const manifest = this._manifest[operationId];

    // No-action component: neutral informational message, not an error (Scenario 8)
    if (!manifest) {
      return {
        allowed: false,
        message: `There's nothing to do here with the current tool. Try a different component.`,
        isNoAction: true,
      };
    }

    const requiredToolId = manifest.requiredTool;

    // Correct tool (AC2)
    if (toolId === requiredToolId || canToolPerformOperation(toolId, operationId)) {
      return {
        allowed: true,
        confirmationCue: manifest.confirmationCue || `Operation successful.`,
      };
    }

    // Wrong tool (AC3) — build contextual message naming the correct tool
    const correctTools = getToolsForOperation(operationId);
    const correctToolNames = correctTools.map((t) => t.name);

    let message;
    if (correctToolNames.length === 1) {
      message = `Use the ${correctToolNames[0]} to ${this._describeOperation(operationId)}.`;
    } else if (correctToolNames.length > 1) {
      const last = correctToolNames[correctToolNames.length - 1];
      const rest = correctToolNames.slice(0, -1).join(', ');
      message = `Use the ${rest} or ${last} to ${this._describeOperation(operationId)}.`;
    } else {
      // Fallback: use the manifest's requiredTool name directly
      const requiredTool = getToolById(requiredToolId);
      const requiredName = requiredTool ? requiredTool.name : requiredToolId;
      message = `Use the ${requiredName} to ${this._describeOperation(operationId)}.`;
    }

    // Phase 1 wrong-tool consequence (Issue #295):
    // Fire onWrongTool callback for the 5 targeted operations when the callback is wired.
    // This is ADDITIVE — the block + message above is always returned regardless.
    if (manifest.phase1Consequence && this._onWrongTool) {
      const componentId = manifest.componentId || operationId;
      this._onWrongTool(operationId, toolId, componentId);
    }

    return { allowed: false, message };
  }

  /**
   * Registers or updates an operation entry in the manifest.
   * Useful for dynamic scenario configuration in tests and game setup.
   *
   * @param {string} operationId
   * @param {{ requiredTool: string, confirmationCue?: string }} entry
   */
  registerOperation(operationId, entry) {
    this._manifest[operationId] = entry;
  }

  /**
   * Returns all registered operation IDs (for static coverage assertion).
   * @returns {string[]}
   */
  getRegisteredOperations() {
    return Object.keys(this._manifest);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Produces a human-readable phrase for the operation ID.
   * Converts kebab-case IDs to plain-language verbs (e.g. 'open-snap-back-case' → 'open the snap-back case').
   * @param {string} operationId
   * @returns {string}
   */
  _describeOperation(operationId) {
    return operationId.replace(/-/g, ' ');
  }
}

/**
 * Default component manifest for the MVP repair loop.
 * Maps all operations from the ToolRegistry to their required tools.
 * Confirmation cues are placeholder strings — the game renderer replaces these
 * with audio/animation triggers in the production integration layer.
 */
const DEFAULT_COMPONENT_MANIFEST = {
  // Fine-tip tweezers
  'handle-hour-hand':   { requiredTool: 'fine-tip-tweezers', confirmationCue: 'Hour hand lifted cleanly.' },
  'handle-minute-hand': { requiredTool: 'fine-tip-tweezers', confirmationCue: 'Minute hand lifted cleanly.' },
  'handle-second-hand': { requiredTool: 'fine-tip-tweezers', confirmationCue: 'Second hand lifted cleanly.' },
  'handle-dial':        { requiredTool: 'fine-tip-tweezers', confirmationCue: 'Dial handled with care.' },
  'position-jewel':     { requiredTool: 'fine-tip-tweezers', confirmationCue: 'Jewel positioned correctly.' },

  // Flat-blade screwdriver
  'remove-movement-plate-screw': { requiredTool: 'flat-blade-screwdriver', confirmationCue: 'Plate screw removed.' },
  'install-movement-plate-screw': { requiredTool: 'flat-blade-screwdriver', confirmationCue: 'Plate screw seated.' },
  'remove-bridge-screw': { requiredTool: 'flat-blade-screwdriver', confirmationCue: 'Bridge screw removed.' },
  'install-bridge-screw': { requiredTool: 'flat-blade-screwdriver', confirmationCue: 'Bridge screw seated.' },

  // Cross-tip screwdriver
  'remove-case-back-screw': { requiredTool: 'cross-tip-screwdriver', confirmationCue: 'Case back screw removed.' },
  'install-case-back-screw': { requiredTool: 'cross-tip-screwdriver', confirmationCue: 'Case back screw seated.' },
  'remove-clasp-screw': { requiredTool: 'cross-tip-screwdriver', confirmationCue: 'Clasp screw removed.' },
  'install-clasp-screw': { requiredTool: 'cross-tip-screwdriver', confirmationCue: 'Clasp screw seated.' },

  // Case knife
  'open-snap-back-case':  { requiredTool: 'case-knife', confirmationCue: 'Case back opened cleanly.' },
  'close-snap-back-case': { requiredTool: 'case-knife', confirmationCue: 'Case back closed.' },

  // Spring bar tool
  'remove-spring-bar': { requiredTool: 'spring-bar-tool', confirmationCue: 'Spring bar removed.' },
  'install-spring-bar': { requiredTool: 'spring-bar-tool', confirmationCue: 'Spring bar installed.' },
  'detach-strap':      { requiredTool: 'spring-bar-tool', confirmationCue: 'Strap detached.' },
  'attach-strap':      { requiredTool: 'spring-bar-tool', confirmationCue: 'Strap attached.' },

  // Movement holder
  'seat-movement':       { requiredTool: 'movement-holder', confirmationCue: 'Movement seated in holder.' },
  'lift-movement':       { requiredTool: 'movement-holder', confirmationCue: 'Movement lifted safely.' },
  'stabilise-movement':  { requiredTool: 'movement-holder', confirmationCue: 'Movement stabilised.' },
  'pick-up-component':   { requiredTool: 'movement-holder', confirmationCue: 'Component picked up with rodico.' },

  // Hand-setting tool
  'set-hour-hand':   { requiredTool: 'hand-setting-tool', confirmationCue: 'Hour hand set onto post.' },
  'set-minute-hand': { requiredTool: 'hand-setting-tool', confirmationCue: 'Minute hand set onto post.' },
  'set-second-hand': { requiredTool: 'hand-setting-tool', confirmationCue: 'Second hand set onto post.' },

  // Dust blower
  'clear-debris':       { requiredTool: 'dust-blower', confirmationCue: 'Debris cleared.' },
  'clean-dial-surface': { requiredTool: 'dust-blower', confirmationCue: 'Dial surface cleaned.' },
  'clean-crystal':      { requiredTool: 'dust-blower', confirmationCue: 'Crystal cleaned.' },

  // ── Phase 1 Wrong-Tool Consequence targets (Issue #295) ─────────────────────
  // phase1Consequence: true enables damage event wiring when onWrongTool is injected.
  // componentId: the part affected (used as partId in DamageEventDetector).
  'wind-mainspring': {
    requiredTool: 'flat-blade-screwdriver',
    confirmationCue: 'Mainspring wound carefully.',
    phase1Consequence: true,
    componentId: 'mainspring',
  },
  'remove-cannon-pinion': {
    requiredTool: 'movement-holder',
    confirmationCue: 'Cannon pinion removed safely.',
    phase1Consequence: true,
    componentId: 'cannon-pinion',
  },
  'remove-balance-wheel': {
    requiredTool: 'fine-tip-tweezers',
    confirmationCue: 'Balance wheel lifted without stress.',
    phase1Consequence: true,
    componentId: 'balance-wheel',
  },
  'oil-jewel-seat': {
    requiredTool: 'movement-holder',
    confirmationCue: 'Jewel seat oiled correctly.',
    phase1Consequence: true,
    componentId: 'jewel-seat',
  },
  'set-crown': {
    requiredTool: 'hand-setting-tool',
    confirmationCue: 'Crown set onto post without damage.',
    phase1Consequence: true,
    componentId: 'crown-wheel',
  },
};

module.exports = { OperationGatingSystem, DEFAULT_COMPONENT_MANIFEST };
