/**
 * Tests: BenchSlot — Issue #116 Two-Bench Workshop Probe
 *
 * Covers AC3: each slot's part-sourcing timer, repair steps, and delivery
 * confirmation operate independently without interference.
 *
 * Test Scenarios covered:
 *   AC3 / Scenario 4: Part-sourcing wait on Slot 1 — slot 2 begins independently; slot 1 timer unaffected
 *   AC3 / Scenario 5: Both slots in sourcing wait — both timers continue independently
 *   AC3 / Scenario 6: Simultaneous delivery — Slot 1 resets; Slot 2 continues undisturbed
 *
 * Run with: npm test
 */

'use strict';

const { BenchSlot, SlotState } = require('../../src/workshop/BenchSlot');

describe('BenchSlot — Issue #116 independent per-slot state machine', () => {

  // ── Construction ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initialises in EMPTY state', () => {
      const slot = new BenchSlot(0);
      expect(slot.state).toBe(SlotState.EMPTY);
      expect(slot.isEmpty).toBe(true);
      expect(slot.jobId).toBeNull();
      expect(slot.watchId).toBeNull();
    });

    it('tracks slotIndex', () => {
      expect(new BenchSlot(0).slotIndex).toBe(0);
      expect(new BenchSlot(1).slotIndex).toBe(1);
    });

    it('throws on invalid slotIndex', () => {
      expect(() => new BenchSlot(-1)).toThrow();
      expect(() => new BenchSlot('a')).toThrow();
    });
  });

  // ── acceptJob ─────────────────────────────────────────────────────────────

  describe('acceptJob()', () => {
    it('transitions EMPTY → ACTIVE and records job details', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1', 'step-2']);
      expect(slot.state).toBe(SlotState.ACTIVE);
      expect(slot.isActive).toBe(true);
      expect(slot.jobId).toBe('job-1');
      expect(slot.watchId).toBe('watch-A');
      expect(slot.repairSteps).toEqual(['step-1', 'step-2']);
    });

    it('throws when slot is not EMPTY', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', []);
      expect(() => slot.acceptJob('job-2', 'watch-B', [])).toThrow(/cannot accept job/);
    });

    it('throws when jobId or watchId is missing', () => {
      const slot = new BenchSlot(0);
      expect(() => slot.acceptJob('', 'watch-A', [])).toThrow();
      expect(() => slot.acceptJob('job-1', '', [])).toThrow();
    });

    it('repairSteps defaults to empty array when not provided', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A');
      expect(slot.repairSteps).toEqual([]);
    });

    it('repairSteps are a defensive copy (mutations do not affect internal state)', () => {
      const steps = ['step-1', 'step-2'];
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', steps);
      steps.push('step-3');
      expect(slot.repairSteps).toEqual(['step-1', 'step-2']);
    });
  });

  // ── startSourcing / tickSourcing ──────────────────────────────────────────

  describe('startSourcing() / tickSourcing() — AC3 independent timers', () => {
    it('transitions ACTIVE → SOURCING with the correct timer', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', []);
      slot.startSourcing(3);
      expect(slot.state).toBe(SlotState.SOURCING);
      expect(slot.isSourcing).toBe(true);
      expect(slot.sourcingTimer).toBe(3);
    });

    it('throws when slot is not ACTIVE', () => {
      const slot = new BenchSlot(0);
      expect(() => slot.startSourcing(2)).toThrow(/cannot start sourcing/);
    });

    it('throws on invalid sessionCount (0 or non-integer)', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', []);
      expect(() => slot.startSourcing(0)).toThrow();
      expect(() => slot.startSourcing(-1)).toThrow();
      expect(() => slot.startSourcing(1.5)).toThrow();
    });

    it('tickSourcing() decrements timer each session', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', []);
      slot.startSourcing(2);
      const arrived1 = slot.tickSourcing();
      expect(arrived1).toBe(false);
      expect(slot.sourcingTimer).toBe(1);
      expect(slot.isSourcing).toBe(true);
    });

    it('tickSourcing() returns true and transitions to ACTIVE when timer reaches 0', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', []);
      slot.startSourcing(1);
      const arrived = slot.tickSourcing();
      expect(arrived).toBe(true);
      expect(slot.sourcingTimer).toBe(0);
      expect(slot.isActive).toBe(true);
    });

    it('AC3 — two independent slots tick independently without interference (Scenario 4)', () => {
      const slot0 = new BenchSlot(0);
      const slot1 = new BenchSlot(1);

      slot0.acceptJob('job-A', 'watch-A', []);
      slot0.startSourcing(3);  // slot 0: 3 sessions

      slot1.acceptJob('job-B', 'watch-B', []);
      slot1.startSourcing(1);  // slot 1: 1 session

      // Tick both
      const slot0arrived = slot0.tickSourcing();
      const slot1arrived = slot1.tickSourcing();

      // Slot 0 still waiting (3→2)
      expect(slot0arrived).toBe(false);
      expect(slot0.sourcingTimer).toBe(2);
      expect(slot0.isSourcing).toBe(true);

      // Slot 1 parts arrived
      expect(slot1arrived).toBe(true);
      expect(slot1.sourcingTimer).toBe(0);
      expect(slot1.isActive).toBe(true);
    });

    it('AC3 — both slots in sourcing wait continue independently (Scenario 5)', () => {
      const slot0 = new BenchSlot(0);
      const slot1 = new BenchSlot(1);

      slot0.acceptJob('job-A', 'watch-A', []);
      slot0.startSourcing(2);
      slot1.acceptJob('job-B', 'watch-B', []);
      slot1.startSourcing(2);

      slot0.tickSourcing();
      slot1.tickSourcing();

      // Both still sourcing after 1 tick
      expect(slot0.isSourcing).toBe(true);
      expect(slot1.isSourcing).toBe(true);
      expect(slot0.sourcingTimer).toBe(1);
      expect(slot1.sourcingTimer).toBe(1);

      slot0.tickSourcing();
      slot1.tickSourcing();

      // Both arrived after 2 ticks
      expect(slot0.isActive).toBe(true);
      expect(slot1.isActive).toBe(true);
    });

    it('throws when tickSourcing() called on non-SOURCING slot', () => {
      const slot = new BenchSlot(0);
      expect(() => slot.tickSourcing()).toThrow(/cannot tick sourcing/);
    });
  });

  // ── completeRepairStep ────────────────────────────────────────────────────

  describe('completeRepairStep() — AC3 independent repair sequences', () => {
    it('removes the step and returns false when more steps remain', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1', 'step-2', 'step-3']);
      const allDone = slot.completeRepairStep('step-1');
      expect(allDone).toBe(false);
      expect(slot.repairSteps).toEqual(['step-2', 'step-3']);
      expect(slot.isActive).toBe(true);
    });

    it('transitions to AWAITING_DELIVERY when last step is completed', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['only-step']);
      const allDone = slot.completeRepairStep('only-step');
      expect(allDone).toBe(true);
      expect(slot.isAwaitingDelivery).toBe(true);
      expect(slot.repairSteps).toEqual([]);
    });

    it('throws when step is not in the list', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1']);
      expect(() => slot.completeRepairStep('unknown-step')).toThrow(/unknown repair step/);
    });

    it('throws when slot is not ACTIVE', () => {
      const slot = new BenchSlot(0);
      expect(() => slot.completeRepairStep('step-1')).toThrow(/cannot complete step/);
    });

    it('AC3 — completing steps on slot 1 does not affect slot 0 repair state (Scenario 6)', () => {
      const slot0 = new BenchSlot(0);
      const slot1 = new BenchSlot(1);
      slot0.acceptJob('job-A', 'watch-A', ['step-A1', 'step-A2']);
      slot1.acceptJob('job-B', 'watch-B', ['step-B1']);

      slot1.completeRepairStep('step-B1');  // slot 1 completes

      expect(slot1.isAwaitingDelivery).toBe(true);
      // Slot 0 is untouched
      expect(slot0.isActive).toBe(true);
      expect(slot0.repairSteps).toEqual(['step-A1', 'step-A2']);
    });
  });

  // ── confirmDelivery ───────────────────────────────────────────────────────

  describe('confirmDelivery() — AC3 independent delivery per slot', () => {
    it('resets slot to EMPTY after delivery confirmation', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1']);
      slot.completeRepairStep('step-1');
      expect(slot.isAwaitingDelivery).toBe(true);

      slot.confirmDelivery();

      expect(slot.isEmpty).toBe(true);
      expect(slot.jobId).toBeNull();
      expect(slot.watchId).toBeNull();
      expect(slot.repairSteps).toEqual([]);
    });

    it('throws when slot is not AWAITING_DELIVERY', () => {
      const slot = new BenchSlot(0);
      expect(() => slot.confirmDelivery()).toThrow(/cannot confirm delivery/);
    });

    it('AC3 — confirming delivery on slot 0 does not disturb slot 1 (Scenario 6)', () => {
      const slot0 = new BenchSlot(0);
      const slot1 = new BenchSlot(1);

      slot0.acceptJob('job-A', 'watch-A', ['step-A1']);
      slot0.completeRepairStep('step-A1');
      slot1.acceptJob('job-B', 'watch-B', ['step-B1', 'step-B2']);

      slot0.confirmDelivery();  // Slot 0 delivers

      // Slot 1 is untouched and in progress
      expect(slot0.isEmpty).toBe(true);
      expect(slot1.isActive).toBe(true);
      expect(slot1.repairSteps).toEqual(['step-B1', 'step-B2']);
    });

    it('slot can accept a new job after delivery', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1']);
      slot.completeRepairStep('step-1');
      slot.confirmDelivery();

      slot.acceptJob('job-2', 'watch-B', ['step-2']);
      expect(slot.isActive).toBe(true);
      expect(slot.jobId).toBe('job-2');
    });
  });

  // ── snapshot / fromSnapshot ───────────────────────────────────────────────

  describe('snapshot() / fromSnapshot() — save/load round-trip', () => {
    it('snapshot captures all slot state fields', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1', 'step-2']);
      slot.startSourcing(2);
      const snap = slot.snapshot();

      expect(snap.slotIndex).toBe(0);
      expect(snap.state).toBe(SlotState.SOURCING);
      expect(snap.jobId).toBe('job-1');
      expect(snap.watchId).toBe('watch-A');
      expect(snap.repairSteps).toEqual(['step-1', 'step-2']);
      expect(snap.sourcingTimer).toBe(2);
    });

    it('fromSnapshot restores slot state accurately', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1']);
      const snap = slot.snapshot();

      const restored = BenchSlot.fromSnapshot(snap);

      expect(restored.slotIndex).toBe(0);
      expect(restored.state).toBe(SlotState.ACTIVE);
      expect(restored.jobId).toBe('job-1');
      expect(restored.watchId).toBe('watch-A');
      expect(restored.repairSteps).toEqual(['step-1']);
    });

    it('fromSnapshot with empty/minimal snapshot creates EMPTY slot', () => {
      const restored = BenchSlot.fromSnapshot({ slotIndex: 1 });
      expect(restored.slotIndex).toBe(1);
      expect(restored.isEmpty).toBe(true);
      expect(restored.repairSteps).toEqual([]);
    });

    it('snapshot is a copy — external mutations do not affect slot', () => {
      const slot = new BenchSlot(0);
      slot.acceptJob('job-1', 'watch-A', ['step-1']);
      const snap = slot.snapshot();
      snap.jobId = 'tampered';
      expect(slot.jobId).toBe('job-1');
    });
  });

});
