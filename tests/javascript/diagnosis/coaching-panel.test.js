/**
 * Tests for CoachingPanel.js — Issue #296
 * Adaptive Coaching UI Panel — In-Session Coaching Delivery (Phase 1 MVP)
 *
 * Acceptance criteria covered:
 *   AC1 — panel appears on trigger: show() renders within one frame with correct copy.
 *   AC2 — explicit dismissal: panel hides; same step+type does not reappear.
 *   AC3 — auto-dismiss on step completion: dismissIfStepMatches() self-dismisses.
 *   AC4 — non-blocking: panel is pure state; no click-intercept in this layer.
 *   AC5 — gentle tone: authored copy uses helpful framing + actionable suggestion.
 *   AC6 — no duplicate stacking: rapid triggers produce only one visible panel.
 *
 * Test scenarios covered:
 *   Scenario 1  — Happy path: coaching_trigger fires → panel appears with correct copy.
 *   Scenario 2  — Explicit dismissal → same step+type does not reappear.
 *   Scenario 3  — Auto-dismiss on step completion.
 *   Scenario 5  — Rapid trigger suppression (AC6 no-duplicate guard).
 *   Scenario 7  — Session isolation: resetSession() clears dismissed state.
 *   Scenario 9  — Contextual copy varies by stepId (not generic).
 *   Scenario 10 — Regression: HintSystem is unchanged (no coupling here).
 *
 * Run with: npm test
 */

'use strict';

const {
  CoachingPanel,
  PANEL_STATE,
  MISTAKE_TYPE,
  COACHING_COPY,
} = require('../../../src/diagnosis/CoachingPanel');

// ── Construction ──────────────────────────────────────────────────────────────

describe('CoachingPanel — construction', () => {
  test('constructs with no arguments', () => {
    expect(() => new CoachingPanel()).not.toThrow();
  });

  test('initial state is HIDDEN', () => {
    const panel = new CoachingPanel();
    expect(panel.getState()).toBe(PANEL_STATE.HIDDEN);
    expect(panel.isHidden()).toBe(true);
    expect(panel.isVisible()).toBe(false);
    expect(panel.isDismissed()).toBe(false);
  });

  test('initial getCurrentTrigger() is null', () => {
    const panel = new CoachingPanel();
    expect(panel.getCurrentTrigger()).toBeNull();
  });

  test('registers coaching_trigger handler when eventBus is provided', () => {
    const handlers = {};
    const mockBus = { on: (event, fn) => { handlers[event] = fn; } };
    const panel = new CoachingPanel({ eventBus: mockBus });
    expect(handlers['coaching_trigger']).toBeDefined();
    // Firing via event bus should show the panel
    handlers['coaching_trigger']({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'test-step' });
    expect(panel.isVisible()).toBe(true);
  });

  test('does not throw if eventBus has no .on() method', () => {
    expect(() => new CoachingPanel({ eventBus: {} })).not.toThrow();
    expect(() => new CoachingPanel({ eventBus: null })).not.toThrow();
  });
});

// ── AC1: show() — panel appears on trigger ────────────────────────────────────

describe('CoachingPanel — AC1: show() panel appears on trigger', () => {
  test('show() transitions HIDDEN → VISIBLE for wrong_tool', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-mainspring' });
    expect(panel.getState()).toBe(PANEL_STATE.VISIBLE);
    expect(panel.isVisible()).toBe(true);
  });

  test('show() returns true when panel becomes visible', () => {
    const panel = new CoachingPanel();
    const result = panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-mainspring' });
    expect(result).toBe(true);
  });

  test('show() works for all three mistake types', () => {
    for (const type of Object.values(MISTAKE_TYPE)) {
      const panel = new CoachingPanel();
      expect(() => panel.show({ type, stepId: 'step-abc' })).not.toThrow();
      expect(panel.isVisible()).toBe(true);
    }
  });

  test('show() stores trigger payload (Scenario 1)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-mainspring' });
    const trigger = panel.getCurrentTrigger();
    expect(trigger.type).toBe(MISTAKE_TYPE.WRONG_TOOL);
    expect(trigger.stepId).toBe('diagnose-mainspring');
  });

  test('show() throws TypeError for missing payload', () => {
    const panel = new CoachingPanel();
    expect(() => panel.show(null)).toThrow(TypeError);
    expect(() => panel.show(undefined)).toThrow(TypeError);
  });

  test('show() throws for unknown mistake type', () => {
    const panel = new CoachingPanel();
    expect(() => panel.show({ type: 'invalid_type', stepId: 'step-1' })).toThrow();
  });

  test('show() throws TypeError for missing or empty stepId', () => {
    const panel = new CoachingPanel();
    expect(() => panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: '' })).toThrow(TypeError);
    expect(() => panel.show({ type: MISTAKE_TYPE.WRONG_TOOL })).toThrow(TypeError);
  });

  // onStateChange callback fires on show
  test('onStateChange callback is invoked when panel becomes visible', () => {
    const callback = jest.fn();
    const panel = new CoachingPanel({ onStateChange: callback });
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-x' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ isVisible: true }));
  });
});

