/**
 * Tests for AC5 (Chronograph) — Telemetry Event Emission
 *
 * AC5: Telemetry events fire correctly for the Chronograph Discovery Path feature.
 *   COMPLICATION_GATE_REACHED   — fires when any complication movement loads (D30 baseline)
 *   CHRONOGRAPH_OVERLAY_SHOWN   — overlay displayed
 *   CHRONOGRAPH_OVERLAY_DISMISSED — player dismissed after reading
 *   CHRONOGRAPH_OVERLAY_SKIPPED   — player skipped immediately
 *   PART_GROUP_REVEALED           — each scaffolded group reveal
 *   DISCOVERY_MODE_TOGGLED        — settings toggle fired
 *
 * Test Scenario 10: COMPLICATION_GATE_REACHED fires pre-launch for D30 baseline.
 */

const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmitter() {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  return { emitter: new TelemetryEmitter(hook), received };
}

// ─── EVENTS constants presence ────────────────────────────────────────────────

describe('EVENTS constants — Issue #88 additions present', () => {
  test('COMPLICATION_GATE_REACHED is defined', () => {
    expect(EVENTS.COMPLICATION_GATE_REACHED).toBe('complication_gate_reached');
  });

  test('CHRONOGRAPH_OVERLAY_SHOWN is defined', () => {
    expect(EVENTS.CHRONOGRAPH_OVERLAY_SHOWN).toBe('chronograph_overlay_shown');
  });

  test('CHRONOGRAPH_OVERLAY_DISMISSED is defined', () => {
    expect(EVENTS.CHRONOGRAPH_OVERLAY_DISMISSED).toBe('chronograph_overlay_dismissed');
  });

  test('CHRONOGRAPH_OVERLAY_SKIPPED is defined', () => {
    expect(EVENTS.CHRONOGRAPH_OVERLAY_SKIPPED).toBe('chronograph_overlay_skipped');
  });

  test('PART_GROUP_REVEALED is defined', () => {
    expect(EVENTS.PART_GROUP_REVEALED).toBe('part_group_revealed');
  });

  test('DISCOVERY_MODE_TOGGLED is defined', () => {
    expect(EVENTS.DISCOVERY_MODE_TOGGLED).toBe('discovery_mode_toggled');
  });
});

// ─── No regressions: existing events still defined ────────────────────────────

describe('EVENTS — existing events untouched (regression guard)', () => {
  test('TUTORIAL_DIAGNOSIS_STARTED unchanged', () => {
    expect(EVENTS.TUTORIAL_DIAGNOSIS_STARTED).toBe('tutorial_diagnosis_started');
  });

  test('REASSEMBLY_COMPLETED unchanged', () => {
    expect(EVENTS.REASSEMBLY_COMPLETED).toBe('reassembly_completed');
  });

  test('CLEANING_REVEAL_STARTED unchanged', () => {
    expect(EVENTS.CLEANING_REVEAL_STARTED).toBe('cleaning_reveal_started');
  });
});

// ─── Test Scenario 10: COMPLICATION_GATE_REACHED ──────────────────────────────

describe('Scenario 10 — COMPLICATION_GATE_REACHED fires for D30 baseline instrumentation', () => {
  test('complicationGateReached emits COMPLICATION_GATE_REACHED with movementId and type', () => {
    const { emitter, received } = makeEmitter();
    emitter.complicationGateReached('mvt-speedmaster-001', 'chronograph');
    expect(received).toHaveLength(1);
    expect(received[0].name).toBe(EVENTS.COMPLICATION_GATE_REACHED);
    expect(received[0].payload.movementId).toBe('mvt-speedmaster-001');
    expect(received[0].payload.complicationType).toBe('chronograph');
  });

  test('wasEmitted returns true after complicationGateReached fires', () => {
    const { emitter } = makeEmitter();
    emitter.complicationGateReached('mvt-001', 'chronograph');
    expect(emitter.wasEmitted(EVENTS.COMPLICATION_GATE_REACHED)).toBe(true);
  });
});

