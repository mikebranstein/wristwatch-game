# Foundation Decision Pack

This document records all foundational architecture decisions for the Wristwatch Revival Simulator.
Each entry maps to an ADR in `docs/adr/` and traces back to product context in `docs/discovery-focus.md`.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| PROPOSED | Decision is under research/discussion |
| APPROVED | Gated and approved by foundation-architect |
| BLOCKED | Requires human escalation before proceeding |
| SUPERSEDED | Replaced by a later decision (link provided) |

---

## Product and Team Context

- **Product type**: Single-player PC simulation game (watch restoration)
- **Domain**: Mechanical wristwatch repair — teardown, cleaning, part sourcing, reassembly
- **Team size**: Small (indie / small-studio scope)
- **Team language strengths**: JavaScript (game engine, UI, interaction); Python (data modelling, persistence, analytics)
- **Delivery constraints**: Phased content rollout starting with ETA-2824 movement; keyboard/mouse primary input; Windows PC first release

---

## Decision Index

| # | Title | Status | ADR | Last Updated |
|---|-------|--------|-----|--------------|
| FD-001 | Runtime and Language | PROPOSED | [ADR-0001](adr/0001-runtime-and-language.md) | 2026-07-10 |
| FD-002 | Game Engine / Simulation Framework | PROPOSED | [ADR-0002](adr/0002-game-engine.md) | 2026-07-10 |
| FD-003 | Data Model for Part Compatibility | PROPOSED | [ADR-0003](adr/0003-data-model.md) | 2026-07-10 |
| FD-004 | Save/Load Architecture | PROPOSED | [ADR-0004](adr/0004-save-load-architecture.md) | 2026-07-10 |
| FD-005 | Build Pipeline and Deployment | PROPOSED | [ADR-0005](adr/0005-build-pipeline.md) | 2026-07-10 |

---

## FD-001 — Runtime and Language

**Status:** PROPOSED  
**Discovery Focus Alignment:** Technical Constraints — "Target mid-range Windows gaming PCs first; keyboard/mouse as primary input. Real-time simulation must remain responsive despite many small interactive parts."  
**Linked ADR:** [ADR-0001](adr/0001-runtime-and-language.md)

### Decision
**Dual-language architecture: JavaScript (Node.js v24) for the real-time game engine layer; Python 3 for data models, catalog, persistence, and analytics.**

The boundary is explicit:
- **JS side**: All real-time simulation, UI interaction, player state, snap-zone tolerances, and event-driven game loop.
- **Python side**: Static part definitions, movement family compatibility tables, save-file I/O, analytics, and catalog filtering.

### Alternatives Considered
- JavaScript only — migration cost too high given existing Python codebase; Python dataclasses more expressive for content authoring.
- Python only — no proven high-performance real-time simulation equivalent for browser/Electron target; V8 performance advantage lost.
- TypeScript + Python — type safety improvement but no immediate functional benefit given current test coverage; treated as a future upgrade.

