/**
 * Tests for AC1, AC3, AC4 — ChronographDiscoveryOverlay
 *
 * AC1: Given a player encounters a chronograph movement for the first time,
 *      when the movement loads, then the column-wheel introduction overlay appears
 *      automatically before any parts are surfaced, and the player can dismiss it
 *      with a single action.
 *
 * AC3: Given a player has previously dismissed the overlay and disabled discovery mode,
 *      when they load the same (or another) chronograph movement, then neither the
 *      overlay nor part scaffolding activates.
 *
 * AC4: Given a player who has completed a chronograph before loads a new chronograph
 *      movement, when discovery mode is set to "off" in settings, then no overlay or
 *      scaffolding appears, confirming the setting persists correctly.
 *
 * Test Scenarios: 1 (first encounter, overlay auto-shows), 2 (skip), 5 (overlay never re-fires)
 */

const {
  ChronographDiscoveryOverlay,
  DISCOVERY_STEPS,
} = require('../../../src/tutorials/ChronographDiscoveryOverlay');
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');
const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOverlay(initialSaveData = {}) {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  const telemetry = new TelemetryEmitter(hook);
  const saveState = new PlayerSaveState(initialSaveData);
  const overlay = new ChronographDiscoveryOverlay(saveState, telemetry);
  return { overlay, saveState, telemetry, received };
}

// ─── AC1 / Test Scenario 1: First encounter — overlay shows automatically ─────

describe('AC1 / Scenario 1 — First-time chronograph encounter: overlay shows automatically', () => {
  test('shouldShow returns true for brand-new player (overlay not seen, discovery mode ON)', () => {
    const { overlay } = makeOverlay();
    expect(overlay.shouldShow()).toBe(true);
  });

  test('tryShow returns true and makes overlay visible for first-time player', () => {
    const { overlay } = makeOverlay();
    const shown = overlay.tryShow('mvt-chrono-001');
    expect(shown).toBe(true);
    expect(overlay.isVisible()).toBe(true);
  });

  test('tryShow emits chronograph_overlay_shown with movementId', () => {
    const { overlay, received } = makeOverlay();
    overlay.tryShow('mvt-chrono-001');
    const evt = received.find((e) => e.name === EVENTS.CHRONOGRAPH_OVERLAY_SHOWN);
    expect(evt).toBeDefined();
    expect(evt.payload.movementId).toBe('mvt-chrono-001');
  });

  test('overlay starts at step 1 after tryShow', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-chrono-001');
    const step = overlay.getCurrentStepData();
    expect(step).not.toBeNull();
    expect(step.step).toBe(1);
  });

  test('getCurrentStepData returns null before tryShow is called', () => {
    const { overlay } = makeOverlay();
    expect(overlay.getCurrentStepData()).toBeNull();
  });

  test('isVisible returns false before tryShow', () => {
    const { overlay } = makeOverlay();
    expect(overlay.isVisible()).toBe(false);
  });
});

// ─── AC1 / Test Scenario 2: Player skips overlay immediately ──────────────────

describe('AC1 / Scenario 2 — Player skips overlay; skip is persisted; overlay never re-fires', () => {
  test('skip() dismisses the overlay immediately', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.skip('mvt-001');
    expect(overlay.isVisible()).toBe(false);
  });

  test('skip() writes chronograph_overlay_seen = true to save state', () => {
    const { overlay, saveState } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.skip('mvt-001');
    expect(saveState.get('chronograph_overlay_seen')).toBe(true);
  });

  test('wasSkipped returns true after skip()', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.skip('mvt-001');
    expect(overlay.wasSkipped()).toBe(true);
  });

  test('skip() emits chronograph_overlay_skipped', () => {
    const { overlay, received } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.skip('mvt-001');
    const evt = received.find((e) => e.name === EVENTS.CHRONOGRAPH_OVERLAY_SKIPPED);
    expect(evt).toBeDefined();
    expect(evt.payload.movementId).toBe('mvt-001');
  });

  test('after skip, shouldShow returns false', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.skip('mvt-001');
    expect(overlay.shouldShow()).toBe(false);
  });
});

// ─── AC1: dismiss() path ──────────────────────────────────────────────────────

describe('AC1 — Player dismisses overlay after reading (single action)', () => {
  test('dismiss() hides the overlay', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.dismiss('mvt-001');
    expect(overlay.isVisible()).toBe(false);
  });

  test('dismiss() persists chronograph_overlay_seen = true', () => {
    const { overlay, saveState } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.dismiss('mvt-001');
    expect(saveState.get('chronograph_overlay_seen')).toBe(true);
  });

  test('wasSkipped returns false after dismiss()', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.dismiss('mvt-001');
    expect(overlay.wasSkipped()).toBe(false);
  });

  test('dismiss() emits chronograph_overlay_dismissed', () => {
    const { overlay, received } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.dismiss('mvt-001');
    const evt = received.find((e) => e.name === EVENTS.CHRONOGRAPH_OVERLAY_DISMISSED);
    expect(evt).toBeDefined();
    expect(evt.payload.movementId).toBe('mvt-001');
  });
});

