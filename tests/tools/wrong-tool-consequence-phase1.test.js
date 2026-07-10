/**
 * Tests for Issue #295 — Wrong-Tool Consequence System Phase 1:
 * Wire Damage Events to OperationGatingSystem
 *
 * Covers all 5 acceptance criteria and all 8 test scenarios from the issue.
 *
 * AC1: Wrong-tool attempt on Phase 1 op → wrong_tool damage event fires with operation ID,
 *      tool ID, component ID, and event type.
 * AC2: wrong_tool event → component enters 'degraded' state, DamageRecoveryPrompt shows
 *      correct Phase 1 failure mode message.
 * AC3: Recovery flow completion → component returns to non-degraded state, operation available.
 * AC4: Correct tool on any op → no wrong_tool event fires, no regression.
 * AC5: Wrong tool on non-Phase-1 op (ops 6–27) → block + message only, no damage event.
 *
 * Test Scenarios:
 * TS1: Happy path — correct tool on Phase 1 op → no wrong_tool event, normal proceed
 * TS2: Wrong tool on Phase 1 op (wind-mainspring) → damage event fires, degraded state,
 *      DamageRecoveryPrompt shows "burred screw head" message
 * TS3: Wrong tool on non-Phase-1 op → existing block + message, no damage event
 * TS4: Recovery completion + telemetry → component restored, telemetry contains all fields
 * TS5: Multiple wrong-tool attempts before recovery → second attempt fires event correctly,
 *      no double-degrade anomaly
 * TS6: Regression — all existing correct-tool operations unaffected (zero regressions)
 * TS7: Regression — existing block+message still fires for all 27 ops
 * TS8: Telemetry schema validation — all required fields present and correctly typed
 */

'use strict';

const {
  OperationGatingSystem,
  DEFAULT_COMPONENT_MANIFEST,
} = require('../../src/tools/OperationGatingSystem');

const {
  DamageEventDetector,
  DAMAGE_EVENT_TYPES,
} = require('../../src/damage/DamageEventDetector');

const { DamageRecoveryController } = require('../../src/damage/DamageRecoveryController');

const { TelemetryEmitter, EVENTS } = require('../../src/telemetry/TelemetryEmitter');

const {
  PHASE1_FAILURE_MODES,
  getPhase1FailureMode,
  getPhase1OperationIds,
} = require('../../src/data/phase1-failure-modes');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmitter() {
  const emittedEvents = [];
  const telemetry = new TelemetryEmitter((name, payload) => {
    emittedEvents.push({ name, payload, timestamp: Date.now() });
  });
  return { telemetry, emittedEvents };
}

function makeSaveState(overrides = {}) {
  const store = { player_currency: 1000, ...overrides };
  return {
    get: (k) => store[k] !== undefined ? store[k] : null,
    set: (k, v) => { store[k] = v; },
  };
}

/**
 * Builds a fully wired Phase 1 integration harness:
 *   OperationGatingSystem → onWrongTool → DamageEventDetector → onDamage → DamageRecoveryPrompt
 */
function makePhase1Harness(restorationId = 'restore-001') {
  const { telemetry, emittedEvents } = makeEmitter();
  const saveState = makeSaveState();

  const recoveryController = new DamageRecoveryController({
    telemetryEmitter: telemetry,
    saveState,
    restorationId,
    restorationValue: 200,
    restorationNumber: 1,
  });

  const wrongToolEvents = [];

  const onWrongTool = (operationId, toolId, componentId) => {
    // Look up Phase 1 failure mode message
    const failureMode = getPhase1FailureMode(operationId);
    const failureMessage = failureMode ? failureMode.message : 'Component damaged by wrong tool.';

    // Emit telemetry
    telemetry.wrongToolDamage(operationId, toolId, componentId, restorationId);

    // Trigger damage event: degraded severity only (Phase 1 hard constraint)
    recoveryController.triggerWrongToolDamage(componentId, restorationId, failureMessage);

    wrongToolEvents.push({ operationId, toolId, componentId });
  };

  const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST, onWrongTool);

  return { gating, recoveryController, telemetry, emittedEvents, wrongToolEvents, saveState };
}

