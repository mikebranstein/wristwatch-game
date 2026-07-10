# wristwatch-game

## Setup

### Python (save system, analytics, orders)

```bash
pip install -r requirements-dev.txt
```

### JavaScript (game runtime — completion, economy, cosmetic, etc.)

```bash
npm install
```

## Running Tests

### Run All Tests (recommended)

Use the unified entry point to run both the JavaScript and Python test suites in a single command:

```bash
npm run test:all
```

Both suites always run to completion — the script does **not** short-circuit on the first failure, so you always see the full health picture of both layers. Exit code is 0 only when both Jest and pytest pass.

To run both suites with coverage reporting:

```bash
npm run test:all:coverage
```

> **Exit-code contract:** `0` = both suites passed; `1` = at least one suite failed (both still ran).

---

### Python tests (individual)

```bash
pytest
```

To run only the analytics tests:

```bash
pytest tests/analytics/
```

### JavaScript tests (individual)

```bash
npm test
```

To run a specific test file:

```bash
npx jest tests/completion/job-quality-aggregator.test.js
```

Both test suites should be run before submitting changes. Use `npm run test:all` for the combined run.
If you prefer running them separately, use:

```bash
npm test && pytest
```

## Language Boundary

The JS/Python interop boundary is documented in **[`docs/language-boundary.md`](docs/language-boundary.md)**.  
Read it before adding new source files to understand which paths belong to each language layer.

To verify the boundary is clean on your local checkout:

```bash
npm run check:boundary
```

A `0` exit code confirms no cross-boundary file placements exist.
