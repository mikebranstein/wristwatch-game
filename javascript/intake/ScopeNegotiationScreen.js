/**
 * ScopeNegotiationScreen — Phase 2 multi-path scope negotiation (Issue #149).
 *
 * Responsibilities (AC3, AC4, AC5 — Issue #149):
 *   - Present the player with all pre-existing damage flags as line items
 *     with estimated cost impact (AC3).
 *   - Require the player to make an explicit scope decision before proceeding
 *     to disassembly (AC3).
 *   - Apply the scope decision and return a pricing summary (AC4).
 *   - Mark client-declined items as "client_declined — do not repair" and
 *     exclude them from QA pass/fail criteria (AC5).
 *   - Integrate with #77 client-trust scoring when available; gracefully fall
 *     back to a neutral client response when #77 is unavailable (AC4 / TS7).
 *
 * Scope decisions available to the player:
 *   - ACCEPT_FULL_SCOPE   — repair all flagged findings
 *   - REDUCED_SCOPE       — client approves / declines individual line items
 *   - DECLINE_JOB         — player declines job; receives partial intake fee
 *
 * Design constraints:
 *   - No scope decision = cannot proceed (isDecisionRequired() returns true).
 *   - Client trust score is read-only input; this module does not update it.
 *     The caller is responsible for invoking #77 trust-score updates after
 *     a decision is applied (AC4).
 *   - Pricing is game-rule-based; not a real-world pricing engine.
 *   - All methods are synchronous.
 */

'use strict';

// ─── Scope decision constants ─────────────────────────────────────────────────

const SCOPE_DECISIONS = Object.freeze({
  ACCEPT_FULL_SCOPE: 'ACCEPT_FULL_SCOPE',
  REDUCED_SCOPE: 'REDUCED_SCOPE',
  DECLINE_JOB: 'DECLINE_JOB',
});

/** Partial intake fee awarded when player declines the job. */
const PARTIAL_INTAKE_FEE = 10;

// ─── ScopeNegotiationScreen ───────────────────────────────────────────────────

class ScopeNegotiationScreen {
  /**
   * @param {import('./PreExistingDamageRegistry').PreExistingDamageRegistry} registry
   *   — the populated pre-existing damage registry from intake
   * @param {number} baseJobEstimate
   *   — the base job cost estimate before scope adjustments
   * @param {{ trustScore?: number|null }} [clientProvenance]
   *   — optional #77 client-trust object; null/undefined = fallback to neutral
   */
  constructor(registry, baseJobEstimate, clientProvenance = null) {
    if (!registry) {
      throw new Error('ScopeNegotiationScreen: registry is required.');
    }
    if (typeof baseJobEstimate !== 'number' || baseJobEstimate < 0) {
      throw new Error('ScopeNegotiationScreen: baseJobEstimate must be a non-negative number.');
    }

    this._registry = registry;
    this._baseJobEstimate = baseJobEstimate;
    this._clientProvenance = clientProvenance || null;
    this._decision = null;
    this._lineItemDecisions = new Map(); // findingId → 'approved'|'declined'
  }

  // ── Pre-decision queries ─────────────────────────────────────────────────────

  /**
   * Build the line items to display in the negotiation screen (AC3).
   * Each item shows the finding, estimated cost delta, and a pending status.
   * @returns {{ findingId: string, label: string, costDelta: number, status: 'pending' }[]}
   */
  buildLineItems() {
    return this._registry.getAllFlaggedFindings().map(f => ({
      findingId: f.findingId,
      label: f.label,
      costDelta: f.costDelta,
      status: 'pending',
    }));
  }

  /**
   * Whether a scope decision is still required before the player can proceed (AC3).
   * Returns true until applyDecision() or applyClientDecisions() has been called.
   * @returns {boolean}
   */
  isDecisionRequired() {
    return this._decision === null;
  }

  /**
   * The effective client trust modifier for scope negotiation.
   *
   * - If #77 provides a trustScore (0–1), it is returned.
   * - If #77 is unavailable (null/undefined), returns 0.5 (neutral — AC4 / TS7).
   *
   * Higher trust = client more likely to accept scope.
   * @returns {number}  0–1; 0.5 = neutral fallback
   */
  getClientTrustModifier() {
    if (
      this._clientProvenance &&
      typeof this._clientProvenance.trustScore === 'number'
    ) {
      return Math.max(0, Math.min(1, this._clientProvenance.trustScore));
    }
    return 0.5; // graceful neutral fallback when #77 is unavailable
  }

  /**
   * Whether #77 client-provenance data is available.
   * @returns {boolean}
   */
  isClientProvenanceAvailable() {
    return (
      this._clientProvenance !== null &&
      typeof (this._clientProvenance || {}).trustScore === 'number'
    );
  }

  // ── Decision application ─────────────────────────────────────────────────────

  /**
   * Player accepts full scope — all flagged findings will be repaired (AC4).
   *
   * @returns {{
   *   decision: 'ACCEPT_FULL_SCOPE',
   *   lineItems: Object[],
   *   totalCostDelta: number,
   *   adjustedEstimate: number,
   *   trustModifier: number,
   *   clientProvenanceAvailable: boolean,
   *   declinedItems: [],
   * }}
   */
  acceptFullScope() {
    this._decision = SCOPE_DECISIONS.ACCEPT_FULL_SCOPE;
    const lineItems = this._registry.getAllFlaggedFindings().map(f => ({
      ...f,
      clientDecision: 'approved',
      excludeFromQA: false,
    }));
    for (const item of lineItems) {
      this._lineItemDecisions.set(item.findingId, 'approved');
    }

    return {
      decision: SCOPE_DECISIONS.ACCEPT_FULL_SCOPE,
      lineItems,
      totalCostDelta: this._registry.getTotalCostDelta(),
      adjustedEstimate: this._baseJobEstimate + this._registry.getTotalCostDelta(),
      trustModifier: this.getClientTrustModifier(),
      clientProvenanceAvailable: this.isClientProvenanceAvailable(),
      declinedItems: [],
    };
  }