// ── AC2: dismiss() — explicit dismissal ──────────────────────────────────────

describe('CoachingPanel — AC2: explicit dismissal and session deduplication', () => {
  test('dismiss() transitions VISIBLE → DISMISSED', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    expect(panel.getState()).toBe(PANEL_STATE.DISMISSED);
    expect(panel.isDismissed()).toBe(true);
    expect(panel.isVisible()).toBe(false);
  });

  test('dismiss() returns true when panel is dismissed', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    expect(panel.dismiss()).toBe(true);
  });

  test('dismiss() is a no-op when HIDDEN (returns false)', () => {
    const panel = new CoachingPanel();
    expect(panel.dismiss()).toBe(false);
    expect(panel.getState()).toBe(PANEL_STATE.HIDDEN);
  });

  test('dismiss() is a no-op when already DISMISSED (returns false)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    expect(panel.dismiss()).toBe(false);
  });

  test('Scenario 2 — same step+type does NOT reappear after dismiss (AC2)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    // Same combination: must be suppressed
    const result = panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    expect(result).toBe(false);
    expect(panel.isVisible()).toBe(false);
  });

  test('different step+type combination CAN reappear after dismissing another (AC2 — key is composite)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    // Different type: should be allowed
    const result = panel.show({ type: MISTAKE_TYPE.MISIDENTIFICATION, stepId: 'step-1' });
    expect(result).toBe(true);
    expect(panel.isVisible()).toBe(true);
  });

  test('different stepId with same type CAN reappear (AC2 — key is composite)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    const result = panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-2' });
    expect(result).toBe(true);
    expect(panel.isVisible()).toBe(true);
  });

  test('isDismissedFor() returns true for dismissed step+type', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    expect(panel.isDismissedFor('step-1', MISTAKE_TYPE.WRONG_TOOL)).toBe(true);
    expect(panel.isDismissedFor('step-1', MISTAKE_TYPE.MISIDENTIFICATION)).toBe(false);
    expect(panel.isDismissedFor('step-2', MISTAKE_TYPE.WRONG_TOOL)).toBe(false);
  });

  test('onStateChange callback fires on dismiss', () => {
    const callback = jest.fn();
    const panel = new CoachingPanel({ onStateChange: callback });
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-x' });
    panel.dismiss();
    // Called twice: show + dismiss
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

// ── AC3: dismissIfStepMatches() — auto-dismiss on step completion ──────────────

describe('CoachingPanel — AC3: auto-dismiss on step completion', () => {
  test('Scenario 3 — dismissIfStepMatches() dismisses when stepId matches (AC3)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-mainspring' });
    const result = panel.dismissIfStepMatches('diagnose-mainspring');
    expect(result).toBe(true);
    expect(panel.isDismissed()).toBe(true);
  });

  test('dismissIfStepMatches() is a no-op when stepId does not match', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-mainspring' });
    const result = panel.dismissIfStepMatches('diagnose-balance-wheel');
    expect(result).toBe(false);
    expect(panel.isVisible()).toBe(true);
  });

  test('dismissIfStepMatches() is a no-op when panel is HIDDEN', () => {
    const panel = new CoachingPanel();
    expect(panel.dismissIfStepMatches('diagnose-mainspring')).toBe(false);
    expect(panel.isHidden()).toBe(true);
  });

  test('dismissIfStepMatches() is a no-op when panel is already DISMISSED', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    expect(panel.dismissIfStepMatches('step-1')).toBe(false);
  });

  test('auto-dismiss records dismissal key (same step+type will not reappear)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismissIfStepMatches('step-1');
    // Attempt to re-show same combination
    const result = panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    expect(result).toBe(false);
  });
});

// ── AC4: non-blocking state layer ─────────────────────────────────────────────

describe('CoachingPanel — AC4: non-blocking (pure state layer)', () => {
  test('CoachingPanel does not import any DOM or canvas modules', () => {
    // Pure state: require() should succeed in Node (no DOM globals needed).
    // This test passing in Node confirms no renderer dependency.
    const { CoachingPanel: CP } = require('../../../src/diagnosis/CoachingPanel');
    expect(typeof CP).toBe('function');
  });

  test('getViewModel() can be called while VISIBLE without side effects', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-x' });
    // Repeated calls return data; no state mutation
    const vm1 = panel.getViewModel();
    const vm2 = panel.getViewModel();
    expect(vm1).toEqual(vm2);
    expect(panel.isVisible()).toBe(true); // no accidental dismiss
  });
});

