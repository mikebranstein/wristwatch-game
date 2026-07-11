# ADR-0005 — Build Pipeline: npm/Jest Single JavaScript Toolchain for Windows PC

**Status:** ACCEPTED  
**Date:** 2026-07-10  
**Deciders:** Foundation Research Agent  
**Tags:** build-pipeline, deployment, testing, ci, platform

---

## Context

The Wristwatch Revival Simulator targets mid-range Windows PCs as the primary distribution platform, with a small team maintaining a phased content rollout. The build pipeline must support:

1. Fast iteration — developers and agents can run tests and verify changes in seconds.
2. Single-language codebase — JavaScript must cover engine, data, save/load, analytics, and accessibility modules.
3. Windows-first distribution — the production deliverable must run on Windows without requiring the player to install any development toolchain.
4. Phased content rollout — new movement families, part types, and game phases can be shipped as content updates without full engine rebuilds.
5. Small team scope — minimal CI maintenance overhead; no monorepo tooling or complex build graphs.

Constraints from `docs/discovery-focus.md`:
- "Target mid-range Windows gaming PCs first; keyboard/mouse as primary input."
- "Small team scope requires phased content rollout and reusable part/system libraries."
- "QA burden is high due to combinatorial repair states; test plans must focus on high-risk failure chains."
- "No mobile-first UX requirements for initial release."

Python existed in the repository before ADR authoring, but this revised decision sets JavaScript as the only target language.

Existing/target toolchain (confirmed by `package.json`):
- **JavaScript**: `npm` for package management; `jest@^29` for test runner; `testEnvironment: "node"` for headless test execution.
- **Coverage**: `jest --coverage` for JavaScript layers.
- **Platform**: Node.js v24.18.0 on Windows 11 (confirmed by spike benchmark environment).

---

## Decision Drivers

- **Windows-first distribution**: Electron wraps the JS game engine and JS-defined data into a self-contained Windows installer.
- **Single-toolchain simplicity**: One runtime, one test runner, one CI environment.
- **Fast feedback loops**: `npm test` completes in seconds for the current codebase size.
- **Small team low-overhead**: npm + Jest are zero-configuration for the existing project layout; no Gradle, CMake, or Bazel required.
- **Phased content pipeline**: New movement families and part types are shipped through JavaScript data/catalog updates with schema validation.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| **A — npm/Jest single toolchain (chosen)** | JavaScript-only test/build/release pipeline with Electron packaging | Simple CI, single runtime, no cross-language coordination, proven Windows path | Electron bundle size (~100MB+) is larger than native |
| B — Electron + Python subprocess | Bundle Python as subprocess inside Electron | Single distributable | Reintroduces multi-language complexity and IPC overhead |
| C — Unity (Windows build) | Unity C# → .exe | Native Windows executable; rich engine | Abandons JavaScript stack; full rewrite required; Unity licensing risk for small teams |
| D — Web browser only (no Electron) | Deploy as a web app on Steam or direct download | No installer; instant delivery | "Target mid-range Windows gaming PCs" implies offline-capable local install; browser-only limits file I/O for saves |
| E — Tauri (Rust + WebView) | Lightweight Electron alternative using Rust backend | Smaller bundle; faster startup | Introduces Rust backend divergence from JavaScript-only standard |

---

## Decision Outcome

**Chosen option: A — npm/Jest single JavaScript toolchain, with Electron for Windows PC distribution.**

This is the architecture-aligned path for the project. The key production path is:

```
Source (JavaScript)
  → npm test (Jest)          — validates engine, interaction, state, data model, save/load
  → npm run build (Electron) — package JS engine + static assets into Windows installer
  → Distributable .exe / Steam upload
```

### Test Pipeline

| Layer | Runner | Coverage target | Files |
|-------|--------|-----------------|-------|
| JavaScript runtime + data + persistence | Jest 29 (`npm test`) | ≥80% line coverage | `javascript/**/*.js`, `src/**/*.js`, `tests/javascript/**/*.test.js` |

Coverage thresholds are enforced via `jest --coverage`.

### Content Update Deployment

For content-only sprints (new movement families, new part types):
1. Author adds enum values and catalog entries in JavaScript catalog modules.
2. Jest and schema tests validate compatibility entries.
3. Catalog artifact generation updates `catalog.json` when required by runtime packaging.
4. Electron package is rebuilt with updated assets — no engine architecture changes required.
5. Patch distributed as an update to the existing Windows installation.

### Phased Rollout Strategy

| Phase | Scope | Build gate |
|-------|-------|------------|
| Phase 0 (MVP core loop) | ETA-2824 only; teardown/cleaning/reassembly | Jest green; manual playtest |
| Phase 1 (Chronograph) | +60 chronograph parts; extended snap-zone config | Chronograph spike GO (confirmed); browser render profiling pass |
| Phase 2 (Additional calibres) | AS-1950, Miyota-8215 | Jest compatibility table coverage; content QA |
| Phase N (Expansion) | New movement families, sourcing economy | Data-only update; no engine rebuild |

### Rollback Strategy

- Each release tag corresponds to a full `dist/` snapshot.
- Content-only updates can be rolled back by re-deploying the previous `catalog.json`.
- Engine changes require a full rebuild and re-release.

---

## Positive Consequences

- Single `npm test` command runs the full test suite in one language.
- Electron provides a proven path to Windows `.exe` distribution with Steam Greenlight / direct download.
- Content authors can ship new calibres without touching the game engine or JS test suite.
- CI is low-maintenance: one standard test runner, no custom cross-language build tooling.
- Node.js v24 LTS has 5-year support horizon (through 2029) — no runtime upgrade urgency.

## Negative Consequences / Trade-offs

- Electron bundle size (~100–150MB) is larger than a native C++ game executable. Acceptable for mid-range PC target; not suitable for mobile.
- Migration work is required to retire remaining Python scripts/modules and ensure behavior parity.
- Browser render profiling pass (identified by spike #87) must be completed before Phase 1 to validate the WebGL draw-call budget.
- Transitional branches may temporarily carry mixed assets while migration lands.

---

## Compliance Notes

- Electron is MIT licensed.
- Steam distribution requires a Steamworks SDK integration (separate implementation task, out of scope for foundation).
- No platform-exclusive APIs are used beyond standard filesystem semantics supported on modern Windows versions.

---

## Links

- Related ADR(s): ADR-0001 (Runtime), ADR-0002 (Game Engine)
- Foundation Decision Pack entry: FD-005 (Deployment and Build Pipeline)
- Discovery Focus section: Technical Constraints — "Target mid-range Windows gaming PCs first." / "Small team scope requires phased content rollout."
- Source: `package.json`
- Spike evidence: `docs/spike-chronograph-part-count-2026-07-10.md`
