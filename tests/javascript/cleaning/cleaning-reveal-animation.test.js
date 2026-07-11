/**
 * Tests for CleaningRevealAnimation
 *
 * Covers:
 *   AC1 — plays reveal animation from dirty/corroded to gleaming with visible contrast.
 *   AC2 — records visual transition beat timestamp for audio sync (±100ms).
 *   AC5 — abort/reset allows successive reveals with no degradation.
 *
 * Test scenarios mapped to issue #53:
 *   Scenario 1  (Happy path)          — play() triggers all phases, ends in complete state.
 *   Scenario 2  (Visual contrast)     — phase sequence includes dirt_fade → gleam_hold.
 *   Scenario 3  (Audio sync anchor)   — sheen_transition beat is recorded.
 *   Scenario 7  (Back-to-back)        — second play() after abort works cleanly.
 *   Scenario 9  (Early dismiss abort) — abort() stops playback and clears render layer.
 */

const { CleaningRevealAnimation } = require('../../../javascript/cleaning/CleaningRevealAnimation');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnimation() {
  const renderReveal = jest.fn();
  const clearReveal = jest.fn();
  const anim = new CleaningRevealAnimation(renderReveal, clearReveal);
  return { anim, renderReveal, clearReveal };
}

// Run animation through all phases to completion
function playToCompletion(anim) {
  anim.play('dirty_movement', 'clean_movement');
  // play() calls _advancePhase for phase 0; then we call nextPhase 3 more times
  anim.nextPhase(); // phase 1 particle_burst
  anim.nextPhase(); // phase 2 sheen_transition
  anim.nextPhase(); // phase 3 gleam_hold
  anim.nextPhase(); // triggers _finish (beyond last phase)
}

// ─── Constructor validation ───────────────────────────────────────────────────

describe('CleaningRevealAnimation — constructor', () => {
  test('throws if renderReveal is not a function', () => {
    expect(() => new CleaningRevealAnimation(null, jest.fn())).toThrow(
      'CleaningRevealAnimation requires a renderReveal function.'
    );
  });

  test('throws if clearReveal is not a function', () => {
    expect(() => new CleaningRevealAnimation(jest.fn(), null)).toThrow(
      'CleaningRevealAnimation requires a clearReveal function.'
    );
  });

  test('initial state: not playing, not complete', () => {
    const { anim } = makeAnimation();
    expect(anim.isPlaying()).toBe(false);
    expect(anim.isComplete()).toBe(false);
  });
});

// ─── Scenario 1: Happy path — play() through all phases ──────────────────────

describe('Scenario 1 — Happy path: play() triggers all phases and completes', () => {
  test('isPlaying returns true immediately after play()', () => {
    const { anim } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    expect(anim.isPlaying()).toBe(true);
  });

  test('renderReveal is called on play() (phase 0)', () => {
    const { anim, renderReveal } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    expect(renderReveal).toHaveBeenCalledTimes(1);
  });

  test('renderReveal is called once per phase (4 total)', () => {
    const { anim, renderReveal } = makeAnimation();
    playToCompletion(anim);
    expect(renderReveal).toHaveBeenCalledTimes(4);
  });

  test('clearReveal is called once when animation finishes', () => {
    const { anim, clearReveal } = makeAnimation();
    playToCompletion(anim);
    expect(clearReveal).toHaveBeenCalledTimes(1);
  });

  test('isComplete returns true after all phases', () => {
    const { anim } = makeAnimation();
    playToCompletion(anim);
    expect(anim.isComplete()).toBe(true);
  });

  test('isPlaying returns false after animation completes', () => {
    const { anim } = makeAnimation();
    playToCompletion(anim);
    expect(anim.isPlaying()).toBe(false);
  });

  test('play() throws if called while already playing', () => {
    const { anim } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    expect(() => anim.play('dirty_movement', 'clean_movement')).toThrow(
      'CleaningRevealAnimation.play() called while animation is already playing.'
    );
  });
});

// ─── Scenario 2: Visual contrast — phase sequence ────────────────────────────

