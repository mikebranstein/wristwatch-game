/**
 * AnnotationRubric — Onboarding Telemetry Baseline & Failure Map (Issue #112)
 *
 * Provides the structured annotation data model for recording playtest sessions
 * during the first restoration job. Annotators use this rubric to capture each
 * decision-point interaction with a consistent schema.
 *
 * Zero game code is modified by this module. This is a pure research artifact.
 *
 * Annotation entry fields (per design decision):
 *   stepName          — The named decision point in the first restoration job
 *   elapsedTimeSeconds — Seconds since session start when the event occurred
 *   eventType         — Classification from EVENT_TYPES
 *   notes             — Free-text qualitative observation (participant verbalization, etc.)
 *   tooltipInteraction — Observed interaction with any on-screen tooltip at this step
 */

'use strict';

// ─── Event taxonomy ───────────────────────────────────────────────────────────

const EVENT_TYPES = {
  /**
   * Participant reached this step and continued without pausing or requesting help.
   * Used for the happy-path completion counter.
   */
  COMPLETION: 'completion',

  /**
   * Participant exited the session at this step without completing the first job.
   * A hard abandonment — the participant did not recover.
   */
  ABANDONMENT: 'abandonment',

  /**
   * Participant paused >10 s, verbalized confusion, or asked for help — but
   * ultimately continued and did not abandon. Distinguishes confusion-with-recovery
   * from hard abandonment for the failure map ranking.
   */
  CONFUSION_WITH_RECOVERY: 'confusion_with_recovery',

  /**
   * A tooltip was displayed at this step but the participant did not interact with
   * it (did not read, dismissed immediately, or appeared not to notice).
   * Enables the report to identify steps where tooltips are seen-but-ignored.
   */
  TOOLTIP_IGNORED: 'tooltip_ignored',
};

// ─── Tooltip interaction taxonomy ─────────────────────────────────────────────

const TOOLTIP_INTERACTIONS = {
  /** Tooltip appeared; participant read and closed it normally. */
  READ: 'read',
  /** Tooltip appeared; participant dismissed it immediately without reading. */
  DISMISSED_IMMEDIATELY: 'dismissed_immediately',
  /** Tooltip appeared; participant appeared not to notice it at all. */
  NOT_NOTICED: 'not_noticed',
  /** No tooltip was displayed at this step. */
  NONE: 'none',
};

// ─── Known first-job decision points ─────────────────────────────────────────

/**
 * Canonical ordered list of decision points in the first restoration job.
 * Annotators pick from this list when recording a step name — free text is
 * also allowed (annotate as-observed), but matching a canonical step enables
 * automated aggregation in FailureMapReport.
 */
const FIRST_JOB_STEPS = [
  'job-selection',
  'tool-selection',
  'case-back-removal',
  'movement-inspection',
  'component-identification',
  'disassembly-start',
  'disassembly-mid',
  'cleaning-start',
  'reassembly-start',
  'reassembly-mid',
  'final-inspection',
  'job-completion',
];

// ─── AnnotationEntry ──────────────────────────────────────────────────────────

class AnnotationEntry {
  /**
   * @param {Object} params
   * @param {string}  params.stepName             Canonical step or free-text label
   * @param {number}  params.elapsedTimeSeconds   Seconds from session start
   * @param {string}  params.eventType            One of EVENT_TYPES values
   * @param {string}  [params.notes]              Qualitative observation
   * @param {string}  [params.tooltipInteraction] One of TOOLTIP_INTERACTIONS values
   */
  constructor({
    stepName,
    elapsedTimeSeconds,
    eventType,
    notes = '',
    tooltipInteraction = TOOLTIP_INTERACTIONS.NONE,
  }) {
    if (!stepName || typeof stepName !== 'string') {
      throw new Error('AnnotationEntry: stepName is required and must be a string.');
    }
    if (typeof elapsedTimeSeconds !== 'number' || elapsedTimeSeconds < 0) {
      throw new Error('AnnotationEntry: elapsedTimeSeconds must be a non-negative number.');
    }
    const validEventTypes = Object.values(EVENT_TYPES);
    if (!validEventTypes.includes(eventType)) {
      throw new Error(
        `AnnotationEntry: eventType "${eventType}" is not valid. Use one of: ${validEventTypes.join(', ')}`
      );
    }
    const validTooltip = Object.values(TOOLTIP_INTERACTIONS);
    if (!validTooltip.includes(tooltipInteraction)) {
      throw new Error(
        `AnnotationEntry: tooltipInteraction "${tooltipInteraction}" is not valid.`
      );
    }

    this.stepName = stepName;
    this.elapsedTimeSeconds = elapsedTimeSeconds;
    this.eventType = eventType;
    this.notes = notes;
    this.tooltipInteraction = tooltipInteraction;
  }

