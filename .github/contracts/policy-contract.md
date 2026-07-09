# Policy Contract

## Scope

Policy gate uses a **tiered approach** to minimize manual review while maintaining governance safety. Most features auto-approve (Tier 1); risky features escalate for leadership review (Tier 2); dangerous features block immediately (Tier 3).

You make the final human judgment for Tier 2 features: ESCALATE (leadership review) or APPROVE (with conditions).

## Decision Framework - Three Tiers

### TIER 1: Automatic Approval (No Human Review)

**Feature Auto-Approves if ALL of the following are true:**

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

**When all 10 criteria are met:** Orchestrator applies `policy-auto-approved` label and releases without manual review.

---

### TIER 2: Leadership Review (Standard Review Path)

**Feature Escalates if ANY of the following are true (but none of the BLOCK conditions apply):**

⚠️ Risk level: **Medium** (automated gates passed, but business judgment needed)
⚠️ Impact: **Touches 2-3 subsystems** (normal scope, but cross-system coordination risk)
⚠️ Performance: Regression 5–10% (acceptable but warrants discussion)
⚠️ New external dependencies: New npm packages, API integrations, or third-party services (needs review)
⚠️ Contributor experience: New to this codebase (<2 prior commits) but scope is small and well-tested
⚠️ Architecture: Multiple files changed (3+) but follows existing patterns
⚠️ Deployment: Coordination needed with ops, other teams, or data migration (but not blocking)

**When any of these apply:** Orchestrator applies `policy-escalated` label; leadership reviews in async fashion (~30 min). Leadership can APPROVE or request changes. Feature does NOT auto-release; leadership makes the call.

---

### TIER 3: Hard Block (Never Release)

**Feature Blocks Immediately if ANY of the following are true:**

🛑 Security/Compliance Violation: PII unencrypted, audit logging disabled, or encryption compromised
🛑 Test Failures: Regressions in critical workflows detected by QA
🛑 Inadequate Testing: Test coverage <50% for risk level (actual gap, not just <70%)
🛑 Acceptance Criteria Unmet: Feature does not satisfy requirements despite passing automated gates
🛑 Architectural Violation: Conflicts with documented design patterns or breaking change to stable API
🛑 Critical Bug Post-QA: Edge case bugs caught that QA strategy missed
🛑 Performance Degradation: >10% latency regression or new blocking I/O in hot path

**When any of these apply:** Orchestrator applies `policy-blocked` label and routes back to Design for fixes. Feature does NOT release; blocker is unambiguous.

---

## Decision Logic

**For Policy Reviewer (Human):**

1. Check for **TIER 3 hard blocks** first
   - If any apply → BLOCK immediately (no nuance)
2. Check for **TIER 1 auto-approve** criteria
   - If all 10 apply → Auto-approved (feature releases, no human review needed)
3. If neither Tier 1 nor Tier 3 → **TIER 2** (escalate for leadership review)

**For Orchestrator (Automated):**

- If feature meets all TIER 1 criteria → Apply `policy-auto-approved` label; route to release
- If feature has any TIER 3 blocker → Apply `policy-blocked` label; route back to Design
- If feature has any TIER 2 escalation criteria → Apply `policy-escalated` label; wait for leadership

## Output Schema (JSON only)

Return valid JSON only:

```json
{
   "contract": "Policy",
   "decision": "APPROVE|ESCALATE|BLOCK",
   "policy_date": "YYYY-MM-DD",
   "reviewer": "string",
   "risk_level": "low|medium|high",
   "impact_scope": "isolated|cross-system|major",
   "policy_rationale": "string",
   "escalation_reason": "string|null",
   "blocker_reason": "string|null",
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
- `decision = ESCALATE` → apply `policy-escalated`
- `decision = BLOCK` → apply `policy-blocked`

## Gate Rule
- TIER 1 (Auto-Approve): Feature is auto-released
- TIER 2 (Leadership Review): Hold for async leadership review (~30 min); leadership decides
- TIER 3 (Hard Block): Return to design for fixes; blocker reason documented
