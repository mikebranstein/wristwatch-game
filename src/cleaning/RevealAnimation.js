/**
 * RevealAnimation — wrapper class for CleaningRevealAnimation.
 *
 * Issue #54 (Cleaning Reveal Shareability) references this module as RevealAnimation
 * while Issue #53 (Core System) implemented it as CleaningRevealAnimation.
 * This class extends CleaningRevealAnimation to ensure Jest can properly
 * auto-mock all prototype methods.
 */

const { CleaningRevealAnimation, PHASES } = require('./CleaningRevealAnimation');

class RevealAnimation extends CleaningRevealAnimation {
  // Inherits all methods from CleaningRevealAnimation:
  // play(), nextPhase(), abort(), clear(), isPlaying(), isComplete(),
  // getPhaseTimestamps(), getVisualTransitionBeatMs()
}

module.exports = { RevealAnimation, CleaningRevealAnimation, PHASES };
