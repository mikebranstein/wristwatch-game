/**
 * Tests for Issue #123 — Progressive Reassembly Success Signals: Phase 2 Full Rollout.
 *
 * Acceptance Criteria covered:
 *   AC1 — Correct seating of ANY component triggers audio click (<200ms) and visual
 *          highlight (0.5–2s) across all 13 SNAP_ZONES components.
 *   AC2 — Incorrect placement attempts do NOT trigger audio or visual feedback.
 *   AC3 — 'Highlight remaining work' toggle is accessible from ReassemblyScreen;
 *          when ON all unseated components receive ambient highlight, clearing
 *          individually as each is correctly seated.
 *   AC4 — Analytics events `reassembly_component_seated_success` and
 *          `highlight_toggle_used` emitted correctly for all components and
 *          toggle interactions.
 *   AC5 — Abandonment tracking (mid-reassembly) regression: session abandonment
 *          event fires for all sessions (no cohort gating).
 */

const { ReassemblyScreen }       = require('../../../src/reassembly/ReassemblyScreen');
const { ReassemblyMicroConfirmationController, COHORTS, AUDIO_CUE } =
  require('../../../src/reassembly/ReassemblyMicroConfirmationController');
const { TelemetryEmitter, EVENTS } = require('../../../src/telemetry/TelemetryEmitter');
const { SNAP_ZONES }              = require('../../../src/reassembly/SnapZoneTolerance');
const { STATES }                  = require('../../../src/reassembly/AssemblyFeedbackStateMachine');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTelemetry() {
  const log = [];
  const emitter = new TelemetryEmitter((name, payload) => log.push({ name, payload }));
  return { emitter, log };
}

/**
 * Build a fully-wired ReassemblyScreen with an optional highlightRenderHook and
 * an injected ReassemblyMicroConfirmationController (no cohort gating in Phase 2).
 *
 * Uses a SHARED instrumentationHook so that events emitted by both the controller's
 * TelemetryEmitter and the screen's TelemetryEmitter all land in hookLog.
 */
function makePhase2Screen(opts = {}) {
  const hookLog      = [];
  const audioLog     = [];
  const visualLog    = [];
  const highlightLog = [];
  // Single shared hook: events from ALL TelemetryEmitter instances (screen + controller) go here
  const sharedHook   = (name, payload) => hookLog.push({ name, payload });
  const emitter      = new TelemetryEmitter(sharedHook);

  const controller = new ReassemblyMicroConfirmationController({
    telemetry:       emitter,
    playAudio:       (cue) => audioLog.push(cue),
    renderHighlight: (evt) => highlightLog.push(evt),
    isMuted:         opts.isMuted || (() => false),
    setTimeoutFn:    (fn) => fn(), // execute immediately for test synchrony
  });

  const screen = new ReassemblyScreen({
    instrumentationHook:         sharedHook,  // same hook → same hookLog
    playAudio:                   (cue) => audioLog.push(cue),
    renderVisual:                (v)   => visualLog.push(v),
    sessionId:                   opts.sessionId || 'session-phase2',
    minDwellMs:                  0,
    microConfirmationController: controller,
    highlightRenderHook:         opts.highlightRenderHook || null,
  });

  return { screen, controller, hookLog, audioLog, visualLog, highlightLog, emitter };
}

/**
 * Helper: snap a part successfully into the ReassemblyScreen.
 */
function snapPart(screen, partId, now = Date.now()) {
  screen.onPartMoved(partId, 10, true, now);
  screen.onPartMoved(partId, 10, true, now + 1);
  return screen.confirmSnap(partId);
}

// ─── SNAP_ZONES catalog ────────────────────────────────────────────────────────

