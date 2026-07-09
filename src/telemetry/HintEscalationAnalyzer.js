/**
 * HintEscalationAnalyzer — Phase-Attributed Hint Escalation Analysis
 *
 * Issue #110: Telemetry gate required before the Scaffolded Fault-Signal System
 * (Phase 1: Loupe Visual Cues) can proceed to design/build.
 *
 * Purpose:
 *   Analyzes existing session telemetry event logs to determine whether the
 *   diagnosis phase has the highest hint escalation rate compared to all other
 *   game phases (cleaning, reassembly, delivery).  Produces a binary gate outcome
 *   (PASS / FAIL) and documents a numeric 'diagnosis-without-hint %' baseline for
 *   use as the A/B test control in the downstream Loupe Visual Cues feature.
 *
 * Design constraints (from Design Decision comment, Issue #110):
 *   - Read-only: no new events emitted, no schema changes, no UI changes.
 *   - Uses ONLY existing telemetry event data.
 *   - All results are aggregate counts/rates — no per-session PII exposed.
 *   - Phase attribution uses explicit payload.phase first, then event-name inference.
 *   - All known failure modes (schema gap, insufficient sample, partial attribution)
 *     are handled with documented coverage metrics and escalation paths.
 *
 * Accepted session record shape:
 *   {
 *     sessionId: string,          // internal ID (not exposed in output — AC7 PII guard)
 *     completed: boolean,         // whether the session reached delivery completion
 *     events: Array<{
 *       name: string,             // event name (e.g. 'hint_tier_1_shown')
 *       payload: Object,          // may include { phase: string } for explicit attribution
 *       timestamp: number,        // epoch ms
 *     }>
 *   }
 *
 * Output schema (from analyze()):
 *   {
 *     totalSessions: number,
 *     completedSessions: number,
 *     sufficientSampleSize: boolean,      // true when completedSessions >= MIN_SAMPLE (200)
 *     schemaGap: boolean,                 // true when NO events have any phase attribution
 *     insufficientSample: boolean,        // true when completedSessions < MIN_SAMPLE
 *     phases: {
 *       [phase]: {
 *         sessionsWithPhase: number,      // sessions that had at least one event in phase
 *         sessionsWithHint: number,       // sessions that had at least one hint event in phase
 *         escalationRate: number|null,    // (sessionsWithHint / sessionsWithPhase) * 100, 1dp
 *       }
 *     },
 *     overallCoveragePercent: number,     // % of events with attributable phase (1dp)
 *     diagnosisIsHighest: boolean|null,   // null when gate cannot be declared
 *     gateOutcome: 'PASS'|'FAIL'|null,    // null when insufficient sample or schema gap
 *     diagnosisWithoutHintPercent: number|null,  // A/B test control baseline (1dp)
 *   }
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum completed-session count required to declare a gate outcome (AC2). */
const MIN_SAMPLE = 200;

/** The four canonical game phases, in play order. */
const KNOWN_PHASES = ['diagnosis', 'cleaning', 'reassembly', 'delivery'];

/**
 * Static phase inference map.
 * Maps event names that are unambiguously in a single phase to that phase name.
 * This allows phase attribution without requiring an explicit payload.phase field.
 * (Test Scenario 1, 2 — happy path; partial fallback for Test Scenario 3.)
 */
const PHASE_BY_EVENT_NAME = Object.freeze({
  // Diagnosis phase
  tutorial_diagnosis_started:       'diagnosis',
  hint_tier_1_shown:                'diagnosis',
  hint_tier_2_shown:                'diagnosis',
  hint_tier_3_shown:                'diagnosis',
  diagnosis_completed_without_hint: 'diagnosis',
  diagnosis_completed_with_hint:    'diagnosis',

  // Cleaning phase
  cleaning_reveal_started:          'cleaning',
  cleaning_reveal_dismissed:        'cleaning',
  cleaning_reveal_auto_dismissed:   'cleaning',

  // Reassembly phase
  undo_attempted:                   'reassembly',
  reassembly_part_confirmed:        'reassembly',
  reassembly_completed:             'reassembly',

  // Chronograph / discovery events — reassembly context
  complication_gate_reached:        'reassembly',
  chronograph_overlay_shown:        'reassembly',
  chronograph_overlay_dismissed:    'reassembly',
  chronograph_overlay_skipped:      'reassembly',
  part_group_revealed:              'reassembly',
  discovery_mode_toggled:           'reassembly',
});