// ── AC5: gentle-tone copy compliance ─────────────────────────────────────────

describe('CoachingPanel — AC5: gentle-tone copy compliance', () => {
  const ACCUSATORY_PHRASES = [
    'you did wrong',
    'you failed',
    'wrong choice',
    'bad move',
    'you messed up',
    "you can't",
  ];

  test.each(Object.entries(COACHING_COPY))(
    'COACHING_COPY["%s"].headline is a non-empty string',
    (type, copy) => {
      expect(typeof copy.headline).toBe('string');
      expect(copy.headline.length).toBeGreaterThan(0);
    }
  );

  test.each(Object.entries(COACHING_COPY))(
    'COACHING_COPY["%s"].actionHint is a non-empty string',
    (type, copy) => {
      expect(typeof copy.actionHint).toBe('string');
      expect(copy.actionHint.length).toBeGreaterThan(0);
    }
  );

  test.each(Object.entries(COACHING_COPY))(
    'COACHING_COPY["%s"].body is a function returning contextual string',
    (type, copy) => {
      expect(typeof copy.body).toBe('function');
      const text = copy.body('test-step');
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }
  );

  test.each(Object.entries(COACHING_COPY))(
    'COACHING_COPY["%s"].body contains no accusatory framing (AC5)',
    (type, copy) => {
      const text = copy.body('test-step').toLowerCase();
      for (const phrase of ACCUSATORY_PHRASES) {
        expect(text).not.toContain(phrase);
      }
    }
  );

  test.each(Object.entries(COACHING_COPY))(
    'COACHING_COPY["%s"].headline contains no accusatory framing (AC5)',
    (type, copy) => {
      const text = copy.headline.toLowerCase();
      for (const phrase of ACCUSATORY_PHRASES) {
        expect(text).not.toContain(phrase);
      }
    }
  );

  test('all three mistake types have authored copy entries', () => {
    expect(COACHING_COPY[MISTAKE_TYPE.WRONG_TOOL]).toBeDefined();
    expect(COACHING_COPY[MISTAKE_TYPE.MISIDENTIFICATION]).toBeDefined();
    expect(COACHING_COPY[MISTAKE_TYPE.UNDO_OVERUSE]).toBeDefined();
  });
});

// ── AC6: no duplicate stacking ───────────────────────────────────────────────

describe('CoachingPanel — AC6: no duplicate stacking', () => {
  test('Scenario 5 — second show() while VISIBLE is a no-op (AC6)', () => {
    const panel = new CoachingPanel();
    const first  = panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    const second = panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(panel.getState()).toBe(PANEL_STATE.VISIBLE);
  });

  test('Scenario 5 — different type rapid trigger while VISIBLE is also suppressed (AC6)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    // Even a different type is suppressed while visible — only one panel at a time
    const second = panel.show({ type: MISTAKE_TYPE.MISIDENTIFICATION, stepId: 'step-1' });
    expect(second).toBe(false);
    // Panel remains on the first trigger
    expect(panel.getCurrentTrigger().type).toBe(MISTAKE_TYPE.WRONG_TOOL);
  });

  test('onStateChange callback is NOT called on duplicate show() (AC6)', () => {
    const callback = jest.fn();
    const panel = new CoachingPanel({ onStateChange: callback });
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-x' }); // fires callback
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-x' }); // no-op — no callback
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ── getViewModel() ────────────────────────────────────────────────────────────

describe('CoachingPanel — getViewModel()', () => {
  test('returns correct shape when HIDDEN', () => {
    const panel = new CoachingPanel();
    const vm = panel.getViewModel();
    expect(vm.state).toBe(PANEL_STATE.HIDDEN);
    expect(vm.isVisible).toBe(false);
    expect(vm.mistakeType).toBeNull();
    expect(vm.stepId).toBeNull();
    expect(vm.headline).toBeNull();
    expect(vm.body).toBeNull();
    expect(vm.actionHint).toBeNull();
  });

  test('returns correct shape when VISIBLE (AC1)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-mainspring' });
    const vm = panel.getViewModel();
    expect(vm.state).toBe(PANEL_STATE.VISIBLE);
    expect(vm.isVisible).toBe(true);
    expect(vm.mistakeType).toBe(MISTAKE_TYPE.WRONG_TOOL);
    expect(vm.stepId).toBe('diagnose-mainspring');
    expect(typeof vm.headline).toBe('string');
    expect(typeof vm.body).toBe('string');
    expect(typeof vm.actionHint).toBe('string');
  });

  test('body text includes the stepId for contextual copy (Scenario 9)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-mainspring' });
    const vm1 = panel.getViewModel();
    expect(vm1.body).toContain('diagnose-mainspring');

    const panel2 = new CoachingPanel();
    panel2.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'diagnose-balance-wheel' });
    const vm2 = panel2.getViewModel();
    expect(vm2.body).toContain('diagnose-balance-wheel');

    // Scenario 9: different steps produce different copy
    expect(vm1.body).not.toBe(vm2.body);
  });

  test('returns non-visible shape when DISMISSED', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    const vm = panel.getViewModel();
    expect(vm.isVisible).toBe(false);
    expect(vm.state).toBe(PANEL_STATE.DISMISSED);
  });
});

