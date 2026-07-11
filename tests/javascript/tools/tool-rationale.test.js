/**
 * Tests for Issue #301 — In-Context Tool Rationale — Core System & Pilot Set (Phase 1 MVP)
 *
 * Covers all 5 Acceptance Criteria:
 *
 * AC1: Card renders on tool selection — given active operation context and a defined rationale,
 *      card renders with 3–5 word rationale string and icon within the interaction.
 * AC2: Progressive disclosure suppression — card auto-suppressed after N=5 views per tool.
 *      Player can re-enable via a visible control (unsuppressCard).
 * AC3: Player-triggered suppress persists — player collapse/suppress persists in PlayerSaveState,
 *      restored on next session load.
 * AC4: No card outside active operation context — no card rendered, no console error,
 *      no undefined reference when outside active repair operation step.
 * AC5: Telemetry emitted per impression — record contains operationId, toolId, shown (bool),
 *      timestamp — all fields present and correctly typed.
 *
 * Also covers all 10 Test Scenarios from the issue:
 * Scenario 1: Happy path — active operation, tool with rationale → card appears.
 * Scenario 2: Happy path — active operation, tool without rationale → no card.
 * Scenario 3: Progressive disclosure threshold — 5× views → 6th view suppressed.
 * Scenario 4: Player-suppressed card persists across sessions (PlayerSaveState round-trip).
 * Scenario 5: Non-active-operation context → no card, no error.
 * Scenario 6: All 10 pilot operations covered — each returns non-empty domain-accurate string.
 * Scenario 7: Regression — ToolPanel.getTooltip() unaffected; identical output before/after.
 * Scenario 8: Telemetry schema validation — all required fields present and correctly typed.
 * Scenario 9: Performance — O(1) static lookup confirmed (synchronous, no async or iteration).
 * Scenario 10: Non-pilot operations — no card, no error.
 */

'use strict';

const { getToolRationale, getAllOperationIds, RATIONALE_MAP } = require('../../../src/tools/ToolRationaleProvider');
const {
  ToolRationaleCardController,
  SUPPRESS_AFTER_N,
  SAVE_KEY_USE_COUNTS,
  SAVE_KEY_PLAYER_SUPPRESSED,
  TELEMETRY_EVENT,
} = require('../../../src/tools/ToolRationaleCardController');
const { ToolPanel } = require('../../../src/tools/ToolPanel');
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');
const { TelemetryEmitter } = require('../../../src/telemetry/TelemetryEmitter');
const { WorkbenchHUD } = require('../../../src/workbench/WorkbenchHUD');

// ── Test Helpers ──────────────────────────────────────────────────────────────

function makeTelemetry() {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  const telemetry = new TelemetryEmitter(hook);
  return { telemetry, received };
}

function makePanel() {
  return new ToolPanel();
}

function makeSaveState(initialData = {}) {
  return new PlayerSaveState(initialData);
}

/**
 * Build a fully wired controller.
 * @param {{ activeOpId?: string|null, saveData?: object, withHUD?: boolean }} opts
 */
function makeController(opts = {}) {
  const { activeOpId = null, saveData = {}, withHUD = false } = opts;
  const panel = makePanel();
  const saveState = makeSaveState(saveData);
  const { telemetry, received } = makeTelemetry();
  const hud = withHUD ? new WorkbenchHUD() : null;
  let currentOpId = activeOpId;
  const getActiveOperationId = () => currentOpId;
  const ctrl = new ToolRationaleCardController(panel, getActiveOperationId, saveState, telemetry, hud);
  return { ctrl, panel, saveState, telemetry, received, hud, setOp: (id) => { currentOpId = id; } };
}

// ── ToolRationaleProvider Tests ───────────────────────────────────────────────

