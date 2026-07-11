/**
 * Tests for BeforeAfterUI
 *
 * Covers:
 *   AC3 — shown after animation completes; visible for ≥3 seconds; auto-dismisses.
 *   AC4 — early dismiss on tap/click; no errors, freezes, or visual artifacts.
 *   AC5 — clean reset between sequential reveals.
 *
 * Test scenarios mapped to issue #53:
 *   Scenario 1 (Happy path)            — show() renders panel; auto-dismisses.
 *   Scenario 4 (Before/after accuracy) — correct pre/post textures rendered.
 *   Scenario 5 (Portrait 9:16)         — layoutMode '9:16' is passed to renderer.
 *   Scenario 6 (Landscape 16:9)        — layoutMode '16:9' is passed to renderer.
 *   Scenario 7 (Back-to-back)          — clean state on successive shows.
 *   Scenario 9 (Early dismiss)         — dismissEarly() works cleanly.
 *   Scenario 10 (Sequence boundary)    — onDismiss callback fires after auto/early dismiss.
 */

const { BeforeAfterUI, MIN_DISPLAY_DURATION_MS } = require('../../../javascript/cleaning/BeforeAfterUI');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFakeTimers() {
  let timers = [];
  let idCounter = 1;

  const setTimeout = jest.fn((fn, delay) => {
    const id = idCounter++;
    timers.push({ id, fn, delay });
    return id;
  });

  const clearTimeout = jest.fn((id) => {
    timers = timers.filter((t) => t.id !== id);
  });

  const flush = () => {
    const pending = [...timers];
    timers = [];
    pending.forEach((t) => t.fn());
  };

  return { setTimeout, clearTimeout, flush };
}

function makeUI(timerImpl) {
  const renderBeforeAfter = jest.fn();
  const clearBeforeAfter = jest.fn();
  const ui = new BeforeAfterUI(renderBeforeAfter, clearBeforeAfter, timerImpl || {});
  return { ui, renderBeforeAfter, clearBeforeAfter };
}

// ─── Constructor validation ───────────────────────────────────────────────────

describe('BeforeAfterUI — constructor', () => {
  test('throws if renderBeforeAfter is not a function', () => {
    expect(() => new BeforeAfterUI(null, jest.fn())).toThrow(
      'BeforeAfterUI requires a renderBeforeAfter function.'
    );
  });

  test('throws if clearBeforeAfter is not a function', () => {
    expect(() => new BeforeAfterUI(jest.fn(), null)).toThrow(
      'BeforeAfterUI requires a clearBeforeAfter function.'
    );
  });

  test('initial state: not visible', () => {
    const { ui } = makeUI();
    expect(ui.isVisible()).toBe(false);
  });

  test('MIN_DISPLAY_DURATION_MS is 3000', () => {
    expect(MIN_DISPLAY_DURATION_MS).toBe(3000);
  });
});

// ─── Scenario 1 (AC3): show() renders and auto-dismisses ─────────────────────

describe('Scenario 1 — Happy path: show() renders panel and auto-dismisses after 3s', () => {
  test('show() calls renderBeforeAfter', () => {
    const timers = makeFakeTimers();
    const { ui, renderBeforeAfter } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    expect(renderBeforeAfter).toHaveBeenCalledTimes(1);
  });

  test('isVisible is true immediately after show()', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    expect(ui.isVisible()).toBe(true);
  });

  test('setTimeout is scheduled with MIN_DISPLAY_DURATION_MS delay', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    expect(timers.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      MIN_DISPLAY_DURATION_MS
    );
  });

  test('auto-dismiss: isVisible is false after timer fires', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    timers.flush();
    expect(ui.isVisible()).toBe(false);
  });

  test('auto-dismiss: clearBeforeAfter is called after timer fires', () => {
    const timers = makeFakeTimers();
    const { ui, clearBeforeAfter } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    timers.flush();
    expect(clearBeforeAfter).toHaveBeenCalledTimes(1);
  });

  test('auto-dismiss: onDismiss callback is invoked', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    const onDismiss = jest.fn();
    ui.show('pre', 'post', '16:9', onDismiss);
    timers.flush();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ─── Scenario 4 (AC3): correct textures rendered ─────────────────────────────

describe('Scenario 4 — Before/after accuracy: correct pre/post textures passed to renderer', () => {
  test('renderBeforeAfter receives preTexture', () => {
    const timers = makeFakeTimers();
    const { ui, renderBeforeAfter } = makeUI(timers);
    ui.show('dirty_movement_tex', 'clean_movement_tex', '16:9');
    expect(renderBeforeAfter.mock.calls[0][0].preTexture).toBe('dirty_movement_tex');
  });

  test('renderBeforeAfter receives postTexture', () => {
    const timers = makeFakeTimers();
    const { ui, renderBeforeAfter } = makeUI(timers);
    ui.show('dirty_movement_tex', 'clean_movement_tex', '16:9');
    expect(renderBeforeAfter.mock.calls[0][0].postTexture).toBe('clean_movement_tex');
  });

  test('getDisplayState returns the correct preTexture and postTexture', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre_tex', 'post_tex', '16:9');
    const state = ui.getDisplayState();
    expect(state.preTexture).toBe('pre_tex');
    expect(state.postTexture).toBe('post_tex');
  });
});

