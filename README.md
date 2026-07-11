# wristwatch-game

## Architecture Overview

The Wristwatch Revival Simulator uses a **dual-language architecture** by design. JavaScript drives the real-time game engine layer, while Python owns data modelling, persistence, and analytics — each language is applied where it excels. This decision is recorded in [ADR-0001](docs/adr/0001-runtime-and-language.md) and elaborated in the [Foundation Decision Pack](docs/foundation-decision-pack.md).

### Responsibility Table

| Layer | Language | What lives here |
|-------|----------|-----------------|
| Game engine | JavaScript (`src/**/*.js`) | Snap-zone tolerances, assembly state machines, UI interaction, real-time simulation, player save state |
| Data & persistence | Python (`python/**/*.py`) | Parts catalog, data model definitions, compatibility logic, save system persistence, analytics, accessibility config |

### Interop Boundary

The two layers communicate through **`catalog.json`**: Python serialises the parts catalog and data models to JSON; JavaScript reads that file at runtime. There is **no direct runtime crossover** — each language runs in its own process and `catalog.json` is the sole handoff point. The full path-level boundary rules are documented in [`docs/language-boundary.md`](docs/language-boundary.md).

> **Layer boundary guardrail:** When in doubt, keep game logic in JavaScript and data definitions in Python. Do not mix layer responsibilities across the boundary. See [ADR-0001](docs/adr/0001-runtime-and-language.md) for the full architectural rationale.

### Developer Quick Reference

| Purpose | Command |
|---------|---------|
| Run JavaScript tests | `npm test` |
| Run Python tests | `pytest` |
| Run both test suites | `npm test && pytest` |

## Project Layout

- `python/` — Python source files (save system, analytics, orders, catalog, etc.)
- `src/` — JavaScript source files (game runtime, completion, economy, cosmetic, etc.)
- `tests/python/` — Python pytest suite
- `tests/javascript/` — JavaScript Jest suite

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
pytest tests/python/analytics/
```

### JavaScript tests (individual)

```bash
npm test
```

To run a specific test file:

```bash
npx jest tests/javascript/completion/job-quality-aggregator.test.js
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
