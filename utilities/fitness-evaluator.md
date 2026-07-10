# Fitness Evaluator Utility

This utility runs the architecture fitness evaluation for the wristwatch-game project and produces `fitness-report.json`.

## Usage

```
./utilities/fitness-evaluator.md run --window "last-3-features"
```

## Checks Performed

1. **Test Coverage** — `pytest --cov=src --cov-report=json`
   - Thresholds from `docs/fitness-thresholds.md`
2. **Cyclomatic Complexity** — `radon cc src -a -s`
   - Per-function warning: > 10, critical: > 15
3. **Module Size** — line count per `.py` file in `src/`
   - Warning: > 300 lines, critical: > 500 lines
4. **Dependency Layering** — static analysis of `from`/`import` statements vs. allowed layer map
   - Any violation is critical
5. **Dead Code** — `vulture src --min-confidence 80`
   - Warning: > 3 unused exports, critical: > 10

## Output

Writes `fitness-report.json` in the repository root with the following schema:

```json
{
  "generated_at": "<ISO timestamp>",
  "window": "<window parameter>",
  "findings": [
    {
      "id": "<unique-slug>",
      "check": "<check name>",
      "severity": "critical|warning",
      "module": "<src/path/to/module.py>",
      "description": "<human-readable description>",
      "metric": "<measured value>",
      "threshold": "<threshold value>"
    }
  ],
  "summary": {
    "total": 0,
    "critical": 0,
    "warning": 0
  }
}
```
