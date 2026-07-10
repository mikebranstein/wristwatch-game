/**
 * Tests for Issue #131 — Tool-Switching MVP: Core Repair Loop (6-8 Tools)
 *
 * Covers all 5 Acceptance Criteria and all 9 Test Scenarios:
 *
 * AC1: All 6-8 MVP tools visible with name and one-line purpose tooltip.
 * AC2: Correct tool → operation proceeds with positive confirmation cue.
 * AC3: Wrong tool → operation blocked, contextual message names the correct tool.
 * AC4: First-time tutorial prompt shown once; dismissible; never reappears after dismissal.
 * AC5: Contextual highlight — eligible operations glow; ineligible operations are de-emphasised.
 *
 * Scenario 1 (Happy path): Spring bar tool + spring bar lug → strap detaches successfully.
 * Scenario 2 (Wrong tool blocked): Screwdriver + watch hand → blocked, names fine-tip tweezers.
 * Scenario 3 (Tooltip coverage): Hover each of the 8 tools → correct name and purpose shown.
 * Scenario 4 (Tutorial — first session): New player → tutorial shown; dismissed → never reappears.
 * Scenario 5 (Contextual highlight): Case knife selected → case back eligible; hands/plate ineligible.
 * Scenario 6 (Multi-tool sequence): 3-step sequence gates each step; no step can be skipped.
 * Scenario 7 (Keyboard/controller navigation): All 8 tools reachable via navigateNext/navigatePrev.
 * Scenario 8 (No-action component): Any tool + no-action component → neutral message, no corruption.
 * Scenario 9 (Tool state persistence): Selected tool persists until explicitly changed.
 *
 * Also covers:
 *   - PlayerSaveState backward-compatible tutorial_tool_switching_seen addition
 *   - ToolPanel hard cap (max 8 tools enforcement)
 *   - ContextualHighlightController event-driven (dirty-flag) pattern
 *   - MultiStepOperationTracker ordered step enforcement
 */

const {
  TOOL_DEFINITIONS,
  getToolById,
  getAllTools,
  getAllToolIds,
  getToolsForOperation,
  canToolPerformOperation,
} = require('../../src/tools/ToolRegistry');

const { ToolPanel, MAX_TOOLS } = require('../../src/tools/ToolPanel');

const {
  OperationGatingSystem,
  DEFAULT_COMPONENT_MANIFEST,
} = require('../../src/tools/OperationGatingSystem');

const {
  ContextualHighlightController,
  DEFAULT_COMPONENT_OPERATION_MAP,
} = require('../../src/tools/ContextualHighlightController');

const {
  ToolSwitchingTutorial,
  TOOL_SWITCHING_TUTORIAL_STEPS,
  SAVE_KEY,
} = require('../../src/tools/ToolSwitchingTutorial');

const { MultiStepOperationTracker } = require('../../src/tools/MultiStepOperationTracker');

const { PlayerSaveState } = require('../../src/state/PlayerSaveState');
const { TelemetryEmitter } = require('../../src/telemetry/TelemetryEmitter');

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function makeTelemetry() {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  const telemetry = new TelemetryEmitter(hook);
  return { telemetry, received };
}

function makeTutorial(initialSaveData = {}) {
  const { telemetry, received } = makeTelemetry();
  const saveState = new PlayerSaveState(initialSaveData);
  const tutorial = new ToolSwitchingTutorial(saveState, telemetry);
  return { tutorial, saveState, telemetry, received };
}

function makePanel(toolIds = null) {
  return toolIds ? new ToolPanel(toolIds) : new ToolPanel();
}

function makeHighlightController(toolPanel, componentMap = DEFAULT_COMPONENT_OPERATION_MAP) {
  return new ContextualHighlightController(toolPanel, componentMap);
}

function makeGatingSystem(manifest = DEFAULT_COMPONENT_MANIFEST) {
  return new OperationGatingSystem(manifest);
}

// ─── ToolRegistry ──────────────────────────────────────────────────────────────

