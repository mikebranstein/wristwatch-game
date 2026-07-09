/**
 * Tests for RevealAnimation — AC#53-1, AC#53-8
 *
 * Covers: construction validation, play(), clear(), isPlaying(), getProgress(),
 *         reveal beat callback timing, animation completion callback,
 *         and concurrency guard (second play() is a no-op while playing).
 */

const { RevealAnimation, ANIMATION_DURATION_MS } = require('../../src/cleaning/RevealAnimation');

// ── Construction ──────────────────────────────────────────────────────────────

describe('RevealAnimation — construction', () => {
  test('throws if renderReveal is not a function', () => {
    expect(() => new RevealAnimation(null, jest.fn())).toThrow(
      'renderReveal must be a function'
    );
  });

  test('throws if clearReveal is not a function', () => {
    expect(() => new RevealAnimation(jest.fn(), null)).toThrow(
      'clearReveal must be a function'
    );
  });

  test('constructs with valid hooks', () => {
    const anim = new RevealAnimation(jest.fn(), jest.fn());
    expect(anim.isPlaying()).toBe(false);
    expect(anim.getProgress()).toBe(0);
  });

  test('getDurationMs() returns ANIMATION_DURATION_MS constant', () => {
    expect(RevealAnimation.getDurationMs()).toBe(ANIMATION_DURATION_MS);
  });
});

// ── play() ────────────────────────────────────────────────────────────────────

describe('RevealAnimation — play()', () => {
  let renderReveal, clearReveal, anim;

  beforeEach(() => {
    jest.useFakeTimers();
    renderReveal = jest.fn();
    clearReveal = jest.fn();
    anim = new RevealAnimation(renderReveal, clearReveal);
  });

  afterEach(() => {
    anim.clear();
    jest.useRealTimers();
  });

  test('isPlaying() returns true immediately after play() is called', () => {
    anim.play('pre.png', 'post.png');
    expect(anim.isPlaying()).toBe(true);
  });

  test('AC#53-1: renderReveal is called with progress 0 at start (pre-state visible)', () => {
    anim.play('pre.png', 'post.png');
    expect(renderReveal).toHaveBeenCalledWith('pre.png', 'post.png', 0);
  });

  test('renderReveal receives the correct pre and post texture identifiers', () => {
    anim.play('dirty_movement.png', 'gleaming_movement.png');
    expect(renderReveal).toHaveBeenCalledWith('dirty_movement.png', 'gleaming_movement.png', 0);
  });

  test('reveal beat callback fires at ~50% progress (mid-animation)', () => {
    const onRevealBeat = jest.fn();
    anim.play('pre.png', 'post.png', onRevealBeat);

    // Beat fires at the midpoint
    jest.advanceTimersByTime(ANIMATION_DURATION_MS / 2);
    expect(onRevealBeat).toHaveBeenCalledTimes(1);
  });

  test('reveal beat callback is NOT fired before the midpoint', () => {
    const onRevealBeat = jest.fn();
    anim.play('pre.png', 'post.png', onRevealBeat);

    jest.advanceTimersByTime(ANIMATION_DURATION_MS / 2 - 1);
    expect(onRevealBeat).not.toHaveBeenCalled();
  });

  test('onComplete fires when animation finishes', () => {
    const onComplete = jest.fn();
    anim.play('pre.png', 'post.png', null, onComplete);

    jest.advanceTimersByTime(ANIMATION_DURATION_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('isPlaying() returns false after animation completes', () => {
    anim.play('pre.png', 'post.png');
    jest.advanceTimersByTime(ANIMATION_DURATION_MS);
    expect(anim.isPlaying()).toBe(false);
  });

  test('getProgress() returns 1.0 after animation completes', () => {
    anim.play('pre.png', 'post.png');
    jest.advanceTimersByTime(ANIMATION_DURATION_MS);
    expect(anim.getProgress()).toBe(1.0);
  });

  test('renderReveal is called with progress 1.0 at end (AC#53-1: post-state gleaming)', () => {
    anim.play('pre.png', 'post.png');
    jest.advanceTimersByTime(ANIMATION_DURATION_MS);
    expect(renderReveal).toHaveBeenCalledWith('pre.png', 'post.png', 1.0);
  });

  test('play() while already playing is a no-op (concurrency guard)', () => {
    anim.play('pre.png', 'post.png');
    renderReveal.mockClear();
    anim.play('pre2.png', 'post2.png'); // second call while playing — ignored
    expect(renderReveal).not.toHaveBeenCalled();
  });

  test('play() with no callbacks does not throw', () => {
    expect(() => anim.play('pre.png', 'post.png')).not.toThrow();
    jest.runAllTimers();
  });
});

// ── clear() ───────────────────────────────────────────────────────────────────

describe('RevealAnimation — clear()', () => {
  let renderReveal, clearReveal, anim;

  beforeEach(() => {
    jest.useFakeTimers();
    renderReveal = jest.fn();
    clearReveal = jest.fn();
    anim = new RevealAnimation(renderReveal, clearReveal);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('clear() calls the clearReveal hook', () => {
    anim.play('pre.png', 'post.png');
    anim.clear();
    expect(clearReveal).toHaveBeenCalled();
  });

  test('clear() sets isPlaying() to false', () => {
    anim.play('pre.png', 'post.png');
    anim.clear();
    expect(anim.isPlaying()).toBe(false);
  });

  test('clear() resets getProgress() to 0', () => {
    anim.play('pre.png', 'post.png');
    jest.advanceTimersByTime(ANIMATION_DURATION_MS / 2);
    anim.clear();
    expect(anim.getProgress()).toBe(0);
  });

  test('clear() prevents reveal beat callback from firing after cancellation', () => {
    const onRevealBeat = jest.fn();
    anim.play('pre.png', 'post.png', onRevealBeat);
    anim.clear();
    jest.runAllTimers();
    expect(onRevealBeat).not.toHaveBeenCalled();
  });

  test('clear() prevents onComplete callback from firing after cancellation', () => {
    const onComplete = jest.fn();
    anim.play('pre.png', 'post.png', null, onComplete);
    anim.clear();
    jest.runAllTimers();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