### Rationale
The existing dual-language codebase is implemented, tested, and benchmarked. The chronograph spike (Issue #87) confirmed Node.js v24 sustains >11,000 FPS theoretical throughput at 80 parts with <0.1ms P95 interaction latency. Forcing a single-language rewrite would incur high migration cost with no measurable benefit to the product's core constraint.

### Consequences
- Two build pipelines (npm/Jest + Python/pytest) must be maintained.
- JSON interop boundary between Python data and JS runtime must be respected.
- TypeScript migration (if desired) requires a future ADR.

---

## FD-002 — Game Engine / Simulation Framework

**Status:** PROPOSED  
**Discovery Focus Alignment:** Technical Constraints — "Real-time simulation must remain responsive despite many small interactive parts."  
**Linked ADR:** [ADR-0002](adr/0002-game-engine.md)

### Decision
**Custom JavaScript Canvas/WebGL simulation engine** — hand-rolled JS modules (`SnapZoneTolerance`, `AssemblyFeedbackStateMachine`, `ReassemblyScreen`) targeting browser/Electron rendering, tested in Node.js via Jest.

### Alternatives Considered
- Phaser 3 — general-purpose 2D framework, not optimised for precision snap-zone simulation; not tested for 80+ micro-part workload.
- Unity (WebGL export) — C# diverges from existing stack; Unity licensing changes (2024) introduce commercial risk.
- Godot 4 — different language; no measured evidence for watch-part precision simulation.
- React + Canvas — React state model conflicts with tight game-loop timing requirements.

### Rationale
The engine is already implemented and benchmarked. The chronograph spike confirmed:
- O(1) snap-zone lookup; O(1) per-part FSM updates.
- 80-part active simulation uses <0.5% of the 60Hz frame budget.
- Jest-based CI covers all interaction paths without a renderer dependency.

No third-party engine can match this measured evidence for the specific workload. Switching would abandon the validated performance baseline and require a full rewrite.

### Consequences
- Browser render pipeline (WebGL draw calls) must be profiled in Chrome before Phase 1 (outstanding spike recommendation).
- Polygon/render budget system (≤500 triangles/part; ≤40,000 triangles/scene) must be implemented before Phase 1 build.
- No built-in audio, animation, or scene graph — lightweight libraries needed.

---

## FD-003 — Data Model for Part Compatibility

**Status:** PROPOSED  
**Discovery Focus Alignment:** Technical Constraints — "Data model must support modular part compatibility across movement families." / "Small team scope requires phased content rollout and reusable part/system libraries."  
**Linked ADR:** [ADR-0003](adr/0003-data-model.md)

### Decision
**Python dataclasses with static `COMPATIBILITY_TABLE` dict.** `MovementFamily`, `PartType`, `PartCondition`, `CompatibilityStatus` as `str` Enums. Frozen `@dataclass` for `Part`. `UNCERTAIN` is the safe default for unregistered `(movement_family, part_id)` pairs.

### Alternatives Considered
- SQLite relational DB — schema migrations on every content update; overkill for lookup-only data source.
- JSON files only — no type safety; typos cause silent failures.
- TypeScript enums + JSON — loses Python dataclass expressiveness; requires migration of existing modules.
- YAML-driven catalog — adds YAML parser; less type-safe; requires extra validation tooling.

### Rationale
The existing model is implemented, tested with pytest, and in production use. The `UNCERTAIN` default prevents false incompatibility errors when content is added incrementally. Adding a new movement family requires one enum value + new table entries — no migration, no infrastructure change.

### Consequences
- Catalog requires re-serialisation to JSON on content updates (no hot-reload).
- JSON serialisation boundary between Python and JS must be maintained explicitly.
- Static dict may warrant a builder pattern as catalog grows beyond 3–5 movement families.

---

## FD-004 — Save/Load Architecture

**Status:** PROPOSED  
**Discovery Focus Alignment:** Technical Constraints — "Save/load reliability is critical to prevent progress loss during long restorations."  
**Linked ADR:** [ADR-0004](adr/0004-save-load-architecture.md)

### Decision
**Atomic JSON checkpoints with async background writes.** Python `SaveSystem` uses `tempfile + os.replace()` for atomic writes on Windows NTFS. `save_async()` fires a background thread so the game loop never pauses. Stage checkpoints at each of 4 restoration phases (teardown, cleaning, sourcing, reassembly). In-transit orders persisted at placement time. Additive backward-compatible `DEFAULT_SAVE` schema in JS `PlayerSaveState`.

### Alternatives Considered
- SQLite save database — transactional but heavy for single-player local saves; schema migrations burden small team.
- localStorage / IndexedDB only — 5–10MB quota; no atomic write guarantees.
- Cloud save only — violates discovery focus: "No live-service dependency for core play."
- Manual save only — unacceptable progress loss risk for 90-minute sessions.

### Rationale
The architecture satisfies all reliability constraints with minimal infrastructure. Atomic writes eliminate corrupt-save scenarios on Windows. Async saves ensure the 60Hz game loop is never paused. The additive schema pattern allows unlimited new fields without migration tooling. Full test coverage validates all autosave/load paths.

### Consequences
- Background write threading requires careful callback design — errors are not surfaced to the game loop without `on_error`.
- Production JS/Electron integration layer (wiring `PlayerSaveState.snapshot()` to the Electron file API) is not yet implemented — Phase 1 prerequisite.
- Large save files (many completed watches or job captures) may need pruning in a future patch.

---

## FD-005 — Build Pipeline and Deployment

**Status:** PROPOSED  
**Discovery Focus Alignment:** Technical Constraints — "Target mid-range Windows gaming PCs first." / "Small team scope requires phased content rollout."  
**Linked ADR:** [ADR-0005](adr/0005-build-pipeline.md)

### Decision
**npm/Jest + Python/pytest dual toolchain, with Electron for Windows PC distribution.** Build pipeline: `npm test` (Jest, JS engine) → `pytest` (Python data/persistence) → Python→JSON catalog serialisation → `npm run build` (Electron Windows installer). Content-only updates (new calibres) require only Python data changes + catalog re-serialisation — no engine rebuild.

### Alternatives Considered
- JavaScript-only stack — requires Python persistence migration; team's Python expertise lost.
- Unity Windows build — abandons JS/Python stack; full rewrite.
- Web browser only — limits file I/O for local saves; browser-only insufficient for PC game distribution.
- Tauri (Rust + WebView) — smaller bundle but adds Rust expertise requirement; diverges from Python persistence layer.

### Rationale
The existing dual-toolchain is zero-configuration and proven. Electron is the standard path for JS→Windows distribution. Content phases are isolated to data updates, keeping engine CI stable. Node.js v24 LTS has support through 2029.

### Consequences
- Electron bundle size ~100–150MB (acceptable for mid-range PC; not suitable for mobile).
- Python must be bundled in Electron package (via PyInstaller) for persistence layer — adds build complexity.
- Browser render profiling pass (spike #87 recommendation) must precede Phase 1 build.

---

## Non-Functional Requirements

- **Performance budget**: 60 FPS minimum on mid-range Windows PC; <16.67ms per frame; engine layer confirmed <0.1ms at 80 parts.
- **Save reliability**: Zero progress loss on clean exits; maximum one-phase loss on abnormal exit.
- **Session length**: Support 20–90 minute uninterrupted sessions with stage checkpoints.
- **Part count**: Engine validated for 50–80 parts; Phase 1 targets 80-part chronograph movement.
- **QA coverage**: ≥80% line coverage for both JS (Jest) and Python (pytest) layers; focus on combinatorial compatibility and save/load chains.

---

## Guardrails for Autonomous Agents

- **Interop boundary**: Python owns data definitions and file I/O; JS owns runtime game state and interaction. Do not mix responsibilities across the boundary.
- **Backward compatibility**: All new save fields must follow the `DEFAULT_SAVE` additive pattern with null/false/zero defaults.
- **Content-only updates**: New movement families require only Python catalog changes + pytest validation. Do not modify the JS engine for data-only additions.
- **Polygon budget**: Per-part ≤500 triangles; per-scene ≤40,000 triangles — enforce at asset load time before Phase 1.
- **No live-service dependency**: Core gameplay must function without network access. Save files are local only.
- **No real watch brand trademarks**: Use generic movement family designations (ETA-2824, AS-1950, Miyota-8215) descriptively — do not use protected brand logos or trade dress.

---

## Foundation Gate Checklist

- [x] Decision records created for all major choices (ADR-0001 through ADR-0005)
- [x] Strategic constraints and non-functional requirements documented
- [x] Risk and rollback strategies documented in each ADR
- [x] Discovery focus explicitly referenced in each decision
- [ ] Foundation architect gate review (pending — issue #228)
- [ ] Browser render profiling pass (Phase 1 prerequisite — not a gate blocker)
- [ ] Electron + PyInstaller build integration (Phase 1 prerequisite)

---

## Approval

- **Reviewer:** _(pending foundation-architect gate)_
- **Date:** —
- **Decision:** PENDING
- **Notes:** Foundation research complete. All 5 decision areas covered with ADRs. Recommend proceeding to architect gate review.

---

_Last updated: 2026-07-10 by foundation-research agent (Issue #228)_
