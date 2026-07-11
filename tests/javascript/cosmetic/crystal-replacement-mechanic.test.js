/**
 * Tests for CrystalReplacementMechanic
 *
 * Issue #146 — Crystal Replacement: Cosmetic Restoration Phase 2
 *
 * Covers:
 *   - State machine: idle → removing → removed → installing → installed (AC2)
 *   - Ordering enforcement (cannot skip removal)
 *   - onStateChange callback firing
 *   - Re-do / reset support (AC6)
 *   - Completion count tracking
 */

'use strict';

const { CrystalReplacementMechanic, STATES } = require('../../../javascript/cosmetic/CrystalReplacementMechanic');

function makeMechanic(stateChanges = []) {
  const mechanic = new CrystalReplacementMechanic({
    onStateChange: (s) => stateChanges.push(s),
  });
  return mechanic;
}

describe('CrystalReplacementMechanic — initial state', () => {
  test('starts in idle state', () => {
    const m = makeMechanic();
    expect(m.getState()).toBe(STATES.IDLE);
  });

  test('isInstalled() is false initially', () => {
    const m = makeMechanic();
    expect(m.isInstalled()).toBe(false);
  });

  test('completionCount is 0 initially', () => {
    const m = makeMechanic();
    expect(m.getCompletionCount()).toBe(0);
  });
});

describe('CrystalReplacementMechanic — happy path (AC2)', () => {
  test('full remove → install flow succeeds', () => {
    const m = makeMechanic();

    expect(m.beginRemove().success).toBe(true);
    expect(m.getState()).toBe(STATES.REMOVING);

    expect(m.completeRemove().success).toBe(true);
    expect(m.getState()).toBe(STATES.REMOVED);

    expect(m.beginInstall().success).toBe(true);
    expect(m.getState()).toBe(STATES.INSTALLING);

    const result = m.completeInstall();
    expect(result.success).toBe(true);
    expect(result.completionCount).toBe(1);
    expect(m.getState()).toBe(STATES.INSTALLED);
    expect(m.isInstalled()).toBe(true);
  });

  test('onStateChange fires in correct order', () => {
    const changes = [];
    const m = makeMechanic(changes);
    m.beginRemove();
    m.completeRemove();
    m.beginInstall();
    m.completeInstall();
    expect(changes).toEqual([
      STATES.REMOVING,
      STATES.REMOVED,
      STATES.INSTALLING,
      STATES.INSTALLED,
    ]);
  });
});

describe('CrystalReplacementMechanic — ordering enforcement', () => {
  test('cannot beginInstall before removing', () => {
    const m = makeMechanic();
    const result = m.beginInstall();
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/must remove/i);
  });

  test('cannot completeInstall before beginInstall', () => {
    const m = makeMechanic();
    m.beginRemove();
    m.completeRemove();
    const result = m.completeInstall();
    expect(result.success).toBe(false);
  });

  test('cannot completeRemove before beginRemove', () => {
    const m = makeMechanic();
    const result = m.completeRemove();
    expect(result.success).toBe(false);
  });

  test('cannot beginRemove from removing state', () => {
    const m = makeMechanic();
    m.beginRemove();
    const result = m.beginRemove();
    expect(result.success).toBe(false);
  });
});

describe('CrystalReplacementMechanic — re-do / reset (AC6)', () => {
  test('can be reset from installed state and redone (AC6)', () => {
    const m = makeMechanic();
    m.beginRemove(); m.completeRemove(); m.beginInstall(); m.completeInstall();
    expect(m.isInstalled()).toBe(true);
    expect(m.getCompletionCount()).toBe(1);

    // Reset for re-do
    m.reset();
    expect(m.getState()).toBe(STATES.IDLE);
    expect(m.isInstalled()).toBe(false);

    // Re-do the replacement
    m.beginRemove(); m.completeRemove(); m.beginInstall(); m.completeInstall();
    expect(m.isInstalled()).toBe(true);
    expect(m.getCompletionCount()).toBe(2);
  });

  test('reset() can be called from any state', () => {
    const m = makeMechanic();
    m.beginRemove();
    m.reset();
    expect(m.getState()).toBe(STATES.IDLE);
  });

  test('reset() fires onStateChange with idle', () => {
    const changes = [];
    const m = makeMechanic(changes);
    m.beginRemove();
    m.reset();
    expect(changes).toContain(STATES.IDLE);
  });

  test('second completion correctly applies and completion count increments (AC6)', () => {
    const m = makeMechanic();
    // First run
    m.beginRemove(); m.completeRemove(); m.beginInstall(); m.completeInstall();
    // Redo
    m.reset();
    m.beginRemove(); m.completeRemove(); m.beginInstall();
    const result = m.completeInstall();
    expect(result.success).toBe(true);
    expect(result.completionCount).toBe(2);
  });
});

describe('CrystalReplacementMechanic — STATES constants', () => {
  test('STATES exports all expected state identifiers', () => {
    expect(STATES.IDLE).toBe('idle');
    expect(STATES.REMOVING).toBe('removing');
    expect(STATES.REMOVED).toBe('removed');
    expect(STATES.INSTALLING).toBe('installing');
    expect(STATES.INSTALLED).toBe('installed');
  });
});
