/**
 * ProficiencyEngine — per-tool mastery progression core engine.
 *
 * Issue #297 — Per-Tool Mastery Progression: Core Engine (2–3 Tools, Tier 1–5)
 * Issue #307 — Per-Tool Mastery Progression: 5-Tier Proficiency System for All 8 Repair Tools
 *
 * Design contract (from approved design):
 *   - Manages per-tool proficiency state: { tier, points } for each designated tool.
 *   - Tier progression: 0 (unnamed) → 1 (Apprentice) → 2 (Journeyman) → 3 (Craftsman)
 *     → 4 (Master) → 5 (Grand Maître).
 *   - Tier 0 is the unnamed starting state — displayed as "no proficiency earned".
 *     TIER_NAMES[0] = '' (empty string); getProficiency() returns '' for tier 0.
 *   - Accuracy-weighted gain: points earned on each tool use, weighted by retry/undo count.
 *     accuracyMultiplier = max(0.2, 1.0 - retryCount * 0.4)
 *     pointsGained = baseGain * accuracyMultiplier
 *   - Functional rewards fire at correct tiers:
 *       Tier 3+: time modifier applied (0.80 = 20% reduction)
 *       Tier 4+: time modifier deepens (0.70 = 30% reduction)
 *       Tier 5:  error margin narrows (0.75 = 25% tightening)
 *   - Fast first milestone: Tier 1 reachable within 5–10 accurate uses per session.
 *     With baseGain = 2.0 and TIER_THRESHOLDS[0] = 10, 5 accurate uses → Tier 1 ✓
 *   - Designated tools (all 8 ToolRegistry tools, Issue #307 expansion):
 *       Phase 1 (Issue #297):
 *         1. fine-tip-tweezers      (5 eligible operations — highest in registry)
 *         2. flat-blade-screwdriver (4 eligible operations)
 *         3. spring-bar-tool        (4 eligible operations)
 *       Phase 2 additions (Issue #307):
 *         4. cross-tip-screwdriver  (4 eligible operations)
 *         5. case-knife             (2 eligible operations — see AC5 baseGain note)
 *         6. movement-holder        (6 eligible operations)
 *         7. hand-setting-tool      (4 eligible operations)
 *         8. dust-blower            (3 eligible operations)
 *   - Performance: proficiency calculation is O(1), well within the ≤8 ms budget.
 *
 * AC1: accuracy-weighted gain; retry events proportionally reduce gain.
 * AC2: functional rewards at Tier 3 (time) and Tier 5 (error margin).
 * AC3: Tier 1 reachable in 5–10 accurate uses (baseGain = 2.0, threshold = 10).
 * AC4: initialised from PlayerSaveState `tool_proficiency` field; null load = Tier 0 all tools.
 * AC5: getProficiencyBarData(toolId) drives ToolPanel proficiency bar display.
 * AC3(#307): vocabulary migration — TIER_NAMES globally renamed; tier 0 unnamed (empty string);
 *   one-time notice flag `tool_proficiency_vocabulary_updated` in PlayerSaveState.
 */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Tier names (index = tier number 0–5).
 * Tier 0 is the unnamed starting state ('no proficiency earned').
 * TIER_NAMES[0] is '' (empty string) — use getProficiency().tierName for display.
 *
 * Issue #307: globally renamed from [Novice, Apprentice, Journeyman, Expert, Artisan, Master]
 * to ['' (unnamed), Apprentice, Journeyman, Craftsman, Master, Grand Maître].
 * Existing #297 saves are structurally unchanged (tier values stored as integers);
 * labels Expert→Craftsman, Artisan→Master, Master→Grand Maître update silently on load.
 * One-time in-game notice (tool_proficiency_vocabulary_updated in PlayerSaveState) acknowledges
 * the vocabulary rebranding for players who had earned Expert, Artisan, or Master on #297 tools.
 * @type {string[]}
 */
const TIER_NAMES = ['', 'Apprentice', 'Journeyman', 'Craftsman', 'Master', 'Grand Maître'];

