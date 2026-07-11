/**
 * Tests for Phase2ToolInjector.js — Issue #84.
 *
 * Acceptance Criteria covered:
 *   AC4 (Test Scenario 4 — tool availability):
 *     - Bent-hand straightening tool and penetrant applicator do NOT appear for standard
 *       or Phase 1 damage-state watches.
 *     - They appear ONLY when the corresponding Phase 2 damage state is present.
 *   Design constraint: tool injection is conditional on active damage state.
 *   Design constraint: 3 new tools fit without redesigning existing toolset.
 */

'use strict';

const {
  Phase2ToolInjector,
  PHASE2_TOOLS,
  PHASE2_TOOL_IDS,
} = require('../../../src/tools/Phase2ToolInjector');

const PHASE1_DAMAGE_STATES = ['water_ingress', 'oxidation', 'crystal_crazing'];

// ─── Tool catalog structure ───────────────────────────────────────────────────

describe('Phase2ToolInjector — tool catalog', () => {
  test('PHASE2_TOOLS has exactly 3 tools', () => {
    expect(Object.keys(PHASE2_TOOLS)).toHaveLength(3);
  });

  test('bent-hand-straightening-tool is defined', () => {
    expect(PHASE2_TOOLS['bent-hand-straightening-tool']).toBeDefined();
    expect(PHASE2_TOOLS['bent-hand-straightening-tool'].label).toBeTruthy();
  });

  test('penetrant-applicator is defined', () => {
    expect(PHASE2_TOOLS['penetrant-applicator']).toBeDefined();
    expect(PHASE2_TOOLS['penetrant-applicator'].label).toBeTruthy();
  });

  test('fastener-extractor is defined', () => {
    expect(PHASE2_TOOLS['fastener-extractor']).toBeDefined();
    expect(PHASE2_TOOLS['fastener-extractor'].label).toBeTruthy();
  });

  test('PHASE2_TOOL_IDS contains all 3 tool IDs', () => {
    expect(PHASE2_TOOL_IDS).toContain('bent-hand-straightening-tool');
    expect(PHASE2_TOOL_IDS).toContain('penetrant-applicator');
    expect(PHASE2_TOOL_IDS).toContain('fastener-extractor');
    expect(PHASE2_TOOL_IDS).toHaveLength(3);
  });

  test('every tool has id, label, description, applicableDamageStates', () => {
    for (const tool of Object.values(PHASE2_TOOLS)) {
      expect(typeof tool.id).toBe('string');
      expect(typeof tool.label).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(Array.isArray(tool.applicableDamageStates)).toBe(true);
      expect(tool.applicableDamageStates.length).toBeGreaterThan(0);
    }
  });
});

// ─── AC4 / Test Scenario 4: Tool availability — conditional on damage state ──

describe('Phase2ToolInjector — AC4/Scenario 4: tools absent for Phase 1 + standard wear', () => {
  const injector = new Phase2ToolInjector();

  test('getToolsForDamageState(null) returns empty array (standard wear)', () => {
    expect(injector.getToolsForDamageState(null)).toHaveLength(0);
  });

  test.each(PHASE1_DAMAGE_STATES)(
    'getToolsForDamageState("%s") returns empty array (Phase 1 state)',
    (stateId) => {
      expect(injector.getToolsForDamageState(stateId)).toHaveLength(0);
    }
  );

  test('shouldShowTool("bent-hand-straightening-tool", null) = false (standard wear)', () => {
    expect(injector.shouldShowTool('bent-hand-straightening-tool', null)).toBe(false);
  });

  test.each(PHASE1_DAMAGE_STATES)(
    'shouldShowTool("bent-hand-straightening-tool", "%s") = false (Phase 1)',
    (stateId) => {
      expect(injector.shouldShowTool('bent-hand-straightening-tool', stateId)).toBe(false);
    }
  );

  test.each(PHASE1_DAMAGE_STATES)(
    'shouldShowTool("penetrant-applicator", "%s") = false (Phase 1)',
    (stateId) => {
      expect(injector.shouldShowTool('penetrant-applicator', stateId)).toBe(false);
    }
  );

  test.each(PHASE1_DAMAGE_STATES)(
    'shouldShowTool("fastener-extractor", "%s") = false (Phase 1)',
    (stateId) => {
      expect(injector.shouldShowTool('fastener-extractor', stateId)).toBe(false);
    }
  );
});

// ─── AC4: Tools DO appear for matching Phase 2 state ─────────────────────────