// ─── AC3 / Test Scenario 5: Overlay never re-fires for any subsequent chronograph ─

describe('AC3 / Scenario 5 — Overlay never re-fires after first encounter', () => {
  test('tryShow returns false on second chronograph after skip', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.skip('mvt-001');
    const shown = overlay.tryShow('mvt-002');
    expect(shown).toBe(false);
    expect(overlay.isVisible()).toBe(false);
  });

  test('tryShow returns false on second chronograph after dismiss', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    overlay.dismiss('mvt-001');
    const shown = overlay.tryShow('mvt-002');
    expect(shown).toBe(false);
  });

  test('player with chronograph_overlay_seen = true already set never sees overlay', () => {
    const { overlay } = makeOverlay({ chronograph_overlay_seen: true });
    const shown = overlay.tryShow('mvt-001');
    expect(shown).toBe(false);
  });
});

// ─── AC3 / AC4: Discovery mode disabled — overlay suppressed ──────────────────

describe('AC3 / AC4 — Discovery mode disabled: overlay suppressed', () => {
  test('shouldShow returns false when discovery_mode_enabled is false', () => {
    const { overlay } = makeOverlay({ discovery_mode_enabled: false });
    expect(overlay.shouldShow()).toBe(false);
  });

  test('tryShow returns false when discovery mode is off', () => {
    const { overlay } = makeOverlay({ discovery_mode_enabled: false });
    const shown = overlay.tryShow('mvt-001');
    expect(shown).toBe(false);
    expect(overlay.isVisible()).toBe(false);
  });

  test('overlay suppressed even for brand-new player if discovery mode was pre-disabled', () => {
    // chronograph_overlay_seen is still false, but discovery_mode_enabled is false
    const { overlay, saveState } = makeOverlay({ discovery_mode_enabled: false });
    expect(saveState.get('chronograph_overlay_seen')).toBe(false);
    expect(overlay.tryShow('mvt-001')).toBe(false);
  });
});

// ─── Step navigation ──────────────────────────────────────────────────────────

describe('ChronographDiscoveryOverlay — step navigation', () => {
  test('has the correct total number of steps', () => {
    const { overlay } = makeOverlay();
    expect(overlay.getTotalSteps()).toBe(DISCOVERY_STEPS.length);
  });

  test('there are at least 3 discovery steps (design requirement)', () => {
    expect(DISCOVERY_STEPS.length).toBeGreaterThanOrEqual(3);
  });

  test('nextStep advances through all steps', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    const steps = [];
    let step = overlay.getCurrentStepData();
    while (step) {
      steps.push(step.step);
      step = overlay.nextStep();
    }
    expect(steps).toEqual(DISCOVERY_STEPS.map((s) => s.step));
  });

  test('overlay is no longer visible after advancing past the last step', () => {
    const { overlay } = makeOverlay();
    overlay.tryShow('mvt-001');
    for (let i = 0; i <= DISCOVERY_STEPS.length; i++) {
      overlay.nextStep();
    }
    expect(overlay.isVisible()).toBe(false);
  });

  test('chronograph_overlay_seen is persisted after completing all steps', () => {
    const { overlay, saveState } = makeOverlay();
    overlay.tryShow('mvt-001');
    for (let i = 0; i <= DISCOVERY_STEPS.length; i++) {
      overlay.nextStep();
    }
    expect(saveState.get('chronograph_overlay_seen')).toBe(true);
  });

  test('each DISCOVERY_STEPS entry has a non-empty title and body', () => {
    DISCOVERY_STEPS.forEach((step) => {
      expect(typeof step.title).toBe('string');
      expect(step.title.length).toBeGreaterThan(0);
      expect(typeof step.body).toBe('string');
      expect(step.body.length).toBeGreaterThan(0);
    });
  });

  test('nextStep returns null when overlay is not visible', () => {
    const { overlay } = makeOverlay();
    expect(overlay.nextStep()).toBeNull();
  });
});

// ─── PlayerSaveState backward-compatibility ───────────────────────────────────

describe('PlayerSaveState — Issue #88 backward-compatible additions', () => {
  test('defaults chronograph_overlay_seen to false', () => {
    const save = new PlayerSaveState();
    expect(save.get('chronograph_overlay_seen')).toBe(false);
  });

  test('defaults discovery_mode_enabled to true', () => {
    const save = new PlayerSaveState();
    expect(save.get('discovery_mode_enabled')).toBe(true);
  });

  test('existing tutorial_first_fault_seen default is unchanged', () => {
    const save = new PlayerSaveState();
    expect(save.get('tutorial_first_fault_seen')).toBe(false);
  });

  test('initialState overrides discovery_mode_enabled default', () => {
    const save = new PlayerSaveState({ discovery_mode_enabled: false });
    expect(save.get('discovery_mode_enabled')).toBe(false);
  });

  test('snapshot includes the two new keys', () => {
    const save = new PlayerSaveState();
    const snap = save.snapshot();
    expect(snap).toHaveProperty('chronograph_overlay_seen', false);
    expect(snap).toHaveProperty('discovery_mode_enabled', true);
  });
});
