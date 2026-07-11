/**
 * Tests: DamageRecoveryController (integration) — Issue #148
 *
 * AC1: Damage triggers broken visual state and recovery prompt within 1 second.
 * AC2: Player orders replacement → awaiting-replacement state; other actions available.
 * AC3: Early-game (first 3 restorations): cost ≤5%, delay ≤30s.
 * AC4: Install replacement → restoration can complete; cost penalty applied.
 * AC5: Telemetry captures partId, restorationId, eventType, playerChoice.
 * Test Scenario 2: Decline → blocked state.
 * Test Scenario 4: Multiple simultaneous damage events.
 * Test Scenario 7: Save/load — snapshotForSave() persists to PlayerSaveState.
 * Test Scenario 10: Regression — undamaged play adds no friction.
 *
 * Run with: npm test
 */

'use strict';

jest.useFakeTimers();

const { DamageRecoveryController, RESTORATION_DAMAGE_STATE } = require('../../../src/damage/DamageRecoveryController');
const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');

function makeController({
  restorationId     = 'rest-001',
  restorationValue  = 1000,
  restorationNumber = 1,
} = {}) {
  const hook       = jest.fn();
  const telemetry  = new TelemetryEmitter(hook);
  const saveState  = new PlayerSaveState();
  saveState.set('player_currency', 500);

  const ctrl = new DamageRecoveryController({
    telemetryEmitter:  telemetry,
    saveState,
    restorationId,
    restorationValue,
    restorationNumber,
  });

  return { ctrl, telemetry, saveState, hook };
}

afterEach(() => {
  jest.clearAllTimers();
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('DamageRecoveryController — constructor', () => {
  test('initial restoration state is active', () => {
    const { ctrl } = makeController();
    expect(ctrl.getRestorationState()).toBe(RESTORATION_DAMAGE_STATE.ACTIVE);
    ctrl.dispose();
  });

  test('throws when telemetryEmitter is missing', () => {
    const saveState = new PlayerSaveState();
    expect(() => new DamageRecoveryController({
      telemetryEmitter: null, saveState, restorationId: 'r', restorationValue: 100, restorationNumber: 1,
    })).toThrow('telemetryEmitter is required');
  });
});

// ─── AC1: triggerDamage() — visual state and prompt ──────────────────────────

describe('DamageRecoveryController — AC1: triggerDamage()', () => {
  test('part visual state becomes "broken" synchronously after damage', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('over_torque', 'part-001');
    expect(ctrl.getPartVisualState('part-001')).toBe('broken');
    ctrl.dispose();
  });

  test('getPromptData() returns non-null after damage (prompt shown within 1s)', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('drop', 'part-002');
    const data = ctrl.getPromptData();
    expect(data).not.toBeNull();
    expect(data.state).toBe('visible');
    expect(data.context.partId).toBe('part-002');
    ctrl.dispose();
  });

  test('restoration transitions to awaiting_replacement after first damage', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('snap', 'part-003');
    expect(ctrl.getRestorationState()).toBe(RESTORATION_DAMAGE_STATE.AWAITING_REPLACEMENT);
    ctrl.dispose();
  });
});

// ─── AC2: playerConfirmsOrder() — awaiting-replacement state ─────────────────

describe('DamageRecoveryController — AC2: playerConfirmsOrder()', () => {
  test('confirms order and places it in active orders', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('over_torque', 'part-AC2');
    ctrl.playerConfirmsOrder();
    const orders = ctrl.getActiveOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].partId).toBe('part-AC2');
    ctrl.dispose();
  });

  test('restoration remains in awaiting_replacement after confirming order', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('drop', 'part-AC2b');
    ctrl.playerConfirmsOrder();
    expect(ctrl.getRestorationState()).toBe(RESTORATION_DAMAGE_STATE.AWAITING_REPLACEMENT);
    ctrl.dispose();
  });

  test('prompt is reset after confirming order (ready for next damage event)', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('snap', 'part-AC2c');
    ctrl.playerConfirmsOrder();
    expect(ctrl.getPromptData()).toBeNull();
    ctrl.dispose();
  });
});

