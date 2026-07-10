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
pytest tests/analytics/
```

### JavaScript tests

```bash
npm test
```

To run a specific test file:

```bash
npx jest tests/completion/job-quality-aggregator.test.js
```

Both test suites should be run before submitting changes:

```bash
npm test && pytest
```