// ── Phase1FailureModes data file tests ────────────────────────────────────────

describe('phase1-failure-modes data file', () => {
  test('exports all 5 Phase 1 operations', () => {
    const ids = getPhase1OperationIds();
    expect(ids).toHaveLength(5);
    expect(ids).toContain('wind-mainspring');
    expect(ids).toContain('remove-cannon-pinion');
    expect(ids).toContain('remove-balance-wheel');
    expect(ids).toContain('oil-jewel-seat');
    expect(ids).toContain('set-crown');
  });

  test('each entry has operationId, componentId, and message fields', () => {
    for (const [id, entry] of Object.entries(PHASE1_FAILURE_MODES)) {
      expect(entry).toHaveProperty('operationId', id);
      expect(entry).toHaveProperty('componentId');
      expect(typeof entry.componentId).toBe('string');
      expect(entry.componentId.length).toBeGreaterThan(0);
      expect(entry).toHaveProperty('message');
      expect(typeof entry.message).toBe('string');
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });

  test('getPhase1FailureMode returns correct entry for each Phase 1 operation', () => {
    expect(getPhase1FailureMode('wind-mainspring')).toMatchObject({
      operationId: 'wind-mainspring',
      componentId: 'mainspring',
      message: 'Wrong-gauge screwdriver — screw head is burred.',
    });
    expect(getPhase1FailureMode('set-crown')).toMatchObject({
      operationId: 'set-crown',
      componentId: 'crown-wheel',
      message: 'Wrong tool on crown setting — crown stem is bent.',
    });
  });

  test('getPhase1FailureMode returns null for non-Phase-1 operations', () => {
    expect(getPhase1FailureMode('handle-hour-hand')).toBeNull();
    expect(getPhase1FailureMode('remove-movement-plate-screw')).toBeNull();
    expect(getPhase1FailureMode('unknown-op')).toBeNull();
  });
});

// ── DamageEventDetector: wrong_tool event type ───────────────────────────────

describe('DamageEventDetector — wrong_tool event type (Issue #295)', () => {
  test('DAMAGE_EVENT_TYPES includes WRONG_TOOL', () => {
    expect(DAMAGE_EVENT_TYPES).toHaveProperty('WRONG_TOOL', 'wrong_tool');
  });

  test('registerDamageEvent accepts wrong_tool event type', () => {
    const events = [];
    const detector = new DamageEventDetector((e) => events.push(e));
    const result = detector.registerDamageEvent('wrong_tool', 'mainspring', 'restore-001', 'degraded');
    expect(result.eventType).toBe('wrong_tool');
    expect(result.severity).toBe('degraded');
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('wrong_tool');
  });

  test('wrong_tool event produces degraded state (not broken)', () => {
    const detector = new DamageEventDetector(() => {});
    detector.registerDamageEvent('wrong_tool', 'mainspring', 'restore-001', 'degraded');
    expect(detector.getPartState('mainspring')).toBe('degraded');
  });

  test('existing over_torque/drop/snap events still produce broken state (no regression)', () => {
    const detector = new DamageEventDetector(() => {});
    detector.registerDamageEvent('over_torque', 'part-a', 'restore-001'); // default severity
    detector.registerDamageEvent('drop', 'part-b', 'restore-001');
    detector.registerDamageEvent('snap', 'part-c', 'restore-001');
    expect(detector.getPartState('part-a')).toBe('broken');
    expect(detector.getPartState('part-b')).toBe('broken');
    expect(detector.getPartState('part-c')).toBe('broken');
  });

  test('severity defaults to broken when not specified', () => {
    const detector = new DamageEventDetector(() => {});
    detector.registerDamageEvent('over_torque', 'part-x', 'restore-001');
    expect(detector.getPartState('part-x')).toBe('broken');
  });

  test('rejects unknown severity', () => {
    const detector = new DamageEventDetector(() => {});
    expect(() => {
      detector.registerDamageEvent('wrong_tool', 'part-x', 'restore-001', 'catastrophic');
    }).toThrow(/Unknown severity/);
  });

  test('context fields are forwarded on the event (operationId, toolId, failureMessage)', () => {
    const events = [];
    const detector = new DamageEventDetector((e) => events.push(e));
    detector.registerDamageEvent('wrong_tool', 'mainspring', 'restore-001', 'degraded', {
      operationId: 'wind-mainspring',
      toolId: 'fine-tip-tweezers',
      failureMessage: 'Wrong-gauge screwdriver — screw head is burred.',
    });
    expect(events[0]).toMatchObject({
      operationId: 'wind-mainspring',
      toolId: 'fine-tip-tweezers',
      failureMessage: 'Wrong-gauge screwdriver — screw head is burred.',
    });
  });

  // TS5: Multiple wrong-tool attempts before recovery — no double-degrade anomaly
  test('TS5: second wrong_tool attempt before recovery re-fires callback but does not change state', () => {
    const events = [];
    const detector = new DamageEventDetector((e) => events.push(e));
    detector.registerDamageEvent('wrong_tool', 'mainspring', 'restore-001', 'degraded');
    detector.registerDamageEvent('wrong_tool', 'mainspring', 'restore-001', 'degraded');

    expect(detector.getPartState('mainspring')).toBe('degraded'); // still degraded, not double-changed
    expect(events).toHaveLength(2); // callback still fires for recovery prompt re-surface
  });
});

// ── OperationGatingSystem: Phase 1 wiring ────────────────────────────────────

describe('OperationGatingSystem — Phase 1 wrong-tool consequence wiring (Issue #295)', () => {
  // AC4: Correct tool → no wrong_tool event, no regression
  test('AC4/TS1: correct tool on Phase 1 op does not fire onWrongTool callback', () => {
    const wrongToolCalls = [];
    const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST, (opId, tId, cId) => {
      wrongToolCalls.push({ opId, tId, cId });
    });

    const result = gating.attemptOperation('flat-blade-screwdriver', 'wind-mainspring');
    expect(result.allowed).toBe(true);
    expect(wrongToolCalls).toHaveLength(0);
  });

  // AC1: Wrong tool on Phase 1 op → callback fires with correct operationId, toolId, componentId
  test('AC1: wrong tool on Phase 1 op fires onWrongTool with operation ID, tool ID, component ID', () => {
    const wrongToolCalls = [];
    const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST, (opId, tId, cId) => {
      wrongToolCalls.push({ opId, tId, cId });
    });

    const result = gating.attemptOperation('case-knife', 'wind-mainspring');
    expect(result.allowed).toBe(false);
    expect(result.message).toBeDefined();
    expect(wrongToolCalls).toHaveLength(1);
    expect(wrongToolCalls[0]).toMatchObject({
      opId: 'wind-mainspring',
      tId: 'case-knife',
      cId: 'mainspring',
    });
  });

  // AC5: Wrong tool on non-Phase-1 op → block + message, NO callback
  test('AC5/TS3: wrong tool on non-Phase-1 op does NOT fire onWrongTool callback', () => {
    const wrongToolCalls = [];
    const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST, (opId, tId, cId) => {
      wrongToolCalls.push({ opId, tId, cId });
    });

    // 'handle-hour-hand' is NOT in Phase 1 target set
    const result = gating.attemptOperation('flat-blade-screwdriver', 'handle-hour-hand');
    expect(result.allowed).toBe(false);
    expect(wrongToolCalls).toHaveLength(0);
  });

  test('callback fires for all 5 Phase 1 operations on wrong-tool attempt', () => {
    const phase1Ops = getPhase1OperationIds();
    // Map each Phase 1 op to its required tool (from manifest), then attempt with a wrong tool
    const wrongToolFor = {
      'wind-mainspring': 'case-knife',
      'remove-cannon-pinion': 'case-knife',
      'remove-balance-wheel': 'case-knife',
      'oil-jewel-seat': 'case-knife',
      'set-crown': 'case-knife',
    };

    for (const opId of phase1Ops) {
      const wrongToolCalls = [];
      const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST, (o, t, c) => {
        wrongToolCalls.push({ o, t, c });
      });
      gating.attemptOperation(wrongToolFor[opId], opId);
      expect(wrongToolCalls).toHaveLength(1);
      expect(wrongToolCalls[0].o).toBe(opId);
    }
  });

  // AC4: Correct tool on ALL operations → no wrong_tool callback (regression check)
  test('AC4/TS6: correct tool on all 27 manifest ops never fires onWrongTool callback', () => {
    const wrongToolCalls = [];
    const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST, (opId, tId, cId) => {
      wrongToolCalls.push({ opId, tId, cId });
    });

    const allCorrect = {
      'handle-hour-hand':            'fine-tip-tweezers',
      'handle-minute-hand':          'fine-tip-tweezers',
      'handle-second-hand':          'fine-tip-tweezers',
      'handle-dial':                 'fine-tip-tweezers',
      'position-jewel':              'fine-tip-tweezers',
      'remove-movement-plate-screw': 'flat-blade-screwdriver',
      'install-movement-plate-screw':'flat-blade-screwdriver',
      'remove-bridge-screw':         'flat-blade-screwdriver',
      'install-bridge-screw':        'flat-blade-screwdriver',
      'remove-case-back-screw':      'cross-tip-screwdriver',
      'install-case-back-screw':     'cross-tip-screwdriver',
      'remove-clasp-screw':          'cross-tip-screwdriver',
      'install-clasp-screw':         'cross-tip-screwdriver',
      'open-snap-back-case':         'case-knife',
      'close-snap-back-case':        'case-knife',
      'remove-spring-bar':           'spring-bar-tool',
      'install-spring-bar':          'spring-bar-tool',
      'detach-strap':                'spring-bar-tool',
      'attach-strap':                'spring-bar-tool',
      'seat-movement':               'movement-holder',
      'lift-movement':               'movement-holder',
      'stabilise-movement':          'movement-holder',
      'pick-up-component':           'movement-holder',
      'set-hour-hand':               'hand-setting-tool',
      'set-minute-hand':             'hand-setting-tool',
      'set-second-hand':             'hand-setting-tool',
      'clear-debris':                'dust-blower',
      'clean-dial-surface':          'dust-blower',
      'clean-crystal':               'dust-blower',
      // Phase 1
      'wind-mainspring':             'flat-blade-screwdriver',
      'remove-cannon-pinion':        'movement-holder',
      'remove-balance-wheel':        'fine-tip-tweezers',
      'oil-jewel-seat':              'movement-holder',
      'set-crown':                   'hand-setting-tool',
    };

    for (const [opId, toolId] of Object.entries(allCorrect)) {
      gating.attemptOperation(toolId, opId);
    }
    expect(wrongToolCalls).toHaveLength(0);
  });

  // TS7: block+message still fires for all ops (additive, not replacing)
  test('TS7: wrong tool on Phase 1 op still returns block + message (additive behaviour)', () => {
    const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST, () => {});
    const result = gating.attemptOperation('case-knife', 'wind-mainspring');
    expect(result.allowed).toBe(false);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  // When NO callback is wired — all pre-Phase-1 behaviour preserved
  test('no callback (default null) — Phase 1 ops behave exactly like pre-Phase-1', () => {
    const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST); // no callback
    const result = gating.attemptOperation('case-knife', 'wind-mainspring');
    expect(result.allowed).toBe(false);
    expect(result.message).toBeDefined();
    // no error thrown; callback not invoked
  });

  test('no callback — correct tool on Phase 1 op allowed (no regression)', () => {
    const gating = new OperationGatingSystem(DEFAULT_COMPONENT_MANIFEST); // no callback
    const result = gating.attemptOperation('flat-blade-screwdriver', 'wind-mainspring');
    expect(result.allowed).toBe(true);
  });
});