/**
 * Set of event names that constitute hint usage within a phase.
 * Any hint event attributed to a phase counts that session as "escalated" in
 * that phase (AC1 attribution + AC2 rate calculation).
 */
const HINT_EVENT_NAMES = new Set([
  'hint_tier_1_shown',
  'hint_tier_2_shown',
  'hint_tier_3_shown',
]);

// ─── Phase inference helper ───────────────────────────────────────────────────

/**
 * Resolve the game phase for a single event.
 *
 * Priority:
 *   1. Explicit payload.phase field (highest confidence)
 *   2. Inference via PHASE_BY_EVENT_NAME map
 *   3. Unattributed (attributed: false)
 *
 * @param {{ name: string, payload?: Object }} event
 * @returns {{ phase: string|null, attributed: boolean, source: 'explicit'|'inferred'|'none' }}
 */
function resolveEventPhase(event) {
  const phase = event.payload && event.payload.phase;
  if (typeof phase === 'string' && KNOWN_PHASES.includes(phase)) {
    return { phase, attributed: true, source: 'explicit' };
  }
  const inferred = PHASE_BY_EVENT_NAME[event.name];
  if (inferred) {
    return { phase: inferred, attributed: true, source: 'inferred' };
  }
  return { phase: null, attributed: false, source: 'none' };
}

/**
 * Returns true when the event represents a hint being shown to the player.
 * Supports both named hint events AND any event with payload.hintShown === true
 * (forward-compatible with future generic hint events from other phases).
 *
 * @param {{ name: string, payload?: Object }} event
 * @returns {boolean}
 */
function isHintEvent(event) {
  return (
    HINT_EVENT_NAMES.has(event.name) ||
    (event.payload != null && event.payload.hintShown === true)
  );
}

// ─── HintEscalationAnalyzer ───────────────────────────────────────────────────

