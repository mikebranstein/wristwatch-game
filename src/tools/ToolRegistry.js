/**
 * ToolRegistry — static data structure mapping each of the 8 MVP tools to their
 * eligible operations, display name, and one-line purpose description.
 *
 * Issue #131 — Tool-Switching MVP: Core Repair Loop (6-8 Tools)
 *
 * Design contract (from approved design):
 *   - Stateless: no mutable state; all data is frozen at module load.
 *   - 8 MVP tools available from the first repair session (no unlock gates).
 *   - Each tool carries:
 *       id              — stable string key referenced by gating logic
 *       name            — display name shown in the tool panel HUD
 *       purpose         — one-line description shown in the tooltip (AC1)
 *       eligibleOperations — array of operation IDs this tool can perform (AC2, AC3, AC5)
 *       ariaLabel       — accessible label for assistive technologies (Constraint: WCAG 2.1 AA)
 *
 * AC1: All 8 tools have name and purpose (tooltip text).
 * AC2: eligibleOperations defines the correct-tool match set.
 * AC3: OperationGatingSystem uses eligibleOperations to gate wrong-tool operations.
 * AC5: eligibleOperations drives the contextual highlight system.
 */

/** @typedef {{ id: string, name: string, purpose: string, eligibleOperations: string[], ariaLabel: string }} ToolDefinition */

/** @type {ToolDefinition[]} */
const TOOL_DEFINITIONS = [
  {
    id: 'fine-tip-tweezers',
    name: 'Fine-Tip Tweezers',
    purpose: 'Handles delicate dial components and watch hands with precision grip.',
    eligibleOperations: [
      'handle-hour-hand',
      'handle-minute-hand',
      'handle-second-hand',
      'handle-dial',
      'position-jewel',
    ],
    ariaLabel: 'Fine-Tip Tweezers — handles delicate dial components and watch hands',
  },
  {
    id: 'flat-blade-screwdriver',
    name: 'Flat-Blade Screwdriver',
    purpose: 'Drives flat-head screws securing movement plates and bridges.',
    eligibleOperations: [
      'remove-movement-plate-screw',
      'install-movement-plate-screw',
      'remove-bridge-screw',
      'install-bridge-screw',
    ],
    ariaLabel: 'Flat-Blade Screwdriver — drives flat-head screws on movement plates',
  },
  {
    id: 'cross-tip-screwdriver',
    name: 'Cross-Tip Screwdriver',
    purpose: 'Drives Phillips/JIS cross-head screws on case backs and bracelet clasps.',
    eligibleOperations: [
      'remove-case-back-screw',
      'install-case-back-screw',
      'remove-clasp-screw',
      'install-clasp-screw',
    ],
    ariaLabel: 'Cross-Tip Screwdriver — drives cross-head screws on case backs',
  },
  {
    id: 'case-knife',
    name: 'Case Knife',
    purpose: 'Levers open snap-back case covers without scratching the case.',
    eligibleOperations: [
      'open-snap-back-case',
      'close-snap-back-case',
    ],
    ariaLabel: 'Case Knife — levers open snap-back case covers',
  },
  {
    id: 'spring-bar-tool',
    name: 'Spring Bar Tool',
    purpose: 'Compresses spring bars to attach or remove watch straps and bracelets.',
    eligibleOperations: [
      'remove-spring-bar',
      'install-spring-bar',
      'detach-strap',
      'attach-strap',
    ],
    ariaLabel: 'Spring Bar Tool — compresses spring bars for strap attachment and removal',
  },
  {
    id: 'movement-holder',
    name: 'Movement Holder / Rodico',
    purpose: 'Holds and positions the movement safely during disassembly and reassembly.',
    eligibleOperations: [
      'seat-movement',
      'lift-movement',
      'stabilise-movement',
      'pick-up-component',
    ],
    ariaLabel: 'Movement Holder and Rodico — holds and positions the movement during work',
  },
  {
    id: 'hand-setting-tool',
    name: 'Hand-Setting Tool',
    purpose: 'Presses watch hands evenly onto movement cannon pinions without damage.',
    eligibleOperations: [
      'set-hour-hand',
      'set-minute-hand',
      'set-second-hand',
    ],
    ariaLabel: 'Hand-Setting Tool — presses watch hands onto movement posts',
  },
  {
    id: 'dust-blower',
    name: 'Dust Blower',
    purpose: 'Blows debris and dust off movement components before case closure.',
    eligibleOperations: [
      'clear-debris',
      'clean-dial-surface',
      'clean-crystal',
    ],
    ariaLabel: 'Dust Blower — clears debris before closing the case',
  },
];

/**
 * Returns the tool definition for the given tool ID, or null if not found.
 * @param {string} toolId
 * @returns {ToolDefinition|null}
 */
function getToolById(toolId) {
  return TOOL_DEFINITIONS.find((t) => t.id === toolId) || null;
}

/**
 * Returns all tool definitions (all 8 MVP tools).
 * @returns {ToolDefinition[]}
 */
function getAllTools() {
  return [...TOOL_DEFINITIONS];
}

/**
 * Returns all tool IDs in panel order.
 * @returns {string[]}
 */
function getAllToolIds() {
  return TOOL_DEFINITIONS.map((t) => t.id);
}

/**
 * Returns the tool(s) that are eligible for the given operation ID.
 * Used by OperationGatingSystem to build contextual error messages.
 * @param {string} operationId
 * @returns {ToolDefinition[]}
 */
function getToolsForOperation(operationId) {
  return TOOL_DEFINITIONS.filter((t) => t.eligibleOperations.includes(operationId));
}

/**
 * Returns true if the given tool can perform the given operation.
 * @param {string} toolId
 * @param {string} operationId
 * @returns {boolean}
 */
function canToolPerformOperation(toolId, operationId) {
  const tool = getToolById(toolId);
  if (!tool) return false;
  return tool.eligibleOperations.includes(operationId);
}

module.exports = {
  TOOL_DEFINITIONS,
  getToolById,
  getAllTools,
  getAllToolIds,
  getToolsForOperation,
  canToolPerformOperation,
};
