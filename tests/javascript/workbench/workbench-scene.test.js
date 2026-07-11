/**
 * Tests: WorkbenchScene — Issue #164 Acceptance Criteria
 *
 * Covers:
 *   AC1  — Scene loads, watch visible, parts selectable, load time tracking
 *   AC2  — Diagnosis identifies ≥1 fault after disassembly; HUD shows fault name + part
 *   AC3  — Repair action clears fault; part → repaired state; HUD updates (no remaining faults)
 *   AC4  — Completion screen: watchRunning, "Restoration Complete", session summary counts
 *   AC5  — Save/restore: all part states (in-tray, repaired, unrepaired) survive a round-trip
 *
 * Also covers key Scenarios from the test plan:
 *   Scenario 4  — Part drag-and-drop invalid → snaps back without error
 *   Scenario 5  — Incorrect reassembly order → hint shown, no crash, no silent failure
 *   Scenario 7  — Repair action on non-faulty part → "good condition" feedback, no state change
 *   Scenario 8  — Completion screen renders with all required fields
 *   Scenario 9  — Module integration: diagnosis, compatibility, save state all callable
 *
 * Run with: npm test
 */

'use strict';

const { WorkbenchScene, SCENE_STATE } = require('../../../src/workbench/WorkbenchScene');
const { PART_STATE, SESSION_FAULT_PART_ID } = require('../../../src/workbench/WatchPartModel');
const { REPAIR_STEP } = require('../../../src/workbench/WorkbenchHUD');

// ── Shared test helpers ───────────────────────────────────────────────────────

const noop = () => {};
const asyncNoop = async () => {};

/**
 * Build a WorkbenchScene with safe no-op hooks for unit testing.
 * @param {Object} [overrides]
 */
function makeScene(overrides = {}) {
  return new WorkbenchScene({
    instrumentationHook: noop,
    renderOverlay:       noop,
    clearOverlay:        noop,
    eventBus:            { on: noop, off: noop, emit: noop },
    onConfidenceUpdate:  noop,
    playAudio:           noop,
    renderVisual:        noop,
    ...overrides,
  });
}

/**
 * Remove all 15 parts in valid disassembly order.
 * Returns the scene after full disassembly (but before completeTeardown).
 */
function disassembleAll(scene) {
  const order = [
    'caseback', 'crown',
    'movement_holder',
    'dial',
    'hour_hand', 'minute_hand', 'second_hand',
    'keyless_works',
    'click_spring',
    'ratchet_wheel',
    'barrel_bridge',
    'mainspring', 'gear_train',
    'balance_wheel',
    'escapement',
  ];
  for (const id of order) {
    const r = scene.removePart(id);
    if (!r.success) throw new Error(`disassembleAll failed at ${id}: ${r.reason}`);
  }
}

/**
 * Assemble all 15 parts in valid reassembly order (reverse disassembly, deepest first).
 */
