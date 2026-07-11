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

### Python tests

```bash
pytest
```

To run only the analytics tests:

```bash
pytest tests/python/analytics/
```

### JavaScript tests

```bash
npm test
```

To run a specific test file:

```bash
npx jest tests/javascript/completion/job-quality-aggregator.test.js
```

Both test suites should be run before submitting changes:

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