  /**
   * Apply individual client decisions for reduced-scope negotiation (AC5).
   *
   * @param {Array<{ findingId: string, clientDecision: 'approved'|'declined' }>} itemDecisions
   * @returns {{
   *   decision: 'REDUCED_SCOPE',
   *   lineItems: Object[],
   *   totalCostDelta: number,
   *   adjustedEstimate: number,
   *   trustModifier: number,
   *   clientProvenanceAvailable: boolean,
   *   declinedItems: Object[],
   * }}
   */
  applyClientDecisions(itemDecisions) {
    if (!Array.isArray(itemDecisions) || itemDecisions.length === 0) {
      throw new Error('ScopeNegotiationScreen: itemDecisions must be a non-empty array.');
    }
    this._decision = SCOPE_DECISIONS.REDUCED_SCOPE;

    const decisionMap = new Map();
    for (const { findingId, clientDecision } of itemDecisions) {
      if (!['approved', 'declined'].includes(clientDecision)) {
        throw new Error(
          `ScopeNegotiationScreen: invalid clientDecision "${clientDecision}" for "${findingId}". Must be "approved" or "declined".`
        );
      }
      decisionMap.set(findingId, clientDecision);
    }

    const allFindings = this._registry.getAllFlaggedFindings();
    let approvedCostDelta = 0;
    const lineItems = [];
    const declinedItems = [];

    for (const f of allFindings) {
      const cd = decisionMap.get(f.findingId) || 'declined'; // default: declined if not specified
      this._lineItemDecisions.set(f.findingId, cd);

      const item = {
        ...f,
        clientDecision: cd,
        // AC5: declined items are marked and excluded from QA
        excludeFromQA: cd === 'declined',
        jobCardNote: cd === 'declined' ? 'client declined — do not repair' : null,
      };
      lineItems.push(item);
      if (cd === 'approved') {
        approvedCostDelta += f.costDelta;
      } else {
        declinedItems.push(item);
      }
    }

    return {
      decision: SCOPE_DECISIONS.REDUCED_SCOPE,
      lineItems,
      totalCostDelta: approvedCostDelta,
      adjustedEstimate: this._baseJobEstimate + approvedCostDelta,
      trustModifier: this.getClientTrustModifier(),
      clientProvenanceAvailable: this.isClientProvenanceAvailable(),
      declinedItems,
    };
  }

  /**
   * Player declines the job entirely (e.g., too much damage — AC / TS5).
   *
   * @returns {{
   *   decision: 'DECLINE_JOB',
   *   partialIntakeFee: number,
   *   penalty: false,
   *   lineItems: Object[],
   * }}
   */
  declineJob() {
    this._decision = SCOPE_DECISIONS.DECLINE_JOB;
    const lineItems = this._registry.getAllFlaggedFindings().map(f => ({
      ...f,
      clientDecision: 'job_declined',
      excludeFromQA: true,
    }));
    return {
      decision: SCOPE_DECISIONS.DECLINE_JOB,
      partialIntakeFee: PARTIAL_INTAKE_FEE,
      penalty: false,
      lineItems,
    };
  }

  // ── Post-decision queries ─────────────────────────────────────────────────────

  /**
   * The current scope decision (null if not yet made).
   * @returns {string|null}
   */
  getDecision() {
    return this._decision;
  }

  /**
   * Returns items that were declined by the client (AC5).
   * These items must be excluded from QA pass/fail criteria.
   * Returns empty array if no decision has been made yet or if full scope was accepted.
   * @returns {Object[]}
   */
  getDeclinedItems() {
    if (this._decision === null || this._decision === SCOPE_DECISIONS.ACCEPT_FULL_SCOPE) {
      return [];
    }
    if (this._decision === SCOPE_DECISIONS.DECLINE_JOB) {
      // Entire job declined — return all findings marked as declined
      return this._registry.getAllFlaggedFindings().map(f => ({
        ...f,
        clientDecision: 'job_declined',
        excludeFromQA: true,
        jobCardNote: 'client declined — do not repair',
      }));
    }
    // REDUCED_SCOPE
    return this._registry.getAllFlaggedFindings()
      .filter(f => this._lineItemDecisions.get(f.findingId) === 'declined')
      .map(f => ({
        ...f,
        clientDecision: 'declined',
        excludeFromQA: true,
        jobCardNote: 'client declined — do not repair',
      }));
  }

  /**
   * Returns items that were approved (to be repaired).
   * @returns {Object[]}
   */
  getApprovedItems() {
    if (this._decision === null || this._decision === SCOPE_DECISIONS.DECLINE_JOB) {
      return [];
    }
    return this._registry.getAllFlaggedFindings()
      .filter(f => this._lineItemDecisions.get(f.findingId) !== 'declined')
      .map(f => ({
        ...f,
        clientDecision: this._lineItemDecisions.get(f.findingId) || 'approved',
        excludeFromQA: false,
      }));
  }
}

module.exports = { ScopeNegotiationScreen, SCOPE_DECISIONS, PARTIAL_INTAKE_FEE };