// ─── Test Scenario 2: playerDeclinesOrder() — blocked state ─────────────────

describe('DamageRecoveryController — Test Scenario 2: playerDeclinesOrder()', () => {
  test('restoration state becomes blocked on decline', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('drop', 'part-declined');
    ctrl.playerDeclinesOrder();
    expect(ctrl.getRestorationState()).toBe(RESTORATION_DAMAGE_STATE.BLOCKED);
    ctrl.dispose();
  });

  test('no active orders after decline', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('over_torque', 'part-decl2');
    ctrl.playerDeclinesOrder();
    expect(ctrl.getActiveOrders()).toHaveLength(0);
    ctrl.dispose();
  });
});

// ─── AC3: Early-game cost and delay calibration ───────────────────────────────

describe('DamageRecoveryController — AC3: early-game calibration', () => {
  test('cost penalty in first restoration is ≤5% of restoration value', () => {
    const { ctrl } = makeController({ restorationValue: 1000, restorationNumber: 1 });
    ctrl.triggerDamage('over_torque', 'part-early');
    ctrl.playerConfirmsOrder();
    const orders = ctrl.getActiveOrders();
    expect(orders[0].cost).toBeLessThanOrEqual(50); // 5% of 1000
    ctrl.dispose();
  });

  test('delay is ≤30 seconds in first restoration', () => {
    const { ctrl } = makeController({ restorationNumber: 1 });
    ctrl.triggerDamage('drop', 'part-delay');
    ctrl.playerConfirmsOrder();
    const orders = ctrl.getActiveOrders();
    expect(orders[0].delaySecs).toBeLessThanOrEqual(30);
    ctrl.dispose();
  });
});

// ─── AC4: installReplacement() — restoration completes with cost penalty ─────

describe('DamageRecoveryController — AC4: installReplacement()', () => {
  test('after install, part visual state returns to "installed"', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('over_torque', 'part-install');
    ctrl.playerConfirmsOrder();
    ctrl.simulateReplacementArrival('part-install');
    ctrl.installReplacement('part-install');
    expect(ctrl.getPartVisualState('part-install')).toBe('installed');
    ctrl.dispose();
  });

  test('installReplacement() returns cost penalty', () => {
    const { ctrl } = makeController({ restorationValue: 1000, restorationNumber: 1 });
    ctrl.triggerDamage('snap', 'part-cost');
    ctrl.playerConfirmsOrder();
    ctrl.simulateReplacementArrival('part-cost');
    const result = ctrl.installReplacement('part-cost');
    expect(result.costPenalty).toBe(50);
    ctrl.dispose();
  });

  test('total cost penalty accumulates correctly for multiple replacements', () => {
    const { ctrl } = makeController({ restorationValue: 1000, restorationNumber: 1 });
    ctrl.triggerDamage('over_torque', 'part-A');
    ctrl.playerConfirmsOrder();
    ctrl.triggerDamage('drop', 'part-B');
    ctrl.playerConfirmsOrder();
    ctrl.simulateReplacementArrival('part-A');
    ctrl.simulateReplacementArrival('part-B');
    ctrl.installReplacement('part-A');
    ctrl.installReplacement('part-B');
    expect(ctrl.getTotalCostPenalty()).toBe(100); // 50 + 50
    ctrl.dispose();
  });

  test('restoration state returns to active after all replacements installed', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('snap', 'part-final');
    ctrl.playerConfirmsOrder();
    ctrl.simulateReplacementArrival('part-final');
    ctrl.installReplacement('part-final');
    expect(ctrl.getRestorationState()).toBe(RESTORATION_DAMAGE_STATE.ACTIVE);
    ctrl.dispose();
  });

  test('installReplacement() throws when replacement not yet arrived', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('over_torque', 'part-notarrived');
    ctrl.playerConfirmsOrder();
    expect(() => ctrl.installReplacement('part-notarrived')).toThrow('has not arrived yet');
    ctrl.dispose();
  });
});

