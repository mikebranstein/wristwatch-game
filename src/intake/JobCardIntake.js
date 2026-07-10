/**
 * JobCardIntake — Phase 2 additive job card fields for intake (Issue #149).
 *
 * Responsibilities (AC2, AC4, AC5 — Issue #149):
 *   - Record functional test results as typed findings on the job card (AC2).
 *   - Store the scope decision and client approval/decline state (AC4, AC5).
 *   - Provide a list of QA-excluded items (client-declined — do not repair) (AC5).
 *   - Track the adjusted pricing delta so the job reward reflects scope (AC4).
 *
 * Design constraints:
 *   - This module is additive — it does NOT modify the existing MVP intake data
 *     model; it only adds new fields to a job card object.
 *   - All methods are synchronous.
 *   - Serialisable to plain JSON (no circular refs).
 */

'use strict';

/**
 * @typedef {Object} FunctionalFinding
 * @property {string}  testId            — which test produced this finding
 * @property {string}  result            — the test result string
 * @property {boolean} isFinding         — whether the result is anomalous
 * @property {boolean} flaggedPreExisting — player flagged as pre-existing damage
 */

/**
 * @typedef {Object} JobCardIntakeData
 * @property {FunctionalFinding[]} functionalFindings       — all test results
 * @property {string|null}         scopeDecision            — ACCEPT_FULL_SCOPE | REDUCED_SCOPE | DECLINE_JOB | null
 * @property {number}              pricingDelta             — cost adjustment from scope negotiation
 * @property {string[]}            clientDeclinedFindingIds — findings excluded from QA (AC5)
 * @property {boolean|null}        clientApproved           — did the client approve the scope?
 */

class JobCardIntake {
  constructor() {
    /** @type {Map<string, FunctionalFinding>} */
    this._findings = new Map();

    /** @type {string|null} */
    this._scopeDecision = null;

    /** @type {number} */
    this._pricingDelta = 0;

    /** @type {Set<string>} */
    this._clientDeclinedFindingIds = new Set();

    /** @type {boolean|null} */
    this._clientApproved = null;
  }

  // ── Functional test findings ─────────────────────────────────────────────────

  /**
   * Record a functional test result on the job card (AC2).
   *
   * @param {string}  testId           — functional test ID (e.g. 'crown_wind')
   * @param {string}  result           — test result string (e.g. 'broken')
   * @param {boolean} isFinding        — true if the result is anomalous
   * @param {boolean} [flaggedPreExisting] — true if player flagged as pre-existing
   * @returns {FunctionalFinding}
   */
  recordFunctionalFinding(testId, result, isFinding, flaggedPreExisting = false) {
    if (!testId || typeof testId !== 'string') {
      throw new Error('JobCardIntake: testId must be a non-empty string.');
    }
    if (!result || typeof result !== 'string') {
      throw new Error('JobCardIntake: result must be a non-empty string.');
    }
    const finding = { testId, result, isFinding, flaggedPreExisting };
    this._findings.set(testId, finding);
    return finding;
  }

  /**
   * All recorded functional findings (for job card display and QA).
   * @returns {FunctionalFinding[]}
   */
  getFunctionalFindings() {
    return Array.from(this._findings.values());
  }

  /**
   * Retrieve a specific test finding.
   * @param {string} testId
   * @returns {FunctionalFinding|null}
   */
  getFunctionalFinding(testId) {
    return this._findings.get(testId) || null;
  }

  // ── Scope decision ───────────────────────────────────────────────────────────

  /**
   * Apply the scope decision result from ScopeNegotiationScreen (AC4, AC5).
   *
   * @param {string}   scopeDecision      — ACCEPT_FULL_SCOPE | REDUCED_SCOPE | DECLINE_JOB
   * @param {number}   pricingDelta       — total approved cost delta
   * @param {string[]} declinedFindingIds — finding IDs client declined (AC5)
   * @param {boolean}  clientApproved     — whether client approved the negotiated scope
   */
  applyScopeDecision(scopeDecision, pricingDelta, declinedFindingIds, clientApproved) {
    const valid = ['ACCEPT_FULL_SCOPE', 'REDUCED_SCOPE', 'DECLINE_JOB'];
    if (!valid.includes(scopeDecision)) {
      throw new Error(`JobCardIntake: invalid scopeDecision "${scopeDecision}".`);
    }
    if (typeof pricingDelta !== 'number') {
      throw new Error('JobCardIntake: pricingDelta must be a number.');
    }

    this._scopeDecision = scopeDecision;
    this._pricingDelta = pricingDelta;
    this._clientDeclinedFindingIds = new Set(declinedFindingIds || []);
    this._clientApproved = clientApproved;
  }

  // ── Scope queries ────────────────────────────────────────────────────────────

  /**
   * The recorded scope decision, or null if none yet.
   * @returns {string|null}
   */
  getScopeDecision() {
    return this._scopeDecision;
  }

  /**
   * The pricing delta applied to this job from scope negotiation (AC4).
   * @returns {number}
   */
  getPricingDelta() {
    return this._pricingDelta;
  }

  /**
   * IDs of findings the client declined — these are excluded from QA (AC5).
   * @returns {string[]}
   */
  getClientDeclinedFindingIds() {
    return Array.from(this._clientDeclinedFindingIds);
  }

  /**
   * Whether a specific finding is client-declined (excluded from QA — AC5).
   * @param {string} findingId
   * @returns {boolean}
   */
  isFindingDeclined(findingId) {
    return this._clientDeclinedFindingIds.has(findingId);
  }

  /**
   * Whether the client approved the negotiated scope.
   * @returns {boolean|null}
   */
  isClientApproved() {
    return this._clientApproved;
  }

  // ── Serialisation ─────────────────────────────────────────────────────────────

  /**
   * Serialise to a plain JSON-compatible object for job card persistence.
   * @returns {JobCardIntakeData}
   */
  toJSON() {
    return {
      functionalFindings: this.getFunctionalFindings(),
      scopeDecision: this._scopeDecision,
      pricingDelta: this._pricingDelta,
      clientDeclinedFindingIds: this.getClientDeclinedFindingIds(),
      clientApproved: this._clientApproved,
    };
  }
}

module.exports = { JobCardIntake };
