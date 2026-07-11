/**
 * Phase2ToolInjector — conditional tool injection for Phase 2 damage states.
 *
 * Issue #84: Phase 2 — Tool Inventory Expansion.
 *
 * Design contract (from design decision):
 *   - Three new specialised tools: bent-hand straightening, penetrant applicator,
 *     fastener extractor.
 *   - Tools are injected into the active toolset ONLY when the corresponding
 *     Phase 2 damage state is assigned to the current watch.
 *   - They do NOT appear for Phase 1 or standard-wear watches (Test Scenario 4).
 *   - Tool UI must accommodate 3 new entries without a toolset redesign —
 *     tools are injected as additional entries, not replacing existing tools.
 *
 * Usage:
 *   const injector = new Phase2ToolInjector();
 *   const tools = injector.getToolsForDamageState('shock_damage');
 *   // → [{ id: 'bent-hand-straightening-tool', ... }]
 *
 *   injector.shouldShowTool('penetrant-applicator', 'rust_fused_fasteners'); // true
 *   injector.shouldShowTool('penetrant-applicator', 'water_ingress');        // false
 */

'use strict';

/**
 * Phase 2 tool descriptors.
 * Each tool entry defines the metadata consumed by the tool UI injection layer.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   applicableDamageStates: string[],
 *   requiresPriorStep: string|null
 * }} Phase2Tool
 */

/** @type {Object.<string, Phase2Tool>} */
const PHASE2_TOOLS = {
  'bent-hand-straightening-tool': {
    id: 'bent-hand-straightening-tool',
    label: 'Bent-Hand Straightening Tool',
    description:
      'Precision micro-lever tool for re-aligning bent or off-axis watch hands. ' +
      'Required before component repositioning in Shock Damage repair.',
    applicableDamageStates: ['shock_damage'],
    requiresPriorStep: null,  // First-order tool — no prerequisite
  },

  'penetrant-applicator': {
    id: 'penetrant-applicator',
    label: 'Penetrant Applicator',
    description:
      'Capillary-action rust penetrant that dissolves the corrosion bond on fused fasteners. ' +
      'Apply before using the fastener extractor.',
    applicableDamageStates: ['rust_fused_fasteners'],
    requiresPriorStep: null,  // First-order tool — no prerequisite
  },

  'fastener-extractor': {
    id: 'fastener-extractor',
    label: 'Fastener Extractor',
    description:
      'Specialised extraction driver for corroded screw heads. ' +
      'Requires penetrant to have been applied first — will not engage an untreated fused fastener.',
    applicableDamageStates: ['rust_fused_fasteners'],
    requiresPriorStep: 'penetrant-applicator',
  },
};

/** All Phase 2 tool IDs. */
const PHASE2_TOOL_IDS = Object.keys(PHASE2_TOOLS);

class Phase2ToolInjector {
  // ──────────────────────────────────────────────────────────────────────────
  // Tool availability queries
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Returns the array of Phase 2 tool descriptors that apply to the given
   * damage state. Returns an empty array for null (standard wear) or any
   * Phase 1 damage state — Phase 2 tools do NOT appear for those watches.
   *
   * @param {string|null} damageStateId — active damage state for the current watch
   * @returns {Phase2Tool[]}
   */
  getToolsForDamageState(damageStateId) {
    if (!damageStateId) return [];
    return Object.values(PHASE2_TOOLS).filter(tool =>
      tool.applicableDamageStates.includes(damageStateId)
    );
  }

  /**
   * Returns true when a specific Phase 2 tool should be shown for the given
   * damage state. False for Phase 1 states, standard wear, or non-Phase 2 tools.
   *
   * @param {string} toolId           — tool identifier
   * @param {string|null} damageStateId
   * @returns {boolean}
   */
  shouldShowTool(toolId, damageStateId) {
    if (!damageStateId) return false;
    const tool = PHASE2_TOOLS[toolId];
    if (!tool) return false;
    return tool.applicableDamageStates.includes(damageStateId);
  }

  /**
   * Returns the IDs of Phase 2 tools available for the active damage state.
   *
   * @param {string|null} damageStateId
   * @returns {string[]}
   */
  getToolIdsForDamageState(damageStateId) {
    return this.getToolsForDamageState(damageStateId).map(t => t.id);
  }

  /**
   * Returns the descriptor for a specific Phase 2 tool, or null if not a
   * Phase 2 tool ID.
   *
   * @param {string} toolId
   * @returns {Phase2Tool|null}
   */
  getToolDescriptor(toolId) {
    return PHASE2_TOOLS[toolId] || null;
  }

  /**
   * Returns true if the tool has a required prior step.
   * Used by the interaction layer to enforce the penetrant → extractor sequence.
   *
   * @param {string} toolId
   * @returns {boolean}
   */
  hasPrerequisite(toolId) {
    const tool = PHASE2_TOOLS[toolId];
    return !!(tool && tool.requiresPriorStep);
  }

  /**
   * Returns the ID of the required prior tool for this tool, or null.
   *
   * @param {string} toolId
   * @returns {string|null}
   */
  getPrerequisiteTool(toolId) {
    const tool = PHASE2_TOOLS[toolId];
    return (tool && tool.requiresPriorStep) || null;
  }

  /**
   * Returns all Phase 2 tool descriptors (for UI registration at game startup).
   * @returns {Phase2Tool[]}
   */
  getAllPhase2Tools() {
    return Object.values(PHASE2_TOOLS);
  }
}

module.exports = { Phase2ToolInjector, PHASE2_TOOLS, PHASE2_TOOL_IDS };