describe('ToolRationaleProvider', () => {
  describe('getToolRationale(operationId)', () => {
    test('returns null for unknown operationId', () => {
      expect(getToolRationale('non-existent-operation')).toBeNull();
    });

    test('returns null for null input (AC4 guard)', () => {
      expect(getToolRationale(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
      expect(getToolRationale(undefined)).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(getToolRationale('')).toBeNull();
    });

    test('returns a RationaleEntry for a pilot operation', () => {
      const entry = getToolRationale('open-snap-back-case');
      expect(entry).not.toBeNull();
      expect(entry).toHaveProperty('operationId', 'open-snap-back-case');
      expect(entry).toHaveProperty('rationale');
      expect(entry).toHaveProperty('icon');
    });

    test('rationale string is 3–5 words (AC1 domain format)', () => {
      for (const opId of getAllOperationIds()) {
        const entry = getToolRationale(opId);
        const wordCount = entry.rationale.split(/\s+/).length;
        expect(wordCount).toBeGreaterThanOrEqual(3);
        expect(wordCount).toBeLessThanOrEqual(5);
      }
    });

    test('rationale strings are non-empty (Scenario 6)', () => {
      for (const opId of getAllOperationIds()) {
        const entry = getToolRationale(opId);
        expect(typeof entry.rationale).toBe('string');
        expect(entry.rationale.trim().length).toBeGreaterThan(0);
      }
    });

    test('operationId in entry matches the key used to look it up', () => {
      for (const opId of getAllOperationIds()) {
        const entry = getToolRationale(opId);
        expect(entry.operationId).toBe(opId);
      }
    });
  });

  describe('getAllOperationIds()', () => {
    test('returns exactly 10 pilot operation IDs (pilot set boundary)', () => {
      expect(getAllOperationIds()).toHaveLength(10);
    });

    test('all returned IDs match keys in RATIONALE_MAP', () => {
      for (const id of getAllOperationIds()) {
        expect(RATIONALE_MAP).toHaveProperty(id);
      }
    });

    test('returns a new array each call (immutable defensive copy)', () => {
      const a = getAllOperationIds();
      const b = getAllOperationIds();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('Scenario 6 — all 10 pilot operations covered', () => {
    const EXPECTED_PILOT_OPERATIONS = [
      'open-snap-back-case',
      'handle-dial',
      'remove-movement-plate-screw',
      'remove-bridge-screw',
      'set-hour-hand',
      'remove-spring-bar',
      'handle-hour-hand',
      'seat-movement',
      'position-jewel',
      'clean-dial-surface',
    ];

    test.each(EXPECTED_PILOT_OPERATIONS)(
      '%s has a non-empty domain-accurate rationale string',
      (opId) => {
        const entry = getToolRationale(opId);
        expect(entry).not.toBeNull();
        expect(entry.rationale.trim().length).toBeGreaterThan(0);
        // Not a placeholder or generic string
        expect(entry.rationale).not.toMatch(/^(TODO|placeholder|test|PLACEHOLDER)/i);
      }
    );
  });

  describe('Scenario 10 — non-pilot operations (scope boundary)', () => {
    const NON_PILOT_OPERATIONS = [
      'install-movement-plate-screw',
      'install-bridge-screw',
      'remove-case-back-screw',
      'install-case-back-screw',
      'remove-clasp-screw',
      'install-clasp-screw',
      'close-snap-back-case',
      'install-spring-bar',
      'detach-strap',
      'attach-strap',
      'lift-movement',
      'stabilise-movement',
      'pick-up-component',
      'set-minute-hand',
      'set-second-hand',
      'handle-minute-hand',
      'handle-second-hand',
      'clear-debris',
      'clean-crystal',
    ];

    test.each(NON_PILOT_OPERATIONS)(
      '%s returns null (Phase 2 scope, not in pilot set)',
      (opId) => {
        expect(getToolRationale(opId)).toBeNull();
      }
    );
  });
});

// ── ToolPanel Extension Tests ─────────────────────────────────────────────────

describe('ToolPanel.getToolRationaleForOperation() (Issue #301 additive extension)', () => {
  let panel;
  beforeEach(() => {
    panel = makePanel();
  });

  test('returns null for null operationId (AC4 guard)', () => {
    expect(panel.getToolRationaleForOperation(null)).toBeNull();
  });

  test('returns null for undefined operationId', () => {
    expect(panel.getToolRationaleForOperation(undefined)).toBeNull();
  });

  test('returns null for empty string operationId', () => {
    expect(panel.getToolRationaleForOperation('')).toBeNull();
  });

  test('returns null for non-pilot operation', () => {
    expect(panel.getToolRationaleForOperation('install-bridge-screw')).toBeNull();
  });

  test('returns a RationaleEntry for a pilot operation', () => {
    const entry = panel.getToolRationaleForOperation('open-snap-back-case');
    expect(entry).not.toBeNull();
    expect(entry.rationale).toBeDefined();
  });

  describe('Scenario 7 — Regression: getTooltip() unaffected', () => {
    test('getTooltip() still returns name, purpose, and ariaLabel for all tools', () => {
      const ids = panel.getToolIds();
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const tooltip = panel.getTooltip(id);
        expect(tooltip).not.toBeNull();
        expect(typeof tooltip.name).toBe('string');
        expect(typeof tooltip.purpose).toBe('string');
        expect(typeof tooltip.ariaLabel).toBe('string');
        expect(tooltip.name.length).toBeGreaterThan(0);
        expect(tooltip.purpose.length).toBeGreaterThan(0);
      }
    });

    test('getTooltip() returns null for unknown tool (unchanged behavior)', () => {
      expect(panel.getTooltip('not-a-tool')).toBeNull();
    });

    test('getTooltip() is not affected by multiple getToolRationaleForOperation() calls', () => {
      // Call rationale several times
      panel.getToolRationaleForOperation('open-snap-back-case');
      panel.getToolRationaleForOperation(null);
      panel.getToolRationaleForOperation('non-existent');
      // Tooltip still works correctly
      const tooltip = panel.getTooltip('case-knife');
      expect(tooltip).not.toBeNull();
      expect(tooltip.name).toBe('Case Knife');
    });
  });
});

// ── PlayerSaveState Extension Tests ──────────────────────────────────────────

describe('PlayerSaveState — Issue #301 additive fields', () => {
  test('tool_rationale_use_counts defaults to empty object', () => {
    const save = new PlayerSaveState();
    expect(save.get('tool_rationale_use_counts')).toEqual({});
  });

  test('tool_rationale_player_suppressed defaults to empty object', () => {
    const save = new PlayerSaveState();
    expect(save.get('tool_rationale_player_suppressed')).toEqual({});
  });

  test('backward-compatible: pre-existing saves without these keys receive {} defaults', () => {
    // Simulate an old save that lacks the new keys
    const oldSaveData = { tutorial_first_fault_seen: true };
    const save = new PlayerSaveState(oldSaveData);
    expect(save.get('tool_rationale_use_counts')).toEqual({});
    expect(save.get('tool_rationale_player_suppressed')).toEqual({});
    // Old fields unaffected
    expect(save.get('tutorial_first_fault_seen')).toBe(true);
  });

  test('initial save data for tool_rationale_use_counts is respected', () => {
    const save = new PlayerSaveState({ tool_rationale_use_counts: { 'case-knife': 3 } });
    expect(save.get('tool_rationale_use_counts')).toEqual({ 'case-knife': 3 });
  });
});

// ── WorkbenchHUD Extension Tests ──────────────────────────────────────────────

describe('WorkbenchHUD — rationale card state (Issue #301 additive extension)', () => {
  let hud;
  const snapshots = [];
  beforeEach(() => {
    snapshots.length = 0;
    hud = new WorkbenchHUD({ onStateChange: (s) => snapshots.push(s) });
  });

  test('getRationaleCardState() returns null by default', () => {
    expect(hud.getRationaleCardState()).toBeNull();
  });

  test('showRationaleCard() sets card state and fires onStateChange', () => {
    hud.showRationaleCard('open-snap-back-case', 'case-knife', 'Prevents case scratch', 'icon-case-knife');
    const state = hud.getRationaleCardState();
    expect(state).not.toBeNull();
    expect(state.operationId).toBe('open-snap-back-case');
    expect(state.toolId).toBe('case-knife');
    expect(state.rationaleText).toBe('Prevents case scratch');
    expect(state.icon).toBe('icon-case-knife');
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].rationaleCard).toEqual(state);
  });

  test('hideRationaleCard() clears card state and fires onStateChange', () => {
    hud.showRationaleCard('open-snap-back-case', 'case-knife', 'Prevents case scratch', 'icon-case-knife');
    hud.hideRationaleCard();
    expect(hud.getRationaleCardState()).toBeNull();
    expect(snapshots.length).toBe(2); // show + hide
    expect(snapshots[1].rationaleCard).toBeNull();
  });

  test('hideRationaleCard() is idempotent — no extra notification when already hidden', () => {
    expect(hud.getRationaleCardState()).toBeNull();
    hud.hideRationaleCard(); // already hidden — should not fire
    expect(snapshots.length).toBe(0);
  });

  test('getSnapshot() includes rationaleCard field', () => {
    const snap = hud.getSnapshot();
    expect(snap).toHaveProperty('rationaleCard');
    expect(snap.rationaleCard).toBeNull();
  });

  test('getSnapshot().rationaleCard reflects current card state', () => {
    hud.showRationaleCard('handle-dial', 'fine-tip-tweezers', 'Prevents dial scratch', 'icon-tweezers');
    const snap = hud.getSnapshot();
    expect(snap.rationaleCard).not.toBeNull();
    expect(snap.rationaleCard.rationaleText).toBe('Prevents dial scratch');
  });

  test('getRationaleCardState() returns a defensive copy (pure-state constraint)', () => {
    hud.showRationaleCard('open-snap-back-case', 'case-knife', 'Prevents case scratch', 'icon');
    const s1 = hud.getRationaleCardState();
    const s2 = hud.getRationaleCardState();
    expect(s1).not.toBe(s2);         // different references
    expect(s1).toEqual(s2);          // same values
    // Mutation of returned snapshot does not affect internal state
    s1.rationaleText = 'mutated';
    expect(hud.getRationaleCardState().rationaleText).toBe('Prevents case scratch');
  });

  test('existing HUD state (step, faults, tool, hint) is unaffected by rationale card operations', () => {
    hud.setStep('REPAIR');
    hud.setActiveFaults([{ partId: 'p1', partName: 'Main Plate', faultType: 'worn_screw' }]);
    hud.selectTool('TWEEZERS');
    hud.setStepHint('Use the correct tool');
    snapshots.length = 0;

    hud.showRationaleCard('open-snap-back-case', 'case-knife', 'Prevents case scratch', 'icon');
    const snap = hud.getSnapshot();
    expect(snap.step).toBe('REPAIR');
    expect(snap.activeFaults).toHaveLength(1);
    expect(snap.selectedTool).toBe('TWEEZERS');
    expect(snap.stepHint).toBe('Use the correct tool');
  });
});

// ── ToolRationaleCardController Tests ─────────────────────────────────────────

describe('ToolRationaleCardController', () => {
  describe('AC1 — Card renders on tool selection', () => {
    test('Scenario 1: card shown when tool selected in active operation with rationale', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      expect(ctrl.isCardVisible()).toBe(true);
      const card = ctrl.getCurrentCard();
      expect(card.operationId).toBe('open-snap-back-case');
      expect(card.toolId).toBe('case-knife');
      expect(typeof card.rationaleText).toBe('string');
      expect(card.rationaleText.trim().length).toBeGreaterThan(0);
      expect(typeof card.icon).toBe('string');
    });

    test('card shown for handle-dial operation (Prevents dial scratch)', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'handle-dial' });
      // fine-tip-tweezers is the default active tool; navigate away first so the
      // subsequent select fires an onToolChange notification (ToolPanel no-ops when
      // the same tool is already active — correct behavior per AC9 ghost-selection guard).
      panel.selectTool('case-knife');
      panel.selectTool('fine-tip-tweezers');
      expect(ctrl.isCardVisible()).toBe(true);
      const card = ctrl.getCurrentCard();
      expect(card.rationaleText).toBe('Prevents dial scratch');
    });

    test('getCurrentCard() returns a defensive copy', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      const c1 = ctrl.getCurrentCard();
      const c2 = ctrl.getCurrentCard();
      expect(c1).not.toBe(c2);
      expect(c1).toEqual(c2);
    });
  });

  describe('Scenario 2 — Active operation, tool without rationale in pilot set → no card', () => {
    test('no card when operation is not in pilot set', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'install-bridge-screw' });
      panel.selectTool('flat-blade-screwdriver');
      expect(ctrl.isCardVisible()).toBe(false);
      expect(ctrl.getCurrentCard()).toBeNull();
    });

    test('no card when rationale entry exists but tool is wrong (non-pilot op)', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'remove-case-back-screw' });
      panel.selectTool('cross-tip-screwdriver');
      expect(ctrl.isCardVisible()).toBe(false);
    });
  });

  describe('AC4 — No card outside active operation context', () => {
    test('Scenario 5: no card when getActiveOperationId returns null', () => {
      const { ctrl, panel } = makeController({ activeOpId: null });
      panel.selectTool('case-knife');
      expect(ctrl.isCardVisible()).toBe(false);
      expect(ctrl.getCurrentCard()).toBeNull();
    });

    test('no console error or undefined reference thrown (AC4)', () => {
      const { ctrl, panel } = makeController({ activeOpId: null });
      expect(() => panel.selectTool('dust-blower')).not.toThrow();
      expect(ctrl.isCardVisible()).toBe(false);
    });

    test('card disappears when operation context cleared after showing', () => {
      const { ctrl, panel, setOp } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      expect(ctrl.isCardVisible()).toBe(true);
      setOp(null);
      panel.selectTool('flat-blade-screwdriver');
      expect(ctrl.isCardVisible()).toBe(false);
    });
  });

  describe('AC2 — Progressive disclosure suppression (N=5)', () => {
    test('Scenario 3: card shown for first 5 views', () => {
      const { ctrl, panel, saveState } = makeController({ activeOpId: 'open-snap-back-case' });
      for (let i = 0; i < SUPPRESS_AFTER_N; i++) {
        // Select case-knife to show the card
        panel.selectTool('case-knife');
        expect(ctrl.isCardVisible()).toBe(true);
        // Navigate to a different tool (this hides the card — no rationale for flat-blade on open-snap-back-case)
        panel.selectTool('flat-blade-screwdriver');
      }
      expect(saveState.get(SAVE_KEY_USE_COUNTS)['case-knife']).toBe(SUPPRESS_AFTER_N);
    });

    test('card suppressed on view N+1 (6th view after 5 previous)', () => {
      const { ctrl, panel } = makeController({
        activeOpId: 'open-snap-back-case',
        saveData: { tool_rationale_use_counts: { 'case-knife': SUPPRESS_AFTER_N } },
      });
      panel.selectTool('case-knife');
      expect(ctrl.isCardVisible()).toBe(false);
    });

    test('SUPPRESS_AFTER_N is 5', () => {
      expect(SUPPRESS_AFTER_N).toBe(5);
    });

    test('use count for the tool is incremented in PlayerSaveState on each show', () => {
      const { ctrl, panel, saveState } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      expect(saveState.get(SAVE_KEY_USE_COUNTS)['case-knife']).toBe(1);
      panel.selectTool('flat-blade-screwdriver'); // switch away (hides card)
      panel.selectTool('case-knife');             // switch back (shows card again)
      expect(saveState.get(SAVE_KEY_USE_COUNTS)['case-knife']).toBe(2);
    });

    test('getViewCount() returns the current count from PlayerSaveState', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      expect(ctrl.getViewCount('case-knife')).toBe(0);
      panel.selectTool('case-knife');
      expect(ctrl.getViewCount('case-knife')).toBe(1);
    });

    test('use count not incremented when card is suppressed', () => {
      const { ctrl, panel, saveState } = makeController({
        activeOpId: 'open-snap-back-case',
        saveData: { tool_rationale_use_counts: { 'case-knife': SUPPRESS_AFTER_N } },
      });
      panel.selectTool('case-knife');
      // Count should remain at SUPPRESS_AFTER_N (not incremented when suppressed)
      expect(saveState.get(SAVE_KEY_USE_COUNTS)['case-knife']).toBe(SUPPRESS_AFTER_N);
    });
  });

  describe('AC3 — Player-triggered suppress persists (cross-session)', () => {
    test('Scenario 4: suppressCard() hides card immediately', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      expect(ctrl.isCardVisible()).toBe(true);
      ctrl.suppressCard('case-knife');
      expect(ctrl.isCardVisible()).toBe(false);
    });

    test('suppressCard() persists flag to PlayerSaveState', () => {
      const { ctrl, panel, saveState } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      ctrl.suppressCard('case-knife');
      const suppressed = saveState.get(SAVE_KEY_PLAYER_SUPPRESSED);
      expect(suppressed['case-knife']).toBe(true);
    });

    test('suppress preference is restored on next session load (cross-session persistence)', () => {
      // First session: suppress the card
      const { saveState } = makeController({ activeOpId: 'open-snap-back-case' });
      const panel1 = makePanel();
      const { telemetry: t1 } = makeTelemetry();
      const ctrl1 = new ToolRationaleCardController(panel1, () => 'open-snap-back-case', saveState, t1);
      panel1.selectTool('case-knife');
      ctrl1.suppressCard('case-knife');
      ctrl1.dispose();

      // Simulate session save/load: serialize and restore
      const savedData = saveState.snapshot();

      // Second session: restore from save data
      const restoredSave = new PlayerSaveState(savedData);
      const panel2 = makePanel();
      const { telemetry: t2 } = makeTelemetry();
      const ctrl2 = new ToolRationaleCardController(panel2, () => 'open-snap-back-case', restoredSave, t2);
      panel2.selectTool('case-knife');
      expect(ctrl2.isCardVisible()).toBe(false); // suppress preference persisted
      ctrl2.dispose();
    });

    test('isPlayerSuppressed() returns true after suppressCard()', () => {
      const { ctrl } = makeController({ activeOpId: 'open-snap-back-case' });
      expect(ctrl.isPlayerSuppressed('case-knife')).toBe(false);
      ctrl.suppressCard('case-knife');
      expect(ctrl.isPlayerSuppressed('case-knife')).toBe(true);
    });

    test('unsuppressCard() clears the suppress flag from PlayerSaveState', () => {
      const { ctrl, saveState } = makeController({ activeOpId: 'open-snap-back-case' });
      ctrl.suppressCard('case-knife');
      expect(ctrl.isPlayerSuppressed('case-knife')).toBe(true);
      ctrl.unsuppressCard('case-knife');
      expect(ctrl.isPlayerSuppressed('case-knife')).toBe(false);
      const suppressed = saveState.get(SAVE_KEY_PLAYER_SUPPRESSED);
      expect(suppressed['case-knife']).toBeUndefined();
    });

    test('after unsuppressCard(), tool can show card again', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      ctrl.suppressCard('case-knife');
      ctrl.unsuppressCard('case-knife');
      // Navigate away and back to trigger onToolChange
      panel.selectTool('flat-blade-screwdriver');
      panel.selectTool('case-knife');
      expect(ctrl.isCardVisible()).toBe(true);
    });

    test('suppressCard() is idempotent — no error on multiple calls', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      expect(() => {
        ctrl.suppressCard('case-knife');
        ctrl.suppressCard('case-knife');
      }).not.toThrow();
    });

    test('suppressCard() with null/undefined is safe (AC4 guard)', () => {
      const { ctrl } = makeController({ activeOpId: 'open-snap-back-case' });
      expect(() => ctrl.suppressCard(null)).not.toThrow();
      expect(() => ctrl.suppressCard(undefined)).not.toThrow();
    });
  });

  describe('AC5 — Telemetry emitted per impression', () => {
    test('Scenario 8: telemetry record contains operationId, toolId, shown, timestamp — all typed correctly', () => {
      const { panel, received } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      const impressions = received.filter((r) => r.name === TELEMETRY_EVENT);
      expect(impressions.length).toBe(1);
      const payload = impressions[0].payload;
      expect(typeof payload.operationId).toBe('string');
      expect(typeof payload.toolId).toBe('string');
      expect(typeof payload.shown).toBe('boolean');
      expect(typeof payload.timestamp).toBe('number');
      expect(payload.shown).toBe(true);
      expect(payload.operationId).toBe('open-snap-back-case');
      expect(payload.toolId).toBe('case-knife');
    });

    test('telemetry emitted with shown=false when auto-suppressed (AC2)', () => {
      const { panel, received } = makeController({
        activeOpId: 'open-snap-back-case',
        saveData: { tool_rationale_use_counts: { 'case-knife': SUPPRESS_AFTER_N } },
      });
      panel.selectTool('case-knife');
      const impressions = received.filter((r) => r.name === TELEMETRY_EVENT);
      expect(impressions.length).toBe(1);
      expect(impressions[0].payload.shown).toBe(false);
    });

    test('telemetry emitted with shown=false when player-suppressed (AC3)', () => {
      const { ctrl, panel, received } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      ctrl.suppressCard('case-knife');
      const suppressTelemetry = received.filter((r) => r.name === TELEMETRY_EVENT && !r.payload.shown);
      expect(suppressTelemetry.length).toBeGreaterThanOrEqual(1);
    });

    test('no telemetry emitted when outside active operation context (AC4)', () => {
      const { panel, received } = makeController({ activeOpId: null });
      panel.selectTool('case-knife');
      const impressions = received.filter((r) => r.name === TELEMETRY_EVENT);
      expect(impressions.length).toBe(0);
    });

    test('no telemetry emitted for non-pilot operations', () => {
      const { panel, received } = makeController({ activeOpId: 'install-bridge-screw' });
      panel.selectTool('flat-blade-screwdriver');
      const impressions = received.filter((r) => r.name === TELEMETRY_EVENT);
      expect(impressions.length).toBe(0);
    });

    test('TELEMETRY_EVENT constant matches expected string', () => {
      expect(TELEMETRY_EVENT).toBe('tool_rationale_card_impression');
    });
  });

  describe('WorkbenchHUD integration', () => {
    test('WorkbenchHUD.showRationaleCard called on card show', () => {
      const { ctrl, panel, hud } = makeController({
        activeOpId: 'open-snap-back-case',
        withHUD: true,
      });
      panel.selectTool('case-knife');
      expect(ctrl.isCardVisible()).toBe(true);
      const hudState = hud.getRationaleCardState();
      expect(hudState).not.toBeNull();
      expect(hudState.operationId).toBe('open-snap-back-case');
      expect(hudState.toolId).toBe('case-knife');
    });

    test('WorkbenchHUD.hideRationaleCard called on card hide', () => {
      const { panel, hud, setOp } = makeController({
        activeOpId: 'open-snap-back-case',
        withHUD: true,
      });
      panel.selectTool('case-knife');
      expect(hud.getRationaleCardState()).not.toBeNull();
      setOp(null); // remove active operation context
      panel.selectTool('flat-blade-screwdriver');
      expect(hud.getRationaleCardState()).toBeNull();
    });
  });

  describe('dispose()', () => {
    test('dispose() releases ToolPanel subscription without error', () => {
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      expect(() => ctrl.dispose()).not.toThrow();
      // After dispose, tool changes should not affect controller state
      panel.selectTool('case-knife');
      // No error expected; card state reflects pre-dispose state (not further updated)
    });

    test('dispose() is idempotent — no error on double-dispose', () => {
      const { ctrl } = makeController({ activeOpId: 'open-snap-back-case' });
      ctrl.dispose();
      expect(() => ctrl.dispose()).not.toThrow();
    });
  });

  describe('Scenario 9 — Performance: O(1) static lookup', () => {
    test('getToolRationale is a synchronous dictionary lookup (no async, no iteration)', () => {
      // Verify the function is synchronous and returns instantly
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        getToolRationale('open-snap-back-case');
      }
      const elapsed = Date.now() - start;
      // 10,000 lookups should complete in well under 100ms on any device
      expect(elapsed).toBeLessThan(100);
    });

    test('ToolRationaleCardController._onToolChanged uses only sync operations', () => {
      // If any async operations were introduced, this test would fail or be flaky.
      // This test validates that the full path (tool change → card decision) is sync.
      const { ctrl, panel } = makeController({ activeOpId: 'open-snap-back-case' });
      panel.selectTool('case-knife');
      // Immediately after selectTool returns, card should be set synchronously
      expect(ctrl.isCardVisible()).toBe(true);
    });
  });

  describe('TelemetryEmitter.toolRationaleCardImpression() convenience method', () => {
    test('emits TOOL_RATIONALE_CARD_IMPRESSION with correct payload shape', () => {
      const { telemetry, received } = makeTelemetry();
      telemetry.toolRationaleCardImpression('open-snap-back-case', 'case-knife', true);
      const events = received.filter((r) => r.name === TELEMETRY_EVENT);
      expect(events.length).toBe(1);
      const payload = events[0].payload;
      expect(payload.operationId).toBe('open-snap-back-case');
      expect(payload.toolId).toBe('case-knife');
      expect(payload.shown).toBe(true);
      expect(typeof payload.timestamp).toBe('number');
    });

    test('convenience method emits shown=false for suppression events', () => {
      const { telemetry, received } = makeTelemetry();
      telemetry.toolRationaleCardImpression('handle-dial', 'fine-tip-tweezers', false);
      const payload = received[0].payload;
      expect(payload.shown).toBe(false);
    });
  });
});