class HintEscalationAnalyzer {
  /**
   * @param {Array<{sessionId: string, completed: boolean, events: Array}>} sessions
   *   Array of session records.  Each record must have a `completed` boolean and
   *   an `events` array.  `sessionId` is accepted but never included in output
   *   (PII guard — AC7 / Test Scenario 7).
   */
  constructor(sessions) {
    if (!Array.isArray(sessions)) {
      throw new TypeError('HintEscalationAnalyzer: sessions must be an array.');
    }
    this._sessions = sessions;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Run the full escalation analysis.
   *
   * Returns a result object conforming to the output schema described in the
   * module JSDoc above.  All fields are present regardless of the data state
   * (schema gap, insufficient sample, etc.) so callers can rely on a stable shape.
   *
   * @returns {Object}
   */
  analyze() {
    const totalSessions = this._sessions.length;
    const completedSessions = this._sessions.filter((s) => s.completed === true);
    const totalCompleted = completedSessions.length;

    const allEvents = completedSessions.flatMap((s) => (Array.isArray(s.events) ? s.events : []));
    const totalEvents = allEvents.length;

    // ── Schema gap check (Test Scenario 5) ──────────────────────────────────
    // If zero events have any phase attribution we cannot proceed.
    const hasAnyAttribution = totalEvents > 0 && allEvents.some((e) => resolveEventPhase(e).attributed);

    if (totalEvents === 0 || !hasAnyAttribution) {
      return {
        totalSessions,
        completedSessions: totalCompleted,
        sufficientSampleSize: totalCompleted >= MIN_SAMPLE,
        schemaGap: true,
        insufficientSample: totalCompleted < MIN_SAMPLE,
        phases: this._emptyPhaseMap(),
        overallCoveragePercent: 0,
        diagnosisIsHighest: null,
        gateOutcome: null,
        diagnosisWithoutHintPercent: null,
      };
    }

    // ── Coverage % (AC1) ──────────────────────────────────────────────────────
    const attributedCount = allEvents.filter((e) => resolveEventPhase(e).attributed).length;
    const overallCoveragePercent = parseFloat(((attributedCount / totalEvents) * 100).toFixed(1));

    // ── Per-phase stats (AC1, AC2) ────────────────────────────────────────────
    const phases = this._computePerPhaseStats(completedSessions);

    // ── Diagnosis-without-hint % (AC4) ────────────────────────────────────────
    const diagnosisWithoutHintPercent = this._computeDiagnosisWithoutHintPercent(completedSessions);

    // ── Insufficient sample (Test Scenario 4) ────────────────────────────────
    const insufficientSample = totalCompleted < MIN_SAMPLE;
    const sufficientSampleSize = !insufficientSample;

    // ── Binary gate (AC3) — only when sample is sufficient ───────────────────
    let diagnosisIsHighest = null;
    let gateOutcome = null;

    if (!insufficientSample) {
      const diagRate = phases.diagnosis ? phases.diagnosis.escalationRate : null;
      const otherRates = KNOWN_PHASES
        .filter((p) => p !== 'diagnosis')
        .map((p) => (phases[p] ? phases[p].escalationRate : null))
        .filter((r) => r !== null);

      if (diagRate !== null) {
        diagnosisIsHighest = otherRates.length === 0 || otherRates.every((r) => diagRate >= r);
        gateOutcome = diagnosisIsHighest ? 'PASS' : 'FAIL';
      }
    }

    return {
      totalSessions,
      completedSessions: totalCompleted,
      sufficientSampleSize,
      schemaGap: false,
      insufficientSample,
      phases,
      overallCoveragePercent,
      diagnosisIsHighest,
      gateOutcome,
      diagnosisWithoutHintPercent,
    };
  }

  /**
   * Generate a Markdown findings report suitable for posting as an issue comment.
   * This satisfies AC5: findings summary and data table posted on the issue.
   *
   * @param {Object} result  The return value from analyze().
   * @returns {string}       Markdown-formatted report.
   */
  generateReport(result) {
    const lines = [];

    lines.push('## Telemetry Analysis: Phase-Attributed Hint Escalation (Issue #110)');
    lines.push('');

    // ── Blocker: schema gap ──
    if (result.schemaGap) {
      lines.push('### ⚠️ BLOCKER: Phase Attribution Absent from Event Schema');
      lines.push('');
      lines.push(
        'No events in the analyzed sessions carry resolvable phase attribution ' +
          '(neither `payload.phase` field nor a recognized event name). ' +
          'A follow-on instrumentation task must be created to add phase context ' +
          'to telemetry events before this analysis can proceed.'
      );
      lines.push('');
      lines.push('**Gate Outcome: ⚠️ INCONCLUSIVE — schema gap blocker**');
      lines.push('');
      lines.push(
        '> Phase 1: Loupe Visual Cues is gated until schema gap is resolved.'
      );
      return lines.join('\n');
    }

    // ── Summary header ──
    lines.push(`**Sessions Analyzed:** ${result.completedSessions}`);
    lines.push(`**Phase Attribution Coverage:** ${result.overallCoveragePercent}%`);
    if (result.insufficientSample) {
      lines.push(
        `**⚠️ Insufficient Sample:** Only ${result.completedSessions} completed sessions ` +
          `(minimum ${MIN_SAMPLE} required). Gate outcome cannot be declared. ` +
          'Propose extending the instrumentation period and re-running analysis once ' +
          `${MIN_SAMPLE}+ sessions are available.`
      );
    }
    lines.push('');

    // ── Per-phase table ──
    lines.push('### Hint Escalation Rate by Game Phase');
    lines.push('');
    lines.push('| Phase | Sessions in Phase | Sessions with Hint | Escalation Rate |');
    lines.push('|-------|------------------:|-------------------:|----------------:|');

    for (const phase of KNOWN_PHASES) {
      const s = result.phases[phase] || { sessionsWithPhase: 0, sessionsWithHint: 0, escalationRate: null };
      const rate = s.escalationRate !== null ? `${s.escalationRate}%` : 'N/A';
      lines.push(`| ${phase} | ${s.sessionsWithPhase} | ${s.sessionsWithHint} | ${rate} |`);
    }

    lines.push('');

    // ── A/B test baseline ──
    lines.push('### Baseline Metric — A/B Test Control (AC4)');
    lines.push('');
    const baselineValue =
      result.diagnosisWithoutHintPercent !== null
        ? `**${result.diagnosisWithoutHintPercent}%**`
        : 'N/A';
    lines.push(`**Diagnosis-Without-Hint %:** ${baselineValue}`);
    lines.push(
      '_This numeric value is the pre-treatment control baseline for the ' +
        'Loupe Visual Cues A/B test (Phase 1). The A/B test will measure whether ' +
        'the intervention increases this percentage._'
    );
    lines.push('');

    // ── Gate outcome ──
    lines.push('### Gate Outcome (AC3)');
    lines.push('');
    if (result.gateOutcome === 'PASS') {
      lines.push('**✅ PASS — Diagnosis is the highest hint escalation phase.**');
      lines.push('');
      lines.push(
        'The diagnosis phase has the highest hint escalation rate across all game phases. ' +
          'Phase 1: Loupe Visual Cues may proceed to design and build.'
      );
    } else if (result.gateOutcome === 'FAIL') {
      lines.push('**❌ FAIL — Diagnosis is NOT the highest hint escalation phase.**');
      lines.push('');
      lines.push(
        'Another game phase has a higher hint escalation rate than diagnosis. ' +
          'Escalate this finding to PM/PO for priority re-evaluation before ' +
          'Phase 1: Loupe Visual Cues proceeds. The highest-friction phase should ' +
          'be prioritized for intervention instead.'
      );
    } else {
      lines.push('**⚠️ INCONCLUSIVE — Gate outcome cannot be declared.**');
      lines.push('');
      lines.push(
        'Insufficient completed sessions to declare a statistically meaningful gate. ' +
          `Minimum ${MIN_SAMPLE} completed sessions required; ` +
          `${result.completedSessions} are available. ` +
          'Re-run analysis after additional instrumentation period.'
      );
    }

    return lines.join('\n');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Compute per-phase escalation statistics across all completed sessions.
   *
   * For each phase:
   *   sessionsWithPhase — sessions containing at least one attributed event for this phase
   *   sessionsWithHint  — subset of those where at least one event is a hint event
   *   escalationRate    — (sessionsWithHint / sessionsWithPhase) × 100, rounded to 1dp
   *                       null when sessionsWithPhase === 0
   *
   * @param {Array} completedSessions
   * @returns {{ [phase: string]: { sessionsWithPhase, sessionsWithHint, escalationRate } }}
   */
  _computePerPhaseStats(completedSessions) {
    const stats = {};

    for (const phase of KNOWN_PHASES) {
      let sessionsWithPhase = 0;
      let sessionsWithHint = 0;

      for (const session of completedSessions) {
        const events = Array.isArray(session.events) ? session.events : [];

        const phaseEvents = events.filter((e) => {
          const { phase: p } = resolveEventPhase(e);
          return p === phase;
        });

        if (phaseEvents.length === 0) continue;

        sessionsWithPhase += 1;

        const hasHint = phaseEvents.some((e) => isHintEvent(e));
        if (hasHint) sessionsWithHint += 1;
      }

      const escalationRate =
        sessionsWithPhase === 0
          ? null
          : parseFloat(((sessionsWithHint / sessionsWithPhase) * 100).toFixed(1));

      stats[phase] = { sessionsWithPhase, sessionsWithHint, escalationRate };
    }

    return stats;
  }

  /**
   * Compute the 'diagnosis-without-hint %' baseline (AC4).
   *
   * = (diagnosis sessions with NO hint events / all diagnosis sessions) × 100
   *
   * Returns null when no completed sessions have any diagnosis-phase events.
   *
   * @param {Array} completedSessions
   * @returns {number|null}
   */
  _computeDiagnosisWithoutHintPercent(completedSessions) {
    let diagSessions = 0;
    let diagWithoutHint = 0;

    for (const session of completedSessions) {
      const events = Array.isArray(session.events) ? session.events : [];
      const diagEvents = events.filter((e) => {
        const { phase } = resolveEventPhase(e);
        return phase === 'diagnosis';
      });

      if (diagEvents.length === 0) continue;

      diagSessions += 1;
      const usedHint = diagEvents.some((e) => isHintEvent(e));
      if (!usedHint) diagWithoutHint += 1;
    }

    if (diagSessions === 0) return null;
    return parseFloat(((diagWithoutHint / diagSessions) * 100).toFixed(1));
  }

  /** Returns an empty per-phase map (used for schema-gap / zero-event paths). */
  _emptyPhaseMap() {
    const map = {};
    for (const phase of KNOWN_PHASES) {
      map[phase] = { sessionsWithPhase: 0, sessionsWithHint: 0, escalationRate: null };
    }
    return map;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  HintEscalationAnalyzer,
  KNOWN_PHASES,
  MIN_SAMPLE,
  HINT_EVENT_NAMES,
  PHASE_BY_EVENT_NAME,
  resolveEventPhase,
  isHintEvent,
};