/**
 * Cumulative point thresholds to reach each tier (index = tier number 1–5).
 * Points needed to advance FROM (tier - 1) TO tier:
 *   Tier 0 → 1: 10 pts  (5 accurate uses at baseGain=2.0)
 *   Tier 1 → 2: 30 pts  (15 accurate uses)
 *   Tier 2 → 3: 60 pts  (30 accurate uses)
 *   Tier 3 → 4: 100 pts (50 accurate uses)
 *   Tier 4 → 5: 150 pts (75 accurate uses)
 * @type {number[]}
 */
const TIER_THRESHOLDS = [10, 30, 60, 100, 150];

/**
 * Maximum achievable tier.
 * @type {number}
 */
const MAX_TIER = 5;

/**
 * All 8 designated tool IDs with proficiency config.
 * Phase 1 (Issue #297): fine-tip-tweezers, flat-blade-screwdriver, spring-bar-tool.
 * Phase 2 additions (Issue #307): cross-tip-screwdriver, case-knife, movement-holder,
 *   hand-setting-tool, dust-blower.
 * All tools use baseGain = 2.0. Tier 1 reachable in 5 accurate uses (threshold = 10).
 * Note: case-knife has only 2 eligible operations — pre-build playtest gate should
 * verify AC5 30-minute reachability; baseGain can be raised without affecting other tools.
 * @type {Object.<string, { baseGain: number }>}
 */
const DESIGNATED_TOOLS = {
  'fine-tip-tweezers':      { baseGain: 2.0 },
  'flat-blade-screwdriver': { baseGain: 2.0 },
  'spring-bar-tool':        { baseGain: 2.0 },
  'cross-tip-screwdriver':  { baseGain: 2.0 },
  'case-knife':             { baseGain: 2.0 },
  'movement-holder':        { baseGain: 2.0 },
  'hand-setting-tool':      { baseGain: 2.0 },
  'dust-blower':            { baseGain: 2.0 },
};

/**
 * Accuracy floor: minimum multiplier even at maximum retries.
 * @type {number}
 */
const ACCURACY_FLOOR = 0.2;

/**
 * Retry penalty per undo/retry event.
 * @type {number}
 */
const RETRY_PENALTY_PER_EVENT = 0.4;

/**
 * Time modifier applied at Tier 3 (20% faster).
 * @type {number}
 */
const TIME_MODIFIER_TIER_3 = 0.80;

/**
 * Time modifier applied at Tier 4 (30% faster).
 * @type {number}
 */
const TIME_MODIFIER_TIER_4 = 0.70;

/**
 * Error margin multiplier applied at Tier 5 (25% tighter tolerance).
 * @type {number}
 */
const ERROR_MARGIN_MODIFIER_TIER_5 = 0.75;

// ── ProficiencyEngine ─────────────────────────────────────────────────────────

class ProficiencyEngine {
  /**
   * @param {Object.<string, { tier: number, points: number }>|null} savedState
   *   Loaded from PlayerSaveState `tool_proficiency` field.
   *   null = pre-feature save; all tools default to Tier 0, 0 points.
   */
  constructor(savedState = null) {
    /** @type {Object.<string, { tier: number, points: number }>} */
    this._state = {};

    for (const toolId of Object.keys(DESIGNATED_TOOLS)) {
      const saved = savedState && savedState[toolId];
      this._state[toolId] = {
        tier:   (saved && typeof saved.tier   === 'number') ? saved.tier   : 0,
        points: (saved && typeof saved.points === 'number') ? saved.points : 0,
      };
    }
  }

  // ── Tool Designation ────────────────────────────────────────────────────────

  /**
   * Returns true if the tool is in the Phase 1 designated set.
   * Out-of-scope tools receive no proficiency tracking in this phase.
   *
   * @param {string} toolId
   * @returns {boolean}
   */
  isDesignatedTool(toolId) {
    return Object.prototype.hasOwnProperty.call(DESIGNATED_TOOLS, toolId);
  }

  /**
   * Returns the list of designated Phase 1 tool IDs.
   * @returns {string[]}
   */
  getDesignatedToolIds() {
    return Object.keys(DESIGNATED_TOOLS);
  }

  // ── Proficiency Gain ────────────────────────────────────────────────────────