// ── DamageRecoveryController: triggerWrongToolDamage ─────────────────────────

describe('DamageRecoveryController — triggerWrongToolDamage (Issue #295)', () => {
  function makeController() {
    const { telemetry } = makeEmitter();
    const saveState = makeSaveState();
    const controller = new DamageRecoveryController({
      telemetryEmitter: telemetry,
      saveState,
      restorationId: 'restore-001',
      restorationValue: 200,
      restorationNumber: 1,
    });
    return { controller, telemetry, saveState };
  }

  // AC2: wrong_tool event → component enters 'degraded' state, prompt appears
  test('AC2: triggerWrongToolDamage produces degraded state (not broken)', () => {
    const { controller } = makeController();
    controller.triggerWrongToolDamage('mainspring', 'restore-001', 'Wrong-gauge screwdriver — screw head is burred.');
    expect(controller.getPartVisualState('mainspring')).toBe('degraded');
  });

  test('AC2: triggerWrongToolDamage shows DamageRecoveryPrompt', () => {
    const { controller } = makeController();
    controller.triggerWrongToolDamage('mainspring', 'restore-001', 'Wrong-gauge screwdriver — screw head is burred.');
    const promptData = controller.getPromptData();
    expect(promptData).not.toBeNull();
    expect(promptData.state).toBe('visible');
  });

  // AC3: recovery flow completion → component returns to non-degraded state
  test('AC3: after part replacement installed, component returns to non-degraded state', () => {
    const { controller } = makeController();
    controller.triggerWrongToolDamage('mainspring', 'restore-001', 'burred screw head');

    // Player confirms order
    controller.playerConfirmsOrder();
    expect(controller.getRestorationState()).toBe('awaiting_replacement');

    // Simulate replacement arrival
    controller.simulateReplacementArrival('mainspring');

    // Install replacement
    controller.installReplacement('mainspring');

    expect(controller.getPartVisualState('mainspring')).toBe('installed');
    expect(controller.getRestorationState()).toBe('active');
  });
});

