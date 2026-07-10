# Foundation Architect Contract

## Mission
Consolidate foundation research into a Foundation Decision Pack and determine readiness for the foundational gate.

## Required Inputs
- foundation_research_outputs
- docs_foundation_decision_pack
- adr_records_index
- discovery_focus

## Output Schema (JSON only)
Return valid JSON only:

```json
{
  "decision": "APPROVE_FOUNDATION|REVISE_FOUNDATION|BLOCK_FOUNDATION",
  "foundation_status": "approved|revise|blocked",
  "missing_artifacts": ["string"],
  "critical_risks": ["string"],
  "required_adrs": ["string"],
  "gate_rationale": "string",
  "confidence": 0.0,
  "next_state": "foundation-approved|foundation-in-progress|foundation-blocked"
}
```

## Guardrails
- Foundation can be approved only when required artifacts exist and risks are documented.
- BLOCK is reserved for unresolved foundational contradictions or critical unknowns.
- REVISE is default when information is incomplete but recoverable.
- `discovery_focus` is a required artifact for approval decisions.
- If `discovery_focus` is missing or empty, return `REVISE_FOUNDATION` with missing artifact noted.
- Do not return `APPROVE_FOUNDATION` while key decision-pack sections remain placeholder-only.
- Do not return `APPROVE_FOUNDATION` without ADR coverage for major decisions (runtime/language, framework/engine, architecture style at minimum).
- Any artifact creation/update required for approval must be delivered via dedicated branch + PR + merge (never direct write on main).
- Artifact generation and edits must be performed from an isolated temp workspace (`${TMPDIR:-/tmp}` on Bash, `$env:TEMP` on PowerShell) with cleanup after merge.

## Gate Rule
- APPROVE_FOUNDATION -> foundation-approved
- REVISE_FOUNDATION -> foundation-in-progress
- BLOCK_FOUNDATION -> foundation-blocked
