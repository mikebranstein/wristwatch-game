/**
 * Tests for AssemblyFeedbackStateMachine — AC2, AC3, AC4.
 *
 * AC2: State 2 (near-correct proximity highlight) activates when a part enters the
 *      approach radius but has not yet achieved correct orientation — visually
 *      distinct from State 1 (neutral).
 * AC3: State 3 (wrong orientation) produces a unique visual indicator that is
 *      distinguishable from both State 2 and State 4 without prior game knowledge.
 * AC4: State 4 (locked-in confirmation) plays an audio cue that is audibly distinct
 *      from State 2 and State 3 audio cues; all 4 state audio cues are differentiable
 *      with screen visuals hidden.
 *
 * Test Scenarios covered:
 *   Scenario 1  — Happy path: State 2 → State 4 correct placement
 *   Scenario 2  — Wrong orientation: State 3 fires, no snap
 *   Scenario 3  — Approach proximity without correct orientation
 *   Scenario 4  — No interaction / far → State 1 (neutral)
 *   Scenario 5  — Final confirmation lock precision preserved
 *   Scenario 7  — Audio-only accessibility: all 4 audio cues distinct
 *   Scenario 9  — Multi-part sequence: state system fires correctly per part
 */

const {
  AssemblyFeedbackStateMachine,
  STATES,
  STATE_NAMES,
  STATE_VISUALS,
  STATE_AUDIO,
  MIN_DWELL_MS,
} = require('../../../src/reassembly/AssemblyFeedbackStateMachine');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFSM(minDwellMs = 0) {
  const audioLog = [];
  const visualLog = [];
  const fsm = new AssemblyFeedbackStateMachine({
    playAudio: (cue) => audioLog.push(cue),
    renderVisual: (v) => visualLog.push(v),
    minDwellMs,
  });
  return { fsm, audioLog, visualLog };
}

// ─── Constructor guards ───────────────────────────────────────────────────────

describe('AssemblyFeedbackStateMachine — constructor guards', () => {
  test('throws when playAudio is not a function', () => {
    expect(() => new AssemblyFeedbackStateMachine({
      playAudio: null,
      renderVisual: jest.fn(),
    })).toThrow(/playAudio/i);
  });

  test('throws when renderVisual is not a function', () => {
    expect(() => new AssemblyFeedbackStateMachine({
      playAudio: jest.fn(),
      renderVisual: null,
    })).toThrow(/renderVisual/i);
  });
});

// ─── Scenario 4 — State 1: Neutral (no interaction) ──────────────────────────

describe('Scenario 4 — State 1 (NEUTRAL): no feedback when outside approach zone', () => {
  test('part outside zone → State 1 NEUTRAL', () => {
    const { fsm } = makeFSM();
    const result = fsm.update('mainspring', 'outside', false);
    expect(result.state).toBe(STATES.NEUTRAL);
    expect(result.stateName).toBe('neutral');
  });

  test('canSnap is false in State 1', () => {
    const { fsm } = makeFSM();
    const result = fsm.update('mainspring', 'outside', false);
    expect(result.canSnap).toBe(false);
  });

  test('State 1 audioCue is null (no audio)', () => {
    const { fsm } = makeFSM();
    const result = fsm.update('mainspring', 'outside', false);
    expect(result.audioCue).toBeNull();
  });

  test('State 1 visuals: no highlight', () => {
    const result = { visuals: STATE_VISUALS[STATES.NEUTRAL] };
    expect(result.visuals.highlight).toBe(false);
  });
});

// ─── AC2 — Scenario 3: State 2 (PROXIMITY) ───────────────────────────────────