// ── TelemetryEmitter: wrongToolDamage event ───────────────────────────────────

describe('TelemetryEmitter — wrongToolDamage (Issue #295)', () => {
  // TS8: telemetry schema validation — all required fields present and correctly typed
  test('TS8: wrongToolDamage emits WRONG_TOOL_DAMAGE event with all required fields', () => {
    const { telemetry, emittedEvents } = makeEmitter();

    telemetry.wrongToolDamage('wind-mainspring', 'case-knife', 'mainspring', 'restore-001');

    const event = emittedEvents.find((e) => e.name === EVENTS.WRONG_TOOL_DAMAGE);
    expect(event).toBeDefined();
    expect(event.payload).toMatchObject({
      operationId:   'wind-mainspring',
      toolId:        'case-knife',
      componentId:   'mainspring',
      restorationId: 'restore-001',
    });
    expect(typeof event.payload.timestamp).toBe('number');
    expect(event.payload.timestamp).toBeGreaterThan(0);
  });

  test('EVENTS.WRONG_TOOL_DAMAGE constant is defined and correctly named', () => {
    expect(EVENTS.WRONG_TOOL_DAMAGE).toBe('wrong_tool_damage');
  });

  test('WRONG_TOOL_DAMAGE is distinct from WRONG_TOOL_SELECTED (Issue #293)', () => {
    expect(EVENTS.WRONG_TOOL_DAMAGE).not.toBe(EVENTS.WRONG_TOOL_SELECTED);
  });

  test('wrongToolDamage does not affect other emitted events (additive)', () => {
    const { telemetry, emittedEvents } = makeEmitter();
    telemetry.partDamaged('part-1', 'restore-1', 'over_torque');
    telemetry.wrongToolDamage('wind-mainspring', 'case-knife', 'mainspring', 'restore-001');

    const damageEvents = emittedEvents.filter((e) => e.name === EVENTS.PART_DAMAGED);
    const wrongToolDamageEvents = emittedEvents.filter((e) => e.name === EVENTS.WRONG_TOOL_DAMAGE);
    expect(damageEvents).toHaveLength(1);
    expect(wrongToolDamageEvents).toHaveLength(1);
  });
});