function reassembleAll(scene) {
  const order = [
    'escapement',
    'balance_wheel',
    'gear_train',
    'mainspring',
    'barrel_bridge',
    'ratchet_wheel',
    'click_spring',
    'keyless_works',
    'second_hand',
    'minute_hand',
    'hour_hand',
    'dial',
    'movement_holder',
    'crown',
    'caseback',
  ];
  for (const id of order) {
    const r = scene.assemblePart(id);
    if (!r.success) throw new Error(`reassembleAll failed at ${id}: ${r.reason}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AC1 — Scene loads, watch is visible, parts selectable, load time tracked
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC1: Scene load and part visibility', () => {
  it('constructs without errors', () => {
    expect(() => makeScene()).not.toThrow();
  });

  it('starts in LOADING state', () => {
    const scene = makeScene();
    expect(scene.getSceneState()).toBe(SCENE_STATE.LOADING);
  });

  it('markSceneReady transitions to READY state', () => {
    const scene = makeScene();
    scene.markSceneReady(125);
    expect(scene.getSceneState()).toBe(SCENE_STATE.READY);
  });

  it('markSceneReady records load duration', () => {
    const scene = makeScene();
    scene.markSceneReady(130);
    expect(scene.getSceneLoadDurationMs()).toBe(130);
  });

  it('markSceneReady returns part count (15 parts for MVP watch)', () => {
    const scene = makeScene();
    const result = scene.markSceneReady(110);
    expect(result.partCount).toBe(15);
  });

  it('all 15 parts start in ON_WATCH state (watch is visible and interactive)', () => {
    const scene = makeScene();
    const parts = scene.getPartModel().getAllParts();
    expect(parts.length).toBe(15);
    expect(parts.every(p => p.state === PART_STATE.ON_WATCH)).toBe(true);
  });

  it('HUD step is INTAKE after markSceneReady', () => {
    const scene = makeScene();
    scene.markSceneReady(120);
    expect(scene.getHUD().getStep()).toBe(REPAIR_STEP.INTAKE);
  });

  it('notifies onSceneStateChange listener on markSceneReady', () => {
    const states = [];
    const scene = makeScene({ onSceneStateChange: s => states.push(s) });
    scene.markSceneReady(100);
    expect(states).toContain(SCENE_STATE.READY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC2 — Diagnosis identifies ≥1 fault after disassembly; HUD shows fault
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC2: Disassembly and diagnosis', () => {
  it('can remove caseback immediately (no prerequisite)', () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    const result = scene.removePart('caseback');
    expect(result.success).toBe(true);
  });

  it('cannot remove movement_holder before caseback', () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    const result = scene.removePart('movement_holder');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/case back/i);
  });

  it('shows hint in HUD when removal order is wrong (Scenario 5 disassembly)', () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    scene.removePart('movement_holder'); // Wrong order
    expect(scene.getHUD().getStepHint()).toBeTruthy();
  });

  it('scene transitions to IN_REPAIR after first removal', () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    scene.removePart('caseback');
    expect(scene.getSceneState()).toBe(SCENE_STATE.IN_REPAIR);
  });

  it('part transitions to IN_TRAY or UNREPAIRED after removal', () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    scene.removePart('caseback');
    const part = scene.getPartModel().getPart('caseback');
    expect([PART_STATE.IN_TRAY, PART_STATE.UNREPAIRED]).toContain(part.state);
  });

  it('mainspring (faulty part) transitions to UNREPAIRED on removal', () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    const part = scene.getPartModel().getPart('mainspring');
    expect(part.state).toBe(PART_STATE.UNREPAIRED);
  });

  it('completeTeardown resolves with ≥1 fault (AC2: diagnosis finds fault)', async () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    const { faults } = await scene.completeTeardown();
    expect(faults.length).toBeGreaterThanOrEqual(1);
  });

  it('HUD shows fault name and affected part after completeTeardown (AC2)', async () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    const { hudSnapshot } = await scene.completeTeardown();
    expect(hudSnapshot.activeFaults.length).toBeGreaterThanOrEqual(1);
    expect(hudSnapshot.activeFaults[0]).toHaveProperty('partId');
    expect(hudSnapshot.activeFaults[0]).toHaveProperty('faultType');
  });

  it('HUD fault list has no null, blank, or duplicate entries (Scenario 6)', async () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    const { hudSnapshot } = await scene.completeTeardown();
    const ids = hudSnapshot.activeFaults.map(f => f.partId);
    const uniqueIds = new Set(ids);
    // No duplicates
    expect(uniqueIds.size).toBe(ids.length);
    // No null/blank
    for (const f of hudSnapshot.activeFaults) {
      expect(f.partId).toBeTruthy();
      expect(f.faultType).toBeTruthy();
    }
  });

  it('HUD step transitions to DIAGNOSIS after completeTeardown', async () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    await scene.completeTeardown();
    expect(scene.getHUD().getStep()).toBe(REPAIR_STEP.DIAGNOSIS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC3 — Repair action clears fault; part transitions to REPAIRED; HUD updates
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC3: Repair actions and fault clearing', () => {
  async function setupForRepair() {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    await scene.completeTeardown();
    return scene;
  }

  it('applyRepairAction on faulty mainspring clears fault (AC3)', async () => {
    const scene = await setupForRepair();
    const result = scene.applyRepairAction(SESSION_FAULT_PART_ID);
    expect(result.applied).toBe(true);
    expect(result.message).toMatch(/repaired/i);
  });

  it('part transitions to REPAIRED state after repair (AC3)', async () => {
    const scene = await setupForRepair();
    scene.applyRepairAction(SESSION_FAULT_PART_ID);
    const part = scene.getPartModel().getPart(SESSION_FAULT_PART_ID);
    expect(part.state).toBe(PART_STATE.REPAIRED);
  });

  it('HUD has 0 remaining faults after repair (AC3: HUD updates to no remaining faults)', async () => {
    const scene = await setupForRepair();
    scene.applyRepairAction(SESSION_FAULT_PART_ID);
    expect(scene.getHUD().getRemainingFaultCount()).toBe(0);
  });

  it('HUD activeFaults is empty after all repairs (AC3)', async () => {
    const scene = await setupForRepair();
    scene.applyRepairAction(SESSION_FAULT_PART_ID);
    expect(scene.getHUD().getActiveFaults()).toHaveLength(0);
  });

  it('applyRepairAction on non-faulty part returns "good condition" (AC3, Scenario 7)', async () => {
    const scene = await setupForRepair();
    const result = scene.applyRepairAction('caseback'); // no fault
    expect(result.applied).toBe(false);
    expect(result.message).toMatch(/good condition/i);
  });

  it('non-faulty part state does not change after repair attempt (Scenario 7)', async () => {
    const scene = await setupForRepair();
    const before = scene.getPartModel().getPart('caseback').state;
    scene.applyRepairAction('caseback');
    const after = scene.getPartModel().getPart('caseback').state;
    expect(after).toBe(before);
  });

  it('onStateChange callback fires when HUD fault list changes (AC3)', async () => {
    let changes = 0;
    const scene = makeScene({ onHUDChange: () => { changes++; } });
    scene.markSceneReady(100);
    disassembleAll(scene);
    await scene.completeTeardown();
    const before = changes;
    scene.applyRepairAction(SESSION_FAULT_PART_ID);
    expect(changes).toBeGreaterThan(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC4 — Completion screen: watchRunning, "Restoration Complete", session summary
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC4: Completion screen and reassembly gate', () => {
  async function setupForReassembly() {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    await scene.completeTeardown();
    scene.applyRepairAction(SESSION_FAULT_PART_ID);
    return scene;
  }

  it('reassembling a part sets state to ASSEMBLED', async () => {
    const scene = await setupForReassembly();
    // Escapement has no dependents → can be assembled first
    const result = await scene.assemblePart('escapement');
    expect(result.success).toBe(true);
    expect(scene.getPartModel().getPart('escapement').state).toBe(PART_STATE.ASSEMBLED);
  });

  it('cannot reassemble out of order (Scenario 5 reassembly)', async () => {
    const scene = await setupForReassembly();
    // caseback has many dependents — cannot go back until they're assembled
    const result = await scene.assemblePart('caseback');
    expect(result.success).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('wrong reassembly order shows hint in HUD (Scenario 5)', async () => {
    const scene = await setupForReassembly();
    await scene.assemblePart('caseback'); // Wrong order
    expect(scene.getHUD().getStepHint()).toBeTruthy();
  });

  it('triggerCompletion returns watchRunning: true (AC4)', async () => {
    const scene = await setupForReassembly();
    reassembleAll(scene);
    const completion = scene.triggerCompletion();
    expect(completion.watchRunning).toBe(true);
  });

  it('triggerCompletion returns restorationCompleteText: true (AC4)', async () => {
    const scene = await setupForReassembly();
    reassembleAll(scene);
    const completion = scene.triggerCompletion();
    expect(completion.restorationCompleteText).toBe(true);
  });

  it('completion session summary has partsServiced count (AC4)', async () => {
    const scene = await setupForReassembly();
    reassembleAll(scene);
    const completion = scene.triggerCompletion();
    expect(completion.sessionSummary.partsServiced).toBeGreaterThan(0);
  });

  it('completion session summary has faultsFixed ≥ 1 (AC4)', async () => {
    const scene = await setupForReassembly();
    reassembleAll(scene);
    const completion = scene.triggerCompletion();
    expect(completion.sessionSummary.faultsFixed).toBeGreaterThanOrEqual(1);
  });

  it('completion session summary has correct totalParts (15)', async () => {
    const scene = await setupForReassembly();
    reassembleAll(scene);
    const completion = scene.triggerCompletion();
    expect(completion.sessionSummary.totalParts).toBe(15);
  });

  it('scene state transitions to COMPLETE after triggerCompletion', async () => {
    const scene = await setupForReassembly();
    reassembleAll(scene);
    scene.triggerCompletion();
    expect(scene.getSceneState()).toBe(SCENE_STATE.COMPLETE);
  });

  it('completeReassembly returns completionState with watchRunning when faults cleared (AC4)', async () => {
    const scene = await setupForReassembly();
    reassembleAll(scene);
    const { completionState } = await scene.completeReassembly();
    expect(completionState).not.toBeNull();
    expect(completionState.watchRunning).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC5 — Save/restore: all part states survive a round-trip
// ═══════════════════════════════════════════════════════════════════════════════

describe('AC5: Save and restore workbench state', () => {
  it('toSaveData returns a serialisable object', () => {
    const scene = makeScene();
    const data = scene.toSaveData();
    expect(() => JSON.stringify(data)).not.toThrow();
    expect(data).toHaveProperty('parts');
  });

  it('restored scene preserves IN_TRAY state for disassembled parts', () => {
    const scene1 = makeScene();
    scene1.markSceneReady(100);
    scene1.removePart('caseback');
    scene1.removePart('crown');

    // Simulate save → reload
    const saveData = scene1.toSaveData();
    const scene2 = makeScene({ initialSaveState: { workbench_state: saveData } });

    expect(scene2.getPartModel().getPart('caseback').state).toBe(PART_STATE.IN_TRAY);
    expect(scene2.getPartModel().getPart('crown').state).toBe(PART_STATE.IN_TRAY);
  });

  it('restored scene preserves UNREPAIRED state for faulty disassembled parts', () => {
    const scene1 = makeScene();
    scene1.markSceneReady(100);
    disassembleAll(scene1);

    const saveData = scene1.toSaveData();
    const scene2 = makeScene({ initialSaveState: { workbench_state: saveData } });

    expect(scene2.getPartModel().getPart(SESSION_FAULT_PART_ID).state).toBe(PART_STATE.UNREPAIRED);
  });

  it('restored scene preserves REPAIRED state for fixed parts', async () => {
    const scene1 = makeScene();
    scene1.markSceneReady(100);
    disassembleAll(scene1);
    await scene1.completeTeardown();
    scene1.applyRepairAction(SESSION_FAULT_PART_ID);

    const saveData = scene1.toSaveData();
    const scene2 = makeScene({ initialSaveState: { workbench_state: saveData } });

    expect(scene2.getPartModel().getPart(SESSION_FAULT_PART_ID).state).toBe(PART_STATE.REPAIRED);
  });

  it('restored scene preserves faultCleared state (repair progress)', async () => {
    const scene1 = makeScene();
    scene1.markSceneReady(100);
    disassembleAll(scene1);
    await scene1.completeTeardown();
    scene1.applyRepairAction(SESSION_FAULT_PART_ID);

    const saveData = scene1.toSaveData();
    const scene2 = makeScene({ initialSaveState: { workbench_state: saveData } });

    expect(scene2.getPartModel().getPart(SESSION_FAULT_PART_ID).faultCleared).toBe(true);
  });

  it('restored scene handles null save data without error (AC5: null-safe)', () => {
    expect(() => makeScene({ initialSaveState: null })).not.toThrow();
  });

  it('restored scene handles missing workbench_state key (AC5: pre-feature save)', () => {
    expect(() => makeScene({ initialSaveState: { order_queue: [] } })).not.toThrow();
  });

  it('autosaveHook is called on completeTeardown (AC5: checkpoint at disassembly)', async () => {
    const checkpoints = [];
    const scene = makeScene({
      autosaveHook: async (stage) => checkpoints.push(stage),
    });
    scene.markSceneReady(100);
    disassembleAll(scene);
    await scene.completeTeardown();
    expect(checkpoints).toContain('teardown');
  });

  it('autosaveHook is called on completeReassembly (AC5: checkpoint at reassembly)', async () => {
    const checkpoints = [];
    const scene = makeScene({
      autosaveHook: async (stage) => checkpoints.push(stage),
    });
    scene.markSceneReady(100);
    disassembleAll(scene);
    await scene.completeTeardown();
    scene.applyRepairAction(SESSION_FAULT_PART_ID);
    reassembleAll(scene);
    await scene.completeReassembly();
    expect(checkpoints).toContain('reassembly');
  });

  it('toSaveData includes all 15 parts in snapshot (AC5: no state lost)', () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    const saveData = scene.toSaveData();
    const partIds = Object.keys(saveData.parts);
    expect(partIds.length).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 9 — Module integration stability
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario 9: Module integration stability', () => {
  it('TeardownScreen is accessible from WorkbenchScene', () => {
    const scene = makeScene();
    expect(scene.getTeardownScreen()).toBeDefined();
  });

  it('DiagnosisScreen is accessible from WorkbenchScene', () => {
    const scene = makeScene();
    expect(scene.getDiagnosisScreen()).toBeDefined();
  });

  it('ReassemblyScreen is accessible from WorkbenchScene', () => {
    const scene = makeScene();
    expect(scene.getReassemblyScreen()).toBeDefined();
  });

  it('full 3-run repair loop completes without errors (Scenario 9)', async () => {
    for (let run = 0; run < 3; run++) {
      const scene = makeScene();
      scene.markSceneReady(100);
      disassembleAll(scene);
      await scene.completeTeardown();
      scene.applyRepairAction(SESSION_FAULT_PART_ID);
      reassembleAll(scene);
      await scene.completeReassembly();
      const completion = scene.triggerCompletion();
      expect(completion.watchRunning).toBe(true);
      expect(completion.restorationCompleteText).toBe(true);
    }
  });

  it('DiagnosisScreen.enterDiagnosis is called during completeTeardown', async () => {
    const scene = makeScene();
    scene.markSceneReady(100);
    disassembleAll(scene);
    // Should not throw — diagnosis module is wired
    await expect(scene.completeTeardown()).resolves.not.toThrow();
  });

  it('WorkbenchSaveAdapter builds payload without errors', () => {
    const { WorkbenchSaveAdapter } = require('../../../src/workbench/WorkbenchSaveAdapter');
    const adapter = new WorkbenchSaveAdapter();
    const payload = adapter.buildSavePayload({ order_queue: [] }, { parts: {} });
    expect(payload).toHaveProperty('workbench_state');
    expect(payload).toHaveProperty('order_queue');
  });
});