  /**
   * Record a tool use and apply accuracy-weighted proficiency gain.
   *
   * Gain formula (AC1):
   *   accuracyMultiplier = max(ACCURACY_FLOOR, 1.0 − retryCount × RETRY_PENALTY_PER_EVENT)
   *   pointsGained       = baseGain × accuracyMultiplier
   *
   * No-ops for non-designated tools (returns null).
   *
   * @param {string} toolId          — the tool used
   * @param {number} [retryCount=0]  — number of undo/retry events during this operation
   * @returns {{ pointsGained: number, tierBefore: number, tierAfter: number,
   *             accuracyMultiplier: number, totalPoints: number }|null}
   *   null if toolId is not a designated tool.
   */
  recordToolUse(toolId, retryCount = 0) {
    if (!this.isDesignatedTool(toolId)) return null;

    const config = DESIGNATED_TOOLS[toolId];
    const state  = this._state[toolId];

    const accuracyMultiplier = Math.max(ACCURACY_FLOOR, 1.0 - retryCount * RETRY_PENALTY_PER_EVENT);
    const pointsGained       = config.baseGain * accuracyMultiplier;

    const tierBefore = state.tier;

    // Only accumulate points if not already at max tier
    if (state.tier < MAX_TIER) {
      state.points += pointsGained;
      this._advanceTiers(state);
    }

    return {
      pointsGained,
      accuracyMultiplier,
      tierBefore,
      tierAfter:   state.tier,
      totalPoints: state.points,
    };
  }

  // ── Proficiency Queries ─────────────────────────────────────────────────────

  /**
   * Returns the current proficiency state for a tool.
   *
   * @param {string} toolId
   * @returns {{ tier: number, tierName: string, points: number,
   *             pointsInTier: number, pointsToNextTier: number|null,
   *             isMaxTier: boolean }|null}
   *   null if toolId is not a designated tool.
   */
  getProficiency(toolId) {
    if (!this.isDesignatedTool(toolId)) return null;

    const state = this._state[toolId];
    const cumulativeThreshold = this._cumulativeThreshold(state.tier);
    const nextThreshold       = state.tier < MAX_TIER
      ? this._cumulativeThreshold(state.tier + 1)
      : null;

    const pointsInTier    = state.points - cumulativeThreshold;
    const pointsToNextTier = nextThreshold !== null
      ? nextThreshold - state.points
      : null;

    return {
      tier:            state.tier,
      tierName:        TIER_NAMES[state.tier] !== undefined ? TIER_NAMES[state.tier] : 'Unknown',
      points:          state.points,
      pointsInTier:    Math.max(0, pointsInTier),
      pointsToNextTier: pointsToNextTier !== null ? Math.max(0, pointsToNextTier) : null,
      isMaxTier:       state.tier >= MAX_TIER,
    };
  }

  /**
   * Returns proficiency bar data for ToolPanel display (AC5).
   * Returns null for non-designated tools (out-of-scope tools show no proficiency UI).
   *
   * @param {string} toolId
   * @returns {{ tier: number, tierName: string, progressFraction: number,
   *             isMaxTier: boolean, label: string }|null}
   */
  getProficiencyBarData(toolId) {
    const proficiency = this.getProficiency(toolId);
    if (!proficiency) return null;

    let progressFraction;
    if (proficiency.isMaxTier) {
      progressFraction = 1.0;
    } else {
      const tierStart   = this._cumulativeThreshold(proficiency.tier);
      const tierEnd     = this._cumulativeThreshold(proficiency.tier + 1);
      const tierSpan    = tierEnd - tierStart;
      progressFraction  = tierSpan > 0
        ? (proficiency.points - tierStart) / tierSpan
        : 0;
    }

    const label = proficiency.isMaxTier
      ? `${proficiency.tierName} (Maxed)`
      : proficiency.tier === 0
        ? `no proficiency earned — 0/${this._tierSpan(0)} pts`
        : `${proficiency.tierName} — ${Math.floor(proficiency.pointsInTier)}/${this._tierSpan(proficiency.tier)} pts`;

    return {
      tier:             proficiency.tier,
      tierName:         proficiency.tierName,
      progressFraction: Math.min(1.0, Math.max(0, progressFraction)),
      isMaxTier:        proficiency.isMaxTier,
      label,
    };
  }

  // ── Functional Reward Modifiers ─────────────────────────────────────────────

