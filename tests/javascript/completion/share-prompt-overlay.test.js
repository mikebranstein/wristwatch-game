/**
 * Tests for SharePromptOverlay.js — Issue #142 Completion Reveal Shareability Layer
 *
 * Acceptance criteria covered:
 *   AC1 — share prompt appears at peak moment (both before/after states fully visible)
 *          without obscuring the watch comparison visual.
 *   AC4 — dismissing the share prompt does not interrupt the reveal (overlay
 *          state → DISMISSED; sequence continues via RevealSequenceController).
 *
 * Constraint coverage:
 *   - Screen area ≤ 15%: constructor rejects screenAreaPercent > 15.
 *   - No watch comparison overlap: constructor rejects overlapsComparison = true.
 *   - Generic copy only: all registered copy strings are platform-agnostic.
 *
 * Test scenarios covered:
 *   Scenario 1 — Happy path: show() → visible; dismiss() → dismissed.
 *   Scenario 2 — Dismiss: overlay dismissed; sequence continues (state only).
 *   Scenario 7 — Share prompt appears only at peak (show() called by controller
 *                after peak offset; tested here as: show() transitions correctly).
 *   Scenario 9 — Accessibility: copy text is readable; no platform names in any copy.
 *
 * Run with: npm test
 */

'use strict';

const {
  SharePromptOverlay,
  OVERLAY_STATE,
  COPY_REGISTRY,
  MAX_SCREEN_AREA_PERCENT,
} = require('../../../src/completion/SharePromptOverlay');

// ── Construction ──────────────────────────────────────────────────────────────

describe('SharePromptOverlay — construction', () => {
  test('constructs with no arguments (all defaults)', () => {
    expect(() => new SharePromptOverlay()).not.toThrow();
  });

  test('initial state is HIDDEN', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.getState()).toBe(OVERLAY_STATE.HIDDEN);
    expect(overlay.isHidden()).toBe(true);
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.isDismissed()).toBe(false);
  });

  test('accepts a valid copyKey', () => {
    expect(() => new SharePromptOverlay({ copyKey: 'capture_moment' })).not.toThrow();
  });

  test('throws for unknown copyKey', () => {
    expect(() => new SharePromptOverlay({ copyKey: 'tweet_this' })).toThrow();
  });

  test('accepts screenAreaPercent within 0–15', () => {
    expect(() => new SharePromptOverlay({ screenAreaPercent: 15 })).not.toThrow();
    expect(() => new SharePromptOverlay({ screenAreaPercent: 0  })).not.toThrow();
    expect(() => new SharePromptOverlay({ screenAreaPercent: 7  })).not.toThrow();
  });

  test('throws RangeError for screenAreaPercent > MAX_SCREEN_AREA_PERCENT (constraint)', () => {
    expect(() => new SharePromptOverlay({ screenAreaPercent: 16 })).toThrow(RangeError);
    expect(() => new SharePromptOverlay({ screenAreaPercent: 100 })).toThrow(RangeError);
  });

  test('throws RangeError for negative screenAreaPercent', () => {
    expect(() => new SharePromptOverlay({ screenAreaPercent: -1 })).toThrow(RangeError);
  });

  test('throws Error when overlapsComparison is true (constraint)', () => {
    expect(() => new SharePromptOverlay({ overlapsComparison: true })).toThrow(Error);
  });

  test('allows overlapsComparison = false (expected default)', () => {
    expect(() => new SharePromptOverlay({ overlapsComparison: false })).not.toThrow();
  });
});

// ── AC1: show() at peak moment ────────────────────────────────────────────────

describe('SharePromptOverlay — AC1: show() at peak moment', () => {
  test('show() transitions HIDDEN → VISIBLE', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    expect(overlay.getState()).toBe(OVERLAY_STATE.VISIBLE);
    expect(overlay.isVisible()).toBe(true);
  });

  test('show() returns true when overlay becomes visible', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.show()).toBe(true);
  });

  test('show() is a no-op when already VISIBLE (returns false)', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    expect(overlay.show()).toBe(false);
    expect(overlay.getState()).toBe(OVERLAY_STATE.VISIBLE);
  });

  test('show() is a no-op when DISMISSED (returns false)', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.dismiss();
    expect(overlay.show()).toBe(false);
    expect(overlay.getState()).toBe(OVERLAY_STATE.DISMISSED);
  });

  test('overlay is not visible before show() — does not appear prematurely (Scenario 7)', () => {
    const overlay = new SharePromptOverlay();
    // At construction: HIDDEN — share prompt is not shown before peak moment
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.isHidden()).toBe(true);
  });
});

// ── AC4: dismiss() — single-input dismissal ──────────────────────────────────

describe('SharePromptOverlay — AC4: dismiss() transitions to DISMISSED', () => {
  test('dismiss() transitions VISIBLE → DISMISSED', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.dismiss();
    expect(overlay.getState()).toBe(OVERLAY_STATE.DISMISSED);
    expect(overlay.isDismissed()).toBe(true);
    expect(overlay.isVisible()).toBe(false);
  });

  test('dismiss() returns true when overlay is dismissed', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    expect(overlay.dismiss()).toBe(true);
  });

  test('dismiss() is a no-op when already DISMISSED (returns false)', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.dismiss();
    expect(overlay.dismiss()).toBe(false);
    expect(overlay.getState()).toBe(OVERLAY_STATE.DISMISSED);
  });

  test('dismiss() is a no-op when HIDDEN (returns false — AC4: no stuck state)', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.dismiss()).toBe(false);
    expect(overlay.getState()).toBe(OVERLAY_STATE.HIDDEN);
  });

  test('AC4 — sequence state is managed by caller; dismiss() does not cause stuck state', () => {
    // This module only manages overlay state; the reveal continues via
    // RevealSequenceController.  We verify dismiss() leaves no stuck state here.
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.dismiss();
    // After dismiss: DISMISSED (not stuck at VISIBLE)
    expect(overlay.getState()).not.toBe(OVERLAY_STATE.VISIBLE);
    expect(overlay.getState()).toBe(OVERLAY_STATE.DISMISSED);
  });
});