// ─── Scenario 5 (AC3): portrait 9:16 layout ──────────────────────────────────

describe('Scenario 5 — Portrait 9:16: layoutMode is passed correctly', () => {
  test('renderBeforeAfter receives layoutMode 9:16', () => {
    const timers = makeFakeTimers();
    const { ui, renderBeforeAfter } = makeUI(timers);
    ui.show('pre', 'post', '9:16');
    expect(renderBeforeAfter.mock.calls[0][0].layoutMode).toBe('9:16');
  });
});

// ─── Scenario 6 (AC3): landscape 16:9 layout ─────────────────────────────────

describe('Scenario 6 — Landscape 16:9: layoutMode is passed correctly', () => {
  test('renderBeforeAfter receives layoutMode 16:9', () => {
    const timers = makeFakeTimers();
    const { ui, renderBeforeAfter } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    expect(renderBeforeAfter.mock.calls[0][0].layoutMode).toBe('16:9');
  });

  test('layoutMode defaults to 16:9 when not provided', () => {
    const timers = makeFakeTimers();
    const { ui, renderBeforeAfter } = makeUI(timers);
    ui.show('pre', 'post'); // no layoutMode arg
    expect(renderBeforeAfter.mock.calls[0][0].layoutMode).toBe('16:9');
  });
});

// ─── Scenario 7 (AC5): back-to-back shows ────────────────────────────────────

describe('Scenario 7 — Back-to-back: second show() resets state cleanly', () => {
  test('second show() cancels the first auto-dismiss timer', () => {
    const timers = makeFakeTimers();
    const { ui, clearBeforeAfter } = makeUI(timers);
    ui.show('pre1', 'post1', '16:9');
    ui.show('pre2', 'post2', '16:9');
    // clearTimeout must have been called to cancel first timer
    expect(timers.clearTimeout).toHaveBeenCalled();
  });

  test('second show() replaces textures with the new values', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre1', 'post1', '16:9');
    ui.show('pre2', 'post2', '9:16');
    const state = ui.getDisplayState();
    expect(state.preTexture).toBe('pre2');
    expect(state.postTexture).toBe('post2');
    expect(state.layoutMode).toBe('9:16');
  });

  test('renderBeforeAfter is called for each show()', () => {
    const timers = makeFakeTimers();
    const { ui, renderBeforeAfter } = makeUI(timers);
    ui.show('pre1', 'post1', '16:9');
    ui.show('pre2', 'post2', '16:9');
    expect(renderBeforeAfter).toHaveBeenCalledTimes(2);
  });
});

// ─── Scenario 9 (AC4): early dismiss ─────────────────────────────────────────

describe('Scenario 9 — Early dismiss: dismissEarly() cleans up without errors', () => {
  test('dismissEarly() sets isVisible to false', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    ui.dismissEarly();
    expect(ui.isVisible()).toBe(false);
  });

  test('dismissEarly() calls clearBeforeAfter', () => {
    const timers = makeFakeTimers();
    const { ui, clearBeforeAfter } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    ui.dismissEarly();
    expect(clearBeforeAfter).toHaveBeenCalledTimes(1);
  });

  test('dismissEarly() cancels the auto-dismiss timer', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    ui.dismissEarly();
    expect(timers.clearTimeout).toHaveBeenCalled();
  });

  test('dismissEarly() invokes the onDismiss callback', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    const onDismiss = jest.fn();
    ui.show('pre', 'post', '16:9', onDismiss);
    ui.dismissEarly();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('dismissEarly() records lastDismissWasEarly as true', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    ui.dismissEarly();
    expect(ui.getDisplayState().lastDismissWasEarly).toBe(true);
  });

  test('auto-dismiss records lastDismissWasEarly as false', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    timers.flush(); // auto-dismiss
    expect(ui.getDisplayState().lastDismissWasEarly).toBe(false);
  });

  test('dismissEarly() when not visible is a no-op', () => {
    const timers = makeFakeTimers();
    const { ui, clearBeforeAfter } = makeUI(timers);
    ui.dismissEarly(); // not visible
    expect(clearBeforeAfter).not.toHaveBeenCalled();
  });
});

// ─── Scenario 10 (AC4): onDismiss fires and UI is fully reset ────────────────

describe('Scenario 10 — Sequence boundary: state is fully reset after dismiss', () => {
  test('getDisplayState.isVisible is false after auto-dismiss', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre', 'post', '16:9');
    timers.flush();
    expect(ui.getDisplayState().isVisible).toBe(false);
  });

  test('after auto-dismiss, can call show() again without errors', () => {
    const timers = makeFakeTimers();
    const { ui } = makeUI(timers);
    ui.show('pre1', 'post1', '16:9');
    timers.flush();
    expect(() => ui.show('pre2', 'post2', '16:9')).not.toThrow();
  });
});
