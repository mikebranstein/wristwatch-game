/**
 * DeliveryHandler — delivery-completion boundary for the Collection Gallery.
 * Issue #127 — Workshop Collection Gallery MVP
 *
 * Issue #145 — Workshop Economy MVP:
 *   handleDelivery() payload extended with `pricing_tier` and `parts_cost`.
 *   When a LedgerManager is provided, the ledger is updated atomically at this
 *   delivery-completion boundary (consistent with the existing save-flush pattern).
 *   If no LedgerManager is supplied, economy fields are silently ignored for
 *   backward-compatibility with pre-economy integration points.
 *
 * Issue #254 — Cosmetic Grade Modifier:
 *   handleDelivery() payload extended with optional `cosmetic_grade` field.
 *   When present and a valid grade, it is passed to LedgerManager.recordJobCompletion()
 *   (grade multiplier applied to full_restoration tier only) and a client
 *   satisfaction_message is appended to the delivery entry.
 *   Backward-compatible: callers omitting cosmetic_grade receive no message and no
 *   multiplier, consistent with prior behavior (AC5, Scenario 8).
 *
 * Issue #294 — Movement Regulation Phase 1:
 *   handleDelivery() payload extended with optional `regulation_grade` field
 *   ('acceptable'|'good'|'excellent'|'certified_chronometer'|null).
 *   When present and a JobQualityAggregator is wired up, the regulation accuracy
 *   score is injected as the new 'regulation_accuracy' dimension (7th dimension,
 *   build-start decision per design mitigation — separate from timing_calibration).
 *   Backward-compatible: callers omitting regulation_grade receive null default;
 *   no craftsmanship impact for jobs without a regulation phase (AC5, Test Scenario 8).
 *
 * Issue #253 — Holistic Craftsmanship Score Phase 1:
 *   handleDelivery() payload extended with optional `fault_instance_ids` field (string[]).
 *   constructor opts extended with optional `jobQualityAggregator` param.
 *   After recordJobCompletion() (ledger write) and before save flush, the aggregator is
 *   invoked to compute the composite score. Personal best updated if score improves.
 *   Backward-compatible: callers omitting jobQualityAggregator or fault_instance_ids are
 *   unaffected — no craftsmanship score is computed, no existing logic is altered.
 *
 * Issue #255 — Holistic Craftsmanship Score Phase 2:
 *   handleDelivery() payload extended with two optional Phase 2 score fields:
 *     timing_calibration_score  {number|null}  From TimingCalibrationTracker.computeJobScore()
 *     sourcing_quality_score    {number|null}  From SourcingScreen.computeSourcingQualityScore()
 *   Both are forwarded to JobQualityAggregator via injectDimensionScores (slots 5 and 6).
 *   Backward-compatible: callers omitting these fields receive null defaults; aggregator
 *   excludes null dimensions from composite per phase-gate logic (existing behavior).
 *   Pre-Phase-2 jobs (null scores) continue to compute correctly using Phase 1 logic.
 */
'use strict';

/**
 * Client satisfaction messages keyed by cosmetic grade (Issue #254, AC5).
 * Only populated on the delivery entry when cosmetic_grade is present and recognised.
 */
const SATISFACTION_MESSAGES = {
  mirror:   'The mirror polish is exceptional — exactly as I hoped.',
  good:     'The case finish looks great. I\'m very pleased.',
  adequate: 'It\'s functional, but the case finish is just adequate.',
};

class DeliveryHandler {
  /**
   * @param {Object}         opts
   * @param {Object}         opts.saveState           PlayerSaveState-compatible object
   * @param {Function|null}  opts.saveAsyncFn         Optional async save callback
   * @param {Function|null}  opts.onDelivered         Optional delivery notification callback
   * @param {Object|null}    opts.ledgerManager       Issue #145: LedgerManager instance (optional, backward-compat)
   * @param {Object|null}    opts.jobQualityAggregator Issue #253: JobQualityAggregator instance (optional, backward-compat)
   */
  constructor({ saveState, saveAsyncFn = null, onDelivered = null, ledgerManager = null, jobQualityAggregator = null }) {
    this._saveState    = saveState;
    this._saveAsyncFn  = saveAsyncFn;
    this._onDelivered  = onDelivered;
    this._ledger       = ledgerManager;        // Issue #145: null-safe (backward-compat)
    this._aggregator   = jobQualityAggregator; // Issue #253: null-safe (backward-compat)
  }