// ─── Overlay telemetry events ─────────────────────────────────────────────────

describe('AC5 — chronographOverlayShown fires CHRONOGRAPH_OVERLAY_SHOWN', () => {
  test('fires with movementId payload', () => {
    const { emitter, received } = makeEmitter();
    emitter.chronographOverlayShown('mvt-001');
    expect(received[0].name).toBe(EVENTS.CHRONOGRAPH_OVERLAY_SHOWN);
    expect(received[0].payload.movementId).toBe('mvt-001');
  });
});

describe('AC5 — chronographOverlayDismissed fires CHRONOGRAPH_OVERLAY_DISMISSED', () => {
  test('fires with movementId payload', () => {
    const { emitter, received } = makeEmitter();
    emitter.chronographOverlayDismissed('mvt-001');
    expect(received[0].name).toBe(EVENTS.CHRONOGRAPH_OVERLAY_DISMISSED);
    expect(received[0].payload.movementId).toBe('mvt-001');
  });
});

describe('AC5 — chronographOverlaySkipped fires CHRONOGRAPH_OVERLAY_SKIPPED', () => {
  test('fires with movementId payload', () => {
    const { emitter, received } = makeEmitter();
    emitter.chronographOverlaySkipped('mvt-001');
    expect(received[0].name).toBe(EVENTS.CHRONOGRAPH_OVERLAY_SKIPPED);
    expect(received[0].payload.movementId).toBe('mvt-001');
  });
});

describe('AC5 — partGroupRevealed fires PART_GROUP_REVEALED', () => {
  test('fires with groupIndex, label, and partCount', () => {
    const { emitter, received } = makeEmitter();
    emitter.partGroupRevealed(2, 'Timing mechanism — 8 parts', 8);
    expect(received[0].name).toBe(EVENTS.PART_GROUP_REVEALED);
    expect(received[0].payload.groupIndex).toBe(2);
    expect(received[0].payload.label).toBe('Timing mechanism — 8 parts');
    expect(received[0].payload.partCount).toBe(8);
  });
});

describe('AC5 — discoveryModeToggled fires DISCOVERY_MODE_TOGGLED', () => {
  test('fires with newValue = false when player turns off discovery mode', () => {
    const { emitter, received } = makeEmitter();
    emitter.discoveryModeToggled(false);
    expect(received[0].name).toBe(EVENTS.DISCOVERY_MODE_TOGGLED);
    expect(received[0].payload.newValue).toBe(false);
  });

  test('fires with newValue = true when player re-enables discovery mode', () => {
    const { emitter, received } = makeEmitter();
    emitter.discoveryModeToggled(true);
    expect(received[0].payload.newValue).toBe(true);
  });
});

// ─── Full chronograph encounter event sequence ────────────────────────────────

describe('AC5 / Scenario 10 — Full chronograph event sequence fires in order', () => {
  test('complication gate → overlay shown → group 1 → group 2 → group 3 → dismissed', () => {
    const { emitter } = makeEmitter();

    emitter.complicationGateReached('mvt-001', 'chronograph');
    emitter.chronographOverlayShown('mvt-001');
    emitter.chronographOverlayDismissed('mvt-001');
    emitter.partGroupRevealed(0, 'Base plate & bridges — 7 parts', 7);
    emitter.partGroupRevealed(1, 'Column wheel & levers — 6 parts', 6);
    emitter.partGroupRevealed(2, 'Timing mechanism — 8 parts', 8);

    const names = emitter.getEmittedEvents().map((e) => e.name);
    expect(names).toEqual([
      'complication_gate_reached',
      'chronograph_overlay_shown',
      'chronograph_overlay_dismissed',
      'part_group_revealed',
      'part_group_revealed',
      'part_group_revealed',
    ]);
  });
});
