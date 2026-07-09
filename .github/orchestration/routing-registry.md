# Routing Registry

**Purpose:** Declarative routing rules for all stage transitions (PM, PO, Dev loops)  
**Format:** Markdown (readable, version-controlled)  
**Usage:** Orchestrators consult this to determine next stage after agent decision  
**Status:** Single source of truth (GitHub-only state)

---

## Overview

This registry defines:
- ✅ All valid stage transitions
- ✅ Decision outcomes that trigger each transition
- ✅ Feedback loops (e.g., Design REVISE → Intake)
- ✅ Terminal states (issue closed)

**Key principle:** Single source of truth for routing logic. No routing duplicated in orchestrator files.

---

## Discovery Loop Routing

### Stage: signal-scan (Initial)

Discovery orchestrator runs on schedule/event/manual trigger and scans product signals.

**Decision from:** idea-scout agent (signal synthesis and hypothesis generation)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| CREATE_PM_IDEA | Candidate passes evidence + dedupe gate | pm-idea-created |
| DEFER | Candidate lacks confidence or needs more data | candidate-deferred |
| DROP | Duplicate/noise/low-value signal | dropped |

**Action on transition:**
- CREATE_PM_IDEA → Create issue with labels `pm-idea` + `pm-idea-auto`
- DEFER → Append candidate to `Discovery-Deferred-Candidates` wiki page for future runs
- DROP → Record dropped rationale for auditability

**Typical duration:** 10-20min bounded run (hard timeout 30min)

---

### Stage: pm-idea-created (Terminal for Discovery)

Discovery handoff complete. PM loop picks up from `pm-idea`.

---

### Stage: candidate-deferred (Terminal for Run)

Candidate retained for reconsideration in future Discovery run.

---

### Stage: dropped (Terminal for Run)

Candidate dropped due to low quality, low confidence, or duplicate signal.

---

## PM Loop Routing

### Stage: pm-idea (Initial)

Issues start here when labeled `pm-idea` on GitHub.

**Decision from:** product-manager agent (Phase 1 quick gate)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| PROVISIONAL_CHAMPION | Quick gate passed | pm-provisional-champion |
| DEFER | Valid direction, not urgent | pm-deferred |
| BLOCK | Not strategic | pm-blocked |

**Action on transition:**
- PROVISIONAL_CHAMPION → Spawn research agent to dive deep
- DEFER → Close issue, update label to `pm-deferred`
- BLOCK → Close issue, update label to `pm-blocked`

---

### Stage: pm-provisional-champion (Research In Progress)

Waiting for research agent to complete market/competitive analysis.

**Decision from:** research agent (autonomous market analysis)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| research-complete + priority-high | Market validation strong, strategic fit high | pm-finalizing |
| research-complete + priority-medium | Viable but lower priority | pm-deferred |
| research-complete + priority-low | Not strategic | pm-deferred |
| BLOCKED | Unable to research (wiki errors, data unavailable) | pm-blocked |

**Typical duration:** 30-60min (research completes autonomously)

---

### Stage: pm-finalizing (Phase 2 Full Validation)

Preparing strategic opportunity for product owner prioritization.

**Decision from:** product-manager agent (Phase 2, full charter)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| CHAMPION | Charter complete, team alignment strong | pm-opportunity |
| DEFER | Opportunity not ready | pm-deferred |
| BLOCK | Opportunity is not strategic | pm-blocked |
| ESCALATE | Strategic decision needed from leadership | pm-escalated |

**Action on transition:**
- CHAMPION → Close pm-idea and hand off the already-created strategic-opportunity issue to the PO loop

---

### Stage: pm-opportunity (Terminal)

Issue closed. Strategic opportunity created and handed off to PO loop.

**Next loop:** PO Orchestrator picks up via `strategic-opportunity` label

---

### Stage: pm-blocked (Terminal)

Issue closed. Not strategic or research inconclusive.

---

### Stage: pm-escalated (Terminal)

Needs manual leadership decision. No automatic progression.

---

## PO Loop Routing

### Stage: strategic-opportunity (Initial)

Issues start here when PM loop creates them.

**Decision from:** product-owner agent (feature-request conversion gate)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| CREATE_FEATURE_REQUESTS | Opportunity converted into execution work | feature-requests-created |
| DEFER | Deferred (keep for later prioritization) | po-deferred |
| REJECT | Not proceeding | po-rejected |

**Action on transition:**
- CREATE_FEATURE_REQUESTS → Create N `feature-request` issues, close strategic-opportunity, hand off to Dev loop

---

### Stage: feature-requests-created (Terminal)

Strategic opportunity closed. Feature requests created and handed to Dev loop.

---

### Stages: po-deferred, po-rejected (Terminal)

Closed. Not proceeding.

---

## Dev Loop Routing

### Stage: feature-request (Initial)

Issues start here when created by PO loop.

**Decision from:** intake-agent (completeness gate)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| PASS | Requirements clear, no blockers | design-approved |
| REVISE | Requirements incomplete, need clarification | intake-review |
| BLOCKED | Blocked on prerequisite feature | feature-blocked |

**Typical duration:** 15-30min

---

### Stage: intake-review (Clarification Loop)

Waiting for requirement clarification from stakeholder.

**Decision from:** (manual - stakeholder)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| clarified | Stakeholder provided missing info | intake |
| BLOCKED | Can't clarify, blocked | feature-blocked |

**Note:** This is a human decision point. Orchestrator can escalate via comment.

---

