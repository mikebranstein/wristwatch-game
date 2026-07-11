/**
 * Tests for AC2, AC3, AC4 — PartScaffoldingController
 *
 * AC2: Given discovery mode is active, when the chronograph assembly is presented,
 *      then chronograph-specific parts are revealed in at least 3 sequential groups
 *      (not all at once), each group labeled with a descriptive context cue.
 *
 * AC3 / AC4: When discovery mode is off, revealCallback is called once with all parts.
 *
 * Test Scenarios: 3 (sequential reveal), 4 (toggle off), 6 (persistence), 7 (spike config)
 */

const { PartScaffoldingController, MIN_GROUPS } = require('../../../javascript/tutorials/PartScaffoldingController');
const { PlayerSaveState } = require('../../../javascript/state/PlayerSaveState');
const { TelemetryEmitter, EVENTS } = require('../../../javascript/telemetry/TelemetryEmitter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_GROUPS = [
  { label: 'Base plate & bridges — 7 parts', partIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] },
  { label: 'Column wheel & levers — 6 parts', partIds: ['p8', 'p9', 'p10', 'p11', 'p12', 'p13'] },
  { label: 'Timing mechanism — 8 parts', partIds: ['p14', 'p15', 'p16', 'p17', 'p18', 'p19', 'p20', 'p21'] },
  { label: 'Pushers & coupling — 5 parts', partIds: ['p22', 'p23', 'p24', 'p25', 'p26'] },
];

function makeController(initialSaveData = {}, groups = SAMPLE_GROUPS) {
  const received = [];
  const hook = (name, payload) => received.push({ name, payload });
  const telemetry = new TelemetryEmitter(hook);
  const saveState = new PlayerSaveState(initialSaveData);
  const revealedGroups = [];
  const revealCallback = (group) => revealedGroups.push(group);
  const controller = new PartScaffoldingController(saveState, telemetry, groups, revealCallback);
  return { controller, saveState, telemetry, received, revealedGroups };
}

// ─── AC2 / Scenario 3: Sequential group reveal in discovery mode ──────────────

describe('AC2 / Scenario 3 — Discovery mode: parts revealed in sequential groups', () => {
  test('isActive returns true when discovery_mode_enabled is true (default)', () => {
    const { controller } = makeController();
    expect(controller.isActive()).toBe(true);
  });

  test('start() reveals only the first group immediately', () => {
    const { controller, revealedGroups } = makeController();
    controller.start('mvt-001');
    expect(revealedGroups).toHaveLength(1);
    expect(revealedGroups[0].label).toBe(SAMPLE_GROUPS[0].label);
  });

  test('revealNextGroup() reveals subsequent groups one at a time', () => {
    const { controller, revealedGroups } = makeController();
    controller.start('mvt-001');
    controller.revealNextGroup(); // group 2
    expect(revealedGroups).toHaveLength(2);
    controller.revealNextGroup(); // group 3
    expect(revealedGroups).toHaveLength(3);
  });

  test('all 4 groups are eventually revealed via sequential revealNextGroup calls', () => {
    const { controller, revealedGroups } = makeController();
    controller.start('mvt-001');
    while (!controller.isComplete()) {
      controller.revealNextGroup();
    }
    expect(revealedGroups).toHaveLength(SAMPLE_GROUPS.length);
    revealedGroups.forEach((g, i) => {
      expect(g.label).toBe(SAMPLE_GROUPS[i].label);
    });
  });

  test('each revealed group emits part_group_revealed with correct index and label', () => {
    const { controller, received } = makeController();
    controller.start('mvt-001');
    controller.revealNextGroup();
    const evts = received.filter((e) => e.name === EVENTS.PART_GROUP_REVEALED);
    expect(evts).toHaveLength(2);
    expect(evts[0].payload.groupIndex).toBe(0);
    expect(evts[0].payload.label).toBe(SAMPLE_GROUPS[0].label);
    expect(evts[1].payload.groupIndex).toBe(1);
    expect(evts[1].payload.label).toBe(SAMPLE_GROUPS[1].label);
  });

  test('part_group_revealed payload carries partCount', () => {
    const { controller, received } = makeController();
    controller.start('mvt-001');
    const evt = received.find((e) => e.name === EVENTS.PART_GROUP_REVEALED);
    expect(evt.payload.partCount).toBe(SAMPLE_GROUPS[0].partIds.length);
  });

  test('getCurrentGroupIndex returns -1 before start()', () => {
    const { controller } = makeController();
    expect(controller.getCurrentGroupIndex()).toBe(-1);
  });

  test('getCurrentGroupIndex reflects the most recently revealed group', () => {
    const { controller } = makeController();
    controller.start('mvt-001');
    expect(controller.getCurrentGroupIndex()).toBe(0);
    controller.revealNextGroup();
    expect(controller.getCurrentGroupIndex()).toBe(1);
  });

  test('isComplete returns false before start()', () => {
    const { controller } = makeController();
    expect(controller.isComplete()).toBe(false);
  });

  test('isComplete returns true after all groups are revealed', () => {
    const { controller } = makeController();
    controller.start('mvt-001');
    while (!controller.isComplete()) {
      controller.revealNextGroup();
    }
    expect(controller.isComplete()).toBe(true);
  });

  test('revealNextGroup returns false after all groups are revealed (no overflow)', () => {
    const { controller } = makeController();
    controller.start('mvt-001');
    while (!controller.isComplete()) {
      controller.revealNextGroup();
    }
    const result = controller.revealNextGroup();
    expect(result).toBe(false);
  });

  test('getGroups returns a copy of the configured groups', () => {
    const { controller } = makeController();
    const groups = controller.getGroups();
    expect(groups).toHaveLength(SAMPLE_GROUPS.length);
    expect(groups[0].label).toBe(SAMPLE_GROUPS[0].label);
  });
});

