---
description: "Deterministic utility to create or update architecture debt issues from fitness and review findings."
---

# Architecture Debt Manager Utility

This utility upserts architecture-debt issues with deduplication.

## Commands

### sync

Create or update debt issues from a source report.

Example:
```bash
./utilities/architecture-debt-manager.md sync --source fitness-report.json
```

### dedupe-key

Compute dedupe key from finding fingerprint:
- function_id
- subsystem
- symptom hash

## Upsert Rules

1. If open debt issue with same dedupe key exists: append evidence and update timestamp.
2. If no matching open issue exists: create new issue with `architecture-debt` label.
3. If finding is resolved in subsequent report: label issue `debt-resolved` and close.

## Severity Mapping

- PASS -> no debt issue action
- WARN -> create/update debt issue (severity medium by default)
- FAIL_CRITICAL -> create/update debt issue (severity critical) and flag for escalation path

## Boundaries

- Deterministic only; no strategic prioritization.
- Does not create feature-request issues.
- Does not decide policy block vs escalation.
