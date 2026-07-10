# Architecture Review Policy

## Purpose

This document defines the governance rules, review scope, ownership, and escalation paths for architecture reviews of the wristwatch-game project.

## Scope

Architecture reviews apply to all code under `src/`, `tests/`, and configuration files at the repository root. Reviews assess:

- Module coupling and cohesion
- Test coverage levels
- Cyclomatic complexity
- Dependency structure and layering violations
- Code duplication
- Public API surface area

Reviews are triggered automatically on a recurring cadence and whenever a refactor issue is closed.

## Ownership

| Role | Responsibility |
|---|---|
| **Maintainer** | Approves refactor plans, merges architecture-driven PRs, sets fitness thresholds |
| **Dev Agent** | Implements refactor tasks produced by the review cycle |
| **Architecture Review Agent** | Runs fitness checks, files debt issues, produces refactor plans |

The repository owner (`mikebranstein`) is the designated maintainer.

## Review Cadence

- **Scheduled**: Every sprint (approximately every two weeks)
- **On-demand**: Triggered manually or when a `refactor-request` issue is closed

## Issue Labels

| Label | Meaning |
|---|---|
| `architecture-review` | Issue produced by the architecture review agent |
| `refactor-request` | A bounded refactor task ready for dev execution |
| `tech-debt` | Observed fitness violation logged for tracking |
| `architecture-approved` | Review cycle completed; no action required |
| `architecture-blocked` | Review cycle flagged a critical violation requiring immediate attention |

## Escalation Path

1. **Fitness violation (warning)** — Logged as a `tech-debt` issue. No blocking action; addressed in next sprint.
2. **Fitness violation (critical)** — Labeled `architecture-blocked`. Maintainer must acknowledge within one business day before new feature work proceeds.
3. **Unresolvable debt** — Maintainer schedules a dedicated architecture spike issue and defers affected features.

## Governance Rules

- Fitness thresholds are defined in [`docs/fitness-thresholds.md`](fitness-thresholds.md) and must not be modified without a maintainer commit.
- All architecture review issues must be resolved (closed or explicitly deferred) before a major version release.
- Refactor tasks produced by this process follow the same intake → design → build → QA → release pipeline as feature work.
- Architecture reviews are read-only with respect to source code; they produce issues only.
