# Orchestration Routing Registry

This registry defines valid state transitions for all orchestration pipelines in this repository.
The Foundation Orchestrator uses it for G3 Route checks before every label transition.

---

## Foundation Pipeline

| Current State | Decision | Next State | Notes |
|---------------|----------|------------|-------|
| foundation-needed | (auto) | foundation-in-progress | Orchestrator picks up issue |
| foundation-in-progress | RECOMMEND | foundation-review | Research agent recommends approval path |
| foundation-in-progress | NEEDS_MORE_RESEARCH | foundation-in-progress | Stay in research; skip gate this run |
| foundation-in-progress | BLOCKED | foundation-blocked | Research cannot proceed |
| foundation-review | APPROVE_FOUNDATION | foundation-approved | Architect gate approves |
| foundation-review | REVISE_FOUNDATION | foundation-in-progress | Architect requests revisions |
| foundation-review | BLOCK_FOUNDATION | foundation-blocked | Architect blocks |
| foundation-blocked | (human) | foundation-needed | Human unblocks and re-opens |

---

## Transition Validation Gates (Foundation)

| Gate | Check |
|------|-------|
| G1 | Issue has expected current label before transition |
| G2 | Decision value is valid for the current state |
| G3 | `(state, decision)` pair exists in this registry |
| G4 | Required artifacts exist and are non-placeholder before APPROVE |
| G5 | Old state label removed and new state label added atomically |

---

## Architecture Review Pipeline

| Current State | Decision | Next State |
|---------------|----------|------------|
| arch-review-pending | (auto) | arch-review-in-progress |
| arch-review-in-progress | NO_ACTION | arch-review-no-action |
| arch-review-in-progress | REFACTOR_NEEDED | arch-refactor-planned |
| arch-review-in-progress | ESCALATE | arch-review-escalated |
| arch-refactor-planned | (auto) | arch-refactor-requests-created |

---

## Dev Pipeline

| Current State | Decision | Next State |
|---------------|----------|------------|
| feature-request | intake-approved | design-approved (pending design) |
| intake-approved | DESIGN_APPROVED | design-approved |
| intake-approved | DESIGN_BLOCKED | design-blocked |
| design-approved | BUILD_COMPLETE | build-complete |
| design-approved | BUILD_BLOCKED | build-blocked |
| build-complete | QA_PASSED | qa-passed |
| build-complete | QA_FAILED | qa-failed |
| qa-passed | POLICY_AUTO_APPROVED | released |
| qa-passed | POLICY_ESCALATED | policy-escalated |
| qa-passed | POLICY_BLOCKED | policy-blocked |

---

_Last updated: 2026-07-10 (bootstrap)_
