# ADR-0001 — Runtime and Language: JavaScript-Only Architecture

**Status:** ACCEPTED  
**Date:** 2026-07-10  
**Revised:** 2026-07-11  
**Deciders:** Foundation Research Agent  
**Tags:** runtime, language, architecture

---

## Context

The Wristwatch Revival Simulator is a single-player PC simulation game targeting mid-range Windows PCs with keyboard/mouse as primary input. The game requires real-time simulation that remains responsive despite many small interactive parts, and a data model that supports modular part compatibility across watch movement families.

Before ADR authoring, the repository already contained both JavaScript and Python code. This revision records a clear architectural direction: **the project standard is now JavaScript-only**. Any remaining Python paths are legacy and are being replaced by JavaScript modules and tooling.

The spike report (Issue #87) validated the JavaScript engine layer sustains >11,000 FPS theoretical throughput at 80 parts with <0.1ms P95 interaction latency, running under Node.js v24.18.0 on Windows.

Constraints from `docs/discovery-focus.md`:
- Target mid-range Windows gaming PCs; keyboard/mouse as primary input.
- Real-time simulation must remain responsive despite many small interactive parts.
- Small team scope requires phased content rollout and reusable part/system libraries.
- QA burden is high due to combinatorial repair states.

---

## Decision Drivers

- **Performance**: JavaScript V8 engine provides sub-millisecond per-frame interaction latency for the real-time bench simulation (confirmed by spike #87).
- **Web/PC deployment**: JavaScript targets both browser-based and Electron-wrapped Windows desktop delivery with no additional toolchain.
- **Simplicity**: One language removes cross-language boundaries, duplicate test runners, and serialisation handoff complexity.
- **Team velocity**: A single JavaScript stack lowers cognitive load for implementation, review, onboarding, and CI maintenance.
- **Ecosystem maturity**: Node.js + Jest provide a mature, permissive, zero-licensing-cost toolchain for all current subsystems.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| **A — JavaScript only (chosen)** | Use JavaScript for engine, data model, save/load, analytics, and accessibility configuration | One language, one test toolchain, simpler CI/CD, no interop boundary | Requires migration effort for legacy Python modules |
| B — Python only | Move engine and UI runtime to Python | Single language | No proven equivalent for current JS runtime performance and deployment path |
| C — JS + Python | Keep mixed stack | Reuses legacy code with minimal immediate migration | Higher long-term complexity, duplicated tooling, boundary-management overhead |
| D — TypeScript + Python | Typed JS runtime plus Python data/persistence | Better type safety in JS layer | Still dual-language; does not resolve boundary complexity |

---

## Decision Outcome

**Chosen option: A — JavaScript-only architecture.**

The project will standardize all layers on JavaScript (Node.js runtime and browser/Electron deployment surface). Python code that existed before ADR creation is treated as legacy implementation detail, not target architecture.

**Revision note (2026-07-11):** The architecture decision is now explicit and final for this phase: move to one language for everything, with JavaScript replacing Python.

Responsibility boundaries remain by subsystem, but no longer by language:
- **Runtime and simulation**: JavaScript
- **Catalog/data definitions**: JavaScript
- **Save/load and analytics**: JavaScript
- **Accessibility configuration**: JavaScript

### Positive Consequences

- V8-powered JavaScript engine delivers <0.1ms per-frame interaction latency — well under the 16.67ms 60Hz budget.
- Single-language development removes cross-language serialisation and ownership ambiguity.
- One test stack (Jest) and one CI runtime reduce maintenance overhead.
- Node.js + Electron path to Windows PC distribution requires no additional runtime licences.

### Negative Consequences / Trade-offs

- Migration work is required to replace legacy Python modules with equivalent JavaScript implementations.
- During transition, temporary compatibility shims may exist and must be tracked.
- TypeScript adoption (if pursued) remains a separate decision.

**Note:** This ADR supersedes prior dual-language assumptions. Future ADRs should assume JavaScript-first implementation unless explicitly updated.

---

## Interop Contract

The catalog serialization contract remains formalized by `schema/catalog.schema.json` (JSON Schema Draft-07). JavaScript now serves as both producer and consumer:

- **JavaScript (producer):** catalog modules under `javascript/catalog/` or `src/catalog/` generate schema-compliant catalog artifacts.
- **JavaScript (consumer):** runtime loaders and tests validate the same schema using `Ajv`.

### Schema Evolution Policy

- **Additive changes** (adding new optional fields, new enum values) are non-breaking and do not require an ADR update.
- **Breaking changes** (removing or renaming required fields, changing field types, adding new required fields) require a new ADR before the schema may be updated. Content authors adding new movement families must verify schema tests in the JavaScript test suite before merging.

See `schema/catalog.schema.json` for the full schema definition.

---

## Compliance Notes

- Node.js (MIT licence) and Jest (MIT) are permissive and carry no commercial licensing concerns for this project.
- No platform-specific runtime fees for Windows PC distribution via Electron or browser.

---

## Links

- Related ADR(s): ADR-0002 (Game Engine), ADR-0005 (Build Pipeline)
- Foundation Decision Pack entry: FD-001 (Runtime and Language)
- Discovery Focus section: Technical Constraints — "Target mid-range Windows gaming PCs first; keyboard/mouse as primary input. Real-time simulation must remain responsive despite many small interactive parts."
- Spike evidence: `docs/spike-chronograph-part-count-2026-07-10.md` — Node.js v24.18.0 benchmark results
- Language boundary registry and enforcement: `docs/language-boundary.md` — path-ownership map enforced by `npm run check:boundary` (Issue #321), now tracking JavaScript ownership as Python modules are retired.