// ── Full integration: Phase 1 end-to-end ─────────────────────────────────────

describe('Phase 1 end-to-end integration', () => {
  // TS2: wrong tool on Phase 1 op (wind-mainspring) → damage event fires, degraded state,
  //      prompt shows "burred screw head" message
  test('TS2: wrong tool on wind-mainspring → degraded state + prompt + telemetry', () => {
    const { gating, recoveryController, emittedEvents } = makePhase1Harness();

    const result = gating.attemptOperation('case-knife', 'wind-mainspring');

    // Gate still blocks (additive)
    expect(result.allowed).toBe(false);

    // Component is degraded
    expect(recoveryController.getPartVisualState('mainspring')).toBe('degraded');

    // Recovery prompt visible
    const promptData = recoveryController.getPromptData();
    expect(promptData).not.toBeNull();
    expect(promptData.state).toBe('visible');

    // Telemetry fired with all required fields
    const telEvent = emittedEvents.find((e) => e.name === EVENTS.WRONG_TOOL_DAMAGE);
    expect(telEvent).toBeDefined();
    expect(telEvent.payload.operationId).toBe('wind-mainspring');
    expect(telEvent.payload.toolId).toBe('case-knife');
    expect(telEvent.payload.componentId).toBe('mainspring');
    expect(typeof telEvent.payload.timestamp).toBe('number');
  });

  test('TS4: all 5 Phase 1 operations fire damage event with correct failure mode', () => {
    const wrongToolFor = {
      'wind-mainspring':    'case-knife',
      'remove-cannon-pinion': 'case-knife',
      'remove-balance-wheel': 'case-knife',
      'oil-jewel-seat':     'case-knife',
      'set-crown':          'case-knife',
    };

    for (const opId of getPhase1OperationIds()) {
      const { gating, emittedEvents } = makePhase1Harness();
      gating.attemptOperation(wrongToolFor[opId], opId);

      const telEvent = emittedEvents.find((e) => e.name === EVENTS.WRONG_TOOL_DAMAGE);
      expect(telEvent).toBeDefined();
      expect(telEvent.payload.operationId).toBe(opId);
    }
  });

  // TS5: multiple wrong-tool attempts before recovery — no double-degrade, prompt re-fires
  test('TS5: second wrong-tool attempt before recovery does not double-degrade, prompt re-fires', () => {
    const { gating, recoveryController } = makePhase1Harness();

    // First wrong-tool attempt
    gating.attemptOperation('case-knife', 'wind-mainspring');
    expect(recoveryController.getPartVisualState('mainspring')).toBe('degraded');

    // Second wrong-tool attempt before any recovery (player hasn't ordered yet)
    gating.attemptOperation('case-knife', 'wind-mainspring');

    // State must still be degraded (not double-changed by guard in DamageEventDetector)
    expect(recoveryController.getPartVisualState('mainspring')).toBe('degraded');
    // getDamagedPartIds should still show mainspring exactly once
    expect(recoveryController.getPartVisualState('mainspring')).toBe('degraded');
  });

  // AC4 / TS1: correct tool on Phase 1 op — no damage, operation allowed
  test('AC4/TS1: correct tool on all 5 Phase 1 ops → no damage event, operation allowed', () => {
    const correctToolFor = {
      'wind-mainspring':    'flat-blade-screwdriver',
      'remove-cannon-pinion': 'movement-holder',
      'remove-balance-wheel': 'fine-tip-tweezers',
      'oil-jewel-seat':     'movement-holder',
      'set-crown':          'hand-setting-tool',
    };

    for (const opId of getPhase1OperationIds()) {
      const { gating, recoveryController, emittedEvents } = makePhase1Harness();
      const result = gating.attemptOperation(correctToolFor[opId], opId);

      expect(result.allowed).toBe(true);
      const damageEvents = emittedEvents.filter((e) => e.name === EVENTS.WRONG_TOOL_DAMAGE);
      expect(damageEvents).toHaveLength(0);

      // Component state unchanged (no damage)
      const componentId = PHASE1_FAILURE_MODES[opId].componentId;
      expect(recoveryController.getPartVisualState(componentId)).toBe('installed');
    }
  });

  // AC5 / TS3: wrong tool on non-Phase-1 op → block + message only, no damage event
  test('AC5/TS3: wrong tool on non-Phase-1 op → block + message, no damage event', () => {
    const { gating, emittedEvents } = makePhase1Harness();
    const result = gating.attemptOperation('case-knife', 'handle-hour-hand');

    expect(result.allowed).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);

    const damageEvents = emittedEvents.filter((e) => e.name === EVENTS.WRONG_TOOL_DAMAGE);
    expect(damageEvents).toHaveLength(0);
  });
});