  /**
   * Returns the operation time modifier for the given tool at its current tier.
   *
   * Tier 0–2: 1.0 (no change)
   * Tier 3:   0.80 (20% reduction — AC2)
   * Tier 4:   0.70 (30% reduction — AC2)
   * Tier 5:   0.70 (Tier 5 reward is error margin, not additional time reduction)
   *
   * @param {string} toolId
   * @returns {number} Multiplier to apply to base operation time. 1.0 = no change.
   */
  getTimeModifier(toolId) {
    if (!this.isDesignatedTool(toolId)) return 1.0;
    const { tier } = this._state[toolId];
    if (tier >= 4) return TIME_MODIFIER_TIER_4;
    if (tier >= 3) return TIME_MODIFIER_TIER_3;
    return 1.0;
  }

  /**
   * Returns the error margin modifier for the given tool at its current tier.
   *
   * Tier 0–4: 1.0 (no change)
   * Tier 5:   0.75 (25% tighter tolerance — AC2, Tier 5 Master reward)
   *
   * A value < 1.0 means the acceptable error window narrows, rewarding precision.
   *
   * @param {string} toolId
   * @returns {number} Multiplier to apply to the base error margin. 1.0 = no change.
   */
  getErrorMarginModifier(toolId) {
    if (!this.isDesignatedTool(toolId)) return 1.0;
    const { tier } = this._state[toolId];
    return tier >= MAX_TIER ? ERROR_MARGIN_MODIFIER_TIER_5 : 1.0;
  }

  // ── Save State Serialisation ────────────────────────────────────────────────

  /**
   * Returns a serialisable snapshot of all proficiency state.
   * Suitable for writing to PlayerSaveState.tool_proficiency (AC4).
   *
   * @returns {Object.<string, { tier: number, points: number }>}
   */
  serialize() {
    const out = {};
    for (const [toolId, state] of Object.entries(this._state)) {
      out[toolId] = { tier: state.tier, points: state.points };
    }
    return out;
  }

  // ── Synthetic Injection (for testing functional rewards — AC2) ───────────────

  /**
   * Directly set a tool's tier and points.
   * Used in tests to synthetically inject proficiency state (AC2 test scenario 4 & 5).
   *
   * @param {string} toolId
   * @param {number} tier
   * @param {number} [points]  — defaults to the cumulative threshold for that tier
   */
  injectProficiency(toolId, tier, points = null) {
    if (!this.isDesignatedTool(toolId)) {
      throw new Error(`injectProficiency: '${toolId}' is not a designated Phase 1 tool.`);
    }
    const clampedTier = Math.max(0, Math.min(MAX_TIER, tier));
    this._state[toolId] = {
      tier:   clampedTier,
      points: points !== null ? points : this._cumulativeThreshold(clampedTier),
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Advance tiers as long as cumulative points meet the next threshold.
   * @param {{ tier: number, points: number }} state
   */
  _advanceTiers(state) {
    while (state.tier < MAX_TIER) {
      const needed = this._cumulativeThreshold(state.tier + 1);
      if (state.points >= needed) {
        state.tier += 1;
      } else {
        break;
      }
    }
  }

  /**
   * Returns the cumulative point threshold to reach the given tier.
   * Tier 0 = 0 (always starts here).
   *
   * @param {number} tier
   * @returns {number}
   */
  _cumulativeThreshold(tier) {
    if (tier <= 0) return 0;
    let total = 0;
    for (let t = 0; t < tier && t < TIER_THRESHOLDS.length; t++) {
      total += TIER_THRESHOLDS[t];
    }
    return total;
  }

  /**
   * Returns the number of points in the span of the given tier
   * (i.e. how many points are needed to advance from tier to tier+1).
   *
   * @param {number} tier
   * @returns {number}
   */
  _tierSpan(tier) {
    if (tier >= TIER_THRESHOLDS.length) return 0;
    return TIER_THRESHOLDS[tier];
  }
}

module.exports = {
  ProficiencyEngine,
  TIER_NAMES,
  TIER_THRESHOLDS,
  MAX_TIER,
  DESIGNATED_TOOLS,
  ACCURACY_FLOOR,
  RETRY_PENALTY_PER_EVENT,
  TIME_MODIFIER_TIER_3,
  TIME_MODIFIER_TIER_4,
  ERROR_MARGIN_MODIFIER_TIER_5,
};
