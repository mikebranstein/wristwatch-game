/**
 * Tests for AC2 — 3-Tier Progressive Hint Ladder
 *
 * AC2: A player can voluntarily escalate through all 3 hint tiers
 * (nudge → clue → solution) without being forced to view any tier they have
 * not requested; all 3 tiers are accessible for every diagnosable fault.
 *
 * Scenario 2: Full hint-assisted path — hints escalate in order.
 * Scenario 8: Re-examined fault — hint system remains accessible.
 * Scenario 10: Hint ladder resets per fault instance (not per fault type).
 */

const { HintSystem } = require('../../src/diagnosis/HintSystem');
const { TelemetryEmitter } = require('../../src/telemetry/TelemetryEmitter');
const { getAllFaultIds } = require('../../src/data/fault-hints');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTelemetry() {
  const events = [];
  const hook = (name, payload) => events.push({ name, payload });
  return { telemetry: new TelemetryEmitter(hook), events };
}

function makeHintSystem() {
  const { telemetry, events } = makeTelemetry();
  return { hints: new HintSystem(telemetry), events };
}

// ─── AC2: Voluntary hint escalation ────────────────────────────────────────────

describe('AC2 — HintSystem: voluntary 3-tier hint ladder', () => {
  test('requesting hints in order returns tier 1 then 2 then 3', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fault-inst-1', 'mainspring_failure');

    const h1 = hints.requestNextHint('fault-inst-1');
    const h2 = hints.requestNextHint('fault-inst-1');
    const h3 = hints.requestNextHint('fault-inst-1');

    expect(h1.tier).toBe(1);
    expect(h2.tier).toBe(2);
    expect(h3.tier).toBe(3);
  });

  test('hint texts are non-empty strings', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'escapement_fault');
    const h1 = hints.requestNextHint('fi');
    const h2 = hints.requestNextHint('fi');
    const h3 = hints.requestNextHint('fi');
    expect(typeof h1.text).toBe('string');
    expect(h1.text.length).toBeGreaterThan(0);
    expect(h2.text.length).toBeGreaterThan(0);
    expect(h3.text.length).toBeGreaterThan(0);
  });

  test('requestNextHint returns null after max tier is reached', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'balance_wheel_fault');
    hints.requestNextHint('fi');
    hints.requestNextHint('fi');
    hints.requestNextHint('fi');
    const result = hints.requestNextHint('fi'); // 4th call — beyond max
    expect(result).toBeNull();
  });

  test('getCurrentTier reflects the number of hints requested', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'cannon_pinion_slip');
    expect(hints.getCurrentTier('fi')).toBe(0);
    hints.requestNextHint('fi');
    expect(hints.getCurrentTier('fi')).toBe(1);
    hints.requestNextHint('fi');
    expect(hints.getCurrentTier('fi')).toBe(2);
  });

  test('hasMoreHints returns true when below max tier', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'crown_stem_fault');
    expect(hints.hasMoreHints('fi')).toBe(true);
    hints.requestNextHint('fi');
    hints.requestNextHint('fi');
    hints.requestNextHint('fi');
    expect(hints.hasMoreHints('fi')).toBe(false);
  });

  test('hints are never automatically shown — no hints requested means tier 0', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'mainspring_failure');
    expect(hints.getCurrentTier('fi')).toBe(0);
    expect(hints.getHintsShown('fi')).toHaveLength(0);
  });
});

// ─── AC2: All 3 tiers accessible for every diagnosable fault ──────────────────

describe('AC2 — All 3 hint tiers accessible for every authored fault', () => {
  test.each(getAllFaultIds())(
    'fault "%s" has accessible hint tiers 1, 2 and 3',
    (faultId) => {
      const { hints } = makeHintSystem();
      hints.registerFaultInstance(`test-${faultId}`, faultId);
      const h1 = hints.requestNextHint(`test-${faultId}`);
      const h2 = hints.requestNextHint(`test-${faultId}`);
      const h3 = hints.requestNextHint(`test-${faultId}`);
      expect(h1).not.toBeNull();
      expect(h2).not.toBeNull();
      expect(h3).not.toBeNull();
      expect(h1.tier).toBe(1);
      expect(h2.tier).toBe(2);
      expect(h3.tier).toBe(3);
    }
  );
});

// ─── Scenario 2: Telemetry events fire in correct order ───────────────────────

describe('Scenario 2 — Full hint-assisted path fires telemetry in order', () => {
  test('hint_tier_1_shown, hint_tier_2_shown, hint_tier_3_shown fire in order', () => {
    const { hints, events } = makeHintSystem();
    hints.registerFaultInstance('fi', 'mainspring_failure');
    hints.requestNextHint('fi');
    hints.requestNextHint('fi');
    hints.requestNextHint('fi');

    const hintEvents = events
      .filter((e) => e.name.startsWith('hint_tier_'))
      .map((e) => e.name);

    expect(hintEvents).toEqual([
      'hint_tier_1_shown',
      'hint_tier_2_shown',
      'hint_tier_3_shown',
    ]);
  });
});

// ─── Scenario 10: Hint ladder resets per fault instance ───────────────────────

describe('Scenario 10 — Hint ladder resets for new instance of same fault type', () => {
  test('new fault instance of same type starts at tier 0', () => {
    const { hints } = makeHintSystem();

    // First instance of mainspring_failure — use all hints
    hints.registerFaultInstance('instance-A', 'mainspring_failure');
    hints.requestNextHint('instance-A');
    hints.requestNextHint('instance-A');
    hints.requestNextHint('instance-A');
    expect(hints.getCurrentTier('instance-A')).toBe(3);

    // New instance of the same fault type — must start fresh
    hints.registerFaultInstance('instance-B', 'mainspring_failure');
    expect(hints.getCurrentTier('instance-B')).toBe(0);
    expect(hints.hasMoreHints('instance-B')).toBe(true);
  });

  test('requesting hint on new instance returns tier 1 (not tier 3)', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('inst-A', 'escapement_fault');
    hints.requestNextHint('inst-A');
    hints.requestNextHint('inst-A');
    hints.requestNextHint('inst-A');

    hints.registerFaultInstance('inst-B', 'escapement_fault');
    const firstHint = hints.requestNextHint('inst-B');
    expect(firstHint.tier).toBe(1);
  });
});

// ─── Scenario 8: Hint system remains accessible on re-examination ──────────────

describe('Scenario 8 — Hint system stays accessible for already-diagnosed fault', () => {
  test('re-entering the same fault instance still has its hint state', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'date_mechanism_fault');
    hints.requestNextHint('fi');

    // Re-register same instance — must be idempotent
    hints.registerFaultInstance('fi', 'date_mechanism_fault');
    expect(hints.getCurrentTier('fi')).toBe(1); // state preserved
  });
});

// ─── wasHintUsed ──────────────────────────────────────────────────────────────

describe('HintSystem.wasHintUsed', () => {
  test('returns false before any hint requested', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'crown_stem_fault');
    expect(hints.wasHintUsed('fi')).toBe(false);
  });

  test('returns true after first hint requested', () => {
    const { hints } = makeHintSystem();
    hints.registerFaultInstance('fi', 'crown_stem_fault');
    hints.requestNextHint('fi');
    expect(hints.wasHintUsed('fi')).toBe(true);
  });
});