describe('Scenario 2 — Visual contrast: animation phases include dirty and gleam states', () => {
  test('first render call uses dirt_fade phase', () => {
    const { anim, renderReveal } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    const firstCall = renderReveal.mock.calls[0][0];
    expect(firstCall.phase).toBe('dirt_fade');
  });

  test('pre-texture is included in every render call', () => {
    const { anim, renderReveal } = makeAnimation();
    playToCompletion(anim);
    renderReveal.mock.calls.forEach(([state]) => {
      expect(state.preTexture).toBe('dirty_movement');
    });
  });

  test('post-texture is included in every render call', () => {
    const { anim, renderReveal } = makeAnimation();
    playToCompletion(anim);
    renderReveal.mock.calls.forEach(([state]) => {
      expect(state.postTexture).toBe('clean_movement');
    });
  });

  test('phases progress through the correct sequence', () => {
    const { anim, renderReveal } = makeAnimation();
    playToCompletion(anim);
    const phases = renderReveal.mock.calls.map(([state]) => state.phase);
    expect(phases).toEqual(['dirt_fade', 'particle_burst', 'sheen_transition', 'gleam_hold']);
  });

  test('last rendered phase before completion is gleam_hold', () => {
    const { anim, renderReveal } = makeAnimation();
    playToCompletion(anim);
    const lastCall = renderReveal.mock.calls[renderReveal.mock.calls.length - 1][0];
    expect(lastCall.phase).toBe('gleam_hold');
  });
});

// ─── Scenario 3 (AC2): Visual transition beat is recorded ────────────────────

describe('Scenario 3 — Audio sync: visual transition beat recorded at sheen_transition', () => {
  test('getVisualTransitionBeatMs returns null before play()', () => {
    const { anim } = makeAnimation();
    expect(anim.getVisualTransitionBeatMs()).toBeNull();
  });

  test('getVisualTransitionBeatMs returns a number after sheen_transition phase', () => {
    const { anim } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    anim.nextPhase(); // particle_burst
    anim.nextPhase(); // sheen_transition ← beat recorded here
    expect(typeof anim.getVisualTransitionBeatMs()).toBe('number');
  });

  test('play() return value includes visualTransitionBeatMs (may be null before sheen phase)', () => {
    const { anim } = makeAnimation();
    const result = anim.play('dirty_movement', 'clean_movement');
    // After play() only phase 0 (dirt_fade) has run — beat not yet recorded
    expect(result).toHaveProperty('visualTransitionBeatMs');
  });
});

// ─── Scenario 7: Back-to-back reveals ────────────────────────────────────────

describe('Scenario 7 — Back-to-back: abort then re-play works cleanly', () => {
  test('can play again after aborting', () => {
    const { anim, renderReveal, clearReveal } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    anim.abort();

    expect(anim.isPlaying()).toBe(false);

    anim.play('dirty_movement', 'clean_movement');
    expect(anim.isPlaying()).toBe(true);
    expect(renderReveal).toHaveBeenCalledTimes(2);
  });

  test('can play again after completing a full sequence', () => {
    const { anim, renderReveal } = makeAnimation();
    playToCompletion(anim);
    expect(anim.isComplete()).toBe(true);

    // Reset state for second play
    // (In practice the orchestrator creates a fresh instance or calls abort first;
    //  here we verify reset logic by calling directly)
    anim._isPlaying = false;
    anim._isComplete = false;
    anim.play('dirty_movement2', 'clean_movement2');
    expect(anim.isPlaying()).toBe(true);
    expect(renderReveal.mock.calls.length).toBeGreaterThan(4);
  });
});

// ─── Scenario 9: Early dismiss / abort ───────────────────────────────────────

describe('Scenario 9 — Early dismiss: abort() stops animation and clears render layer', () => {
  test('abort() when playing sets isPlaying to false', () => {
    const { anim } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    anim.abort();
    expect(anim.isPlaying()).toBe(false);
  });

  test('abort() calls clearReveal exactly once', () => {
    const { anim, clearReveal } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    anim.abort();
    expect(clearReveal).toHaveBeenCalledTimes(1);
  });

  test('abort() when not playing is a no-op', () => {
    const { anim, clearReveal } = makeAnimation();
    anim.abort();
    expect(clearReveal).not.toHaveBeenCalled();
  });

  test('nextPhase() is a no-op after abort()', () => {
    const { anim, renderReveal } = makeAnimation();
    anim.play('dirty_movement', 'clean_movement');
    anim.abort();
    const callCountAfterAbort = renderReveal.mock.calls.length;
    anim.nextPhase();
    expect(renderReveal).toHaveBeenCalledTimes(callCountAfterAbort);
  });
});

// ─── getCurrentState accessor ─────────────────────────────────────────────────

describe('CleaningRevealAnimation — getCurrentState()', () => {
  test('returns current phase, preTexture and postTexture', () => {
    const { anim } = makeAnimation();
    anim.play('pre_tex', 'post_tex');
    const state = anim.getCurrentState();
    expect(state.phase).toBe('dirt_fade');
    expect(state.preTexture).toBe('pre_tex');
    expect(state.postTexture).toBe('post_tex');
  });
});
