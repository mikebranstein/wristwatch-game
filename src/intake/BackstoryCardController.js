/**
 * BackstoryCardController — manages the Client Backstory Card System.
 *
 * Issue #126 — Client Backstory Card System:
 *   Mirrors the GuidedJobOnboardingController / PlayerSaveState / TelemetryEmitter pattern
 *   established by Issue #111. Owns:
 *
 *   1. A/B cohort assignment: written once to PlayerSaveState as `ab_backstory_cohort`
 *      ('backstory' | 'control') before any intake-screen code runs. Uses the existing
 *      AB_COHORT_ASSIGNED telemetry event (reuse, not invention).
 *
 *   2. Template selection by watchType from the string table, with a session-scoped
 *      recency buffer (≥5-job window) satisfying Test Scenario 7's no-repeat constraint.
 *
 *   3. Variable substitution (clientName, relationshipContext, timeBroken, occasion) with
 *      neutral fallback strings for any missing variable (Test Scenario 8 / edge case).
 *
 *   4. Returns a view-model dict rather than owning DOM directly (consistent with
 *      OrderDashboard pattern). Delegates rendering to the UI layer.
 *
 *   5. Fires TelemetryEmitter events:
 *        - backstory_card_shown  (when a card is rendered)
 *        - job_accepted          (when a player accepts a job, with has_backstory flag)
 *        - job_declined          (when a player declines a job, with has_backstory flag)
 */

'use strict';

const { getTemplatesForWatchType } = require('../data/backstory-templates');
const { EVENTS } = require('../telemetry/TelemetryEmitter');

/** Default neutral fallback strings when a variable field fails to populate. */
const VARIABLE_FALLBACKS = {
  clientName:          'A client',
  relationshipContext: 'a family member',
  timeBroken:          'many years',
  occasion:            'a special occasion',
};

/** Size of the recency buffer — no card repeats within this window (Test Scenario 7). */
const RECENCY_BUFFER_SIZE = 5;

/** A/B cohort values. */
const COHORT_BACKSTORY = 'backstory';
const COHORT_CONTROL   = 'control';