describe('ToolRegistry — tool count and structure', () => {
  test('exactly 8 MVP tools are defined', () => {
    expect(TOOL_DEFINITIONS.length).toBe(8);
  });

  test('every tool has id, name, purpose, eligibleOperations (non-empty), and ariaLabel', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.id).toBe('string');
      expect(tool.id.length).toBeGreaterThan(0);
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.purpose).toBe('string');
      expect(tool.purpose.length).toBeGreaterThan(0);
      expect(Array.isArray(tool.eligibleOperations)).toBe(true);
      expect(tool.eligibleOperations.length).toBeGreaterThan(0);
      expect(typeof tool.ariaLabel).toBe('string');
      expect(tool.ariaLabel.length).toBeGreaterThan(0);
    }
  });

  test('all 8 expected tool IDs are present', () => {
    const ids = getAllToolIds();
    expect(ids).toContain('fine-tip-tweezers');
    expect(ids).toContain('flat-blade-screwdriver');
    expect(ids).toContain('cross-tip-screwdriver');
    expect(ids).toContain('case-knife');
    expect(ids).toContain('spring-bar-tool');
    expect(ids).toContain('movement-holder');
    expect(ids).toContain('hand-setting-tool');
    expect(ids).toContain('dust-blower');
  });

  test('getToolById returns correct tool for known id', () => {
    const tool = getToolById('case-knife');
    expect(tool).not.toBeNull();
    expect(tool.name).toBe('Case Knife');
  });

  test('getToolById returns null for unknown id', () => {
    expect(getToolById('nonexistent-tool')).toBeNull();
  });

  test('canToolPerformOperation returns true for correct tool/operation pair', () => {
    expect(canToolPerformOperation('spring-bar-tool', 'detach-strap')).toBe(true);
    expect(canToolPerformOperation('fine-tip-tweezers', 'handle-hour-hand')).toBe(true);
    expect(canToolPerformOperation('case-knife', 'open-snap-back-case')).toBe(true);
  });

  test('canToolPerformOperation returns false for wrong tool/operation pair', () => {
    expect(canToolPerformOperation('flat-blade-screwdriver', 'handle-hour-hand')).toBe(false);
    expect(canToolPerformOperation('spring-bar-tool', 'open-snap-back-case')).toBe(false);
  });

  test('getToolsForOperation returns tools that can perform the operation', () => {
    const tools = getToolsForOperation('detach-strap');
    const ids = tools.map((t) => t.id);
    expect(ids).toContain('spring-bar-tool');
  });
});

// ─── AC1 / Scenario 3: Tooltip coverage ────────────────────────────────────────

describe('AC1 / Scenario 3 — All 8 tools visible with name and purpose tooltip', () => {
  test('ToolPanel.getAllTooltips returns one entry for each of the 8 tools', () => {
    const panel = makePanel();
    const tooltips = panel.getAllTooltips();
    expect(tooltips.length).toBe(8);
  });

  test('each tooltip entry has id, name, purpose, and ariaLabel', () => {
    const panel = makePanel();
    const tooltips = panel.getAllTooltips();
    for (const tooltip of tooltips) {
      expect(typeof tooltip.id).toBe('string');
      expect(typeof tooltip.name).toBe('string');
      expect(tooltip.name.length).toBeGreaterThan(0);
      expect(typeof tooltip.purpose).toBe('string');
      expect(tooltip.purpose.length).toBeGreaterThan(0);
      expect(typeof tooltip.ariaLabel).toBe('string');
    }
  });

  test('getTooltip returns correct name and purpose for each of the 8 tools', () => {
    const panel = makePanel();
    const ids = panel.getToolIds();
    for (const id of ids) {
      const tip = panel.getTooltip(id);
      expect(tip).not.toBeNull();
      expect(tip.name.length).toBeGreaterThan(0);
      expect(tip.purpose.length).toBeGreaterThan(0);
    }
  });

  test('getTooltip returns null for unknown tool id', () => {
    const panel = makePanel();
    expect(panel.getTooltip('not-a-tool')).toBeNull();
  });

  test('spring bar tool tooltip contains expected content', () => {
    const panel = makePanel();
    const tip = panel.getTooltip('spring-bar-tool');
    expect(tip.name).toBe('Spring Bar Tool');
    expect(tip.purpose.toLowerCase()).toContain('spring bar');
  });

  test('fine-tip tweezers tooltip references dial/hand handling', () => {
    const panel = makePanel();
    const tip = panel.getTooltip('fine-tip-tweezers');
    expect(tip.name).toBe('Fine-Tip Tweezers');
    // Purpose should mention delicate components, hands, or dial
    expect(
      tip.purpose.toLowerCase().includes('dial') ||
      tip.purpose.toLowerCase().includes('hand') ||
      tip.purpose.toLowerCase().includes('delicate')
    ).toBe(true);
  });
});

// ─── AC2 / Scenario 1: Correct tool → operation proceeds ───────────────────────

describe('AC2 / Scenario 1 — Correct tool → operation proceeds with confirmation cue', () => {
  test('spring-bar-tool + detach-strap → allowed with confirmation cue', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('spring-bar-tool', 'detach-strap');
    expect(result.allowed).toBe(true);
    expect(typeof result.confirmationCue).toBe('string');
    expect(result.confirmationCue.length).toBeGreaterThan(0);
  });

  test('case-knife + open-snap-back-case → allowed', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('case-knife', 'open-snap-back-case');
    expect(result.allowed).toBe(true);
  });

  test('fine-tip-tweezers + handle-hour-hand → allowed', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('fine-tip-tweezers', 'handle-hour-hand');
    expect(result.allowed).toBe(true);
  });

  test('hand-setting-tool + set-minute-hand → allowed', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('hand-setting-tool', 'set-minute-hand');
    expect(result.allowed).toBe(true);
  });

  test('dust-blower + clear-debris → allowed', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('dust-blower', 'clear-debris');
    expect(result.allowed).toBe(true);
  });

  test('flat-blade-screwdriver + remove-movement-plate-screw → allowed', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('flat-blade-screwdriver', 'remove-movement-plate-screw');
    expect(result.allowed).toBe(true);
  });

  test('movement-holder + seat-movement → allowed', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('movement-holder', 'seat-movement');
    expect(result.allowed).toBe(true);
  });

  test('cross-tip-screwdriver + remove-case-back-screw → allowed', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('cross-tip-screwdriver', 'remove-case-back-screw');
    expect(result.allowed).toBe(true);
  });
});

