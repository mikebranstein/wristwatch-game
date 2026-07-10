# ADR-0002 — Game Engine: Custom JavaScript Canvas/WebGL Simulation Engine

**Status:** ACCEPTED  
**Date:** 2026-07-10  
**Deciders:** Foundation Research Agent  
**Tags:** engine, simulation, framework, platform

---

## Context

The Wristwatch Revival Simulator requires a game engine or simulation framework that can:

1. Render and interact with 50–80+ individual watch parts simultaneously on a workbench.
2. Handle precise keyboard/mouse input for picking, dragging, dropping, and snapping tiny components.
3. Deliver a responsive real-time simulation loop at 60 Hz or better on mid-range Windows PCs.
4. Support a phased content rollout — new movement families and part types added in content sprints without engine rewrites.
5. Operate within a small team scope with low per-feature integration overhead.

The chronograph spike (Issue #87, `docs/spike-chronograph-part-count-2026-07-10.md`) benchmarked the existing engine against these requirements. Key findings:

- The engine's JS logic layer (`SnapZoneTolerance`, `AssemblyFeedbackStateMachine`, `ReassemblyScreen`) sustains **>11,000 FPS theoretical throughput** at 80 parts.
- Max P95 interaction latency: **0.075ms** — consuming <0.5% of the 16.67ms 60Hz frame budget.
- The engine is O(1) per part for snap-zone lookup and state-machine updates.

The engine is implemented as a set of JavaScript modules (`src/reassembly/`, `src/bench/`, `src/ui/`) without a third-party game framework dependency, running on Node.js for testing and targeting browser/Electron Canvas+WebGL for production rendering.

Constraints from `docs/discovery-focus.md`:
- Real-time simulation must remain responsive despite many small interactive parts.
- Target mid-range Windows gaming PCs; keyboard/mouse as primary input.
- Small team scope requires phased content rollout and reusable part/system libraries.
- QA burden is high due to combinatorial repair states; test plans must focus on high-risk failure chains.

---

## Decision Drivers

- **Proven performance**: The existing custom engine has been benchmarked and validated — no alternative has comparable measured evidence for this specific workload.
- **No external engine lock-in**: Custom JS engine avoids Unity/Unreal/Godot licensing risk, plugin compatibility drift, and opaque upgrade paths for a small team.
- **Testability**: Jest-based unit tests run the full game logic in Node.js without a rendering environment, enabling fast CI and high coverage of interaction states.
- **Lightweight distribution**: Browser + Electron deployment requires no separate runtime installer on Windows.
- **Modular content pipeline**: New part types and movement families can be added as data changes (Python catalog) + snap-zone config without engine modification.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| A — **Custom JS Canvas/WebGL engine (current)** | Hand-rolled JS simulation modules + Canvas/WebGL renderer | Benchmarked; fully testable in Node.js/Jest; zero licensing cost; no framework upgrade surprises | Render pipeline (WebGL draw calls) not yet fully validated in browser; polygon budget system not yet implemented |
| B — Phaser 3 | Popular 2D JS game framework | Large community; built-in input, physics, tilemap | General-purpose 2D framework not optimised for precision snap-zone simulation; adds framework upgrade risk; browser-only; not tested for 80+ micro-part workload |
| C — Unity (WebGL export) | Industry-standard C# game engine | Rich toolset; asset store | C# diverges from JS/Python team stack; WebGL export performance uncertain for 60Hz precision interaction; Unity licensing changes (2024) introduce commercial risk for small team |
| D — Godot 4 (GDScript/C#) | Open-source game engine | Free; 2D support; GDScript approachable | Different language from existing codebase; no measured evidence for watch-part precision simulation; cross-compiling to Windows adds toolchain complexity |
| E — React + Canvas | React UI with HTML5 Canvas for rendering | Familiar web stack | React state model conflicts with tight game-loop timing requirements; not game-optimised |

---

## Decision Outcome

**Chosen option: A — Custom JavaScript Canvas/WebGL simulation engine.**

The engine is already implemented, tested, and benchmarked. Switching to Phaser, Unity, or Godot would:
1. Abandon the validated performance baseline.
2. Require a full rewrite of the snap-zone, state-machine, and interaction systems.
3. Introduce licensing or toolchain risk.

The custom engine's design — O(1) hash-based snap-zone lookup, per-part FSM updates, and a clear JS/Python interop boundary — is well-suited to the game's requirements.

### Open Items (not blockers)

The spike explicitly identified two follow-on validation tasks:
1. **Browser render profiling**: WebGL/Canvas draw-call overhead must be profiled in a live browser (Chrome DevTools, 60 representative parts + placeholder assets). This is a Phase 1 prerequisite, not an engine replacement trigger.
2. **Polygon/render budget system**: A per-part polygon budget (≤500 triangles recommended) and scene budget ceiling (≤40,000 triangles) must be specified and enforced at asset load time before Phase 1 build.

These are scoped to Phase 1 design and do not change the engine selection.

### Positive Consequences

- Engine logic layer has validated headroom — 0.5% of 60Hz frame budget at 80 parts.
- Jest-based CI covers snap-zone, FSM, and interaction behaviour without a renderer.
- No third-party engine upgrade surprises or licensing cost changes.
- Phased content rollout supported: new parts = new data entries + snap-zone config, no engine changes.

### Negative Consequences / Trade-offs

- No built-in animation system, audio manager, or scene graph — these must be implemented or sourced as lightweight libraries.
- Browser render pipeline validation is outstanding; performance on minimum-spec hardware with full polygon budget is unproven.
- Small team carries more engine maintenance responsibility than using an off-the-shelf framework.

---

## Compliance Notes

- All engine code is original JavaScript (MIT licence in `package.json`). No proprietary game engine SDK embedded.
- WebGL and HTML5 Canvas are open web standards with no licensing constraints.

---

## Links

- Related ADR(s): ADR-0001 (Runtime), ADR-0005 (Build Pipeline)
- Foundation Decision Pack entry: FD-002 (Framework / Engine)
- Discovery Focus section: Technical Constraints — "Real-time simulation must remain responsive despite many small interactive parts."
- Spike evidence: `docs/spike-chronograph-part-count-2026-07-10.md`