// ── Instrumentation events ────────────────────────────────────────────────────

describe('SharePromptOverlay — instrumentation events', () => {
  test('show() fires share_prompt_shown event', () => {
    const hook    = jest.fn();
    const overlay = new SharePromptOverlay({ instrumentationHook: hook });
    overlay.show();
    expect(hook).toHaveBeenCalledWith('share_prompt_shown', expect.objectContaining({
      copyKey: 'default',
    }));
  });

  test('dismiss() fires share_prompt_dismissed event', () => {
    const hook    = jest.fn();
    const overlay = new SharePromptOverlay({ instrumentationHook: hook });
    overlay.show();
    overlay.dismiss();
    expect(hook).toHaveBeenCalledWith('share_prompt_dismissed', expect.any(Object));
  });

  test('no events fired if no instrumentationHook provided', () => {
    const overlay = new SharePromptOverlay();
    expect(() => { overlay.show(); overlay.dismiss(); }).not.toThrow();
  });
});

// ── Copy registry: generic, platform-agnostic (Scenario 9, Constraint) ────────

describe('SharePromptOverlay — copy text is generic and platform-agnostic', () => {
  const FORBIDDEN_PLATFORM_NAMES = [
    'steam', 'twitter', 'tiktok', 'instagram', 'facebook', 'youtube',
    'twitch', 'discord', 'reddit', 'snapchat',
  ];

  test.each(Object.entries(COPY_REGISTRY))(
    'COPY_REGISTRY["%s"] contains no platform names',
    (key, copy) => {
      const lower = copy.toLowerCase();
      for (const platform of FORBIDDEN_PLATFORM_NAMES) {
        expect(lower).not.toContain(platform);
      }
    }
  );

  test.each(Object.entries(COPY_REGISTRY))(
    'COPY_REGISTRY["%s"] is a non-empty string',
    (key, copy) => {
      expect(typeof copy).toBe('string');
      expect(copy.length).toBeGreaterThan(0);
    }
  );

  test('getCopyText() returns the correct string for each key', () => {
    for (const [key, expectedCopy] of Object.entries(COPY_REGISTRY)) {
      const overlay = new SharePromptOverlay({ copyKey: key });
      expect(overlay.getCopyText()).toBe(expectedCopy);
    }
  });

  test('default copy key resolves to a non-empty string', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.getCopyText().length).toBeGreaterThan(0);
  });
});

// ── Constraint: screen area cap ───────────────────────────────────────────────

describe('SharePromptOverlay — constraint: screen area ≤ 15%', () => {
  test('MAX_SCREEN_AREA_PERCENT is 15', () => {
    expect(MAX_SCREEN_AREA_PERCENT).toBe(15);
  });

  test('getScreenAreaPercent() returns the declared value', () => {
    const overlay = new SharePromptOverlay({ screenAreaPercent: 10 });
    expect(overlay.getScreenAreaPercent()).toBe(10);
  });

  test('screenAreaPercent of exactly 15 is allowed', () => {
    const overlay = new SharePromptOverlay({ screenAreaPercent: 15 });
    expect(overlay.getScreenAreaPercent()).toBe(15);
  });

  test('screenAreaPercent of 16 throws', () => {
    expect(() => new SharePromptOverlay({ screenAreaPercent: 16 })).toThrow();
  });
});

// ── Constraint: no overlap with watch comparison region ───────────────────────

describe('SharePromptOverlay — constraint: no overlap with watch comparison', () => {
  test('getOverlapsComparison() returns false for valid instances', () => {
    const overlay = new SharePromptOverlay();
    expect(overlay.getOverlapsComparison()).toBe(false);
  });

  test('overlapsComparison = true throws at construction time', () => {
    expect(() => new SharePromptOverlay({ overlapsComparison: true })).toThrow();
  });
});

// ── getViewModel ──────────────────────────────────────────────────────────────

describe('SharePromptOverlay — getViewModel()', () => {
  test('returns expected shape when HIDDEN', () => {
    const overlay = new SharePromptOverlay({ copyKey: 'capture_moment', screenAreaPercent: 8 });
    const vm = overlay.getViewModel();
    expect(vm.state).toBe(OVERLAY_STATE.HIDDEN);
    expect(vm.isVisible).toBe(false);
    expect(vm.copyText).toBe(COPY_REGISTRY.capture_moment);
    expect(vm.screenAreaPercent).toBe(8);
  });

  test('returns isVisible = true when VISIBLE', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    expect(overlay.getViewModel().isVisible).toBe(true);
    expect(overlay.getViewModel().state).toBe(OVERLAY_STATE.VISIBLE);
  });
});

// ── reset() ───────────────────────────────────────────────────────────────────

describe('SharePromptOverlay — reset()', () => {
  test('reset() returns overlay to HIDDEN from VISIBLE', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.reset();
    expect(overlay.getState()).toBe(OVERLAY_STATE.HIDDEN);
  });

  test('reset() returns overlay to HIDDEN from DISMISSED', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.dismiss();
    overlay.reset();
    expect(overlay.getState()).toBe(OVERLAY_STATE.HIDDEN);
  });

  test('after reset(), show() transitions to VISIBLE again', () => {
    const overlay = new SharePromptOverlay();
    overlay.show();
    overlay.dismiss();
    overlay.reset();
    expect(overlay.show()).toBe(true);
    expect(overlay.isVisible()).toBe(true);
  });
});
