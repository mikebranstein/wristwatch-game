# Fitness Thresholds

This document defines the quantitative pass/fail thresholds used by the architecture fitness evaluator for the wristwatch-game project.

All thresholds apply to the `src/` directory unless otherwise noted.

---

## Test Coverage

| Metric | Warning | Critical (Fail) |
|---|---|---|
| Overall line coverage | < 80 % | < 60 % |
| Per-module line coverage | < 70 % | < 50 % |
| Branch coverage | < 70 % | < 50 % |

Coverage is measured by `pytest --cov=src` as configured in `pytest.ini`.

---

## Cyclomatic Complexity

| Metric | Warning | Critical (Fail) |
|---|---|---|
| Per-function complexity | > 10 | > 15 |
| Per-module average complexity | > 7 | > 12 |

Measured with `radon cc`.

---

## Coupling & Cohesion

| Metric | Warning | Critical (Fail) |
|---|---|---|
| Afferent coupling (Ca) per module | > 8 | > 12 |
| Efferent coupling (Ce) per module | > 8 | > 12 |
| Instability index (Ce / (Ca + Ce)) | > 0.8 (for stable modules) | N/A |

Stable modules (those in `config/`, `catalog/data/`) should have instability index ≤ 0.3.

---

## Code Duplication

| Metric | Warning | Critical (Fail) |
|---|---|---|
| Duplicate code blocks (≥ 6 lines) | > 5 instances | > 15 instances |
| Duplication ratio across `src/` | > 5 % | > 10 % |

---

## Module Size

| Metric | Warning | Critical (Fail) |
|---|---|---|
| Lines of code per module (`.py` file) | > 300 | > 500 |
| Number of public functions per module | > 15 | > 25 |

---

## Dependency Layering

The following layering rules must not be violated. A violation at any level is **Critical**.

```
ui/          → may import from: analytics, orders, catalog, workshop, accessibility, config
analytics/   → may import from: config, save
orders/      → may import from: catalog, config
catalog/     → may import from: config
workshop/    → may import from: config, catalog, orders
save/        → may import from: config
config/      → may not import from any other src/ module
```

Circular imports between any two modules are always **Critical**.

---

## Dead Code

| Metric | Warning | Critical (Fail) |
|---|---|---|
| Unused exported symbols | > 3 | > 10 |

---

## Threshold Change Policy

Changes to any threshold value require a commit by the maintainer (`mikebranstein`) with a comment explaining the rationale. Thresholds may only be relaxed with documented justification.