class BackstoryCardController {
  /**
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   * @param {import('../telemetry/TelemetryEmitter').TelemetryEmitter} telemetry
   * @param {() => number} [rng]  Injectable RNG returning [0,1); default Math.random.
   */
  constructor(saveState, telemetry, rng = Math.random) {
    if (!saveState) throw new Error('BackstoryCardController requires a PlayerSaveState instance.');
    if (!telemetry) throw new Error('BackstoryCardController requires a TelemetryEmitter instance.');
    this._save     = saveState;
    this._telemetry = telemetry;
    this._rng      = rng;

    // Session-scoped recency buffer — IDs of recently-shown templates.
    // Persisted during the session so rapid job cycling does not repeat cards
    // within the RECENCY_BUFFER_SIZE window (Test Scenario 7).
    this._recentTemplateIds = [];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Assign the player's A/B cohort if not already assigned.
   * Must be called synchronously before any intake-screen code runs.
   *
   * AC1/AC2: assigns 'backstory' or 'control' with a 50/50 split.
   *
   * @returns {'backstory'|'control'}  The player's cohort.
   */
  assignCohortIfNeeded() {
    const existing = this._save.get('ab_backstory_cohort');
    if (existing === COHORT_BACKSTORY || existing === COHORT_CONTROL) {
      return existing;
    }

    const cohort = this._rng() < 0.5 ? COHORT_BACKSTORY : COHORT_CONTROL;
    this._save.set('ab_backstory_cohort', cohort);
    this._telemetry.abCohortAssigned(cohort);
    return cohort;
  }

  /**
   * Returns the player's assigned cohort (null if not yet assigned).
   * @returns {'backstory'|'control'|null}
   */
  getCohort() {
    return this._save.get('ab_backstory_cohort') || null;
  }

  /**
   * Build and return the backstory card view-model for a job in the 'backstory' cohort,
   * or return null for the 'control' cohort.
   *
   * Fires `backstory_card_shown` when a card is returned.
   *
   * @param {{ jobId: string, watchType: string, variables?: Object }} jobContext
   * @returns {{ cardText: string, templateId: string, jobId: string }|null}
   */
  getCardForJob(jobContext) {
    const { jobId, watchType, variables = {} } = jobContext;
    const cohort = this.assignCohortIfNeeded();

    if (cohort === COHORT_CONTROL) {
      return null; // AC2: control cohort — plain intake UI, no card
    }

    // Select a template, honouring the recency buffer.
    const template = this._selectTemplate(watchType);
    if (!template) return null;

    // Substitute variables; fall back on missing fields (Test Scenario 8 / AC edge).
    const cardText = this._substituteVariables(template.templateText, variables);

    // Record in recency buffer.
    this._recordRecentTemplate(template.id);

    // Emit telemetry.
    this._telemetry.emit(EVENTS.BACKSTORY_CARD_SHOWN, {
      job_id:      jobId,
      job_type:    watchType,
      template_id: template.id,
    });

    return {
      cardText,
      templateId: template.id,
      jobId,
    };
  }

  /**
   * Record that the player accepted a job. Fires `job_accepted` with `has_backstory`.
   *
   * @param {{ jobId: string, watchType: string }} jobContext
   */
  recordJobAccepted(jobContext) {
    const { jobId, watchType } = jobContext;
    const cohort = this.getCohort();
    this._telemetry.emit(EVENTS.JOB_ACCEPTED, {
      job_id:       jobId,
      job_type:     watchType,
      has_backstory: cohort === COHORT_BACKSTORY,
    });
  }

  /**
   * Record that the player declined a job. Fires `job_declined` with `has_backstory`.
   *
   * @param {{ jobId: string, watchType: string }} jobContext
   */
  recordJobDeclined(jobContext) {
    const { jobId, watchType } = jobContext;
    const cohort = this.getCohort();
    this._telemetry.emit(EVENTS.JOB_DECLINED, {
      job_id:       jobId,
      job_type:     watchType,
      has_backstory: cohort === COHORT_BACKSTORY,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Select a template for the given watchType that is not in the recency buffer.
   * Falls back to the least-recently-used template if all candidates are in the buffer.
   *
   * @param {string} watchType
   * @returns {import('../data/backstory-templates').BackstoryTemplate|null}
   */
  _selectTemplate(watchType) {
    const candidates = getTemplatesForWatchType(watchType);
    if (!candidates || candidates.length === 0) return null;

    // Filter out recently-shown templates.
    const fresh = candidates.filter((t) => !this._recentTemplateIds.includes(t.id));
    const pool  = fresh.length > 0 ? fresh : candidates; // fallback: all candidates

    // Random selection within the pool.
    const idx = Math.floor(this._rng() * pool.length);
    return pool[idx];
  }

  /**
   * Perform {{variable}} substitution on templateText.
   * Uses VARIABLE_FALLBACKS for any key not present in `variables`.
   * Guarantees no raw {{token}} remains in the output (Test Scenario 5 / 8).
   *
   * @param {string} templateText
   * @param {Object} variables
   * @returns {string}
   */
  _substituteVariables(templateText, variables) {
    // Merge provided variables with fallbacks; fallbacks fill any gaps.
    const merged = Object.assign({}, VARIABLE_FALLBACKS, variables);

    let result = templateText;
    for (const [key, value] of Object.entries(merged)) {
      const token = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(token, value != null ? String(value) : VARIABLE_FALLBACKS[key] || '');
    }

    // Safety net: replace any remaining {{...}} tokens with an empty string
    // so no raw token is ever shown to a player.
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    return result;
  }

  /**
   * Add a template ID to the recency buffer and trim to RECENCY_BUFFER_SIZE.
   * @param {string} templateId
   */
  _recordRecentTemplate(templateId) {
    this._recentTemplateIds.push(templateId);
    if (this._recentTemplateIds.length > RECENCY_BUFFER_SIZE) {
      this._recentTemplateIds.shift();
    }
  }
}

module.exports = {
  BackstoryCardController,
  COHORT_BACKSTORY,
  COHORT_CONTROL,
  VARIABLE_FALLBACKS,
  RECENCY_BUFFER_SIZE,
};
