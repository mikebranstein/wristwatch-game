/**
 * Tests for RepairSessionRecord.js — Issue #84.
 *
 * Acceptance Criteria covered:
 *   AC5: Given a player abandons a Phase 2 damage-state repair mid-session and
 *        returns later, when they re-open the watch, then repair state is fully
 *        persisted (no lost progress, no component reset).
 *   Backward compatibility: pre-Phase-2 saves deserialise without error (null fields).
 *   Test Scenario 3 (Shock Damage persistence): hands straightened + component
 *        positions persist mid-session.
 */

'use strict';

const { RepairSessionRecord } = require('../../../src/save/RepairSessionRecord');
const { FastenerState } = require('../../../src/disassembly/FastenerState');

// ─── Basic construction and core fields ──────────────────────────────────────

describe('RepairSessionRecord — core fields', () => {
  test('create() builds a record with watchId and damageStateId', () => {
    const record = RepairSessionRecord.create({ watchId: 'watch-001', damageStateId: 'shock_damage' });
    expect(record.getWatchId()).toBe('watch-001');
    expect(record.getDamageStateId()).toBe('shock_damage');
  });

  test('create() initialises empty repair steps', () => {
    const record = RepairSessionRecord.create();
    expect(record.getRepairSteps()).toEqual([]);
  });

  test('addRepairStep appends to the step list', () => {
    const record = RepairSessionRecord.create();
    record.addRepairStep('use_bent_hand_straightening_tool');
    record.addRepairStep('reposition_all_displaced_components');
    expect(record.getRepairSteps()).toEqual([
      'use_bent_hand_straightening_tool',
      'reposition_all_displaced_components',
    ]);
  });

  test('markComplete sets completedAt', () => {
    const record = RepairSessionRecord.create();
    expect(record.getCompletedAt()).toBeNull();
    record.markComplete(12345);
    expect(record.getCompletedAt()).toBe(12345);
  });
});

// ─── AC5: Phase 2 fields default to null (backward compatibility) ─────────────

describe('RepairSessionRecord — backward compatibility (Phase 2 fields default null)', () => {
  test('new record has null scattered_component_positions', () => {
    const record = RepairSessionRecord.create();
    expect(record.getScatteredComponentPositions()).toBeNull();
  });

  test('new record has null fastener_states', () => {
    const record = RepairSessionRecord.create();
    expect(record.getFastenerStates()).toBeNull();
  });

  test('new record has null hand_straightened', () => {
    const record = RepairSessionRecord.create();
    expect(record.getHandStraightened()).toBeNull();
  });

  test('new record has null pre_repair_scatter_snapshot', () => {
    const record = RepairSessionRecord.create();
    expect(record.getPreRepairScatterSnapshot()).toBeNull();
  });

  test('deserialize(null) returns a valid empty record (no error on null save data)', () => {
    const record = RepairSessionRecord.deserialize(null);
    expect(record.getScatteredComponentPositions()).toBeNull();
    expect(record.getFastenerStates()).toBeNull();
    expect(record.getHandStraightened()).toBeNull();
    expect(record.getPreRepairScatterSnapshot()).toBeNull();
  });

  test('deserialize({}) returns valid empty record (pre-Phase-2 save data)', () => {
    const record = RepairSessionRecord.deserialize({});
    expect(record.getScatteredComponentPositions()).toBeNull();
    expect(record.getFastenerStates()).toBeNull();
  });

  test('deserialize with only core fields — Phase 2 fields null, no error', () => {
    const record = RepairSessionRecord.deserialize({
      watchId: 'old-watch',
      damageStateId: 'water_ingress',
      repairSteps: ['apply_corrosion_cleaning_tool'],
    });
    expect(record.getWatchId()).toBe('old-watch');
    expect(record.getScatteredComponentPositions()).toBeNull(); // backward compat
    expect(record.getFastenerStates()).toBeNull();
  });
});

// ─── AC5 / Test Scenario 3: Shock Damage mid-session persistence ──────────────

describe('RepairSessionRecord — AC5/Scenario 3: Shock Damage state persists', () => {
  test('setHandStraightened and getHandStraightened round-trip', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    record.setHandStraightened({ hour_hand: true, minute_hand: false });
    const flags = record.getHandStraightened();
    expect(flags.hour_hand).toBe(true);
    expect(flags.minute_hand).toBe(false);
  });

  test('setHandStraightenedFlag updates individual hand', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    record.setHandStraightenedFlag('hour_hand', true);
    record.setHandStraightenedFlag('minute_hand', false);
    expect(record.getHandStraightened().hour_hand).toBe(true);
    expect(record.getHandStraightened().minute_hand).toBe(false);
  });

  test('areAllHandsStraightened returns true when all hands are true', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    record.setHandStraightened({ hour_hand: true, minute_hand: true });
    expect(record.areAllHandsStraightened()).toBe(true);
  });

  test('areAllHandsStraightened returns false when any hand is not straightened', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    record.setHandStraightened({ hour_hand: true, minute_hand: false });
    expect(record.areAllHandsStraightened()).toBe(false);
  });

  test('areAllHandsStraightened returns false when no flags recorded', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    expect(record.areAllHandsStraightened()).toBe(false);
  });

  test('setScatteredComponentPositions persists positions map', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    const positions = {
      balance_wheel: { x: 280, y: 155, rotation: 42, repositioned: false },
      pallet_fork:   { x: 265, y: 175, rotation: -18, repositioned: false },
    };
    record.setScatteredComponentPositions(positions);
    const retrieved = record.getScatteredComponentPositions();
    expect(retrieved.balance_wheel.x).toBe(280);
    expect(retrieved.pallet_fork.rotation).toBe(-18);
  });

  test('updateComponentPosition updates a single component', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    record.updateComponentPosition('balance_wheel', { x: 200, y: 200, rotation: 0, repositioned: true });
    const positions = record.getScatteredComponentPositions();
    expect(positions.balance_wheel.repositioned).toBe(true);
  });

  test('pre_repair_scatter_snapshot stored and retrieved', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'shock_damage' });
    const snapshot = { layoutId: 'generic-scatter-a', capturedAt: 12345 };
    record.setPreRepairScatterSnapshot(snapshot);
    const retrieved = record.getPreRepairScatterSnapshot();
    expect(retrieved.layoutId).toBe('generic-scatter-a');
    expect(retrieved.capturedAt).toBe(12345);
  });
});

