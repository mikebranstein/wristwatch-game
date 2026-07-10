# ADR-0005 — Build Pipeline: npm/Jest + Python/pytest Dual Toolchain for Windows PC

**Status:** ACCEPTED  
**Date:** 2026-07-10  
**Deciders:** Foundation Research Agent  
**Tags:** build-pipeline, deployment, testing, ci, platform

---

## Context

The Wristwatch Revival Simulator targets mid-range Windows PCs as the primary distribution platform, with a small team maintaining a phased content rollout. The build pipeline must support:

1. Fast iteration — developers and agents can run tests and verify changes in seconds.
2. Dual-language codebase — JavaScript (Node.js/Jest) and Python (pytest) must be independently testable.
3. Windows-first distribution — the production deliverable must run on Windows without requiring the player to install Node.js, Python, or any development toolchain.
4. Phased content rollout — new movement families, part types, and game phases can be shipped as content updates without full engine rebuilds.
5. Small team scope — minimal CI maintenance overhead; no monorepo tooling or complex build graphs.

Constraints from `docs/discovery-focus.md`:
- "Target mid-range Windows gaming PCs first; keyboard/mouse as primary input."
- "Small team scope requires phased content rollout and reusable part/system libraries."
- "QA burden is high due to combinatorial repair states; test plans must focus on high-risk failure chains."
- "No mobile-first UX requirements for initial release."

Existing toolchain (confirmed by `package.json`, `pytest.ini`, `requirements-dev.txt`):
- **JavaScript**: `npm` for package management; `jest@^29` for test runner; `testEnvironment: "node"` for headless test execution.
- **Python**: `pytest>=8.0.0` for test runner; `pyproject.toml` and `pytest.ini` for configuration.
- **Coverage**: `jest --coverage` for JS; pytest with coverage plugin for Python.
- **Platform**: Node.js v24.18.0 on Windows 11 (confirmed by spike benchmark environment).

---

## Decision Drivers

- **Windows-first distribution**: Electron wraps the JS game engine and Python-serialised data into a self-contained Windows installer — no player-side runtime required.
- **Dual-toolchain isolation**: Independent Jest and pytest runs allow parallel CI jobs and prevent cross-language test contamination.
- **Fast feedback loops**: `npm test` and `pytest` complete in seconds for the current codebase size (97 JS tests, 33 Python tests).
- **Small team low-overhead**: npm + Jest + pytest are zero-configuration out-of-the-box for the existing project layout; no Gradle, CMake, or Bazel required.
- **Phased content pipeline**: New movement families require Python data entries only — the Jest suite validates the JS engine, and pytest validates the compatibility data. No full rebuild needed for content-only updates.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| **A — npm/Jest + pytest (current)** | Separate JS and Python toolchains; Electron for Windows distribution | Proven; zero-config; fast; independent CI; Electron is the standard path for JS→Windows | Two toolchains to maintain; Electron bundle size (~100MB+) is larger than native |
| B — Electron + Python subprocess only | Bundle Python as a subprocess inside Electron | Single distributable | Complex IPC layer; Python subprocess management overhead; debugging across process boundary |
| C — Unity (Windows build) | Unity C# → .exe | Native Windows executable; rich engine | Abandons JS/Python stack; full rewrite required; Unity licensing risk for small teams |
| D — Web browser only (no Electron) | Deploy as a web app on Steam or direct download | No installer; instant delivery | "Target mid-range Windows gaming PCs" implies offline-capable local install; browser-only limits file I/O for saves |
| E — Tauri (Rust + WebView) | Lightweight Electron alternative using Rust backend | Smaller bundle; faster startup | Rust backend diverges from Python persistence layer; team doesn't currently maintain Rust expertise |

---

## Decision Outcome

**Chosen option: A — npm/Jest + Python/pytest dual toolchain, with Electron for Windows PC distribution.**

This is the natural continuation of the existing toolchain. The key production path is:

```
Source (JS + Python)
  → npm test (Jest)          — validates game engine, interaction, state
  → pytest                   — validates data model, catalog, save system
  → Python catalog → JSON    — serialise part compatibility data for JS consumption
  → npm run build (Electron) — package JS engine + static JSON assets into Windows installer
  → Distributable .exe / Steam upload
```

### Test Pipeline

| Layer | Runner | Coverage target | Files |
|-------|--------|-----------------|-------|
| JavaScript game engine | Jest 29 (`npm test`) | ≥80% line coverage | `src/**/*.js`, `tests/**/*.test.js` |
| Python data/persistence | pytest 8 (`pytest`) | ≥80% line coverage | `src/**/*.py`, `tests/**/test_*.py` |

Coverage thresholds are enforced via `jest --coverage` and the pytest `--cov` plugin.

### Content Update Deployment

For content-only sprints (new movement families, new part types):
1. Author adds enum values and catalog entries in Python (`src/catalog/data/part_compatibility.py`).
2. `pytest` validates new compatibility entries.
3. Python serialisation script generates updated `catalog.json`.
4. Electron package is rebuilt with updated JSON assets — no JS engine changes required.
5. Patch distributed as an update to the existing Windows installation.

### Phased Rollout Strategy

| Phase | Scope | Build gate |
|-------|-------|------------|
| Phase 0 (MVP core loop) | ETA-2824 only; teardown/cleaning/reassembly | Jest + pytest green; manual playtest |
| Phase 1 (Chronograph) | +60 chronograph parts; extended snap-zone config | Chronograph spike GO (confirmed); browser render profiling pass |
| Phase 2 (Additional calibres) | AS-1950, Miyota-8215 | pytest compatibility table coverage; content QA |
| Phase N (Expansion) | New movement families, sourcing economy | Data-only update; no engine rebuild |

### Rollback Strategy

- Each release tag corresponds to a full `dist/` snapshot.
- Content-only updates can be rolled back by re-deploying the previous `catalog.json`.
- Engine changes require a full rebuild and re-release.

---

## Positive Consequences

- Single `npm test && pytest` command runs the full test suite across both language layers.
- Electron provides a proven path to Windows `.exe` distribution with Steam Greenlight / direct download.
- Content authors can ship new calibres without touching the game engine or JS test suite.
- CI is low-maintenance: two standard test runners, no custom build tooling.
- Node.js v24 LTS has 5-year support horizon (through 2029) — no runtime upgrade urgency.

## Negative Consequences / Trade-offs

- Electron bundle size (~100–150MB) is larger than a native C++ game executable. Acceptable for mid-range PC target; not suitable for mobile.
- Python must be bundled in the Electron package (via PyInstaller or similar) for the persistence layer — adds build complexity relative to a JS-only stack.
- Browser render profiling pass (identified by spike #87) must be completed before Phase 1 to validate the WebGL draw-call budget.
- Two CI jobs are required (Node + Python environments) — minor overhead but standard practice.

---

## Compliance Notes

- Electron is MIT licensed. PyInstaller is GPL with a special exception for bundled applications (compatible with MIT project licence).
- Steam distribution requires a Steamworks SDK integration (separate implementation task, out of scope for foundation).
- No platform-exclusive APIs are used — the Windows NTFS atomic write semantics (`os.replace()`) work correctly on all modern Windows versions (Vista+).

---

## Links

- Related ADR(s): ADR-0001 (Runtime), ADR-0002 (Game Engine)
- Foundation Decision Pack entry: FD-005 (Deployment and Build Pipeline)
- Discovery Focus section: Technical Constraints — "Target mid-range Windows gaming PCs first." / "Small team scope requires phased content rollout."
- Source: `package.json`, `pytest.ini`, `requirements-dev.txt`, `pyproject.toml`
- Spike evidence: `docs/spike-chronograph-part-count-2026-07-10.md`