describe('SNAP_ZONES — all 13 watch parts defined', () => {
  const ALL_PARTS = [
    'mainspring', 'barrel', 'barrel_bridge', 'escape_wheel', 'pallet_fork',
    'balance_wheel', 'balance_cock', 'cannon_pinion', 'minute_wheel',
    'hour_wheel', 'dial', 'crown', 'stem',
  ];

  test('SNAP_ZONES exports exactly 13 parts', () => {
    expect(Object.keys(SNAP_ZONES)).toHaveLength(13);
  });

  test.each(ALL_PARTS)('SNAP_ZONES includes %s', (partId) => {
    expect(SNAP_ZONES).toHaveProperty(partId);
  });
});

// ─── AC1 — All 13 components pre-registered at construction ──────────────────

describe('AC1 — ReassemblyScreen pre-registers all 13 SNAP_ZONES parts at construction', () => {
  test('all 13 SNAP_ZONES parts are queryable without registerPart call', () => {
    const { screen } = makePhase2Screen();
    const snapZone = screen.getSnapZone();
    for (const partId of Object.keys(SNAP_ZONES)) {
      expect(() => snapZone.getTolerances(partId)).not.toThrow();
    }
  });

  test('all 13 parts return hasPart=true without explicit registration', () => {
    const { screen } = makePhase2Screen();
    const snapZone = screen.getSnapZone();
    for (const partId of Object.keys(SNAP_ZONES)) {
      expect(snapZone.hasPart(partId)).toBe(true);
    }
  });

  // The 3 additional parts not in DEFAULT_TOLERANCES
  const EXTRA_PARTS = ['barrel', 'barrel_bridge', 'balance_cock', 'crown', 'stem'];
  test.each(EXTRA_PARTS)('extra part %s is registered (not in DEFAULT_TOLERANCES)', (partId) => {
    const { screen } = makePhase2Screen();
    expect(screen.getSnapZone().hasPart(partId)).toBe(true);
    expect(() => screen.getSnapZone().getZone(partId, 10)).not.toThrow();
  });
});

// ─── AC1 — Audio + visual feedback fires for every component ─────────────────

describe('AC1 — Correct seating of ANY reassembly component triggers audio + visual (Phase 2 full rollout)', () => {
  const ALL_PARTS = Object.keys(SNAP_ZONES);

  test.each(ALL_PARTS)('correct seating of %s triggers audio click (AC1)', (partId) => {
    const { screen, audioLog } = makePhase2Screen();
    const result = snapPart(screen, partId);
    expect(result.success).toBe(true);
    expect(audioLog.filter((c) => c === AUDIO_CUE).length).toBeGreaterThanOrEqual(1);
  });

  test.each(ALL_PARTS)('correct seating of %s triggers visual highlight active=true (AC1)', (partId) => {
    const { screen, highlightLog } = makePhase2Screen();
    const result = snapPart(screen, partId);
    expect(result.success).toBe(true);
    expect(highlightLog.find((h) => h.active === true && h.partId === partId)).toBeDefined();
  });

  test.each(ALL_PARTS)('visual highlight for %s auto-clears (active=false, AC1 0.5–2s spec)', (partId) => {
    const { screen, highlightLog } = makePhase2Screen();
    snapPart(screen, partId);
    expect(highlightLog.find((h) => h.active === false && h.partId === partId)).toBeDefined();
  });
});

// ─── AC2 — Incorrect placement: no feedback ───────────────────────────────────