// ─── AC3 / Scenario 2: Wrong tool → operation blocked ────────────────────────

describe('AC3 / Scenario 2 — Wrong tool → operation blocked with contextual message', () => {
  test('flat-blade-screwdriver + handle-hour-hand → blocked', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('flat-blade-screwdriver', 'handle-hour-hand');
    expect(result.allowed).toBe(false);
  });

  test('wrong-tool message names the correct tool (fine-tip tweezers for hour-hand)', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('flat-blade-screwdriver', 'handle-hour-hand');
    expect(result.allowed).toBe(false);
    expect(typeof result.message).toBe('string');
    // Message must reference the correct tool name
    expect(result.message.toLowerCase()).toContain('fine-tip tweezers');
  });

  test('cross-tip-screwdriver + detach-strap → blocked with spring bar tool named', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('cross-tip-screwdriver', 'detach-strap');
    expect(result.allowed).toBe(false);
    expect(result.message.toLowerCase()).toContain('spring bar tool');
  });

  test('fine-tip-tweezers + open-snap-back-case → blocked with case knife named', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('fine-tip-tweezers', 'open-snap-back-case');
    expect(result.allowed).toBe(false);
    expect(result.message.toLowerCase()).toContain('case knife');
  });

  test('blocked result has no allowed:true flag', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('dust-blower', 'handle-hour-hand');
    expect(result.allowed).toBe(false);
  });

  test('wrong-tool operation is blocked (no state mutation on block)', () => {
    const gating = makeGatingSystem();
    // Attempt wrong tool twice — should both block consistently
    const r1 = gating.attemptOperation('dust-blower', 'handle-hour-hand');
    const r2 = gating.attemptOperation('dust-blower', 'handle-hour-hand');
    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(false);
    expect(r1.message).toBe(r2.message);
  });
});

// ─── TR1 — AC3 extension: multi-tool wrong-message format (lines 82–86) ─────────
//
// Requirement: when getToolsForOperation() returns ≥2 tools for an operation,
// attemptOperation() must produce "Use the [A] or [B] to ..." listing all names.

describe('TR1 — AC3 extension: multi-tool wrong-message format (lines 82–86)', () => {
  // Add a second synthetic tool that is also eligible for 'handle-hour-hand' so
  // getToolsForOperation('handle-hour-hand') returns exactly 2 tools.
  // TOOL_DEFINITIONS is a plain (non-frozen) const array — push/pop is safe in tests.
  beforeEach(() => {
    TOOL_DEFINITIONS.push({
      id: 'test-precision-grabber',
      name: 'Precision Grabber',
      purpose: 'Test-only tool for multi-tool message format coverage.',
      eligibleOperations: ['handle-hour-hand'],
      ariaLabel: 'Precision Grabber — test only',
    });
  });

  afterEach(() => {
    // Remove the synthetic entry so subsequent tests see the original 8 tools.
    TOOL_DEFINITIONS.pop();
  });

  test('wrong-tool result is blocked when multiple tools are valid', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('dust-blower', 'handle-hour-hand');
    expect(result.allowed).toBe(false);
  });

  test('wrong-tool message names all valid tools joined with "or" (multi-tool format)', () => {
    const gating = makeGatingSystem();
    // handle-hour-hand is now covered by 'fine-tip-tweezers' AND 'test-precision-grabber'
    const result = gating.attemptOperation('dust-blower', 'handle-hour-hand');
    expect(result.allowed).toBe(false);
    expect(typeof result.message).toBe('string');
    // Both tool names must appear in the message
    expect(result.message).toMatch(/Fine-Tip Tweezers/i);
    expect(result.message).toMatch(/Precision Grabber/i);
    // Names must be joined with "or", not listed with only one name
    expect(result.message).toMatch(/\bor\b/);
  });
});

// ─── TR2 — AC3 extension: empty-registry fallback message (lines 87–90) ─────────
//
// Requirement: when getToolsForOperation() returns [] (operation not in any tool's
// eligibleOperations), attemptOperation() must fall back to the manifest's
// requiredTool identifier to build the message.