  /** Returns true if this entry records a hard abandonment. */
  isAbandonment() {
    return this.eventType === EVENT_TYPES.ABANDONMENT;
  }

  /** Returns true if participant showed confusion but recovered. */
  isConfusionWithRecovery() {
    return this.eventType === EVENT_TYPES.CONFUSION_WITH_RECOVERY;
  }

  /** Returns true if a tooltip was shown but the participant ignored it. */
  isTooltipIgnored() {
    return this.eventType === EVENT_TYPES.TOOLTIP_IGNORED;
  }

  toJSON() {
    return {
      stepName: this.stepName,
      elapsedTimeSeconds: this.elapsedTimeSeconds,
      eventType: this.eventType,
      notes: this.notes,
      tooltipInteraction: this.tooltipInteraction,
    };
  }
}

// ─── AnnotationRubric ─────────────────────────────────────────────────────────

/**
 * Container for all annotation entries in a single playtest session.
 * Supports both live annotation and async post-session recording review
 * (test scenario #6 requirement).
 */
class AnnotationRubric {
  /**
   * @param {Object} params
   * @param {string} params.sessionId      Unique session identifier
   * @param {string} [params.participantId] Anonymised participant identifier
   * @param {boolean} [params.asyncReview] True if annotated from recording after-the-fact
   */
  constructor({ sessionId, participantId = null, asyncReview = false }) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('AnnotationRubric: sessionId is required.');
    }
    this._sessionId = sessionId;
    this._participantId = participantId;
    this._asyncReview = asyncReview;
    this._entries = [];
    this._sessionComplete = false;
  }

  get sessionId() {
    return this._sessionId;
  }

  get participantId() {
    return this._participantId;
  }

  /** True if this rubric was filled in from a recording (async), not live. */
  get asyncReview() {
    return this._asyncReview;
  }

  /**
   * Add an annotation entry to this session's rubric.
   * Supports both real-time and async post-session update flows.
   *
   * @param {AnnotationEntry|Object} entry  AnnotationEntry instance or plain-object params
   */
  addEntry(entry) {
    const annotationEntry =
      entry instanceof AnnotationEntry ? entry : new AnnotationEntry(entry);
    this._entries.push(annotationEntry);
    return this;
  }

  /**
   * Replace or update the first entry matching stepName.
   * Satisfies test scenario #6: async review can refine live annotations.
   *
   * @param {string} stepName
   * @param {Object} updatedFields  Fields to merge into the existing entry
   */
  updateEntry(stepName, updatedFields) {
    const idx = this._entries.findIndex((e) => e.stepName === stepName);
    if (idx === -1) {
      throw new Error(`AnnotationRubric.updateEntry: no entry found for step "${stepName}".`);
    }
    const existing = this._entries[idx];
    this._entries[idx] = new AnnotationEntry({
      stepName: existing.stepName,
      elapsedTimeSeconds: existing.elapsedTimeSeconds,
      eventType: existing.eventType,
      notes: existing.notes,
      tooltipInteraction: existing.tooltipInteraction,
      ...updatedFields,
    });
    return this;
  }

  /** Mark the session as fully complete (participant finished the first job). */
  markComplete() {
    this._sessionComplete = true;
    return this;
  }

  /** Returns all annotation entries in insertion order. */
  getEntries() {
    return this._entries.slice();
  }

  /** Returns all entries for a specific named step. */
  getEntriesForStep(stepName) {
    return this._entries.filter((e) => e.stepName === stepName);
  }

  /** True if the participant finished the first job end-to-end. */
  isSessionComplete() {
    return this._sessionComplete;
  }

  /** True if any entry records a hard abandonment. */
  hasAbandonment() {
    return this._entries.some((e) => e.isAbandonment());
  }

  /** Returns the first abandonment entry, or null if no abandonment recorded. */
  getAbandonmentEntry() {
    return this._entries.find((e) => e.isAbandonment()) || null;
  }

  /** Returns all confusion-with-recovery entries. */
  getConfusionEntries() {
    return this._entries.filter((e) => e.isConfusionWithRecovery());
  }

  /** Returns all tooltip-ignored entries. */
  getTooltipIgnoredEntries() {
    return this._entries.filter((e) => e.isTooltipIgnored());
  }

  toJSON() {
    return {
      sessionId: this._sessionId,
      participantId: this._participantId,
      asyncReview: this._asyncReview,
      sessionComplete: this._sessionComplete,
      entries: this._entries.map((e) => e.toJSON()),
    };
  }
}

module.exports = {
  AnnotationRubric,
  AnnotationEntry,
  EVENT_TYPES,
  TOOLTIP_INTERACTIONS,
  FIRST_JOB_STEPS,
};