// ─── Rust-Fused Fasteners fastener state persistence ─────────────────────────

describe('RepairSessionRecord — fastener state persistence (rust_fused_fasteners)', () => {
  test('setFastenerStates and getFastenerStates round-trip', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'rust_fused_fasteners' });
    const states = {
      screw_a: FastenerState.FUSED,
      screw_b: FastenerState.TREATED,
    };
    record.setFastenerStates(states);
    const retrieved = record.getFastenerStates();
    expect(retrieved.screw_a).toBe(FastenerState.FUSED);
    expect(retrieved.screw_b).toBe(FastenerState.TREATED);
  });

  test('updateFastenerState updates a single fastener', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'rust_fused_fasteners' });
    record.updateFastenerState('screw_a', FastenerState.FUSED);
    record.updateFastenerState('screw_a', FastenerState.TREATED);
    expect(record.getFastenerStates().screw_a).toBe(FastenerState.TREATED);
  });

  test('fastener map null for non-rust-fused watch (standard/Phase 1)', () => {
    const record = RepairSessionRecord.create({ damageStateId: 'water_ingress' });
    expect(record.getFastenerStates()).toBeNull();
  });
});

// ─── Serialisation / deserialisation round-trip (AC5) ────────────────────────

describe('RepairSessionRecord — serialize/deserialize round-trip (AC5)', () => {
  test('serialize includes all Phase 2 fields when non-null', () => {
    const record = RepairSessionRecord.create({ watchId: 'w1', damageStateId: 'shock_damage' });
    record.setHandStraightened({ hour_hand: true, minute_hand: false });
    record.setScatteredComponentPositions({ balance_wheel: { x: 200, y: 200, rotation: 0, repositioned: true } });
    record.setPreRepairScatterSnapshot({ layoutId: 'generic-scatter-a' });

    const data = record.serialize();
    expect(data.hand_straightened).toBeDefined();
    expect(data.scattered_component_positions).toBeDefined();
    expect(data.pre_repair_scatter_snapshot).toBeDefined();
  });

  test('serialize does NOT include Phase 2 fields when null (compact saves for Phase 1)', () => {
    const record = RepairSessionRecord.create({ watchId: 'w1', damageStateId: 'water_ingress' });
    const data = record.serialize();
    expect(data.hand_straightened).toBeUndefined();
    expect(data.scattered_component_positions).toBeUndefined();
    expect(data.fastener_states).toBeUndefined();
    expect(data.pre_repair_scatter_snapshot).toBeUndefined();
  });

  test('full round-trip: serialize → deserialize preserves all Phase 2 state', () => {
    const original = RepairSessionRecord.create({ watchId: 'w1', damageStateId: 'shock_damage' });
    original.addRepairStep('use_bent_hand_straightening_tool');
    original.setHandStraightened({ hour_hand: true, minute_hand: true });
    original.setScatteredComponentPositions({
      balance_wheel: { x: 200, y: 200, rotation: 0, repositioned: true },
    });
    original.setPreRepairScatterSnapshot({ layoutId: 'eta2824-scatter-a', capturedAt: 99999 });

    const data = original.serialize();
    const restored = RepairSessionRecord.deserialize(data);

    expect(restored.getWatchId()).toBe('w1');
    expect(restored.getDamageStateId()).toBe('shock_damage');
    expect(restored.getRepairSteps()).toEqual(['use_bent_hand_straightening_tool']);
    expect(restored.areAllHandsStraightened()).toBe(true);
    expect(restored.getScatteredComponentPositions().balance_wheel.repositioned).toBe(true);
    expect(restored.getPreRepairScatterSnapshot().layoutId).toBe('eta2824-scatter-a');
  });

  test('mid-session serialise/restore: partial progress preserved (AC5)', () => {
    // Simulate partial shock damage repair (hands straightened, not all components repositioned)
    const record = RepairSessionRecord.create({ watchId: 'w2', damageStateId: 'shock_damage' });
    record.setHandStraightened({ hour_hand: true, minute_hand: true }); // done
    record.setScatteredComponentPositions({
      balance_wheel: { x: 280, y: 155, rotation: 42, repositioned: false }, // still displaced
      pallet_fork:   { x: 200, y: 200, rotation: 0,  repositioned: true  }, // done
    });

    const saveData = record.serialize();
    // Simulate game exit and reload
    const restored = RepairSessionRecord.deserialize(saveData);

    expect(restored.areAllHandsStraightened()).toBe(true); // progress preserved
    const positions = restored.getScatteredComponentPositions();
    expect(positions.balance_wheel.repositioned).toBe(false); // partial progress preserved
    expect(positions.pallet_fork.repositioned).toBe(true);
  });

  test('getRepairSteps returns defensive copy (mutations do not affect internal state)', () => {
    const record = RepairSessionRecord.create();
    record.addRepairStep('step_a');
    const steps = record.getRepairSteps();
    steps.push('injected');
    expect(record.getRepairSteps()).toHaveLength(1); // internal state unaffected
  });
});