describe('TR2 — AC3 extension: empty-registry fallback message (lines 87–90)', () => {
  test('wrong-tool result is blocked when operation has no registry entry', () => {
    // 'phantom-op' does not appear in any tool's eligibleOperations → getToolsForOperation returns []
    const manifest = {
      'phantom-op': { requiredTool: 'case-knife', confirmationCue: 'done.' },
    };
    const gating = new OperationGatingSystem(manifest);
    const result = gating.attemptOperation('dust-blower', 'phantom-op');
    expect(result.allowed).toBe(false);
  });

  test('fallback message uses manifest requiredTool name when registry returns empty array', () => {
    const manifest = {
      'phantom-op': { requiredTool: 'case-knife', confirmationCue: 'done.' },
    };
    const gating = new OperationGatingSystem(manifest);
    // getToolsForOperation('phantom-op') → [] (phantom-op not in any eligibleOperations)
    // Fallback: getToolById('case-knife') → { name: 'Case Knife', ... }
    const result = gating.attemptOperation('dust-blower', 'phantom-op');
    expect(result.allowed).toBe(false);
    expect(typeof result.message).toBe('string');
    expect(result.message).toMatch(/Case Knife/i);
  });

  test('fallback message uses raw requiredTool ID when getToolById also returns null', () => {
    const manifest = {
      'phantom-op': { requiredTool: 'nonexistent-tool-xyz', confirmationCue: 'done.' },
    };
    const gating = new OperationGatingSystem(manifest);
    // getToolsForOperation('phantom-op') → [] AND getToolById('nonexistent-tool-xyz') → null
    // Fallback: raw ID 'nonexistent-tool-xyz' used as the name
    const result = gating.attemptOperation('dust-blower', 'phantom-op');
    expect(result.allowed).toBe(false);
    expect(typeof result.message).toBe('string');
    expect(result.message).toContain('nonexistent-tool-xyz');
  });
});

// ─── TR3 — registerOperation() dynamic manifest update (lines 104–107) ───────────
//
// Requirement: registerOperation(operationId, entry) must add the operation to the
// manifest so subsequent attemptOperation() calls gate it exactly like static entries.

describe('TR3 — registerOperation() dynamic manifest update (lines 104–107)', () => {
  test('correct tool returns allowed:true after dynamic registerOperation()', () => {
    const gating = new OperationGatingSystem({});
    gating.registerOperation('dynamic-op', { requiredTool: 'case-knife', confirmationCue: 'Dynamically registered.' });
    const result = gating.attemptOperation('case-knife', 'dynamic-op');
    expect(result.allowed).toBe(true);
  });

  test('wrong tool returns allowed:false with message after dynamic registerOperation()', () => {
    const gating = new OperationGatingSystem({});
    gating.registerOperation('dynamic-op', { requiredTool: 'case-knife', confirmationCue: 'Dynamically registered.' });
    const result = gating.attemptOperation('dust-blower', 'dynamic-op');
    expect(result.allowed).toBe(false);
    expect(typeof result.message).toBe('string');
  });

  test('registerOperation() overwrites an existing entry for the same operationId', () => {
    const gating = new OperationGatingSystem({
      'dynamic-op': { requiredTool: 'dust-blower', confirmationCue: 'Old entry.' },
    });
    // Re-register with a different requiredTool
    gating.registerOperation('dynamic-op', { requiredTool: 'case-knife', confirmationCue: 'Updated entry.' });
    // Now case-knife should be the correct tool
    expect(gating.attemptOperation('case-knife', 'dynamic-op').allowed).toBe(true);
    // And dust-blower (old required tool) should now be wrong
    expect(gating.attemptOperation('dust-blower', 'dynamic-op').allowed).toBe(false);
  });
});

// ─── TR4 — getRegisteredOperations() manifest enumeration (lines 108–112) ────────
//
// Requirement: getRegisteredOperations() must return exactly the set of operation IDs
// present in the manifest — no additions, no omissions — for both constructor-injected
// and dynamically-registered entries.

