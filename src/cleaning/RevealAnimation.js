/**
 * RevealAnimation — re-export alias for CleaningRevealAnimation.
 *
 * Issue #54 (Cleaning Reveal Shareability) references this module as RevealAnimation
 * while Issue #53 (Core System) implemented it as CleaningRevealAnimation.
 * This alias ensures backward compatibility.
 */

const { CleaningRevealAnimation, PHASES } = require('./CleaningRevealAnimation');

// Alias for Issue #54 compatibility
const RevealAnimation = CleaningRevealAnimation;

module.exports = { RevealAnimation, CleaningRevealAnimation, PHASES };
