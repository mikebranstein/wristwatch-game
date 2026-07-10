/**
 * Tests: DamageRecoveryPrompt — Issue #148
 *
 * AC1: Recovery prompt appears within 1 second; non-punishing tone.
 * AC2: Player ordering a replacement enters awaiting-replacement state;
 *      other valid restoration actions remain available.
 * Test Scenario 2: Recovery declined → blocked state (opt-in, not mandatory).
 * Test Scenario 9: Insufficient funds edge case — UI displays balance and acquisition path.
 *
 * Run with: npm test
 */

'use strict';

const { DamageRecoveryPrompt, PROMPT_STATE, PLAYER_CHOICE } = require('../../src/damage/DamageRecoveryPrompt');

function makePrompt({ onOrder = jest.fn(), onDecline = jest.fn() } = {}) {
  return new DamageRecoveryPrompt({ onOrder, onDecline });
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('DamageRecoveryPrompt — constructor', () => {
  test('throws when onOrder is missing', () => {
    expect(() => new DamageRecoveryPrompt({ onDecline: jest.fn() })).toThrow(
      'DamageRecoveryPrompt requires an onOrder handler.'
    );
  });

  test('throws when onDecline is missing', () => {
    expect(() => new DamageRecoveryPrompt({ onOrder: jest.fn() })).toThrow(
      'DamageRecoveryPrompt requires an onDecline handler.'
    );
  });

  test('initial state is hidden', () => {
    const p = makePrompt();
    expect(p.getState()).toBe(PROMPT_STATE.HIDDEN);
  });
});

// ─── AC1: show() — prompt state transitions ──────────────────────────────────

describe('DamageRecoveryPrompt — AC1: show() transitions to visible', () => {
  const damageEvent = { partId: 'part-001', restorationId: 'rest-001', eventType: 'over_torque' };

  test('state becomes visible after show()', () => {
    const p = makePrompt();
    p.show(damageEvent);
    expect(p.getState()).toBe(PROMPT_STATE.VISIBLE);
  });

  test('show() returns visible state and context', () => {
    const p = makePrompt();
    const result = p.show(damageEvent);
    expect(result.state).toBe(PROMPT_STATE.VISIBLE);
    expect(result.context.partId).toBe('part-001');
    expect(result.context.restorationId).toBe('rest-001');
  });

  test('getCurrentContext() returns context after show()', () => {
    const p = makePrompt();
    p.show(damageEvent);
    const ctx = p.getCurrentContext();
    expect(ctx).not.toBeNull();
    expect(ctx.partId).toBe('part-001');
    expect(ctx.eventType).toBe('over_torque');
  });
});

// ─── AC1: Non-punishing tone ──────────────────────────────────────────────────

describe('DamageRecoveryPrompt — AC1: non-punishing tone', () => {
  const damageEvent = { partId: 'p1', restorationId: 'r1', eventType: 'drop' };

  test('prompt title uses "This part needs replacing" (not "You failed")', () => {
    const p = makePrompt();
    const result = p.show(damageEvent);
    expect(result.message.title).toContain('This part needs replacing');
    expect(result.message.title).not.toMatch(/fail/i);
    expect(result.message.title).not.toMatch(/error/i);
  });

  test('prompt body mentions continuing work (non-punishing framing)', () => {
    const p = makePrompt();
    const result = p.show(damageEvent);
    expect(result.message.body).toMatch(/replacement|continue|proceed/i);
  });
});

// ─── AC2: confirmOrder() — awaiting-replacement ───────────────────────────────

describe('DamageRecoveryPrompt — AC2: confirmOrder()', () => {
  const damageEvent = { partId: 'part-002', restorationId: 'rest-002', eventType: 'snap' };

  test('confirmOrder() fires onOrder callback', () => {
    const onOrder = jest.fn();
    const p = makePrompt({ onOrder });
    p.show(damageEvent);
    p.confirmOrder();
    expect(onOrder).toHaveBeenCalledWith('part-002', 'rest-002');
  });

  test('confirmOrder() returns ORDERED choice', () => {
    const p = makePrompt();
    p.show(damageEvent);
    const result = p.confirmOrder();
    expect(result.choice).toBe(PLAYER_CHOICE.ORDERED);
    expect(result.partId).toBe('part-002');
  });

  test('state becomes dismissed after confirmOrder()', () => {
    const p = makePrompt();
    p.show(damageEvent);
    p.confirmOrder();
    expect(p.getState()).toBe(PROMPT_STATE.DISMISSED);
  });

  test('confirmOrder() throws when prompt is not visible', () => {
    const p = makePrompt();
    expect(() => p.confirmOrder()).toThrow('prompt is not currently visible');
  });
});

// ─── Test Scenario 2: declineOrder() — opt-in recovery ────────────────────────

describe('DamageRecoveryPrompt — Test Scenario 2: declineOrder()', () => {
  const damageEvent = { partId: 'part-003', restorationId: 'rest-003', eventType: 'drop' };

  test('declineOrder() fires onDecline callback', () => {
    const onDecline = jest.fn();
    const p = makePrompt({ onDecline });
    p.show(damageEvent);
    p.declineOrder();
    expect(onDecline).toHaveBeenCalledWith('part-003', 'rest-003');
  });

  test('declineOrder() returns DECLINED choice', () => {
    const p = makePrompt();
    p.show(damageEvent);
    const result = p.declineOrder();
    expect(result.choice).toBe(PLAYER_CHOICE.DECLINED);
  });

  test('state becomes dismissed after declineOrder()', () => {
    const p = makePrompt();
    p.show(damageEvent);
    p.declineOrder();
    expect(p.getState()).toBe(PROMPT_STATE.DISMISSED);
  });

  test('declineOrder() throws when prompt is not visible', () => {
    const p = makePrompt();
    expect(() => p.declineOrder()).toThrow('prompt is not currently visible');
  });
});

// ─── Test Scenario 9: Insufficient funds edge case ───────────────────────────

describe('DamageRecoveryPrompt — Test Scenario 9: insufficient funds', () => {
  const damageEvent = { partId: 'p1', restorationId: 'r1', eventType: 'snap' };

  test('canAfford is false when balance < replacementCost', () => {
    const p = makePrompt();
    const result = p.show(damageEvent, { currentBalance: 10, replacementCost: 50 });
    expect(result.message.canAfford).toBe(false);
  });

  test('canAfford is true when balance >= replacementCost', () => {
    const p = makePrompt();
    const result = p.show(damageEvent, { currentBalance: 100, replacementCost: 50 });
    expect(result.message.canAfford).toBe(true);
  });

  test('insufficient-funds body shows current balance', () => {
    const p = makePrompt();
    const result = p.show(damageEvent, { currentBalance: 5, replacementCost: 100 });
    expect(result.message.body).toContain('5');
    expect(result.message.body).toContain('100');
  });

  test('insufficient-funds body explains acquisition path (player not stuck)', () => {
    const p = makePrompt();
    const result = p.show(damageEvent, { currentBalance: 0, replacementCost: 200 });
    expect(result.message.body).toMatch(/acquire|earn|sell|complete|funds/i);
  });
});

// ─── Critical-path part ───────────────────────────────────────────────────────

describe('DamageRecoveryPrompt — critical-path part', () => {
  test('critical-path body says player cannot proceed without replacement', () => {
    const p = makePrompt();
    const damageEvent = { partId: 'pCrit', restorationId: 'r1', eventType: 'drop' };
    const result = p.show(damageEvent, { isCriticalPath: true, currentBalance: 500, replacementCost: 10 });
    expect(result.message.body).toMatch(/required|proceed|continue/i);
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('DamageRecoveryPrompt — reset()', () => {
  test('reset() returns state to hidden and clears context', () => {
    const p = makePrompt();
    p.show({ partId: 'px', restorationId: 'rx', eventType: 'drop' });
    p.reset();
    expect(p.getState()).toBe(PROMPT_STATE.HIDDEN);
    expect(p.getCurrentContext()).toBeNull();
  });
});