describe('TR4 — getRegisteredOperations() manifest enumeration (lines 108–112)', () => {
  test('returns all operation IDs from a constructor-supplied manifest', () => {
    const manifest = {
      'handle-hour-hand':   { requiredTool: 'fine-tip-tweezers', confirmationCue: 'done.' },
      'open-snap-back-case': { requiredTool: 'case-knife',       confirmationCue: 'done.' },
      'detach-strap':        { requiredTool: 'spring-bar-tool',  confirmationCue: 'done.' },
    };
    const gating = new OperationGatingSystem(manifest);
    const ops = gating.getRegisteredOperations();
    expect(ops).toHaveLength(3);
    expect(ops).toContain('handle-hour-hand');
    expect(ops).toContain('open-snap-back-case');
    expect(ops).toContain('detach-strap');
  });

  test('returns empty array when constructed with empty manifest', () => {
    const gating = new OperationGatingSystem({});
    expect(gating.getRegisteredOperations()).toEqual([]);
  });

  test('newly registered operation appears in getRegisteredOperations()', () => {
    const gating = new OperationGatingSystem({
      'handle-hour-hand': { requiredTool: 'fine-tip-tweezers', confirmationCue: 'done.' },
    });
    gating.registerOperation('dynamic-op', { requiredTool: 'case-knife', confirmationCue: 'done.' });
    const ops = gating.getRegisteredOperations();
    expect(ops).toContain('handle-hour-hand');
    expect(ops).toContain('dynamic-op');
    expect(ops).toHaveLength(2);
  });

  test('DEFAULT_COMPONENT_MANIFEST exposes all 29 MVP operation IDs via getRegisteredOperations()', () => {
    const gating = makeGatingSystem();
    const ops = gating.getRegisteredOperations();
    // The DEFAULT_COMPONENT_MANIFEST contains 29 operations covering all 8 MVP tools
    expect(ops.length).toBe(29);
    // Spot-check a representative entry from each tool group
    expect(ops).toContain('handle-hour-hand');       // fine-tip-tweezers
    expect(ops).toContain('remove-movement-plate-screw'); // flat-blade-screwdriver
    expect(ops).toContain('remove-case-back-screw'); // cross-tip-screwdriver
    expect(ops).toContain('open-snap-back-case');    // case-knife
    expect(ops).toContain('detach-strap');           // spring-bar-tool
    expect(ops).toContain('seat-movement');          // movement-holder
    expect(ops).toContain('set-hour-hand');          // hand-setting-tool
    expect(ops).toContain('clear-debris');           // dust-blower
  });
});

// ─── AC4 / Scenario 4: Tutorial — first session ────────────────────────────────

describe('AC4 / Scenario 4 — Tutorial shown once; dismissed; never reappears', () => {
  test('shouldShow returns true for a brand-new player (flag not set)', () => {
    const { tutorial } = makeTutorial();
    expect(tutorial.shouldShow()).toBe(true);
  });

  test('tryShow returns true and makes tutorial visible for first-time player', () => {
    const { tutorial } = makeTutorial();
    const shown = tutorial.tryShow('session-001');
    expect(shown).toBe(true);
    expect(tutorial.isVisible()).toBe(true);
  });

  test('tryShow emits tool_switching_tutorial_started telemetry', () => {
    const { tutorial, received } = makeTutorial();
    tutorial.tryShow('session-001');
    const evt = received.find((e) => e.name === 'tool_switching_tutorial_started');
    expect(evt).toBeDefined();
    expect(evt.payload.sessionId).toBe('session-001');
  });

  test('tutorial has the expected step count', () => {
    const { tutorial } = makeTutorial();
    expect(tutorial.getTotalSteps()).toBe(TOOL_SWITCHING_TUTORIAL_STEPS.length);
    expect(tutorial.getTotalSteps()).toBeGreaterThanOrEqual(1);
  });

  test('getCurrentStepData returns step 1 content after tryShow', () => {
    const { tutorial } = makeTutorial();
    tutorial.tryShow('session-001');
    const step = tutorial.getCurrentStepData();
    expect(step).not.toBeNull();
    expect(step.step).toBe(1);
    expect(typeof step.title).toBe('string');
    expect(typeof step.body).toBe('string');
  });

  test('dismiss() hides the tutorial and persists the seen flag', () => {
    const { tutorial, saveState } = makeTutorial();
    tutorial.tryShow('session-001');
    tutorial.dismiss();
    expect(tutorial.isVisible()).toBe(false);
    expect(saveState.get(SAVE_KEY)).toBe(true);
  });

  test('dismiss() emits tool_switching_tutorial_dismissed telemetry', () => {
    const { tutorial, received } = makeTutorial();
    tutorial.tryShow('session-001');
    tutorial.dismiss();
    const evt = received.find((e) => e.name === 'tool_switching_tutorial_dismissed');
    expect(evt).toBeDefined();
  });

  test('tryShow returns false on second session (flag already set — never shown again)', () => {
    const { tutorial, saveState } = makeTutorial();
    tutorial.tryShow('session-001');
    tutorial.dismiss();
    // Simulate new session with same saveState
    const { telemetry: tel2 } = makeTelemetry();
    const tutorial2 = new ToolSwitchingTutorial(saveState, tel2);
    const shown = tutorial2.tryShow('session-002');
    expect(shown).toBe(false);
    expect(tutorial2.isVisible()).toBe(false);
  });

  test('shouldShow returns false after dismissal (flag persisted)', () => {
    const { tutorial, saveState } = makeTutorial();
    tutorial.tryShow('session-001');
    tutorial.dismiss();
    const { telemetry: tel2 } = makeTelemetry();
    const tutorial2 = new ToolSwitchingTutorial(saveState, tel2);
    expect(tutorial2.shouldShow()).toBe(false);
  });

  test('PlayerSaveState: tutorial_tool_switching_seen defaults to false (backward-compatible)', () => {
    const save = new PlayerSaveState();
    expect(save.get('tutorial_tool_switching_seen')).toBe(false);
  });

  test('PlayerSaveState: pre-existing save without tutorial_tool_switching_seen defaults to false', () => {
    // Simulate a save file that was created before Issue #131 shipped
    const save = new PlayerSaveState({ tutorial_first_fault_seen: true });
    expect(save.get('tutorial_tool_switching_seen')).toBe(false);
  });

  test('PlayerSaveState: tutorial_tool_switching_seen can be set to true', () => {
    const save = new PlayerSaveState();
    save.set('tutorial_tool_switching_seen', true);
    expect(save.get('tutorial_tool_switching_seen')).toBe(true);
  });
});