describe('AC2 — Scenario 3: State 2 (PROXIMITY) proximity highlight', () => {
  test('entering approach zone fires State 2 PROXIMITY', () => {
    const { fsm } = makeFSM();
    const result = fsm.update('mainspring', 'approach', false);
    expect(result.state).toBe(STATES.PROXIMITY);
    expect(result.stateName).toBe('proximity');
  });

  test('State 2 visuals have highlight: true (AC2 visual distinction from State 1)', () => {
    expect(STATE_VISUALS[STATES.PROXIMITY].highlight).toBe(true);
    expect(STATE_VISUALS[STATES.NEUTRAL].highlight).toBe(false);
  });

  test('State 2 color is distinct from State 1 (null color)', () => {
    expect(STATE_VISUALS[STATES.PROXIMITY].color).not.toBeNull();
    expect(STATE_VISUALS[STATES.NEUTRAL].color).toBeNull();
  });

  test('State 2 audio cue fires when entering approach zone', () => {
    const { fsm, audioLog } = makeFSM();
    fsm.update('mainspring', 'approach', false);
    expect(audioLog).toContain(STATE_AUDIO[STATES.PROXIMITY]);
  });

  test('State 2 canSnap is false', () => {
    const { fsm } = makeFSM();
    const result = fsm.update('mainspring', 'approach', false);
    expect(result.canSnap).toBe(false);
  });

  test('State 2 dwell window: still PROXIMITY within minDwellMs (design mitigation)', () => {
    // Use a non-zero dwell window to test the dwell behavior
    const { fsm } = makeFSM(MIN_DWELL_MS);
    const now = Date.now();
    // First tick enters approach zone
    fsm.update('mainspring', 'approach', false, now);
    // Immediately (0ms elapsed) — still in dwell window → PROXIMITY
    const result = fsm.update('mainspring', 'approach', false, now + 1);
    expect(result.state).toBe(STATES.PROXIMITY);
  });
});

// ─── AC3 — Scenario 2: State 3 (WRONG_ORI) ───────────────────────────────────

describe('AC3 — Scenario 2: State 3 (WRONG_ORI) wrong orientation indicator', () => {
  test('approach zone + wrong orientation after dwell → State 3 WRONG_ORI', () => {
    const { fsm } = makeFSM(0); // minDwellMs=0 to skip dwell
    const now = Date.now();
    fsm.update('mainspring', 'approach', false, now);       // enter approach
    const result = fsm.update('mainspring', 'approach', false, now + 1); // wrong orientation, past dwell
    expect(result.state).toBe(STATES.WRONG_ORI);
    expect(result.stateName).toBe('wrong_orientation');
  });

  test('State 3 visual is distinguishable from State 2 (different color)', () => {
    expect(STATE_VISUALS[STATES.WRONG_ORI].color).not.toBe(STATE_VISUALS[STATES.PROXIMITY].color);
  });

  test('State 3 visual is distinguishable from State 4 (different color)', () => {
    expect(STATE_VISUALS[STATES.WRONG_ORI].color).not.toBe(STATE_VISUALS[STATES.LOCKED_IN].color);
  });

  test('State 3 visual animation is distinct from State 2 and State 4', () => {
    expect(STATE_VISUALS[STATES.WRONG_ORI].animation).not.toBe(STATE_VISUALS[STATES.PROXIMITY].animation);
    expect(STATE_VISUALS[STATES.WRONG_ORI].animation).not.toBe(STATE_VISUALS[STATES.LOCKED_IN].animation);
  });

  test('State 3 has highlight: true', () => {
    expect(STATE_VISUALS[STATES.WRONG_ORI].highlight).toBe(true);
  });

  test('State 3 canSnap is false — wrong orientation cannot trigger final snap', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();
    fsm.update('mainspring', 'approach', false, now);
    const result = fsm.update('mainspring', 'approach', false, now + 1);
    expect(result.canSnap).toBe(false);
  });

  test('State 3 audio cue is distinct from State 2 audio cue (AC4)', () => {
    expect(STATE_AUDIO[STATES.WRONG_ORI]).not.toBe(STATE_AUDIO[STATES.PROXIMITY]);
    expect(STATE_AUDIO[STATES.WRONG_ORI]).not.toBeNull();
  });

  test('Scenario 2 — wrong orientation does not prematurely snap (confirmSnap-like check)', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();
    fsm.update('mainspring', 'approach', false, now);
    fsm.update('mainspring', 'approach', false, now + 1);
    expect(fsm.canSnap('mainspring')).toBe(false);
  });
});

