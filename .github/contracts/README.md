# Contracts Folder

**Decision contracts that agents read and follow.**

These are reference documents that define decision criteria, evaluation rules, and guardrails. Agents read these contracts to understand what to look for and how to make decisions.

Each contract file is named after the stage it serves:
- `intake-agent.md` - Requirements completeness and readiness criteria
- `design-agent.md` - Technical design and architecture criteria
- `build-agent.md` - Implementation scope and test criteria
- `qa-agent.md` - Test coverage and quality criteria
- `policy-contract.md` - Release readiness and governance criteria
- `business-analyst-agent.md` - Requirements clarification and authoring criteria
- `product-manager-contract.md` - Strategic opportunity discovery and validation criteria
- `product-owner-contract.md` - Feature-request definition, prioritization, and handoff criteria
- `research-agent-contract.md` - Research evidence quality and synthesis criteria
- `idea-scout-contract.md` - Autonomous signal-to-idea hypothesis generation criteria
- `foundation-research-contract.md` - Foundational option research and recommendation criteria
- `foundation-architect-contract.md` - Foundation decision-pack gate and approval criteria
- `architecture-review-contract.md` - Continuous architecture health assessment criteria
- `refactor-planner-contract.md` - Bounded refactor request planning criteria

**How agents use contracts:**
```
Agent reads: "Your contract is in .github/contracts/{contract-name}.md"
Agent then: Opens the file, reads the criteria and decision rules
Agent does: Applies the rules to evaluate the issue
Agent does NOT: Execute the contract file (it's a reference document)
```

**Organization principle:**
Contracts are organized by their corresponding agent/stage, making it easy to find the evaluation criteria for any decision point.