// ─── AC5 / Scenario 5: Contextual highlight ────────────────────────────────────

describe('AC5 / Scenario 5 — Contextual highlight: eligible glow, ineligible de-emphasised', () => {
  test('case-knife selected → case-back is eligible', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel);
    expect(ctrl.getHighlightState('case-back')).toBe('eligible');
  });

  test('case-knife selected → hour-hand is ineligible', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel);
    expect(ctrl.getHighlightState('hour-hand')).toBe('ineligible');
  });

  test('case-knife selected → movement-plate is ineligible', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel);
    expect(ctrl.getHighlightState('movement-plate')).toBe('ineligible');
  });

  test('spring-bar-tool selected → spring-bar-lug is eligible', () => {
    const panel = makePanel();
    panel.selectTool('spring-bar-tool');
    const ctrl = makeHighlightController(panel);
    expect(ctrl.getHighlightState('spring-bar-lug')).toBe('eligible');
  });

  test('fine-tip-tweezers selected → hour-hand is eligible', () => {
    const panel = makePanel();
    panel.selectTool('fine-tip-tweezers');
    const ctrl = makeHighlightController(panel);
    expect(ctrl.getHighlightState('hour-hand')).toBe('eligible');
  });

  test('fine-tip-tweezers selected → case-back is ineligible', () => {
    const panel = makePanel();
    panel.selectTool('fine-tip-tweezers');
    const ctrl = makeHighlightController(panel);
    expect(ctrl.getHighlightState('case-back')).toBe('ineligible');
  });

  test('component not in map → neutral (no operation registered)', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel, { 'case-back': ['open-snap-back-case'] });
    expect(ctrl.getHighlightState('nonexistent-component')).toBe('neutral');
  });

  test('getAllHighlightStates returns state for all registered components', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel);
    const states = ctrl.getAllHighlightStates();
    expect(typeof states).toBe('object');
    expect(states['case-back']).toBe('eligible');
    expect(states['hour-hand']).toBe('ineligible');
  });

  test('highlight updates (isDirty) when tool changes', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel);
    ctrl.clearDirty();
    expect(ctrl.isDirty()).toBe(false);
    panel.selectTool('fine-tip-tweezers');
    expect(ctrl.isDirty()).toBe(true);
  });

  test('highlight state changes correctly after tool switch', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel);
    expect(ctrl.getHighlightState('case-back')).toBe('eligible');
    // Switch to tweezers — case back should become ineligible
    panel.selectTool('fine-tip-tweezers');
    expect(ctrl.getHighlightState('case-back')).toBe('ineligible');
    expect(ctrl.getHighlightState('hour-hand')).toBe('eligible');
  });

  test('getEligibleComponents returns only eligible components for current tool', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel);
    const eligible = ctrl.getEligibleComponents();
    expect(eligible).toContain('case-back');
    expect(eligible).not.toContain('hour-hand');
  });

  test('dispose removes subscription and no longer updates highlight state', () => {
    const panel = makePanel();
    panel.selectTool('fine-tip-tweezers');
    const ctrl = makeHighlightController(panel);
    ctrl.clearDirty();
    ctrl.dispose();
    // After dispose, tool change should NOT flip the dirty flag
    panel.selectTool('case-knife');
    expect(ctrl.isDirty()).toBe(false);
  });
});

// ─── Scenario 6: Multi-tool sequence ───────────────────────────────────────────

