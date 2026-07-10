# Architecture Review Contract

## Mission
Assess architectural health during delivery, identify refactor opportunities, and determine whether action is required.

## Required Inputs
- recent_feature_changes
- architecture_health_report
- fitness_evaluation_report
- open_architecture_debt_index
- foundation_decision_pack (`docs/foundation-decision-pack.md`, required)
- adr_records (`docs/adr/`, required)
- wiki_context_snapshot (from `wiki-manager` search, required)

## Output Schema (JSON only)
Return valid JSON only:

```json
{
  "decision": "NO_ACTION|CREATE_REFACTOR_PLAN|ESCALATE",
  "health_summary": "string",
  "hotspots": ["string"],
  "duplication_signals": ["string"],
  "coupling_risks": ["string"],
  "fitness_findings": ["string"],
  "priority": "low|medium|high|critical",
  "recommended_refactors": ["string"],
  "confidence": 0.0,
  "next_state": "arch-review-no-action|arch-refactor-planned|arch-review-escalated"
}
```

## Guardrails
- Do not directly modify production code.
- Do not create release or policy decisions.
- Recommend bounded refactors only.
- Before `NO_ACTION` or `CREATE_REFACTOR_PLAN`, verify alignment with foundation decisions and ADR constraints.
- If foundation/ADR/wiki context is missing or materially conflicting, return `ESCALATE`.

## Gate Rule
- NO_ACTION -> arch-review-no-action
- CREATE_REFACTOR_PLAN -> arch-refactor-planned
- ESCALATE -> arch-review-escalated