// ── resetSession() — session isolation ───────────────────────────────────────

describe('CoachingPanel — resetSession(): Scenario 7 — session isolation', () => {
  test('resetSession() returns panel to HIDDEN state', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    panel.resetSession();
    expect(panel.isHidden()).toBe(true);
    expect(panel.getState()).toBe(PANEL_STATE.HIDDEN);
  });

  test('resetSession() clears dismissed-keys set (Scenario 7)', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    expect(panel.isDismissedFor('step-1', MISTAKE_TYPE.WRONG_TOOL)).toBe(true);

    panel.resetSession();
    expect(panel.isDismissedFor('step-1', MISTAKE_TYPE.WRONG_TOOL)).toBe(false);
  });

  test('after resetSession(), previously dismissed combination CAN reappear', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.dismiss();
    panel.resetSession();

    const result = panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    expect(result).toBe(true);
    expect(panel.isVisible()).toBe(true);
  });

  test('resetSession() clears currentTrigger', () => {
    const panel = new CoachingPanel();
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    panel.resetSession();
    expect(panel.getCurrentTrigger()).toBeNull();
  });

  test('resetSession() invokes onStateChange callback', () => {
    const callback = jest.fn();
    const panel = new CoachingPanel({ onStateChange: callback });
    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    callback.mockClear();
    panel.resetSession();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ── PANEL_STATE and MISTAKE_TYPE constants ────────────────────────────────────

describe('CoachingPanel — exported constants', () => {
  test('PANEL_STATE has expected values', () => {
    expect(PANEL_STATE.HIDDEN).toBe('hidden');
    expect(PANEL_STATE.VISIBLE).toBe('visible');
    expect(PANEL_STATE.DISMISSED).toBe('dismissed');
  });

  test('MISTAKE_TYPE has exactly three Phase 1 values', () => {
    const values = Object.values(MISTAKE_TYPE);
    expect(values).toContain('wrong_tool');
    expect(values).toContain('misidentification');
    expect(values).toContain('undo_overuse');
    expect(values.length).toBe(3);
  });
});

// ── Regression — HintSystem untouched (Scenario 10) ──────────────────────────

describe('CoachingPanel — Scenario 10: regression — HintSystem untouched', () => {
  test('HintSystem module can still be required and constructed independently', () => {
    const { HintSystem } = require('../../../src/diagnosis/HintSystem');
    const mockTelemetry = {
      hintTier1Shown: jest.fn(),
      hintTier2Shown: jest.fn(),
      hintTier3Shown: jest.fn(),
    };
    const hintSystem = new HintSystem(mockTelemetry);
    expect(hintSystem).toBeDefined();
    // CoachingPanel must not have altered HintSystem's behaviour
    expect(() => hintSystem.registerFaultInstance('fi-001', 'cracked-mainspring')).not.toThrow();
  });

  test('CoachingPanel and HintSystem can coexist independently in the same session', () => {
    const { HintSystem } = require('../../../src/diagnosis/HintSystem');
    const mockTelemetry = {
      hintTier1Shown: jest.fn(),
      hintTier2Shown: jest.fn(),
      hintTier3Shown: jest.fn(),
    };
    const panel = new CoachingPanel();
    const hintSystem = new HintSystem(mockTelemetry);

    panel.show({ type: MISTAKE_TYPE.WRONG_TOOL, stepId: 'step-1' });
    hintSystem.registerFaultInstance('fi-001', 'cracked-mainspring');

    // Both are independently operable — Scenario 6 (coexistence) logic
    expect(panel.isVisible()).toBe(true);
    expect(hintSystem.hasMoreHints('fi-001')).toBe(true);
  });
});