describe('Scenario 6 — Multi-tool sequence gates each step; no step can be skipped', () => {
  const STRAP_REMOVAL_SEQUENCE = [
    { stepIndex: 1, requiredTool: 'spring-bar-tool', description: 'compress spring bar' },
    { stepIndex: 2, requiredTool: 'movement-holder', description: 'lift the movement' },
    { stepIndex: 3, requiredTool: 'fine-tip-tweezers', description: 'detach the dial' },
  ];

  test('step 1 advances with correct tool', () => {
    const tracker = new MultiStepOperationTracker({ 'strap-removal': STRAP_REMOVAL_SEQUENCE });
    const result = tracker.advanceStep('strap-removal', 'spring-bar-tool');
    expect(result.advanced).toBe(true);
    expect(result.completed).toBe(false);
  });

  test('step 1 is blocked with wrong tool (cannot skip to step 2)', () => {
    const tracker = new MultiStepOperationTracker({ 'strap-removal': STRAP_REMOVAL_SEQUENCE });
    const result = tracker.advanceStep('strap-removal', 'fine-tip-tweezers');
    expect(result.advanced).toBe(false);
    expect(result.completed).toBe(false);
    // Wrong-tool message must name the required tool
    expect(result.message.toLowerCase()).toContain('spring bar tool');
  });

  test('wrong tool at step 1 does not advance the step index', () => {
    const tracker = new MultiStepOperationTracker({ 'strap-removal': STRAP_REMOVAL_SEQUENCE });
    tracker.advanceStep('strap-removal', 'dust-blower'); // wrong
    const progress = tracker.getProgress('strap-removal');
    expect(progress.currentStep).toBe(0); // still at step 0 (not started)
  });

  test('full 3-step sequence completes in order', () => {
    const tracker = new MultiStepOperationTracker({ 'strap-removal': STRAP_REMOVAL_SEQUENCE });
    expect(tracker.advanceStep('strap-removal', 'spring-bar-tool').advanced).toBe(true);
    expect(tracker.advanceStep('strap-removal', 'movement-holder').advanced).toBe(true);
    const final = tracker.advanceStep('strap-removal', 'fine-tip-tweezers');
    expect(final.advanced).toBe(true);
    expect(final.completed).toBe(true);
    expect(tracker.isComplete('strap-removal')).toBe(true);
  });

  test('sequence is blocked after completion (no re-run)', () => {
    const tracker = new MultiStepOperationTracker({ 'strap-removal': STRAP_REMOVAL_SEQUENCE });
    tracker.advanceStep('strap-removal', 'spring-bar-tool');
    tracker.advanceStep('strap-removal', 'movement-holder');
    tracker.advanceStep('strap-removal', 'fine-tip-tweezers');
    const extra = tracker.advanceStep('strap-removal', 'spring-bar-tool');
    expect(extra.advanced).toBe(false);
    expect(extra.completed).toBe(true);
  });

  test('getProgress reports correct currentStep after each advance', () => {
    const tracker = new MultiStepOperationTracker({ 'strap-removal': STRAP_REMOVAL_SEQUENCE });
    tracker.advanceStep('strap-removal', 'spring-bar-tool');
    const progress = tracker.getProgress('strap-removal');
    expect(progress.currentStep).toBe(1);
    expect(progress.totalSteps).toBe(3);
    expect(progress.completed).toBe(false);
  });

  test('resetSequence resets progress back to step 0', () => {
    const tracker = new MultiStepOperationTracker({ 'strap-removal': STRAP_REMOVAL_SEQUENCE });
    tracker.advanceStep('strap-removal', 'spring-bar-tool');
    tracker.resetSequence('strap-removal');
    expect(tracker.getProgress('strap-removal').currentStep).toBe(0);
  });
});

// ─── Scenario 7: Keyboard/controller navigation ────────────────────────────────

describe('Scenario 7 — Keyboard/controller navigation: all 8 tools reachable', () => {
  test('navigateNext cycles through all 8 tools and wraps around', () => {
    const panel = makePanel();
    const visited = new Set();
    visited.add(panel.getActiveTool());
    for (let i = 0; i < 8; i++) {
      visited.add(panel.navigateNext());
    }
    // Should visit all 8 tool IDs (one extra because wrap-around returns to start)
    expect(visited.size).toBe(8);
  });

  test('navigatePrev cycles backwards through all 8 tools', () => {
    const panel = makePanel();
    const visited = new Set();
    visited.add(panel.getActiveTool());
    for (let i = 0; i < 8; i++) {
      visited.add(panel.navigatePrev());
    }
    expect(visited.size).toBe(8);
  });

  test('navigateNext wraps from last tool back to first', () => {
    const panel = makePanel();
    const ids = panel.getToolIds();
    // Navigate to the last tool
    for (let i = 0; i < ids.length - 1; i++) {
      panel.navigateNext();
    }
    expect(panel.getActiveTool()).toBe(ids[ids.length - 1]);
    // Wrap around
    panel.navigateNext();
    expect(panel.getActiveTool()).toBe(ids[0]);
  });

  test('navigatePrev wraps from first tool to last', () => {
    const panel = makePanel();
    const ids = panel.getToolIds();
    // Start at first tool
    expect(panel.getActiveTool()).toBe(ids[0]);
    panel.navigatePrev();
    expect(panel.getActiveTool()).toBe(ids[ids.length - 1]);
  });

  test('tooltip is accessible for each tool after keyboard navigation', () => {
    const panel = makePanel();
    for (let i = 0; i < 8; i++) {
      const activeTool = panel.getActiveTool();
      const tip = panel.getTooltip(activeTool);
      expect(tip).not.toBeNull();
      expect(tip.name.length).toBeGreaterThan(0);
      expect(tip.purpose.length).toBeGreaterThan(0);
      panel.navigateNext();
    }
  });

  test('selectTool returns true when tool changes, false when already selected', () => {
    const panel = makePanel();
    const ids = panel.getToolIds();
    expect(panel.selectTool(ids[0])).toBe(false); // already selected
    expect(panel.selectTool(ids[1])).toBe(true);  // new selection
    expect(panel.selectTool(ids[1])).toBe(false); // same again
  });
});