// ─── AC4 — Scenario 1: State 4 (LOCKED_IN) ───────────────────────────────────

describe('AC4 — Scenario 1: State 4 (LOCKED_IN) locked-in confirmation', () => {
  test('lock zone + correct orientation → State 4 LOCKED_IN', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();
    fsm.update('mainspring', 'lock', true, now);        // enter lock zone
    const result = fsm.update('mainspring', 'lock', true, now + 1); // confirm
    expect(result.state).toBe(STATES.LOCKED_IN);
    expect(result.stateName).toBe('locked_in');
  });

  test('State 4 canSnap is true', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();
    fsm.update('mainspring', 'lock', true, now);
    const result = fsm.update('mainspring', 'lock', true, now + 1);
    expect(result.canSnap).toBe(true);
  });

  test('State 4 audio cue fires (distinct from State 2 and State 3)', () => {
    const { fsm, audioLog } = makeFSM(0);
    const now = Date.now();
    fsm.update('mainspring', 'lock', true, now);
    audioLog.length = 0; // clear prior events
    fsm.update('mainspring', 'lock', true, now + 1);
    expect(audioLog).toContain(STATE_AUDIO[STATES.LOCKED_IN]);
  });

  test('State 4 visual has highlight: true with distinct color from all other states', () => {
    expect(STATE_VISUALS[STATES.LOCKED_IN].highlight).toBe(true);
    expect(STATE_VISUALS[STATES.LOCKED_IN].color).not.toBe(STATE_VISUALS[STATES.NEUTRAL].color);
    expect(STATE_VISUALS[STATES.LOCKED_IN].color).not.toBe(STATE_VISUALS[STATES.PROXIMITY].color);
    expect(STATE_VISUALS[STATES.LOCKED_IN].color).not.toBe(STATE_VISUALS[STATES.WRONG_ORI].color);
  });

  test('State 4 has maximum glow intensity', () => {
    expect(STATE_VISUALS[STATES.LOCKED_IN].glow).toBe(1.0);
  });
});

// ─── AC4 — Scenario 7: Audio accessibility (all 4 cues distinct) ─────────────

describe('AC4 — Scenario 7: Audio-only accessibility — all 4 state audio cues distinct', () => {
  test('all non-null audio cue names are unique across states', () => {
    const cues = Object.values(STATE_AUDIO).filter(Boolean);
    const uniqueCues = new Set(cues);
    expect(uniqueCues.size).toBe(cues.length);
  });

  test('State 1 (NEUTRAL) has no audio cue (null)', () => {
    expect(STATE_AUDIO[STATES.NEUTRAL]).toBeNull();
  });

  test('State 2 (PROXIMITY) has a defined audio cue', () => {
    expect(STATE_AUDIO[STATES.PROXIMITY]).toBeTruthy();
  });

  test('State 3 (WRONG_ORI) has a defined audio cue', () => {
    expect(STATE_AUDIO[STATES.WRONG_ORI]).toBeTruthy();
  });

  test('State 4 (LOCKED_IN) has a defined audio cue', () => {
    expect(STATE_AUDIO[STATES.LOCKED_IN]).toBeTruthy();
  });

  test('State 2, 3, and 4 audio cues are all different from each other', () => {
    const s2 = STATE_AUDIO[STATES.PROXIMITY];
    const s3 = STATE_AUDIO[STATES.WRONG_ORI];
    const s4 = STATE_AUDIO[STATES.LOCKED_IN];
    expect(s2).not.toBe(s3);
    expect(s2).not.toBe(s4);
    expect(s3).not.toBe(s4);
  });
});

// ─── Scenario 5 — Final confirmation lock precision (AC1 + AC4) ───────────────

