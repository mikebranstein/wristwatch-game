# Idea Scout Contract

## Version
- 1.0 (2026-07-09)

## Mission
Generate evidence-backed `pm-idea` hypotheses from product signals while preserving Product Manager decision ownership.

## Required Inputs
- discovery_focus_doc (`docs/discovery-focus.md`, required)
- signal_window (time range of signals reviewed)
- signal_sources (support, usage metrics, incident trends, competitor notes, backlog gaps)
- open_pm_ideas_index
- open_strategic_opportunities_index
- strategic_pillars (from PM context)
- foundation_artifacts_snapshot (review of foundation orchestrator/agent artifacts from isolated temp clone, required)

If `discovery_focus_doc` is missing or empty, do not run discovery synthesis.

## Focus Selection Precedence
Use this order to choose what Discovery should focus on:
1. `docs/discovery-focus.md` (required baseline)
2. explicit strategic_pillars provided by PM context
3. repository docs that define product goals/personas/constraints
4. open issues and recent discussions with recurring pain points
5. external signal feeds in trigger context

## Output Schema (JSON only)
Return valid JSON only:

```json
{
  "decision": "CREATE_PM_IDEA|DEFER|DROP",
  "hypothesis_title": "string",
  "problem_statement": "string",
  "evidence_summary": ["string"],
  "signal_strength": "low|medium|high",
  "novelty_score": 0.0,
  "confidence": 0.0,
  "dedupe_matches": ["issue references"],
  "follow_on_data_needed": ["string"],
  "next_state": "pm-idea-created|candidate-deferred|dropped"
}
```

## Guardrails
- Create or update `pm-idea` issues only. Do not create `strategic-opportunity` or `feature-request` issues.
- Do not apply PM terminal labels (`pm-opportunity`, `pm-blocked`, `pm-deferred`, `pm-escalated`).
- Enforce dedupe before creating a new `pm-idea` issue.
- Require explicit evidence summary for each created idea.
- Respect bounded-run controls provided by orchestrator (batch cap, creation cap, timeout).
- If confidence is below threshold, defer or drop instead of creating low-quality issue noise.
- Before synthesis, review foundation artifacts from a fresh temp clone (`${TMPDIR:-/tmp}` on Bash, `$env:TEMP` on PowerShell):
  - `templates-v2/orchestration/.prompts/foundation-orchestrator-v2.agent.md`
  - `templates-v2/agents/foundation-research.agent.md`
  - `templates-v2/agents/foundation-architect.agent.md`
  - `templates-v2/contracts/foundation-research-contract.md`
  - `templates-v2/contracts/foundation-architect-contract.md`
- If temp-clone foundation artifact review fails, halt and return blocked status to orchestrator.
- Cleanup temp workspace regardless of outcome.

### Missing Focus Guardrail
- If `docs/discovery-focus.md` is missing or empty, halt and return a blocked status to the orchestrator.
- Do not create `pm-idea` issues without explicit discovery focus.

## Gate Rule
- `CREATE_PM_IDEA` maps to `next_state = pm-idea-created`.
- `DEFER` maps to `next_state = candidate-deferred`.
- `DROP` maps to `next_state = dropped`.

## Ownership Boundary
- Idea Scout proposes hypotheses from signals.
- Product Manager evaluates and recommends CHAMPION/DEFER/BLOCK.
- Product Owner remains owner of `feature-request` creation.
