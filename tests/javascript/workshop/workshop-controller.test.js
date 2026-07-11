/**
 * Tests: WorkshopController — Issue #116 Two-Bench Workshop Probe
 *
 * Acceptance Criteria covered:
 *   AC1 — Second slot visible/available only for probe cohort with ≥2 restorations.
 *   AC2 — First slot unaffected when second slot is ignored.
 *   AC3 — Each slot's sourcing timer, repair steps, and delivery operate independently.
 *   AC4 — Session-frequency telemetry data recorded per cohort arm at session start.
 *
 * Test Scenarios covered:
 *   Scenario 1: Happy path — second slot used (probe player, 3 restorations)
 *   Scenario 2: Single-job player unaffected (1 restoration, control cohort)
 *   Scenario 3: Player ignores second slot (4 restorations, probe, no slot 2 activation)
 *   Scenario 4: Part-sourcing wait on Slot 1; player uses Slot 2 independently
 *   Scenario 5: Both slots in sourcing wait — both timers continue
 *   Scenario 6: Simultaneous delivery — Slot 1 resets; Slot 2 continues undisturbed
 *   Scenario 7: Cohort assignment stability (read separately; WorkshopController uses resolve())
 *   Scenario 9: Edge — intake list empty; graceful empty slot state shown; no crash
 *   Scenario 10: A/B data collection — telemetry events emitted at session start
 *
 * Run with: npm test
 */

'use strict';

const { WorkshopController, MAX_SLOTS, DEFAULT_UNLOCK_THRESHOLD } = require('../../../javascript/workshop/WorkshopController');
const { CohortAssignment, CohortArm } = require('../../../javascript/workshop/CohortAssignment');
const { SlotState } = require('../../../javascript/workshop/BenchSlot');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a minimal PlayerSaveState mock with a simple key/value store.
 * @param {Object} [initial]
 */
function makeSaveState(initial = {}) {
  const store = Object.assign({
    ab_second_bench_cohort: null,
    restorations_completed: 0,
    bench_slots: null,
  }, initial);
  return {
    get: (key) => store[key] !== undefined ? store[key] : null,
    set: (key, value) => { store[key] = value; },
    _store: store,
  };
}

/**
 * Create a TelemetryEmitter mock that records calls.
 */
function makeTelemetry() {
  const events = [];
  return {
    emit: (name, payload) => events.push({ name, payload }),
    _events: events,
    wasEmitted: (name) => events.some(e => e.name === name),
    getEvent: (name) => events.find(e => e.name === name),
    getAllEvents: (name) => events.filter(e => e.name === name),
  };
}

/**
 * Create a CohortAssignment that always returns the given arm.
 * @param {'probe'|'control'} arm
 */
function makeCohortAssignment(arm) {
  return new CohortAssignment(
    { probeRatio: arm === CohortArm.PROBE ? 1.0 : 0.0 },
    arm === CohortArm.PROBE ? () => 0.0 : () => 1.0
  );
}

/**
 * Create a WorkshopController for a probe player with the given restoration count.
 */
function makeProbeController(restorationCount = 2, savedArm = null) {
  const save = makeSaveState({
    ab_second_bench_cohort: savedArm,
    restorations_completed: restorationCount,
  });
  const telemetry = makeTelemetry();
  const cohort = makeCohortAssignment(CohortArm.PROBE);
  return { controller: new WorkshopController(save, telemetry, cohort), save, telemetry };
}

/**
 * Create a WorkshopController for a control player.
 */
