---
description: "Deterministic utility that evaluates architecture fitness functions and emits a machine-readable report."
---

# Fitness Evaluator Utility

This utility evaluates predefined fitness functions and writes a report for architecture-review processing.

## Required Input Artifact

- `docs/fitness-thresholds.md` (source of threshold truth)

If this file is missing, return an error and do not emit PASS/WARN/FAIL results.

## Commands

### run

Evaluate fitness functions for a given window and emit `fitness-report.json`.

Example:
```bash
./utilities/fitness-evaluator.md run --window "last-3-features"
```

## Fitness Functions

1. `dependency_rule_violations`
2. `complexity_hotspots`
3. `duplication_trend`
4. `test_flakiness_rate`
5. `performance_budget_regression`
6. `security_static_findings`

## Threshold Model

- `PASS`: within target
- `WARN`: outside target but non-critical
- `FAIL_CRITICAL`: severe violation requiring escalation

Threshold values must be read from `docs/fitness-thresholds.md`.

## Output Schema

```json
{
  "window": "string",
  "generated_at": "ISO-8601",
  "overall_status": "PASS|WARN|FAIL_CRITICAL",
  "findings": [
    {
      "function_id": "string",
      "status": "PASS|WARN|FAIL_CRITICAL",
      "subsystem": "string",
      "evidence": "string",
      "value": "number|string",
      "threshold": "number|string"
    }
  ]
}
```

## Boundaries

- Deterministic only; no policy decisions.
- Does not create issues directly.
- Does not modify source code.
