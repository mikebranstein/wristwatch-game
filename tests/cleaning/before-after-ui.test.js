/**
 * Tests for BeforeAfterUI — AC#53-3, AC#53-4
 *
 * Covers: show(), dismiss(), isVisible(), texture accessors,
 *         auto-dismiss timer, early player dismiss, and state cleanup.
 *
 * AC#53-3: UI displays for at least 3 seconds; shows correct pre/post textures.
 * AC#53-4: early dismiss is clean — no errors, freezes, or state corruption.
 */

const { BeforeAfterUI, MIN_DISPLAY_DURATION_MS } = require('../../src/cleaning/BeforeAfterUI');

// ── Construction ──────────────────────────────────────────────────────────────

describe('BeforeAfterUI — construction', () => {
  test('isVisible() is false initially', () => {
    const ui = new BeforeAfterUI();
    expect(ui.isVisible()).toBe(false);
  });

  test('getPreTexture() is null initially', () => {
    const ui = new BeforeAfterUI();
    expect(ui.getPreTexture()).toBeNull();
  });

  test('getPostTexture() is null initially', () => {
    const ui = new BeforeAfterUI();
    expect(ui.getPostTexture()).toBeNull();
  });

  test('getMinDisplayDurationMs() returns at least 3000ms (AC#53-3 constraint)', () => {
    expect(BeforeAfterUI.getMinDisplayDurationMs()).toBeGreaterThanOrEqual(3000);
  });
});

// ── show() ────────────────────────────────────────────────────────────────────

describe('BeforeAfterUI — show()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('AC#53-3: isVisible() is true immediately after show()', () => {
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png');
    expect(ui.isVisible()).toBe(true);
  });

  test('AC#53-3: stores the correct pre-cleaning texture', () => {
    const ui = new BeforeAfterUI();
    ui.show('dirty_movement.png', 'clean_movement.png');
    expect(ui.getPreTexture()).toBe('dirty_movement.png');
  });

  test('AC#53-3: stores the correct post-cleaning texture', () => {
    const ui = new BeforeAfterUI();
    ui.show('dirty_movement.png', 'clean_movement.png');
    expect(ui.getPostTexture()).toBe('clean_movement.png');
  });

  test('UI remains visible until MIN_DISPLAY_DURATION_MS elapses (AC#53-3: ≥3s visible)', () => {
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png');

    jest.advanceTimersByTime(MIN_DISPLAY_DURATION_MS - 1);
    expect(ui.isVisible()).toBe(true);
  });

  test('UI auto-dismisses at exactly MIN_DISPLAY_DURATION_MS (AC#53-3)', () => {
    const onDismiss = jest.fn();
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png', onDismiss);

    jest.advanceTimersByTime(MIN_DISPLAY_DURATION_MS);
    expect(ui.isVisible()).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('onDismiss callback fires after auto-dismiss', () => {
    const onDismiss = jest.fn();
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png', onDismiss);

    jest.advanceTimersByTime(MIN_DISPLAY_DURATION_MS);
    expect(onDismiss).toHaveBeenCalled();
  });

  test('show() without onDismiss does not throw', () => {
    const ui = new BeforeAfterUI();
    expect(() => {
      ui.show('pre.png', 'post.png');
      jest.runAllTimers();
    }).not.toThrow();
  });
});

// ── dismiss() (AC#53-4) ───────────────────────────────────────────────────────

describe('BeforeAfterUI — dismiss() (AC#53-4)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('AC#53-4: early dismiss hides the UI immediately', () => {
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png');
    ui.dismiss();
    expect(ui.isVisible()).toBe(false);
  });

  test('AC#53-4: early dismiss fires the onDismiss callback', () => {
    const onDismiss = jest.fn();
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png', onDismiss);
    ui.dismiss();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('AC#53-4: early dismiss clears preTexture (no state corruption)', () => {
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png');
    ui.dismiss();
    expect(ui.getPreTexture()).toBeNull();
  });

  test('AC#53-4: early dismiss clears postTexture (no state corruption)', () => {
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png');
    ui.dismiss();
    expect(ui.getPostTexture()).toBeNull();
  });

  test('early dismiss cancels the auto-dismiss timer (no double-fire)', () => {
    const onDismiss = jest.fn();
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png', onDismiss);
    ui.dismiss();
    jest.runAllTimers();
    // onDismiss must have been called exactly once — not twice
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('AC#53-4: dismiss() on a non-visible UI is a no-op (no errors)', () => {
    const ui = new BeforeAfterUI();
    expect(() => ui.dismiss()).not.toThrow();
    expect(ui.isVisible()).toBe(false);
  });

  test('AC#53-4: dismiss() on a non-visible UI does NOT call onDismiss', () => {
    const onDismiss = jest.fn();
    const ui = new BeforeAfterUI();
    // Not shown — dismiss should be a no-op
    ui.dismiss();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────────

describe('BeforeAfterUI — destroy()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('destroy() cancels the pending auto-dismiss timer', () => {
    const onDismiss = jest.fn();
    const ui = new BeforeAfterUI();
    ui.show('pre.png', 'post.png', onDismiss);
    ui.destroy();
    jest.runAllTimers();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('destroy() when not showing does not throw', () => {
    const ui = new BeforeAfterUI();
    expect(() => ui.destroy()).not.toThrow();
  });
});
