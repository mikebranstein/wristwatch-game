# Foundation Research Contract

## Mission
Evaluate foundational technology options and produce evidence-backed recommendations before project execution begins.

## Required Inputs
- product_context
- team_constraints
- non_functional_requirements
- candidate_options
- discovery_focus (`docs/discovery-focus.md`, required)

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
- Do not emit `RECOMMEND` when `discovery_focus` is missing or empty.
- Recommendations must explicitly reference audience/problem/outcome context from `discovery_focus`.
- Populate or update `docs/foundation-decision-pack.md` for each researched decision area before returning `RECOMMEND`.
- Draft or update ADR files in `docs/adr/` for major recommended decisions before returning `RECOMMEND`.

## Artifact Templates (Authoritative Scaffolds)

Use these scaffolds whenever required files are missing or placeholder-only.

### `docs/discovery-focus.md`

```markdown
# Discovery Focus

## Target Users
- Primary users:
- Secondary users:

## Priority Problems
- Problem 1:
- Problem 2:

## Intended Outcomes
- Product outcomes:
- Business outcomes:

## Constraints
- Platform constraints:
- Team constraints:
- Delivery constraints:

## Assumptions to Validate
- Assumption 1:
- Assumption 2:
```

### `docs/foundation-decision-pack.md`

```markdown
# Foundation Decision Pack

Status: Draft | Approved | Blocked

## 1. Product and Team Context
- Product type:
- Domain:
- Team size:
- Team language strengths:
- Delivery constraints:

## 2. Foundational Decisions

### 2.1 Runtime and Language
- Decision:
- Alternatives considered:
- Rationale:
- Consequences:
- Linked ADR:

### 2.2 Framework or Engine
- Decision:
- Alternatives considered:
- Rationale:
- Consequences:
- Linked ADR:

### 2.3 Architecture Style
- Decision:
- Alternatives considered:
- Rationale:
- Consequences:
- Linked ADR:

### 2.4 Data and Storage Strategy
- Decision:
- Alternatives considered:
- Rationale:
- Consequences:
- Linked ADR:

### 2.5 Testing Strategy Baseline
- Unit testing stack:
- Integration and e2e strategy:
- Coverage target:
- Flakiness handling:

### 2.6 Deployment and Environments
- Deployment model:
- Environment topology:
- Release strategy:
- Rollback strategy:

### 2.7 Non-Functional Requirements
- Availability target:
- Performance budget:
- Security and compliance constraints:
- Cost constraints:

## 3. Guardrails for Autonomous Agents
- Forbidden patterns:
- Required coding conventions:
- Dependency policy:
- Migration policy:

## 4. Foundation Gate Checklist
- [ ] Decision records created for all major choices
- [ ] Strategic constraints and non-functional requirements documented
- [ ] Risk and rollback strategies documented
- [ ] Discovery focus aligned with these decisions

## 5. Approval
- Reviewer:
- Date:
- Decision: APPROVE | BLOCK
- Notes:
```

### `docs/adr/0000-template.md`

```markdown
# ADR 0000: <Decision Title>

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD

## Context

## Decision

## Alternatives Considered

## Consequences

## Rollback Strategy

## References
```

### `.github/ISSUE_TEMPLATE/foundation_decision.md`

```markdown
---
name: Foundation decision
about: Track foundation-level architecture and technology decisions
title: "[foundation]: "
labels: 'foundation-needed'
assignees: ''
---

## Decision Area
Runtime/language, framework, architecture style, data, deployment, NFRs

## Context
Why is this decision needed now?

## Options Considered
1.
2.
3.

## Recommended Choice

## Risks

## Rollback or Exit Strategy

## ADR Link

## Gate Impact
How this affects discovery and development gating.
```

## Gate Rule
- RECOMMEND -> foundation-review
- NEEDS_MORE_RESEARCH -> foundation-in-progress
- BLOCKED -> foundation-blocked