### Stage: design-approved (Design Phase)

Ready for technical design.

**Decision from:** design-agent (technical feasibility gate)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| PASS | Design approved, ready to build | build-approved |
| REVISE | Stakeholder feedback needed | intake (feedback loop) |
| BLOCKED | Technical blocker or dependency | feature-blocked |

**Typical duration:** 1-2 hours

**Feedback loop REVISE → intake:** Means design revealed requirements gap. Back to intake.

---

### Stage: design-approved (Build Handoff)

Ready for implementation.

**Decision from:** build-agent (build complete check)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| COMPLETE | Build complete, ready for QA | qa-testing |
| PARTIAL | Build incomplete, needs more work | build-blocked |
| BLOCKED_REQUIRES_CLARIFICATION | Acceptance criteria ambiguous | design-blocked |
| BLOCKED | Build blocked (dependency, tech issue) | feature-blocked |

**Typical duration:** 4-8 hours (depends on complexity)

---

### Stage: qa-testing (QA Phase)

Ready for quality assurance testing.

**Decision from:** qa-agent (test coverage gate)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| PASS | All tests pass | policy-approval |
| INCOMPLETE | Test coverage incomplete, needs design revision | design-approved (feedback loop) |
| FAIL | Test failures found | qa-failed |

**Typical duration:** 1-2 hours

**Feedback loop INCOMPLETE → design:** Means tests revealed design issue. Architect revises, rebuild.

---

### Stage: policy-approval (Policy Gate)

Ready for leadership/policy review.

**Decision from:** policy-agent (manual approval gate)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| APPROVE | Policy approved, cleared to release | released |
| ESCALATE | Needs leadership escalation | policy-escalated |
| BLOCK | Policy block | feature-blocked |

**Note:** This may require manual review.

---

### Stage: policy-escalated (Escalation)

Needs manual leadership decision.

**Decision from:** (manual - leadership)

| Decision | Condition | Next Stage |
|----------|-----------|------------|
| APPROVE | Leadership approved | released |
| BLOCK | Leadership blocked | feature-blocked |

---

### Stage: released (Terminal - Success)

Feature released successfully. Issue closed.

---

### Stage: feature-blocked (Terminal - Blocked)

Feature blocked (dependency, tech, policy, etc.). Issue closed.

---

## Feedback Loops (Cross-Stage Transitions)

### Feedback Loop: Design REVISE → Intake

**Trigger:** design-agent returns REVISE outcome

**Reason:** Stakeholder feedback or requirements gap discovered during design phase

**Action:**
1. Post comment: "Design review identified requirement gaps. Back to intake for clarification."
2. Transition issue back to `intake` stage
3. Reset context: stakeholder needs to review and clarify
4. Re-enter intake review process

---

### Feedback Loop: QA INCOMPLETE → Design

**Trigger:** qa-agent returns INCOMPLETE outcome

**Reason:** Test coverage incomplete, architectural changes needed

**Action:**
1. Post comment: "Test coverage incomplete. Design revision needed."
2. Transition issue back to `design-approved` stage
3. Design agent revises architecture
4. Build phase re-enters with updated design
5. Re-run QA

---

## Terminal States Summary

| Stage | Status | Issue Action |
|-------|--------|--------------|
| pm-idea-created | ✅ Discovery output | Create `pm-idea` + `pm-idea-auto` |
| candidate-deferred | ⏸️ Deferred | Keep for later Discovery runs |
| dropped | ❌ Dropped | No PM issue created |
| pm-opportunity | ✅ Success | Close, create strategic-opportunity |
| pm-blocked | ❌ Blocked | Close |
| pm-escalated | ⏸️ Paused | Awaiting manual decision |
| po-deferred | ⏸️ Deferred | Close (may reopen later) |
| po-rejected | ❌ Rejected | Close |
| released | ✅ Success | Close with label `released` |
| feature-blocked | ❌ Blocked | Close with label `feature-blocked` |

---

## Adding New Stages

To add a new stage to any loop:

1. **Define stage name** (kebab-case, e.g., `security-review`)
2. **Add row to routing table** above
3. **Define decisions** (what outcomes can this stage have?)
4. **Define next stages** (where does each decision route?)
5. **Document duration** (how long typically in this stage?)
6. **Create agent** (if needed, in templates/agents/ or templates-v2/)
7. **Test routing** (verify orchestrator finds path to this stage)

---

## Querying Routing Registry (In Orchestrators)

**Bash example:**
```bash
# Extract next stage for design-approved + REVISE from this file
grep -A1 "^design-approved" routing-registry.md | grep "REVISE" | awk '{print $NF}'

# Returns: intake (feedback loop)
```

**How orchestrators use it:**
- Parse current stage from issue label
- Read agent decision (PASS, REVISE, BLOCKED, etc.)
- Look up next stage in this registry
- Update issue label to new stage
- Post decision comment to GitHub

---

## Version Control & Updates

**This file is:**
- ✅ Version-controlled in git
- ✅ Source of truth for routing logic
- ✅ Human-readable (markdown format)
- ✅ Consulted by orchestrators on each cycle

**When updating:**
1. Edit this file
2. Commit to git
3. Orchestrators pick up changes on next poll (within 30s)
4. No code changes needed

---

## Next Steps

1. Review routing logic above
2. Verify against your actual orchestrator flows
3. Add/modify stages as needed
4. Commit to git
5. Create matching agents in templates/agents/ or templates-v2/
6. Test end-to-end with sample issues
