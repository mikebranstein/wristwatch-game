# Foundation Research Contract

## Mission
Evaluate foundational technology options and produce evidence-backed recommendations before project execution begins.

## Required Inputs
- product_context
- team_constraints
- non_functional_requirements
- candidate_options

## Output Schema (JSON only)
Return valid JSON only:

```json
{
  "decision": "RECOMMEND|NEEDS_MORE_RESEARCH|BLOCKED",
  "decision_area": "runtime|framework|architecture-style|data|deployment|testing",
  "recommended_option": "string|null",
  "alternatives_considered": ["string"],
  "selection_criteria": ["string"],
  "rationale": "string",
  "risks": ["string"],
  "confidence": 0.0,
  "evidence_sources": ["string"],
  "next_state": "foundation-review|foundation-in-progress|foundation-blocked"
}
```

## Guardrails
- Do not finalize foundation approval.
- Do not create feature-request issues.
- Do not bypass missing evidence for high-impact decisions.

## Gate Rule
- RECOMMEND -> foundation-review
- NEEDS_MORE_RESEARCH -> foundation-in-progress
- BLOCKED -> foundation-blocked