// ─── AC2: Minimum 3 groups validation ─────────────────────────────────────────

describe('AC2 — Minimum 3 groups required in discovery mode', () => {
  test('MIN_GROUPS constant equals 3', () => {
    expect(MIN_GROUPS).toBe(3);
  });

  test('validate() does not throw with exactly 3 groups', () => {
    const twoGroups = SAMPLE_GROUPS.slice(0, 3);
    const { controller } = makeController({}, twoGroups);
    expect(() => controller.validate()).not.toThrow();
  });

  test('validate() throws when fewer than 3 groups configured in discovery mode', () => {
    const twoGroups = SAMPLE_GROUPS.slice(0, 2);
    const { controller } = makeController({}, twoGroups);
    expect(() => controller.validate()).toThrow(/at least 3 groups/);
  });

  test('validate() does NOT throw with fewer than 3 groups when discovery mode is off', () => {
    const oneGroup = SAMPLE_GROUPS.slice(0, 1);
    const { controller } = makeController({ discovery_mode_enabled: false }, oneGroup);
    expect(() => controller.validate()).not.toThrow();
  });
});

// ─── AC3 / AC4 / Scenario 4 & 6: Normal mode (discovery off) ─────────────────

describe('AC3 / AC4 / Scenario 4 — Discovery mode OFF: all parts surface at once', () => {
  test('isActive returns false when discovery_mode_enabled is false', () => {
    const { controller } = makeController({ discovery_mode_enabled: false });
    expect(controller.isActive()).toBe(false);
  });

  test('start() calls revealCallback once with ALL parts when discovery mode is off', () => {
    const { controller, revealedGroups } = makeController({ discovery_mode_enabled: false });
    controller.start('mvt-001');
    expect(revealedGroups).toHaveLength(1);
    const allIds = SAMPLE_GROUPS.flatMap((g) => g.partIds);
    expect(revealedGroups[0].partIds).toEqual(allIds);
  });

  test('revealNextGroup returns false when discovery mode is off', () => {
    const { controller } = makeController({ discovery_mode_enabled: false });
    controller.start('mvt-001');
    expect(controller.revealNextGroup()).toBe(false);
  });

  test('no part_group_revealed events fire in normal mode', () => {
    const { controller, received } = makeController({ discovery_mode_enabled: false });
    controller.start('mvt-001');
    const evts = received.filter((e) => e.name === EVENTS.PART_GROUP_REVEALED);
    expect(evts).toHaveLength(0);
  });
});

// ─── Scenario 7: Spike #87 config dependency — groups as construction-time param ──

describe('Scenario 7 — Spike #87 config: groups are a construction-time parameter', () => {
  test('controller accepts any groups array at construction time (no hardcoding)', () => {
    const spikeConstrainedGroups = [
      { label: 'Tier 1 — 5 parts', partIds: ['a1', 'a2', 'a3', 'a4', 'a5'] },
      { label: 'Tier 2 — 5 parts', partIds: ['b1', 'b2', 'b3', 'b4', 'b5'] },
      { label: 'Tier 3 — 5 parts', partIds: ['c1', 'c2', 'c3', 'c4', 'c5'] },
    ];
    const { controller, revealedGroups } = makeController({}, spikeConstrainedGroups);
    controller.start('mvt-spike');
    expect(revealedGroups[0].label).toBe('Tier 1 — 5 parts');
    expect(revealedGroups[0].partIds).toHaveLength(5);
  });

  test('construction with 6 groups (CONDITIONAL_GO scenario) works without code change', () => {
    const sixGroups = Array.from({ length: 6 }, (_, i) => ({
      label: `Group ${i + 1} — 4 parts`,
      partIds: [`p${i * 4 + 1}`, `p${i * 4 + 2}`, `p${i * 4 + 3}`, `p${i * 4 + 4}`],
    }));
    const { controller } = makeController({}, sixGroups);
    expect(controller.getGroups()).toHaveLength(6);
    expect(() => controller.validate()).not.toThrow();
  });
});

// ─── Constructor guards ────────────────────────────────────────────────────────

describe('PartScaffoldingController — constructor guards', () => {
  function makeParts() {
    const saveState = new PlayerSaveState();
    const telemetry = new TelemetryEmitter(() => {});
    return { saveState, telemetry };
  }

  test('throws if groups is not an array', () => {
    const { saveState, telemetry } = makeParts();
    expect(() => new PartScaffoldingController(saveState, telemetry, null, () => {})).toThrow(
      /groups must be an array/
    );
  });

  test('throws if revealCallback is not a function', () => {
    const { saveState, telemetry } = makeParts();
    expect(() => new PartScaffoldingController(saveState, telemetry, [], 'not-a-fn')).toThrow(
      /revealCallback must be a function/
    );
  });

  test('revealNextGroup returns false before start() is called', () => {
    const { controller } = makeController();
    expect(controller.revealNextGroup()).toBe(false);
  });
});