describe('AC2 — Incorrect placement attempts do not trigger audio or visual feedback', () => {
  test('confirmSnap failure (not in locked-in state) does not fire audio click', () => {
    const { screen, audioLog } = makePhase2Screen();
    // No onPartMoved → FSM is NEUTRAL → confirmSnap fails
    const result = screen.confirmSnap('mainspring');
    expect(result.success).toBe(false);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
  });

  test('wrong orientation (WRONG_ORI state) does not fire audio or highlight', () => {
    const { screen, audioLog, highlightLog } = makePhase2Screen();
    const now = Date.now();
    screen.onPartMoved('barrel', 40, false, now);
    screen.onPartMoved('barrel', 40, false, now + 1);
    const result = screen.confirmSnap('barrel');
    expect(result.success).toBe(false);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(0);
  });

  test('approach zone without lock (PROXIMITY state) does not fire feedback', () => {
    const { screen, audioLog, highlightLog } = makePhase2Screen();
    screen.onPartMoved('balance_cock', 40, true);
    const result = screen.confirmSnap('balance_cock');
    expect(result.success).toBe(false);
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
    expect(highlightLog.filter((h) => h.active === true)).toHaveLength(0);
  });

  test('multiple incorrect placements for different components produce zero analytics events', () => {
    const { screen, hookLog } = makePhase2Screen();
    screen.confirmSnap('stem');
    screen.confirmSnap('crown');
    screen.confirmSnap('dial');
    expect(hookLog.filter((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toHaveLength(0);
  });
});

// ─── AC1/AC2 — Audio independence from mute state ─────────────────────────────

describe('Audio muted: no audio BUT visual highlight and analytics still fire (AC1 independence)', () => {
  test('audio does NOT play when isMuted returns true', () => {
    const { screen, audioLog } = makePhase2Screen({ isMuted: () => true });
    snapPart(screen, 'mainspring');
    expect(audioLog.filter((c) => c === AUDIO_CUE)).toHaveLength(0);
  });

  test('visual highlight DOES fire when audio is muted', () => {
    const { screen, highlightLog } = makePhase2Screen({ isMuted: () => true });
    snapPart(screen, 'mainspring');
    expect(highlightLog.find((h) => h.active === true)).toBeDefined();
  });

  test('analytics event DOES fire when audio is muted', () => {
    const { screen, hookLog } = makePhase2Screen({ isMuted: () => true });
    snapPart(screen, 'pallet_fork');
    expect(hookLog.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBeDefined();
  });
});

// ─── AC3 — Highlight remaining work toggle ────────────────────────────────────

describe('AC3 — Highlight remaining work toggle accessible from ReassemblyScreen', () => {
  test('toggleHighlightRemaining() is a function on ReassemblyScreen', () => {
    const { screen } = makePhase2Screen();
    expect(typeof screen.toggleHighlightRemaining).toBe('function');
  });

  test('toggle defaults to OFF (false) at construction', () => {
    const { screen } = makePhase2Screen();
    expect(screen.getHighlightToggle()).toBe(false);
  });

  test('first toggle call turns toggle ON and returns true', () => {
    const { screen } = makePhase2Screen();
    const result = screen.toggleHighlightRemaining();
    expect(result).toBe(true);
    expect(screen.getHighlightToggle()).toBe(true);
  });

  test('second toggle call turns toggle OFF and returns false', () => {
    const { screen } = makePhase2Screen();
    screen.toggleHighlightRemaining();
    const result = screen.toggleHighlightRemaining();
    expect(result).toBe(false);
    expect(screen.getHighlightToggle()).toBe(false);
  });

  test('toggle ON calls highlightRenderHook with { active: true, unseatedParts }', () => {
    const renderLog = [];
    const { screen } = makePhase2Screen({ highlightRenderHook: (evt) => renderLog.push(evt) });
    screen.toggleHighlightRemaining();
    expect(renderLog).toHaveLength(1);
    expect(renderLog[0].active).toBe(true);
    expect(Array.isArray(renderLog[0].unseatedParts)).toBe(true);
  });

  test('unseatedParts on first toggle includes all 13 SNAP_ZONES parts (none seated yet)', () => {
    const renderLog = [];
    const { screen } = makePhase2Screen({ highlightRenderHook: (evt) => renderLog.push(evt) });
    screen.toggleHighlightRemaining();
    expect(renderLog[0].unseatedParts).toHaveLength(13);
    for (const partId of Object.keys(SNAP_ZONES)) {
      expect(renderLog[0].unseatedParts).toContain(partId);
    }
  });

  test('toggle OFF calls highlightRenderHook with { active: false, unseatedParts: [] }', () => {
    const renderLog = [];
    const { screen } = makePhase2Screen({ highlightRenderHook: (evt) => renderLog.push(evt) });
    screen.toggleHighlightRemaining(); // ON
    renderLog.length = 0;
    screen.toggleHighlightRemaining(); // OFF
    expect(renderLog).toHaveLength(1);
    expect(renderLog[0].active).toBe(false);
    expect(renderLog[0].unseatedParts).toHaveLength(0);
  });

  test('highlighting with no highlightRenderHook injected is a safe no-op', () => {
    const { screen } = makePhase2Screen(); // no highlightRenderHook
    expect(() => screen.toggleHighlightRemaining()).not.toThrow();
  });
});

// ─── AC3 — Ambient highlight clears individually as parts are seated ──────────

describe('AC3 — Ambient highlight clears individually as each component is correctly seated', () => {
  test('successful snap calls highlightRenderHook with { partId, active: false, clearAmbient: true } when toggle is ON', () => {
    const renderLog = [];
    const { screen } = makePhase2Screen({ highlightRenderHook: (evt) => renderLog.push(evt) });
    screen.toggleHighlightRemaining(); // turn ON
    renderLog.length = 0; // clear the toggle-on call
    snapPart(screen, 'mainspring');
    expect(renderLog).toHaveLength(1);
    expect(renderLog[0].partId).toBe('mainspring');
    expect(renderLog[0].active).toBe(false);
    expect(renderLog[0].clearAmbient).toBe(true);
  });

  test('successful snap does NOT call highlightRenderHook when toggle is OFF', () => {
    const renderLog = [];
    const { screen } = makePhase2Screen({ highlightRenderHook: (evt) => renderLog.push(evt) });
    // toggle is OFF by default
    snapPart(screen, 'mainspring');
    expect(renderLog).toHaveLength(0);
  });

  test('unseatedParts list shrinks after each correct seating', () => {
    const renderLog = [];
    const { screen } = makePhase2Screen({ highlightRenderHook: (evt) => renderLog.push(evt) });

    screen.toggleHighlightRemaining(); // ON — unseatedParts = 13
    const firstToggleCall = renderLog[renderLog.length - 1];
    expect(firstToggleCall.unseatedParts).toHaveLength(13);

    // Seat 3 parts
    snapPart(screen, 'mainspring');
    snapPart(screen, 'barrel');
    snapPart(screen, 'dial');

    // Toggle OFF then ON again to get fresh unseatedParts
    screen.toggleHighlightRemaining(); // OFF
    screen.toggleHighlightRemaining(); // ON — should now show 10 unseated
    const refreshedToggleCall = renderLog[renderLog.length - 1];
    expect(refreshedToggleCall.active).toBe(true);
    expect(refreshedToggleCall.unseatedParts).toHaveLength(10);
    for (const p of ['mainspring', 'barrel', 'dial']) {
      expect(refreshedToggleCall.unseatedParts).not.toContain(p);
    }
  });

  test('out-of-order seating: each component highlight clears independently', () => {
    const renderLog = [];
    const { screen } = makePhase2Screen({ highlightRenderHook: (evt) => renderLog.push(evt) });
    screen.toggleHighlightRemaining(); // ON
    renderLog.length = 0;

    // Seat in a non-sequential order
    snapPart(screen, 'stem');
    snapPart(screen, 'balance_wheel');
    snapPart(screen, 'cannon_pinion');

    const clearCalls = renderLog.filter((e) => e.clearAmbient === true);
    expect(clearCalls).toHaveLength(3);
    expect(clearCalls.map((c) => c.partId).sort()).toEqual(['balance_wheel', 'cannon_pinion', 'stem'].sort());
  });
});

// ─── AC4 — Analytics events ────────────────────────────────────────────────────

describe('AC4 — Analytics: reassembly_component_seated_success emitted for all components', () => {
  const ALL_PARTS = Object.keys(SNAP_ZONES);

  test.each(ALL_PARTS)('correct seating of %s emits reassembly_component_seated_success (AC4)', (partId) => {
    const { screen, hookLog } = makePhase2Screen();
    snapPart(screen, partId);
    expect(hookLog.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)).toBeDefined();
  });

  test('analytics event includes correct componentId', () => {
    const { screen, hookLog } = makePhase2Screen();
    snapPart(screen, 'escape_wheel');
    const evt = hookLog.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS);
    expect(evt.payload.componentId).toBe('escape_wheel');
  });

  test('analytics event includes a timestamp', () => {
    const { screen, hookLog } = makePhase2Screen();
    const before = Date.now();
    snapPart(screen, 'hour_wheel');
    const after = Date.now();
    const evt = hookLog.find((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS);
    expect(evt.payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(evt.payload.timestamp).toBeLessThanOrEqual(after);
  });

  test('no duplicate analytics events for the same part without undo', () => {
    const { screen, hookLog } = makePhase2Screen();
    // Second confirmSnap on already-seated part fails → no second event
    snapPart(screen, 'minute_wheel');
    // Try to seat again (FSM reset, so need to move again)
    const now = Date.now() + 10;
    screen.onPartMoved('minute_wheel', 10, true, now);
    screen.onPartMoved('minute_wheel', 10, true, now + 1);
    screen.confirmSnap('minute_wheel');
    expect(
      hookLog.filter((e) => e.name === EVENTS.REASSEMBLY_COMPONENT_SEATED_SUCCESS)
    ).toHaveLength(1);
  });
});

describe('AC4 — Analytics: highlight_toggle_used emitted on each toggle interaction', () => {
  test('EVENTS.HIGHLIGHT_TOGGLE_USED is defined', () => {
    expect(EVENTS.HIGHLIGHT_TOGGLE_USED).toBe('highlight_toggle_used');
  });

  test('toggleHighlightRemaining() emits highlight_toggle_used event', () => {
    const { screen, hookLog } = makePhase2Screen();
    screen.toggleHighlightRemaining();
    expect(hookLog.find((e) => e.name === EVENTS.HIGHLIGHT_TOGGLE_USED)).toBeDefined();
  });

  test('highlight_toggle_used payload includes state="on" when toggled on', () => {
    const { screen, hookLog } = makePhase2Screen();
    screen.toggleHighlightRemaining();
    const evt = hookLog.find((e) => e.name === EVENTS.HIGHLIGHT_TOGGLE_USED);
    expect(evt.payload.state).toBe('on');
  });

  test('highlight_toggle_used payload includes state="off" when toggled off', () => {
    const { screen, hookLog } = makePhase2Screen();
    screen.toggleHighlightRemaining(); // ON
    hookLog.length = 0;
    screen.toggleHighlightRemaining(); // OFF
    const evt = hookLog.find((e) => e.name === EVENTS.HIGHLIGHT_TOGGLE_USED);
    expect(evt.payload.state).toBe('off');
  });

  test('highlight_toggle_used payload includes timestamp', () => {
    const { screen, hookLog } = makePhase2Screen();
    const before = Date.now();
    screen.toggleHighlightRemaining();
    const after = Date.now();
    const evt = hookLog.find((e) => e.name === EVENTS.HIGHLIGHT_TOGGLE_USED);
    expect(evt.payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(evt.payload.timestamp).toBeLessThanOrEqual(after);
  });

  test('two toggle interactions produce two highlight_toggle_used events', () => {
    const { screen, hookLog } = makePhase2Screen();
    screen.toggleHighlightRemaining(); // on
    screen.toggleHighlightRemaining(); // off
    expect(hookLog.filter((e) => e.name === EVENTS.HIGHLIGHT_TOGGLE_USED)).toHaveLength(2);
  });

  test('TelemetryEmitter.highlightToggleUsed() is a convenience method', () => {
    const { emitter, log } = makeTelemetry();
    const ts = Date.now();
    emitter.highlightToggleUsed('on', ts);
    expect(log[0].name).toBe('highlight_toggle_used');
    expect(log[0].payload.state).toBe('on');
    expect(log[0].payload.timestamp).toBe(ts);
  });
});

// ─── AC5 — Abandonment regression: event fires for all sessions (no cohort gate) ─

describe('AC5 — Abandonment tracking regression: no cohort gate on session_abandoned event', () => {
  test('abandonReassembly() emits reassembly_session_abandoned regardless of cohort assignment', () => {
    // Both cohort labels should produce abandonment events in Phase 2
    for (const cohortFn of [() => 0.0, () => 0.9]) {
      const { emitter, log } = makeTelemetry();
      const controller = new ReassemblyMicroConfirmationController({
        telemetry:       emitter,
        playAudio:       () => {},
        renderHighlight: () => {},
        randomFn:        cohortFn,
        setTimeoutFn:    (fn) => fn(),
      });
      const screen = new ReassemblyScreen({
        instrumentationHook:         (name, p) => log.push({ name, p }),
        playAudio:                   () => {},
        renderVisual:                () => {},
        microConfirmationController: controller,
      });
      screen.abandonReassembly();
      expect(emitter.wasEmitted(EVENTS.REASSEMBLY_SESSION_ABANDONED)).toBe(true);
    }
  });

  test('abandonment after seating several components still fires', () => {
    const { screen, emitter } = makePhase2Screen();
    snapPart(screen, 'mainspring');
    snapPart(screen, 'barrel');
    snapPart(screen, 'stem');
    screen.abandonReassembly();
    expect(emitter.wasEmitted(EVENTS.REASSEMBLY_SESSION_ABANDONED)).toBe(true);
  });

  test('abandonment before any seating fires exactly once', () => {
    const { screen, emitter } = makePhase2Screen();
    screen.abandonReassembly();
    screen.abandonReassembly(); // idempotent
    expect(
      emitter.getEmittedEvents().filter((e) => e.name === EVENTS.REASSEMBLY_SESSION_ABANDONED)
    ).toHaveLength(1);
  });
});

// ─── Backward-compatibility: existing ReassemblyScreen behaviour unchanged ─────

describe('Backward-compatibility — Phase 2 additions do not break existing reassembly behaviour', () => {
  test('ReassemblyScreen constructs without highlightRenderHook (backward-compat)', () => {
    expect(() => new ReassemblyScreen({
      instrumentationHook: () => {},
      playAudio:           () => {},
      renderVisual:        () => {},
    })).not.toThrow();
  });

  test('confirmSnap, onPartMoved, undo paths unchanged', () => {
    const hookLog = [];
    const screen = new ReassemblyScreen({
      instrumentationHook: (name, p) => hookLog.push({ name, p }),
      playAudio:           () => {},
      renderVisual:        () => {},
      minDwellMs:          0,
    });
    const now = Date.now();
    screen.onPartMoved('mainspring', 10, true, now);
    screen.onPartMoved('mainspring', 10, true, now + 1);
    const result = screen.confirmSnap('mainspring');
    expect(result.success).toBe(true);
    expect(hookLog.find((e) => e.name === 'reassembly_part_confirmed')).toBeDefined();
  });

  test('setPartTolerance still works after Phase 2 pre-registration', () => {
    const { screen } = makePhase2Screen();
    expect(() => screen.setPartTolerance('mainspring', { approach_radius: 100, lock_radius: 40 })).not.toThrow();
    const tol = screen.getSnapZone().getTolerances('mainspring');
    expect(tol.approach_radius).toBe(100);
  });

  test('getHighlightToggle returns boolean', () => {
    const { screen } = makePhase2Screen();
    expect(typeof screen.getHighlightToggle()).toBe('boolean');
  });
});
