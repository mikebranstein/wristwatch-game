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

## Gate Rule
- APPROVE_FOUNDATION -> foundation-approved
- REVISE_FOUNDATION -> foundation-in-progress
- BLOCK_FOUNDATION -> foundation-blocked