function makeControlController(restorationCount = 0) {
  const save = makeSaveState({
    ab_second_bench_cohort: null,
    restorations_completed: restorationCount,
  });
  const telemetry = makeTelemetry();
  const cohort = makeCohortAssignment(CohortArm.CONTROL);
  return { controller: new WorkshopController(save, telemetry, cohort), save, telemetry };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkshopController — Issue #116 two-bench workshop probe', () => {

  // ── Constructor guards ─────────────────────────────────────────────────────

  describe('constructor validation', () => {
    it('throws when saveState has no get/set', () => {
      const telemetry = makeTelemetry();
      expect(() => new WorkshopController(null, telemetry)).toThrow(/saveState/);
      expect(() => new WorkshopController({}, telemetry)).toThrow(/saveState/);
    });

    it('throws when telemetryEmitter has no emit()', () => {
      const save = makeSaveState();
      expect(() => new WorkshopController(save, null)).toThrow(/telemetryEmitter/);
      expect(() => new WorkshopController(save, {})).toThrow(/telemetryEmitter/);
    });
  });

  // ── AC1 — Unlock gate ──────────────────────────────────────────────────────

  describe('AC1 — unlock gate: second slot visibility', () => {
    it('AC1: probe player with ≥2 restorations has second slot unlocked', () => {
      const { controller } = makeProbeController(2);
      expect(controller.isSecondSlotUnlocked()).toBe(true);
      expect(controller.visibleSlotCount).toBe(2);
    });

    it('AC1: probe player with exactly 0 restorations cannot see second slot', () => {
      const { controller } = makeProbeController(0);
      expect(controller.isSecondSlotUnlocked()).toBe(false);
      expect(controller.visibleSlotCount).toBe(1);
    });

    it('AC1: probe player with 1 restoration cannot see second slot (below threshold)', () => {
      const { controller } = makeProbeController(1);
      expect(controller.isSecondSlotUnlocked()).toBe(false);
    });

    it('AC1: probe player with 3 restorations can see second slot (Scenario 1)', () => {
      const { controller } = makeProbeController(3);
      expect(controller.isSecondSlotUnlocked()).toBe(true);
      expect(controller.visibleSlotCount).toBe(2);
    });

    it('AC1: control player with 10 restorations cannot see second slot', () => {
      const { controller } = makeControlController(10);
      expect(controller.isSecondSlotUnlocked()).toBe(false);
      expect(controller.visibleSlotCount).toBe(1);
    });

    it('AC1: Scenario 2 — player with 1 completion; second slot not visible', () => {
      const { controller } = makeControlController(1);
      expect(controller.isSecondSlotUnlocked()).toBe(false);
      expect(() => controller.getSlot(1)).toThrow(/not unlocked/);
    });

    it('AC1: unlock threshold is configurable', () => {
      const save = makeSaveState({ restorations_completed: 3 });
      const telemetry = makeTelemetry();
      const cohort = makeCohortAssignment(CohortArm.PROBE);
      const ctrl = new WorkshopController(save, telemetry, cohort, { unlockGateThreshold: 5 });
      expect(ctrl.isSecondSlotUnlocked()).toBe(false);  // 3 < 5
    });
  });

  // ── AC2 — First slot unaffected ────────────────────────────────────────────

  describe('AC2 — first slot unaffected when second slot ignored (Scenario 3)', () => {
    it('AC2: first slot operates normally for control cohort player', () => {
      const { controller } = makeControlController(0);
      controller.acceptJob(0, 'job-A', 'watch-A', ['step-1', 'step-2']);
      expect(controller.getSlot(0).isActive).toBe(true);
      expect(controller.getSlot(0).jobId).toBe('job-A');
    });

    it('AC2: probe player with second slot available but unused — slot 0 unaffected', () => {
      const { controller } = makeProbeController(4);
      expect(controller.isSecondSlotUnlocked()).toBe(true);

      // Only use slot 0
      controller.acceptJob(0, 'job-A', 'watch-A', ['step-1']);
      controller.completeRepairStep(0, 'step-1');
      controller.confirmDelivery(0);

      // Slot 0 completes normally; slot 1 remains empty
      expect(controller.getSlot(0).isEmpty).toBe(true);
      expect(controller.getSlot(1).isEmpty).toBe(true);
    });

    it('AC2: getVisibleSlots() always includes slot 0', () => {
      const { controller } = makeControlController(0);
      const visible = controller.getVisibleSlots();
      expect(visible.length).toBe(1);
      expect(visible[0].slotIndex).toBe(0);
    });

    it('AC2: getVisibleSlots() includes both slots for probe player with ≥2 restorations', () => {
      const { controller } = makeProbeController(2);
      const visible = controller.getVisibleSlots();
      expect(visible.length).toBe(2);
    });
  });

  // ── AC3 — Independent slot operations ─────────────────────────────────────

  describe('AC3 — independent slot operations (Scenarios 4, 5, 6)', () => {
    it('AC3 / Scenario 4: sourcing wait on slot 0 does not block slot 1', () => {
      const { controller } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', []);
      controller.startSourcing(0, 3);  // slot 0 in sourcing

      // Player can still accept a job to slot 1
      controller.acceptJob(1, 'job-B', 'watch-B', ['step-B1']);
      expect(controller.getSlot(0).isSourcing).toBe(true);
      expect(controller.getSlot(1).isActive).toBe(true);
    });

    it('AC3 / Scenario 4: ticking slot 0 sourcing timer does not affect slot 1', () => {
      const { controller } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', []);
      controller.startSourcing(0, 3);
      controller.acceptJob(1, 'job-B', 'watch-B', ['step-B1']);
      controller.startSourcing(1, 1);

      controller.tickSourcing(0);
      controller.tickSourcing(1);

      expect(controller.getSlot(0).sourcingTimer).toBe(2);   // 3→2
      expect(controller.getSlot(1).isActive).toBe(true);     // 1→0 arrived
    });

    it('AC3 / Scenario 5: both slots in sourcing — both timers tick independently', () => {
      const { controller } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', []);
      controller.startSourcing(0, 2);
      controller.acceptJob(1, 'job-B', 'watch-B', []);
      controller.startSourcing(1, 2);

      controller.tickSourcing(0);
      controller.tickSourcing(1);

      expect(controller.getSlot(0).sourcingTimer).toBe(1);
      expect(controller.getSlot(1).sourcingTimer).toBe(1);
    });

    it('AC3 / Scenario 6: delivery on slot 0 leaves slot 1 undisturbed', () => {
      const { controller } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', ['step-A1']);
      controller.acceptJob(1, 'job-B', 'watch-B', ['step-B1', 'step-B2']);
      controller.completeRepairStep(0, 'step-A1');

      controller.confirmDelivery(0);

      expect(controller.getSlot(0).isEmpty).toBe(true);
      expect(controller.getSlot(1).isActive).toBe(true);
      expect(controller.getSlot(1).repairSteps).toEqual(['step-B1', 'step-B2']);
    });

    it('AC3 / Scenario 6: slot 0 can accept new job after delivery while slot 1 is active', () => {
      const { controller } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', ['step-A1']);
      controller.acceptJob(1, 'job-B', 'watch-B', ['step-B1']);
      controller.completeRepairStep(0, 'step-A1');
      controller.confirmDelivery(0);

      controller.acceptJob(0, 'job-C', 'watch-C', ['step-C1']);
      expect(controller.getSlot(0).isActive).toBe(true);
      expect(controller.getSlot(0).jobId).toBe('job-C');
      expect(controller.getSlot(1).isActive).toBe(true);
      expect(controller.getSlot(1).jobId).toBe('job-B');
    });
  });

  // ── AC4 — Telemetry (session frequency data) ───────────────────────────────

  describe('AC4 — session-frequency telemetry (Scenario 10)', () => {
    it('AC4: onSessionStart emits second_bench_session_started with cohort arm and restoration count', () => {
      const { controller, telemetry } = makeProbeController(2);
      controller.onSessionStart('session-xyz');
      expect(telemetry.wasEmitted('session_frequency_probe')).toBe(true);
      const ev = telemetry.getEvent('session_frequency_probe');
      expect(ev.payload.sessionId).toBe('session-xyz');
      expect(ev.payload.cohortArm).toBe(CohortArm.PROBE);
      expect(ev.payload.restorationCount).toBe(2);
    });

    it('AC4: onSessionStart emits for control cohort too (comparison baseline)', () => {
      const { controller, telemetry } = makeControlController(0);
      controller.onSessionStart('session-abc');
      expect(telemetry.wasEmitted('session_frequency_probe')).toBe(true);
      const ev = telemetry.getEvent('session_frequency_probe');
      expect(ev.payload.cohortArm).toBe(CohortArm.CONTROL);
    });

    it('AC4: session_start event includes secondSlotVisible flag', () => {
      const { controller, telemetry } = makeProbeController(2);
      controller.onSessionStart('session-1');
      const ev = telemetry.getEvent('session_frequency_probe');
      expect(ev.payload.secondSlotVisible).toBe(true);
    });

    it('AC4: slot1_sourcing_at_session_start emitted when slot 0 is sourcing at session start', () => {
      const { controller, telemetry } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', []);
      controller.startSourcing(0, 2);

      controller.onSessionStart('session-2');

      expect(telemetry.wasEmitted('session_start_behavior_probe')).toBe(true);
      const ev = telemetry.getEvent('session_start_behavior_probe');
      expect(ev.payload.slot1Timer).toBe(2);
    });

    it('AC4: slot1_sourcing_at_session_start NOT emitted when slot 0 is not sourcing', () => {
      const { controller, telemetry } = makeProbeController(2);
      controller.onSessionStart('session-3');
      expect(telemetry.wasEmitted('session_start_behavior_probe')).toBe(false);
    });

    it('AC4: second_bench_slot_activated emitted when player accepts job to slot 1', () => {
      const { controller, telemetry } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', []);
      controller.acceptJob(1, 'job-B', 'watch-B', []);

      expect(telemetry.wasEmitted('second_bench_slot_activated')).toBe(true);
      const ev = telemetry.getEvent('second_bench_slot_activated');
      expect(ev.payload.jobId).toBe('job-B');
      expect(ev.payload.cohortArm).toBe(CohortArm.PROBE);
    });
  });

  // ── Cohort arm write-once persistence ─────────────────────────────────────

  describe('Cohort arm assignment — write-once invariant (Scenario 7)', () => {
    it('persists cohort arm to saveState on first session', () => {
      const { save } = makeProbeController(0);
      expect(save.get('ab_second_bench_cohort')).toBe(CohortArm.PROBE);
    });

    it('does not overwrite an already-stored arm on subsequent sessions', () => {
      // Simulate returning player: arm already stored as 'probe'
      const save = makeSaveState({
        ab_second_bench_cohort: CohortArm.PROBE,
        restorations_completed: 2,
      });
      const telemetry = makeTelemetry();
      // Use a CohortAssignment whose RNG would assign control — but resolve() should ignore it
      const cohort = makeCohortAssignment(CohortArm.CONTROL);
      new WorkshopController(save, telemetry, cohort);

      // Arm must remain probe (not overwritten by control RNG)
      expect(save.get('ab_second_bench_cohort')).toBe(CohortArm.PROBE);
    });

    it('emits second_bench_cohort_assigned only on first-session assignment', () => {
      // First session (arm is null → assigned)
      const { telemetry: t1 } = makeProbeController(0, null);
      expect(t1.wasEmitted('second_bench_cohort_assigned')).toBe(true);

      // Returning player (arm already stored)
      const save2 = makeSaveState({ ab_second_bench_cohort: CohortArm.PROBE, restorations_completed: 0 });
      const t2 = makeTelemetry();
      const cohort2 = makeCohortAssignment(CohortArm.PROBE);
      new WorkshopController(save2, t2, cohort2);
      expect(t2.wasEmitted('second_bench_cohort_assigned')).toBe(false);
    });
  });

  // ── recordRestorationCompleted ─────────────────────────────────────────────

  describe('recordRestorationCompleted()', () => {
    it('increments restoration_count in save state', () => {
      const { controller, save } = makeProbeController(1);
      controller.recordRestorationCompleted();
      expect(save.get('restorations_completed')).toBe(2);
    });

    it('second slot becomes visible after restoration_count reaches threshold', () => {
      const { controller } = makeProbeController(1);
      expect(controller.isSecondSlotUnlocked()).toBe(false);
      controller.recordRestorationCompleted();
      expect(controller.isSecondSlotUnlocked()).toBe(true);
    });
  });

  // ── snapshotSlots / load migration ─────────────────────────────────────────

  describe('snapshotSlots() — save/load round-trip', () => {
    it('snapshotSlots returns version 2 dual-slot snapshot', () => {
      const { controller } = makeProbeController(2);
      const snap = controller.snapshotSlots();
      expect(snap.version).toBe(2);
      expect(Array.isArray(snap.slots)).toBe(true);
      expect(snap.slots.length).toBe(2);
    });

    it('slots are restored from v2 snapshot on controller init', () => {
      const { controller, save } = makeProbeController(2);
      controller.acceptJob(0, 'job-A', 'watch-A', ['step-1']);
      save.set('bench_slots', controller.snapshotSlots());

      // New controller loaded from save
      const save2 = makeSaveState({
        ab_second_bench_cohort: CohortArm.PROBE,
        restorations_completed: 2,
        bench_slots: save.get('bench_slots'),
      });
      const t2 = makeTelemetry();
      const cohort2 = makeCohortAssignment(CohortArm.PROBE);
      const ctrl2 = new WorkshopController(save2, t2, cohort2);

      expect(ctrl2.getSlot(0).isActive).toBe(true);
      expect(ctrl2.getSlot(0).jobId).toBe('job-A');
    });

    it('legacy v1 single-slot save is migrated to dual-slot (slot 0 preserved, slot 1 empty)', () => {
      // Simulate a v1-format saved game: just the slot snapshot directly (no version wrapper)
      const legacySnap = {
        slotIndex: 0,
        state: 'active',
        jobId: 'old-job',
        watchId: 'old-watch',
        repairSteps: ['step-old'],
        sourcingTimer: 0,
        awaitingDelivery: false,
      };
      const save = makeSaveState({
        ab_second_bench_cohort: CohortArm.PROBE,
        restorations_completed: 2,
        bench_slots: legacySnap,   // v1 format
      });
      const telemetry = makeTelemetry();
      const cohort = makeCohortAssignment(CohortArm.PROBE);
      const ctrl = new WorkshopController(save, telemetry, cohort);

      // Slot 0 migrated from v1
      expect(ctrl.getSlot(0).jobId).toBe('old-job');
      expect(ctrl.getSlot(0).isActive).toBe(true);
      // Slot 1 initialised fresh
      expect(ctrl.getSlot(1).isEmpty).toBe(true);
    });
  });

  // ── Edge: Scenario 9 — empty intake list ──────────────────────────────────

  describe('Scenario 9 — graceful empty state: slot stays empty, no crash', () => {
    it('slot remains EMPTY when no job is accepted; no error thrown', () => {
      const { controller } = makeProbeController(2);
      // Player opens second slot UI but no jobs are available — they simply don't call acceptJob
      expect(controller.getSlot(1).isEmpty).toBe(true);
      // No crash, controller still functional
      expect(controller.visibleSlotCount).toBe(2);
    });

    it('getSlot(1) returns an empty BenchSlot without error for probe player', () => {
      const { controller } = makeProbeController(2);
      const slot = controller.getSlot(1);
      expect(slot).not.toBeNull();
      expect(slot.isEmpty).toBe(true);
    });
  });

  // ── getSlot bounds checking ────────────────────────────────────────────────

  describe('getSlot() bounds and permission checking', () => {
    it('throws for negative slot index', () => {
      const { controller } = makeProbeController(2);
      expect(() => controller.getSlot(-1)).toThrow(/invalid slot index/);
    });

    it('throws for slot index >= MAX_SLOTS', () => {
      const { controller } = makeProbeController(2);
      expect(() => controller.getSlot(MAX_SLOTS)).toThrow(/invalid slot index/);
    });

    it('throws for slot 1 when second slot is locked (control cohort)', () => {
      const { controller } = makeControlController(0);
      expect(() => controller.getSlot(1)).toThrow(/not unlocked/);
    });

    it('slot 0 is always accessible', () => {
      const { controller } = makeControlController(0);
      expect(() => controller.getSlot(0)).not.toThrow();
    });
  });

});