describe('Phase2ToolInjector — AC4: tools appear for matching Phase 2 damage state', () => {
  const injector = new Phase2ToolInjector();

  test('getToolsForDamageState("shock_damage") returns bent-hand tool', () => {
    const tools = injector.getToolsForDamageState('shock_damage');
    const ids = tools.map(t => t.id);
    expect(ids).toContain('bent-hand-straightening-tool');
  });

  test('getToolsForDamageState("shock_damage") does NOT return penetrant/extractor', () => {
    const tools = injector.getToolsForDamageState('shock_damage');
    const ids = tools.map(t => t.id);
    expect(ids).not.toContain('penetrant-applicator');
    expect(ids).not.toContain('fastener-extractor');
  });

  test('getToolsForDamageState("rust_fused_fasteners") returns penetrant-applicator', () => {
    const tools = injector.getToolsForDamageState('rust_fused_fasteners');
    const ids = tools.map(t => t.id);
    expect(ids).toContain('penetrant-applicator');
  });

  test('getToolsForDamageState("rust_fused_fasteners") returns fastener-extractor', () => {
    const tools = injector.getToolsForDamageState('rust_fused_fasteners');
    const ids = tools.map(t => t.id);
    expect(ids).toContain('fastener-extractor');
  });

  test('getToolsForDamageState("rust_fused_fasteners") does NOT return bent-hand tool', () => {
    const tools = injector.getToolsForDamageState('rust_fused_fasteners');
    const ids = tools.map(t => t.id);
    expect(ids).not.toContain('bent-hand-straightening-tool');
  });

  test('shouldShowTool("bent-hand-straightening-tool", "shock_damage") = true', () => {
    expect(injector.shouldShowTool('bent-hand-straightening-tool', 'shock_damage')).toBe(true);
  });

  test('shouldShowTool("penetrant-applicator", "rust_fused_fasteners") = true', () => {
    expect(injector.shouldShowTool('penetrant-applicator', 'rust_fused_fasteners')).toBe(true);
  });

  test('shouldShowTool("fastener-extractor", "rust_fused_fasteners") = true', () => {
    expect(injector.shouldShowTool('fastener-extractor', 'rust_fused_fasteners')).toBe(true);
  });

  test('shouldShowTool("bent-hand-straightening-tool", "rust_fused_fasteners") = false', () => {
    expect(injector.shouldShowTool('bent-hand-straightening-tool', 'rust_fused_fasteners')).toBe(false);
  });
});

// ─── Tool metadata (description and prerequisite) ────────────────────────────

describe('Phase2ToolInjector — tool metadata and prerequisite chain', () => {
  const injector = new Phase2ToolInjector();

  test('bent-hand-straightening-tool has no prerequisite', () => {
    expect(injector.hasPrerequisite('bent-hand-straightening-tool')).toBe(false);
    expect(injector.getPrerequisiteTool('bent-hand-straightening-tool')).toBeNull();
  });

  test('penetrant-applicator has no prerequisite', () => {
    expect(injector.hasPrerequisite('penetrant-applicator')).toBe(false);
    expect(injector.getPrerequisiteTool('penetrant-applicator')).toBeNull();
  });

  test('fastener-extractor requires penetrant-applicator', () => {
    expect(injector.hasPrerequisite('fastener-extractor')).toBe(true);
    expect(injector.getPrerequisiteTool('fastener-extractor')).toBe('penetrant-applicator');
  });

  test('getToolDescriptor returns tool for known ID', () => {
    const desc = injector.getToolDescriptor('penetrant-applicator');
    expect(desc).not.toBeNull();
    expect(desc.id).toBe('penetrant-applicator');
  });

  test('getToolDescriptor returns null for unknown tool ID', () => {
    expect(injector.getToolDescriptor('does-not-exist')).toBeNull();
  });

  test('shouldShowTool returns false for non-Phase2 tool ID', () => {
    expect(injector.shouldShowTool('corrosion-cleaning-tool', 'shock_damage')).toBe(false);
  });

  test('getAllPhase2Tools returns all 3 tool descriptors', () => {
    const tools = injector.getAllPhase2Tools();
    expect(tools).toHaveLength(3);
    const ids = tools.map(t => t.id);
    expect(ids).toContain('bent-hand-straightening-tool');
    expect(ids).toContain('penetrant-applicator');
    expect(ids).toContain('fastener-extractor');
  });

  test('getToolIdsForDamageState returns just IDs', () => {
    const ids = injector.getToolIdsForDamageState('shock_damage');
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.every(id => typeof id === 'string')).toBe(true);
    expect(ids).toContain('bent-hand-straightening-tool');
  });
});