// ─── AC5: Telemetry events ────────────────────────────────────────────────────

describe('DamageRecoveryController — AC5: telemetry', () => {
  test('part_damaged event fires with partId, restorationId, eventType on damage', () => {
    const { ctrl, telemetry } = makeController({ restorationId: 'rest-telem' });
    ctrl.triggerDamage('over_torque', 'part-telem');
    expect(telemetry.wasEmitted(EVENTS.PART_DAMAGED)).toBe(true);
    const evt = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.PART_DAMAGED);
    expect(evt.payload.partId).toBe('part-telem');
    expect(evt.payload.restorationId).toBe('rest-telem');
    expect(evt.payload.eventType).toBe('over_torque');
    ctrl.dispose();
  });

  test('part_damage_recovery_chosen fires with playerChoice="ordered" on confirm', () => {
    const { ctrl, telemetry } = makeController();
    ctrl.triggerDamage('drop', 'part-rc');
    ctrl.playerConfirmsOrder();
    const evt = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.PART_DAMAGE_RECOVERY_CHOSEN
    );
    expect(evt).toBeDefined();
    expect(evt.payload.playerChoice).toBe('ordered');
    ctrl.dispose();
  });

  test('part_damage_recovery_chosen fires with playerChoice="declined" on decline', () => {
    const { ctrl, telemetry } = makeController();
    ctrl.triggerDamage('snap', 'part-rd');
    ctrl.playerDeclinesOrder();
    const evt = telemetry.getEmittedEvents().find(
      (e) => e.name === EVENTS.PART_DAMAGE_RECOVERY_CHOSEN
    );
    expect(evt).toBeDefined();
    expect(evt.payload.playerChoice).toBe('declined');
    ctrl.dispose();
  });

  test('telemetry captures all four required AC5 fields in combined events', () => {
    const { ctrl, telemetry } = makeController({ restorationId: 'rest-AC5' });
    ctrl.triggerDamage('snap', 'part-AC5');
    ctrl.playerConfirmsOrder();

    const damaged = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.PART_DAMAGED);
    const chosen  = telemetry.getEmittedEvents().find((e) => e.name === EVENTS.PART_DAMAGE_RECOVERY_CHOSEN);

    // AC5: partId, restorationId, eventType from PART_DAMAGED
    expect(damaged.payload.partId).toBe('part-AC5');
    expect(damaged.payload.restorationId).toBe('rest-AC5');
    expect(damaged.payload.eventType).toBe('snap');

    // AC5: playerChoice from PART_DAMAGE_RECOVERY_CHOSEN
    expect(chosen.payload.playerChoice).toBe('ordered');
    ctrl.dispose();
  });
});

// ─── Test Scenario 4: Multiple simultaneous damage events ────────────────────

describe('DamageRecoveryController — Test Scenario 4: multiple damage events', () => {
  test('two parts can be damaged independently without conflicting', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('over_torque', 'part-multi-A');
    ctrl.playerConfirmsOrder(); // confirm first damage

    ctrl.triggerDamage('drop', 'part-multi-B');
    ctrl.playerConfirmsOrder(); // confirm second damage

    const orders = ctrl.getActiveOrders();
    expect(orders).toHaveLength(2);
    const partIds = orders.map((o) => o.partId);
    expect(partIds).toContain('part-multi-A');
    expect(partIds).toContain('part-multi-B');
    ctrl.dispose();
  });

  test('both replacements installed → restoration returns to active', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('over_torque', 'part-mA');
    ctrl.playerConfirmsOrder();
    ctrl.triggerDamage('drop', 'part-mB');
    ctrl.playerConfirmsOrder();

    ctrl.simulateReplacementArrival('part-mA');
    ctrl.simulateReplacementArrival('part-mB');
    ctrl.installReplacement('part-mA');
    ctrl.installReplacement('part-mB');

    expect(ctrl.getRestorationState()).toBe(RESTORATION_DAMAGE_STATE.ACTIVE);
    ctrl.dispose();
  });

  test('cumulative cost penalty correct for two damage events', () => {
    const { ctrl } = makeController({ restorationValue: 2000, restorationNumber: 1 });
    ctrl.triggerDamage('snap', 'part-mC');
    ctrl.playerConfirmsOrder();
    ctrl.triggerDamage('over_torque', 'part-mD');
    ctrl.playerConfirmsOrder();

    ctrl.simulateReplacementArrival('part-mC');
    ctrl.simulateReplacementArrival('part-mD');
    ctrl.installReplacement('part-mC');
    ctrl.installReplacement('part-mD');

    // 5% of 2000 = 100 per replacement × 2
    expect(ctrl.getTotalCostPenalty()).toBe(200);
    ctrl.dispose();
  });
});

