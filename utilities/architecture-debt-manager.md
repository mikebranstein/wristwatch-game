# Architecture Debt Manager Utility

This utility synchronises `fitness-report.json` findings with GitHub issues labelled `architecture-debt`.

## Usage

```
./utilities/architecture-debt-manager.md sync --source fitness-report.json
```

## Behaviour

1. Read `fitness-report.json` from the repository root.
2. For each finding in the report:
   - Search for an existing open issue with label `architecture-debt` whose title contains the finding `id`.
   - If one exists: update the body with the latest metric values (upsert).
   - If none exists: create a new issue using the `architecture_debt` template, setting title `[ARCH DEBT] <description>`, labels `architecture-debt`, and body populated from the finding.
3. Findings with `severity: critical` additionally receive label `arch-review-pending` so the Architecture Review Agent processes them in the next cycle.
4. After sync, print a summary:
   ```
   Debt issues upserted: N (C critical, W warning)
   ```

## Label Map

| Severity | Labels applied |
|----------|---------------|
| `critical` | `architecture-debt`, `arch-review-pending` |
| `warning`  | `architecture-debt`, `debt-triaged` |
