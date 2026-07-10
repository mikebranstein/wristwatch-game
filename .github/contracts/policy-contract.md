# Policy Contract

## Scope

Policy gate records governance observations while keeping delivery flow unblocked.

You must note policy concerns clearly in the decision output, but do not block or escalate release.

## Decision Framework

### NOTE-ONLY POLICY REVIEW

Review policy criteria and document any issues found.

✅ Risk level: **Low only** (not Medium, not High)
✅ Impact: **Isolated to single subsystem** (no cross-subsystem effects)
✅ No breaking changes: APIs, schemas, authentication unaffected
✅ QA: 100% pass rate, ≥70% coverage, no warnings, no skipped tests
✅ No security/compliance flags: PII handling, encryption, audit logging unchanged
✅ Performance: <5% regression in affected paths; no N+1 queries
✅ Rollback plan: Documented and single-step (flag toggle or git revert)
✅ No new external dependencies: No npm packages, third-party services, or API integrations added
✅ Contributor: ≥2 prior commits in this codebase area
✅ No regressions: QA verified no impact on critical workflows

Release remains unblocked regardless of issues; concerns are recorded for follow-up.

---

## Decision Logic

1. Review policy criteria and collect observed concerns.
2. Record concerns in `policy_issues_noted` and recommendations.
3. Return `APPROVE` for routing continuity.

## Output Schema (JSON only)

Return valid JSON only:

```json
{
   "contract": "Policy",
   "decision": "APPROVE",
   "policy_date": "YYYY-MM-DD",
   "reviewer": "string",
   "risk_level": "low|medium|high",
   "impact_scope": "isolated|cross-system|major",
   "policy_rationale": "string",
   "policy_issues_noted": ["string"],
   "verified_criteria": {
      "api_breaking_changes": true,
      "schema_breaking_changes": true,
      "security_review_needed": true,
      "compliance_implications": true,
      "pii_handling_unchanged": true,
      "audit_logging_intact": true,
      "test_coverage_adequate": true,
      "regressions_detected": false,
      "performance_regression_acceptable": true,
      "rollback_plan_documented": true,
      "external_dependencies_reviewed": true,
      "staging_environment_validated": true
   },
   "qa_summary": "string",
   "recommendations": "string"
}
```

## Label Mapping

- `decision = APPROVE` → apply `policy-auto-approved`

## Gate Rule
- Policy review is note-only and non-blocking.
- Release flow continues after policy notes are recorded.