// ─── Test Scenario 7: Save/load integration with PlayerSaveState ──────────────

describe('DamageRecoveryController — Test Scenario 7: save/load', () => {
  test('snapshotForSave() includes damage state fields required for #93 checkpoint', () => {
    const { ctrl } = makeController();
    ctrl.triggerDamage('drop', 'part-save');
    ctrl.playerConfirmsOrder();
    const snap = ctrl.snapshotForSave();
    expect(snap).toHaveProperty('restorationDamageState');
    expect(snap).toHaveProperty('damagedPartIds');
    expect(snap).toHaveProperty('orders');
    expect(snap).toHaveProperty('totalCostPenalty');
    ctrl.dispose();
  });

  test('damage_recovery_state is persisted into PlayerSaveState after damage', () => {
    const { ctrl, saveState } = makeController();
    ctrl.triggerDamage('snap', 'part-persist');
    ctrl.playerConfirmsOrder();
    const saved = saveState.get('damage_recovery_state');
    expect(saved).not.toBeNull();
    expect(saved.restorationDamageState).toBe(RESTORATION_DAMAGE_STATE.AWAITING_REPLACEMENT);
    expect(saved.damagedPartIds).toContain('part-persist');
    ctrl.dispose();
  });

  test('PlayerSaveState.snapshot() includes damage_recovery_state key', () => {
    const { ctrl, saveState } = makeController();
    ctrl.triggerDamage('over_torque', 'part-snap');
    ctrl.playerConfirmsOrder();
    const snap = saveState.snapshot();
    expect(snap).toHaveProperty('damage_recovery_state');
    ctrl.dispose();
  });

  test('damage_recovery_state defaults to null in PlayerSaveState (backward-compatible)', () => {
    const saveState = new PlayerSaveState();
    expect(saveState.get('damage_recovery_state')).toBeNull();
  });
});

// ─── Test Scenario 10: Regression — undamaged play ───────────────────────────

describe('DamageRecoveryController — Test Scenario 10: regression (undamaged play)', () => {
  test('no active orders when no damage events fire', () => {
    const { ctrl } = makeController();
    expect(ctrl.getActiveOrders()).toHaveLength(0);
    ctrl.dispose();
  });

  test('getPromptData() returns null when no damage has occurred', () => {
    const { ctrl } = makeController();
    expect(ctrl.getPromptData()).toBeNull();
    ctrl.dispose();
  });

  test('restoration state remains active throughout undamaged play', () => {
    const { ctrl } = makeController();
    // Simulate a full undamaged restoration cycle (no damage triggers)
    expect(ctrl.getRestorationState()).toBe(RESTORATION_DAMAGE_STATE.ACTIVE);
    expect(ctrl.getTotalCostPenalty()).toBe(0);
    ctrl.dispose();
  });

  test('getTotalCostPenalty() is 0 for undamaged play', () => {
    const { ctrl } = makeController();
    expect(ctrl.getTotalCostPenalty()).toBe(0);
    ctrl.dispose();
  });

  test('no telemetry events emitted during undamaged play', () => {
    const { telemetry } = makeController();
    expect(telemetry.wasEmitted(EVENTS.PART_DAMAGED)).toBe(false);
    expect(telemetry.wasEmitted(EVENTS.PART_DAMAGE_RECOVERY_CHOSEN)).toBe(false);
  });
});
