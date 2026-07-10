# ADR-0001 — Runtime and Language: Dual-Language Architecture (JavaScript + Python)

**Status:** ACCEPTED  
**Date:** 2026-07-10  
**Deciders:** Foundation Research Agent  
**Tags:** runtime, language, architecture

---

## Context

The Wristwatch Revival Simulator is a single-player PC simulation game targeting mid-range Windows PCs with keyboard/mouse as primary input. The game requires real-time simulation that remains responsive despite many small interactive parts, and a data model that supports modular part compatibility across watch movement families.

At the time of this ADR, the codebase has already established a working dual-language foundation:

- **JavaScript (Node.js v24)** drives the game engine layer: snap-zone tolerances, assembly state machines, UI interaction, player save state, and all real-time simulation components. Jest 29 provides unit and integration testing for this layer.
- **Python 3 (pytest 8)** handles data model definitions, parts catalog, compatibility logic, save system persistence, analytics, and accessibility configuration.

This split emerged organically from team strengths and the different computational profiles of the two layers. The spike report (Issue #87) validated the JavaScript engine layer sustains >11,000 FPS theoretical throughput at 80 parts with <0.1ms P95 interaction latency, running under Node.js v24.18.0 on Windows.

Constraints from `docs/discovery-focus.md`:
- Target mid-range Windows gaming PCs; keyboard/mouse as primary input.
- Real-time simulation must remain responsive despite many small interactive parts.
- Small team scope requires phased content rollout and reusable part/system libraries.
- QA burden is high due to combinatorial repair states.

---

## Decision Drivers

- **Performance**: JavaScript V8 engine provides sub-millisecond per-frame interaction latency for the real-time bench simulation (confirmed by spike #87).
- **Web/PC deployment**: JavaScript targets both browser-based and Electron-wrapped Windows desktop delivery with no additional toolchain.
- **Data expressiveness**: Python dataclasses and enum types provide a concise, type-safe DSL for defining movement families, part types, and compatibility tables — reducing cognitive overhead for content authors adding new calibers.
- **Team scope**: Small team benefits from clearly separated concerns — game logic in JS, data/persistence in Python — each with independent test suites.
- **Ecosystem maturity**: Node.js + Jest and Python + pytest are both well-documented, have large package ecosystems, and impose zero licensing costs.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| A — JavaScript only | Move all Python modules to JS; single-language stack | Simpler build pipeline; one test runner | Python dataclasses more expressive for content; migration cost high given existing Python codebase |
| B — Python only | Move JS engine to Python (e.g., Pygame or PyScript) | Single language; Python ecosystem for data | No proven high-performance real-time JS engine equivalent in Python for browser/Electron target; loses V8 performance advantage |
| **C — JS + Python (current)** | JavaScript for real-time game engine; Python for data/persistence | Each language optimised for its domain; both codebases working and tested; proven performance | Two test runners; dual CI setup; interop boundary must be respected |
| D — TypeScript + Python | Migrate JS to TypeScript | Better type safety in game layer | Migration cost; no immediate functional benefit given current test coverage |

---

## Decision Outcome

**Chosen option: C — JavaScript (Node.js) for real-time game engine + Python for data model and persistence.**

The dual-language architecture is already established, tested, and validated by the chronograph spike. Forcing a single-language rewrite would incur high migration cost with no measurable benefit to the product's core constraint (responsive real-time simulation on Windows PC).

The architectural boundary is clear:
- **JS side**: All real-time simulation, UI, interaction, player state, and event-driven game loop.
- **Python side**: All static data definitions (parts, compatibility tables, movement families), save file I/O, analytics event emission, and catalog filtering.

### Positive Consequences

- V8-powered JavaScript engine delivers <0.1ms per-frame interaction latency — well under the 16.67ms 60Hz budget.
- Python dataclass/enum DSL makes it easy to add new movement families and part types with minimal boilerplate.
- Independent test suites (Jest + pytest) allow domain-specific testing strategies without cross-contamination.
- Node.js + Electron path to Windows PC distribution requires no additional runtime licences.

### Negative Consequences / Trade-offs

- Two build pipelines must be maintained (npm/Jest + Python/pytest).
- Interop boundary (JSON files or IPC) must be explicitly documented so future agents don't accidentally mix runtime responsibilities.
- TypeScript migration (if desired later) must be planned as a separate ADR.

---

## Compliance Notes

- Node.js (MIT licence), Jest (MIT), Python (PSF licence), pytest (MIT) — all permissive, no commercial licensing concerns.
- No platform-specific runtime fees for Windows PC distribution via Electron or browser.

---

## Links

- Related ADR(s): ADR-0002 (Game Engine), ADR-0005 (Build Pipeline)
- Foundation Decision Pack entry: FD-001 (Runtime and Language)
- Discovery Focus section: Technical Constraints — "Target mid-range Windows gaming PCs first; keyboard/mouse as primary input. Real-time simulation must remain responsive despite many small interactive parts."
- Spike evidence: `docs/spike-chronograph-part-count-2026-07-10.md` — Node.js v24.18.0 benchmark results