describe('Scenario 5 — Final confirmation lock precision preserved', () => {
  test('approach zone + correct orientation does NOT yield LOCKED_IN (must be in lock zone)', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();
    fsm.update('mainspring', 'approach', true, now);
    const result = fsm.update('mainspring', 'approach', true, now + 1);
    // approach + correct orientation → PROXIMITY (not LOCKED_IN)
    expect(result.state).toBe(STATES.PROXIMITY);
    expect(result.canSnap).toBe(false);
  });

  test('lock zone + wrong orientation does NOT yield LOCKED_IN', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();
    fsm.update('mainspring', 'lock', false, now);
    const result = fsm.update('mainspring', 'lock', false, now + 1);
    expect(result.state).toBe(STATES.WRONG_ORI);
    expect(result.canSnap).toBe(false);
  });
});

// ─── Scenario 9 — Multi-part sequence: state per part is independent ──────────

describe('Scenario 9 — Multi-part sequence: no state bleed-over between parts', () => {
  test('two parts maintain independent state', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();

    // Part A enters lock zone with correct orientation → LOCKED_IN
    fsm.update('mainspring', 'lock', true, now);
    fsm.update('mainspring', 'lock', true, now + 1);

    // Part B is outside zone → NEUTRAL
    fsm.update('escapement', 'outside', false, now);

    expect(fsm.getState('mainspring')).toBe(STATES.LOCKED_IN);
    expect(fsm.getState('escapement')).toBe(STATES.NEUTRAL);
  });

  test('resetting part A does not affect part B', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();

    fsm.update('mainspring', 'lock', true, now);
    fsm.update('mainspring', 'lock', true, now + 1);
    fsm.update('escapement', 'approach', false, now);

    fsm.reset('mainspring');

    expect(fsm.getState('mainspring')).toBe(STATES.NEUTRAL);
    expect(fsm.getState('escapement')).toBe(STATES.PROXIMITY);
  });

  test('resetAll resets all tracked parts to NEUTRAL', () => {
    const { fsm } = makeFSM(0);
    const now = Date.now();

    fsm.update('mainspring', 'approach', false, now);
    fsm.update('escapement', 'approach', false, now);

    fsm.resetAll();

    expect(fsm.getState('mainspring')).toBe(STATES.NEUTRAL);
    expect(fsm.getState('escapement')).toBe(STATES.NEUTRAL);
  });
});

// ─── renderVisual called on state change ──────────────────────────────────────

describe('AssemblyFeedbackStateMachine — renderVisual called on state transitions', () => {
  test('renderVisual is called when state changes from NEUTRAL to PROXIMITY', () => {
    const { fsm, visualLog } = makeFSM();
    fsm.update('mainspring', 'approach', false);
    const proximityRender = visualLog.find((v) => v.stateName === 'proximity');
    expect(proximityRender).toBeDefined();
    expect(proximityRender.partId).toBe('mainspring');
  });

  test('renderVisual is NOT called again when state remains the same', () => {
    const { fsm, visualLog } = makeFSM(MIN_DWELL_MS);
    const now = Date.now();
    fsm.update('mainspring', 'approach', false, now);
    const countAfterFirst = visualLog.length;
    // Same state (PROXIMITY within dwell) — no re-render
    fsm.update('mainspring', 'approach', false, now + 1);
    expect(visualLog.length).toBe(countAfterFirst);
  });
});

// ─── STATE_NAMES / STATES constants completeness ─────────────────────────────

describe('AssemblyFeedbackStateMachine — constants completeness', () => {
  test('STATES defines all 4 states with correct numbers', () => {
    expect(STATES.NEUTRAL).toBe(1);
    expect(STATES.PROXIMITY).toBe(2);
    expect(STATES.WRONG_ORI).toBe(3);
    expect(STATES.LOCKED_IN).toBe(4);
  });

  test('STATE_NAMES maps every STATES value to a string', () => {
    for (const [stateNum, name] of Object.entries(STATE_NAMES)) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test('STATE_VISUALS has an entry for every STATES value', () => {
    for (const stateNum of Object.values(STATES)) {
      expect(STATE_VISUALS[stateNum]).toBeDefined();
    }
  });

  test('STATE_AUDIO has an entry for every STATES value', () => {
    for (const stateNum of Object.values(STATES)) {
      // Entry exists (may be null for NEUTRAL)
      expect(Object.prototype.hasOwnProperty.call(STATE_AUDIO, stateNum)).toBe(true);
    }
  });
});
