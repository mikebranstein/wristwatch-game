/**
 * ToolRationaleProvider — static map of (operationId → rationale) for the
 * pilot set of 10 operations.
 *
 * Issue #301 — In-Context Tool Rationale — Core System & Pilot Set (Phase 1 MVP)
 *
 * Design contract (from approved design decision):
 *   - Mirrors HorologyGlossary.js structure: static dict + lookup function.
 *   - exports getToolRationale(operationId) and getAllOperationIds().
 *   - Bounded to 10 pilot operations only (Phase 2 scope: operations 11–28,
 *     gated on user-test validation from this sprint's playtest).
 *   - All rationale strings are 3–5 words, sourced from horological literature.
 *     No placeholder, invented, or generic copy is permitted (hard constraint).
 *   - Phase 2 expansion: add new entries to RATIONALE_MAP; no API changes needed.
 *
 * Pilot operation selection: the 10 highest-visibility operations, selected
 * from the most common hint-escalation phases per HintEscalationAnalyzer telemetry.
 *
 * Rationale framing: craft fact, not tutorial directive.
 * Good:  "Prevents dial scratch"
 * Avoid: "Use this tool to avoid scratching the dial"
 *
 * Sources: Daniels, G. (2011) Watchmaking. Rev. ed. Philip Wilson Publishers.
 *          DeCarle, D. (1977) Practical Watch Repairing. 3rd ed. NAG Press.
 */

'use strict';

/**
 * @typedef {{ operationId: string, rationale: string, icon: string }} RationaleEntry
 */

/**
 * Static rationale map: operationId → RationaleEntry
 * Pilot set — 10 operations only.  Phase 2 will extend this map.
 *
 * Sources for each entry are listed inline per the domain-accuracy hard constraint.
 *
 * @type {Object.<string, RationaleEntry>}
 */
const RATIONALE_MAP = {
  // ── Case opening ──────────────────────────────────────────────────────────
  // Thin blade pried at the notch applies controlled lateral force; sharp
  // blades and screwdrivers mar the case-back chamfer (Daniels §4.2).
  'open-snap-back-case': {
    operationId: 'open-snap-back-case',
    rationale: 'Prevents case scratch',
    icon: 'icon-case-knife',
  },

  // ── Dial handling ─────────────────────────────────────────────────────────
  // Smooth inner jaw faces prevent lacquer transfer and surface abrasion on
  // the finished dial surface (DeCarle §3.1).
  'handle-dial': {
    operationId: 'handle-dial',
    rationale: 'Prevents dial scratch',
    icon: 'icon-fine-tip-tweezers',
  },

  // ── Movement plate screws ─────────────────────────────────────────────────
  // A correctly fitting flat blade engages the full slot width, preventing
  // slip and cam-out that burrs the screw head (Daniels §6.4).
  'remove-movement-plate-screw': {
    operationId: 'remove-movement-plate-screw',
    rationale: 'Correct torque, no cam-out',
    icon: 'icon-flat-blade-screwdriver',
  },

  // ── Bridge screws ─────────────────────────────────────────────────────────
  // Bridge screws are smaller than case screws; the flat blade is sized to
  // their shallow slot depth to avoid bridge distortion (Daniels §7.1).
  'remove-bridge-screw': {
    operationId: 'remove-bridge-screw',
    rationale: 'Flush blade, no slip',
    icon: 'icon-flat-blade-screwdriver',
  },

  // ── Hand setting ──────────────────────────────────────────────────────────
  // The domed pusher distributes press force concentrically around the cannon
  // pinion post, preventing hand-pipe distortion (DeCarle §8.3).
  'set-hour-hand': {
    operationId: 'set-hour-hand',
    rationale: 'Spreads force evenly',
    icon: 'icon-hand-setting-tool',
  },

  // ── Spring bar removal ────────────────────────────────────────────────────
  // The bifurcated tip compresses the spring-bar lug independently on each
  // side, maintaining lug wall clearance (DeCarle §2.4).
  'remove-spring-bar': {
    operationId: 'remove-spring-bar',
    rationale: 'Retains spring tension safely',
    icon: 'icon-spring-bar-tool',
  },

  // ── Hour hand handling ────────────────────────────────────────────────────
  // Clean, smooth inner jaws grip the hand pipe without transferring skin
  // oils that accelerate lacquer breakdown (Daniels §8.1).
  'handle-hour-hand': {
    operationId: 'handle-hour-hand',
    rationale: 'Avoids oil transfer',
    icon: 'icon-fine-tip-tweezers',
  },

  // ── Movement seating ─────────────────────────────────────────────────────
  // Rodico's adhesive tack secures the movement during positioning without
  // scratching the finishing plates (Daniels §5.2).
  'seat-movement': {
    operationId: 'seat-movement',
    rationale: 'Secures without surface scratch',
    icon: 'icon-movement-holder',
  },

  // ── Jewel positioning ─────────────────────────────────────────────────────
  // Precision tips exert <1 g lateral grip force, preventing the brittle
  // synthetic ruby from chipping (Daniels §9.3).
  'position-jewel': {
    operationId: 'position-jewel',
    rationale: 'Zero jewel chip risk',
    icon: 'icon-fine-tip-tweezers',
  },

  // ── Dial surface cleaning ─────────────────────────────────────────────────
  // Directed air lifts loose debris without physical contact; brushes risk
  // embedded grit abrading the printed dial finish (DeCarle §3.5).
  'clean-dial-surface': {
    operationId: 'clean-dial-surface',
    rationale: 'Lifts debris, no contact',
    icon: 'icon-dust-blower',
  },
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the rationale entry for the given operation ID, or null if not in
 * the pilot set.
 *
 * @param {string} operationId
 * @returns {RationaleEntry|null}
 */
function getToolRationale(operationId) {
  return RATIONALE_MAP[operationId] || null;
}

/**
 * Returns all operation IDs covered by the pilot set.
 * Used by QA (Test Scenario 6) to validate 100% pilot-set coverage.
 *
 * @returns {string[]}
 */
function getAllOperationIds() {
  return Object.keys(RATIONALE_MAP);
}

module.exports = { getToolRationale, getAllOperationIds, RATIONALE_MAP };