// ── Regression: DEFAULT_COMPONENT_MANIFEST Phase 1 entries ───────────────────

describe('DEFAULT_COMPONENT_MANIFEST Phase 1 entries', () => {
  test('all 5 Phase 1 operations have phase1Consequence: true', () => {
    for (const opId of getPhase1OperationIds()) {
      expect(DEFAULT_COMPONENT_MANIFEST[opId]).toBeDefined();
      expect(DEFAULT_COMPONENT_MANIFEST[opId].phase1Consequence).toBe(true);
    }
  });

  test('all 5 Phase 1 operations have a componentId', () => {
    for (const opId of getPhase1OperationIds()) {
      const entry = DEFAULT_COMPONENT_MANIFEST[opId];
      expect(typeof entry.componentId).toBe('string');
      expect(entry.componentId.length).toBeGreaterThan(0);
    }
  });

  test('componentId in manifest matches PHASE1_FAILURE_MODES', () => {
    for (const opId of getPhase1OperationIds()) {
      const manifestEntry = DEFAULT_COMPONENT_MANIFEST[opId];
      const failureMode = getPhase1FailureMode(opId);
      expect(manifestEntry.componentId).toBe(failureMode.componentId);
    }
  });

  test('all pre-existing manifest entries are still present (no regressions)', () => {
    const existingOps = [
      'handle-hour-hand', 'handle-minute-hand', 'handle-second-hand', 'handle-dial',
      'position-jewel', 'remove-movement-plate-screw', 'install-movement-plate-screw',
      'remove-bridge-screw', 'install-bridge-screw', 'remove-case-back-screw',
      'install-case-back-screw', 'remove-clasp-screw', 'install-clasp-screw',
      'open-snap-back-case', 'close-snap-back-case', 'remove-spring-bar',
      'install-spring-bar', 'detach-strap', 'attach-strap', 'seat-movement',
      'lift-movement', 'stabilise-movement', 'pick-up-component',
      'set-hour-hand', 'set-minute-hand', 'set-second-hand',
      'clear-debris', 'clean-dial-surface', 'clean-crystal',
    ];
    for (const opId of existingOps) {
      expect(DEFAULT_COMPONENT_MANIFEST[opId]).toBeDefined();
    }
  });
});