  /**
   * Handle a completed job delivery.
   *
   * Issue #145 extension: if `pricing_tier` and `parts_cost` are provided (and a
   * LedgerManager was supplied at construction), the ledger is updated atomically
   * before the save flush so that ledger totals and balance are always consistent.
   *
   * Issue #254 extension: optional `cosmetic_grade` payload field ('adequate'|'good'|'mirror').
   * When present, it is forwarded to LedgerManager.recordJobCompletion() (grade multiplier
   * for full_restoration tier) and a `satisfaction_message` is added to the delivery entry.
   * Backward-compatible: omitting `cosmetic_grade` produces no satisfaction_message and no
   * grade multiplier — existing callers unaffected (AC5, Scenario 8).
   *
   * Issue #253 extension: optional `fault_instance_ids` payload field (string[], default []).
   * When a `jobQualityAggregator` is provided, the composite craftsmanship score is computed
   * after recordJobCompletion() and before the save flush. Personal best is updated when the
   * new score exceeds the stored value. No aggregator → no score computed (backward-compat).
   *
   * Issue #255 extension: optional `timing_calibration_score` and `sourcing_quality_score`
   * payload fields (number|null, default null). When a `jobQualityAggregator` is provided,
   * both scores are forwarded to aggregator.computeScore() via injectDimensionScores (slots 5
   * and 6). Null values trigger phase-gate exclusion in the aggregator (consistent with
   * Phase 1 behaviour). Pre-Phase-2 jobs (null scores) are fully backward-compatible.
   *
   * @param {Object}      payload
   * @param {string}      payload.watch_name
   * @param {string}      payload.client_name
   * @param {string}      payload.completion_date
   * @param {string}      payload.portrait_asset_key
   * @param {string}      [payload.before_portrait_url]
   * @param {string}      [payload.pricing_tier]              Issue #145: 'simple_service'|'complex_service'|'full_restoration'
   * @param {number}      [payload.parts_cost]                Issue #145: total parts cost for this job (≥0)
   * @param {string}      [payload.cosmetic_grade]            Issue #254: 'adequate'|'good'|'mirror' (optional)
   * @param {string[]}    [payload.fault_instance_ids]        Issue #253: fault IDs registered for this job (default [])
   * @param {string}      [payload.job_id]                    Issue #253: job ID for personal best record (optional)
   * @param {number|null} [payload.timing_calibration_score]  Issue #255: from TimingCalibrationTracker.computeJobScore()
   * @param {number|null} [payload.sourcing_quality_score]    Issue #255: from SourcingScreen.computeSourcingQualityScore()
   * @param {string|null} [payload.regulation_grade]          Issue #294: from RegulationPhaseController.completePhase()
   *                                                           'acceptable'|'good'|'excellent'|'certified_chronometer'|null
   * @returns {Object} The delivery entry (collection gallery record + economy summary + craftsmanship result)
   */
  handleDelivery({
    watch_name,
    client_name,
    completion_date,
    portrait_asset_key,
    before_portrait_url       = null,
    pricing_tier              = null,   // Issue #145
    parts_cost                = 0,      // Issue #145
    cosmetic_grade            = null,   // Issue #254
    fault_instance_ids        = [],     // Issue #253
    job_id                    = null,   // Issue #253
    timing_calibration_score  = null,   // Issue #255
    sourcing_quality_score    = null,   // Issue #255
    regulation_grade          = null,   // Issue #294
  }) {
    const entry = { watch_name, client_name, completion_date, portrait_asset_key, before_portrait_url };

    // Issue #145 / #254: update ledger at delivery boundary if economy is wired up.
    // Issue #254: cosmetic_grade forwarded to recordJobCompletion for grade multiplier.
    // Atomic: ledger totals + balance are always written together before the save flush.
    let economySummary = null;
    if (this._ledger && pricing_tier) {
      economySummary = this._ledger.recordJobCompletion(pricing_tier, parts_cost, cosmetic_grade);
      entry.pricing_tier   = pricing_tier;
      entry.parts_cost     = parts_cost;
      entry.net_income     = economySummary.netIncome;
      entry.ledger_balance = economySummary.newBalance;
    }

    // Issue #254 (AC5): add satisfaction_message only when cosmetic_grade is present
    // and recognised. No cosmetic restoration → no satisfaction_message field.
    if (cosmetic_grade && SATISFACTION_MESSAGES[cosmetic_grade]) {
      entry.satisfaction_message = SATISFACTION_MESSAGES[cosmetic_grade];
    }

    // Issue #253: Holistic Craftsmanship Score Phase 1.
    // Issue #255: Phase 2 — timing_calibration_score and sourcing_quality_score injected
    //   via injectDimensionScores (slots 5 and 6). Null values are excluded by phase-gate.
    // Compute composite score AFTER ledger write and BEFORE save flush.
    // Null-safe: if no aggregator was supplied, skip entirely (backward-compat).
    let craftsmanshipResult = null;
    if (this._aggregator) {
      // Build injection map — only include non-null Phase 2 scores so that null values
      // propagate through the aggregator's injectDimensionScores null-exclusion path
      // (injectDimensionScores skips entries where value is null/undefined per AC5 contract).
      const phaseInjections = {};
      if (timing_calibration_score !== null && timing_calibration_score !== undefined) {
        phaseInjections.timing_calibration = timing_calibration_score;
      }
      if (sourcing_quality_score !== null && sourcing_quality_score !== undefined) {
        phaseInjections.sourcing_quality = sourcing_quality_score;
      }
      // Issue #294: inject regulation_accuracy score when regulation_grade is present.
      // Build-start decision: regulation_accuracy is a new 7th dimension separate from
      // timing_calibration (see design mitigation in JobQualityAggregator.js).
      if (regulation_grade !== null && regulation_grade !== undefined) {
        const { RegulationGradeEngine } = require('../regulation/RegulationGradeEngine');
        const regulationAccuracyScore = RegulationGradeEngine.gradeToAccuracyScore(regulation_grade);
        if (regulationAccuracyScore !== null) {
          phaseInjections.regulation_accuracy = regulationAccuracyScore;
        }
      }

      craftsmanshipResult = this._aggregator.computeScore({
        pricingTier:          pricing_tier,
        partsCost:            parts_cost,
        faultInstanceIds:     Array.isArray(fault_instance_ids) ? fault_instance_ids : [],
        injectDimensionScores: phaseInjections,
      });

      // Update personal best when the new score exceeds the stored value.
      // Personal best save-flush is handled by the existing saveAsyncFn call below.
      const prev = this._saveState.get('craftsmanship_personal_best');
      if (prev === null || prev === undefined || craftsmanshipResult.score > prev.score) {
        this._saveState.set('craftsmanship_personal_best', {
          score:  craftsmanshipResult.score,
          tier:   craftsmanshipResult.tier,
          jobId:  job_id !== undefined ? job_id : null,
        });
      }

      // Attach craftsmanship summary to delivery entry for caller/display layer.
      entry.craftsmanship_score = craftsmanshipResult.score;
      entry.craftsmanship_tier  = craftsmanshipResult.tier;
    }

      // Issue #294: attach regulation_grade to delivery entry for delivery summary display (AC5).
      // null = job completed without a regulation phase (backward-compat, Test Scenario 8).
      if (regulation_grade !== undefined) {
        entry.regulation_grade = regulation_grade !== null ? regulation_grade : null;
      }

    this._saveState.appendCompletedWatch(entry);
    if (this._saveAsyncFn) this._saveAsyncFn(this._saveState.snapshot());
    if (this._onDelivered) this._onDelivered(entry);
    // Issue #253: return craftsmanshipResult on the entry for display layer (null when no aggregator)
    return Object.assign({}, entry, craftsmanshipResult ? { craftsmanship: craftsmanshipResult } : {});
  }

  getSaveState() { return this._saveState; }

  /** Issue #145: convenience accessor for the ledger manager. */
  getLedger() { return this._ledger; }

  /** Issue #253: convenience accessor for the job quality aggregator. */
  getJobQualityAggregator() { return this._aggregator; }
}

module.exports = { DeliveryHandler };
