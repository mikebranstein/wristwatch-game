# Sequencing Brief: SO #50 Cleaning Reveal vs. Completion Reveal Design Boundary

**Issue:** #140  
**Date:** 2026-07-10  
**Document Type:** Design Boundary Document  
**Status:** TEMPLATE — Awaiting Research Completion  
**Authors:** _(spike team)_  
**Reviewers required:** SO #50 Cleaning Reveal team · Core System (Completion Reveal) team · PO  

---

## Purpose

This brief defines the design boundaries between the **SO #50 Cleaning Reveal** (mid-repair, individual parts, intimate) and the **Completion Reveal** (job complete, whole watch, climactic). It exists to prevent visual and UX overlap between the two reveal moments, and to surface any shared technical dependencies that require coordination before the Completion Reveal Core System (Issue #141) begins design.

**Gate:** Issue #141 (Core System) may not proceed to design until this brief is PO-approved.

---

## Reveal Identity Comparison

| Dimension | SO #50 Cleaning Reveal | Completion Reveal (#141) |
|-----------|----------------------|--------------------------|
| **Trigger point in restoration arc** | Mid-repair; after a cleaning or restoration step on individual parts | End of restoration; all work complete, watch fully assembled |
| **Visual scope** | Individual part(s) — close-up, detail-focused | Whole watch — complete assembled timepiece |
| **Emotional register** | Intimate, satisfying, incremental progress | Climactic, celebratory, sense of achievement |
| **Player state at trigger** | In progress — more work may remain | Job complete — nothing left to do |
| **Timing in game flow** | During repair phase | At delivery/completion phase |
| **Recommended format** | _(reference SO #50 design artifacts #53, #54)_ | _(insert from test findings summary)_ |

---

## Recommended Completion Reveal Format

> _[Author: Insert the recommended format from the test findings summary after research is complete.]_

**Selected format:** ___________  
**Source document:** `docs/spike-completion-reveal-ux-format-2026-07-10.md`

---

## Design Boundaries

### Timing in the Restoration Arc

> _[Author: Define exactly where in the game flow each reveal fires. Use existing event names from src/completion/ and src/cleaning/ as reference points if applicable.]_

- **SO #50 Cleaning Reveal fires at:** ___________
- **Completion Reveal fires at:** ___________
- **Gap / buffer between reveals:** ___________
- **Risk of overlap:** `[ ] None  [ ] Low  [ ] Medium — describe below`

### Visual Scope

> _[Author: Describe what each reveal shows visually. Define the boundary clearly so asset teams know which reveal "owns" which visual territory.]_

- **SO #50 Cleaning Reveal shows:** _(individual parts, specific components)_
- **Completion Reveal shows:** _(whole assembled watch, final presentation)_
- **Are the same watch assets used by both reveals?** `[ ] Yes — see Shared Dependencies below  [ ] No`

### Emotional Register

> _[Author: Describe the intended player emotional arc through each reveal. Confirm they are distinct and do not dilute each other.]_

- **SO #50 Cleaning Reveal emotional target:** ___________
- **Completion Reveal emotional target:** ___________
- **Assessment — do these conflict or dilute each other?** `[ ] No conflict  [ ] Potential conflict — describe below`
- **If conflict:** ___________

### Asset Requirements

> _[Author: List asset types required by each reveal. Flag any asset that both reveals require.]_

**SO #50 Cleaning Reveal assets:**
- _(list)_

**Completion Reveal assets:**
- _(list)_

---

## Shared Technical Dependencies

> _[Author: Identify any shared assets, UI components, animation systems, or audio cues that both reveals will need. For each dependency, propose a resolution — shared component vs. separate instances — per Scenario 5.]_

### Shared Assets

| Asset / Component | Used by SO #50 | Used by Completion Reveal | Resolution Proposed |
|-------------------|---------------|--------------------------|---------------------|
| _(example: watch render layer)_ | `[ ]` | `[ ]` | |
| | `[ ]` | `[ ]` | |

**Total shared dependencies found:** ___

### Resolution for Each Shared Dependency

> _[Author: For each shared dependency above, document whether a shared component or separate instances are recommended, and which team owns the decision.]_

_[Complete this section if any shared dependencies exist.]_

---

## Constraints the Core System Build Team Must Respect

> _[Author: Required per AC4. Document any constraints the Core System (#141) build team must observe based on this brief's findings. These become inputs to the #141 design decision.]_

1. ___________
2. ___________
3. _(add as needed)_

---

## Sequencing Conflict Assessment

**Scenario 4 outcome (boundary clear):** `[ ] Both teams confirm no design conflicts exist`  
**Scenario 5 outcome (conflict found):** `[ ] Conflicts found — see Shared Dependencies section above`

### SO #50 Team Sign-Off

- **Reviewer:** ___________  
- **Date reviewed:** ___________  
- **Assessment:** `[ ] No conflicts  [ ] Conflicts found (documented above)  [ ] Revision requested`  
- **Notes:** ___________

### Core System Team Sign-Off

- **Reviewer:** ___________  
- **Date reviewed:** ___________  
- **Assessment:** `[ ] No conflicts  [ ] Conflicts found (documented above)  [ ] Revision requested`  
- **Notes:** ___________

---

## Acceptance Criteria Coverage

| AC | Requirement | Status |
|----|-------------|--------|
| AC3 | Sequencing Brief defines boundaries: timing, visual scope (parts vs. whole), emotional register, shared technical dependencies | `[ ] Met  [ ] Not met` |
| AC4 | Brief states recommended reveal format and constraints the Core System build team must respect | `[ ] Met  [ ] Not met` |

---

## PO Review Gate

> _Per constraint: "Issue #141 cannot proceed to design until that review is complete and approved."_  
> _Both this document and the test findings summary must be submitted together._

- **Submitted to PO:** `[ ] Yes  [ ] No` — Date: ___________  
- **PO review window:** 2 business days from submission  
- **PO Decision:** `[ ] Approved — Issue #141 may proceed  [ ] Revision requested (see feedback below)`  
- **PO Reviewer:** ___________  
- **PO Decision Date:** ___________  
- **Revision feedback (if any):** ___________

---

## Constraints Compliance

| Constraint | Compliant? | Notes |
|------------|-----------|-------|
| Written document in accessible format (Markdown) | `[ ] Yes  [ ] No` | |
| Shareable with SO #50 team and Core System team | `[ ] Yes  [ ] No` | |
| No code artifacts produced | `[ ] Yes  [ ] No` | |
| PO review SLA (2 business days) built into timeline | `[ ] Yes  [ ] No` | |

---

*Document status: TEMPLATE — complete all sections during spike execution and before PO review.*  
*Both this document and the UX test findings summary must be PO-approved before Issue #141 may proceed.*  
*Reference: SO #50 Cleaning Reveal design artifacts — Issues #53 and #54.*