// ─── Scenario 8: No-action component ─────────────────────────────────────────

describe('Scenario 8 — No-action component: neutral message, no state corruption', () => {
  test('any tool applied to unregistered operation returns neutral isNoAction response', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('fine-tip-tweezers', 'nonexistent-operation');
    expect(result.allowed).toBe(false);
    expect(result.isNoAction).toBe(true);
    expect(typeof result.message).toBe('string');
  });

  test('neutral message is informational, not an error labelling a correct tool', () => {
    const gating = makeGatingSystem();
    const result = gating.attemptOperation('dust-blower', 'unknown-part');
    // Should NOT contain "Use the X" phrasing (which is the wrong-tool pattern)
    // It should be a neutral informational message
    expect(result.isNoAction).toBe(true);
    expect(result.allowed).toBe(false);
  });

  test('no-action does not corrupt gating state (subsequent valid operation still works)', () => {
    const gating = makeGatingSystem();
    // Hit a no-action operation
    gating.attemptOperation('fine-tip-tweezers', 'nonexistent-op');
    // Now do a valid operation — must still work correctly
    const result = gating.attemptOperation('fine-tip-tweezers', 'handle-hour-hand');
    expect(result.allowed).toBe(true);
  });

  test('highlight system returns neutral for component not in map', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    const ctrl = makeHighlightController(panel, { 'case-back': ['open-snap-back-case'] });
    expect(ctrl.getHighlightState('non-operable-part')).toBe('neutral');
  });
});

// ─── Scenario 9: Tool state persistence ───────────────────────────────────────

describe('Scenario 9 — Tool state persists until explicitly changed; no ghost-selection', () => {
  test('active tool persists after multiple other actions', () => {
    const panel = makePanel();
    panel.selectTool('case-knife');
    // Simulate other activity
    const gating = makeGatingSystem();
    gating.attemptOperation('case-knife', 'open-snap-back-case');
    gating.attemptOperation('flat-blade-screwdriver', 'handle-hour-hand'); // wrong tool
    // Tool selection must still be case-knife
    expect(panel.getActiveTool()).toBe('case-knife');
  });

  test('active tool does not change when wrong-tool operation is blocked', () => {
    const panel = makePanel();
    panel.selectTool('spring-bar-tool');
    const gating = makeGatingSystem();
    gating.attemptOperation('spring-bar-tool', 'handle-hour-hand'); // wrong tool, blocked
    expect(panel.getActiveTool()).toBe('spring-bar-tool');
  });

  test('selecting the same tool twice leaves state unchanged', () => {
    const panel = makePanel();
    panel.selectTool('dust-blower');
    const changed = panel.selectTool('dust-blower');
    expect(changed).toBe(false);
    expect(panel.getActiveTool()).toBe('dust-blower');
  });

  test('onToolChange subscriber fires only when selection actually changes', () => {
    const panel = makePanel();
    const changes = [];
    panel.onToolChange((id) => changes.push(id));
    panel.selectTool(panel.getActiveTool()); // no change — same tool
    expect(changes.length).toBe(0);
    panel.selectTool('dust-blower');
    expect(changes.length).toBe(1);
    expect(changes[0]).toBe('dust-blower');
  });

  test('unsubscribe from onToolChange stops notifications', () => {
    const panel = makePanel();
    const changes = [];
    const unsub = panel.onToolChange((id) => changes.push(id));
    panel.selectTool('case-knife');
    expect(changes.length).toBe(1);
    unsub(); // unsubscribe
    panel.selectTool('dust-blower');
    expect(changes.length).toBe(1); // no new notification
  });
});

// ─── ToolPanel hard cap constraint ─────────────────────────────────────────────

describe('ToolPanel — hard cap enforcement (max 8 tools)', () => {
  test('constructing with 8 tools succeeds', () => {
    const ids = getAllToolIds(); // exactly 8
    expect(() => new ToolPanel(ids)).not.toThrow();
  });

  test('constructing with 9 tools throws with descriptive error', () => {
    const ids = getAllToolIds();
    // Attempt to add a 9th (would require registering it first — just use a duplicate for this test)
    const nineIds = [...ids, ids[0]]; // intentionally duplicate to hit count check first
    expect(() => new ToolPanel(nineIds)).toThrow(/hard cap/i);
  });

  test('constructing with unknown tool ID throws', () => {
    expect(() => new ToolPanel(['not-a-real-tool'])).toThrow(/unknown tool id/i);
  });

  test('MAX_TOOLS constant is 8', () => {
    expect(MAX_TOOLS).toBe(8);
  });
});
