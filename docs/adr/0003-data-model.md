# ADR-0003 — Data Model: JavaScript Static Catalog with Compatibility Tables

**Status:** ACCEPTED  
**Date:** 2026-07-10  
**Deciders:** Foundation Research Agent  
**Tags:** data-model, parts-catalog, compatibility, movement-families

---

## Context

The Wristwatch Revival Simulator must represent a catalogue of mechanical watch parts where:

1. Each part belongs to a **movement family** (e.g., ETA-2824, AS-1950, Miyota-8215) or is universal.
2. Each part has a **type** (mainspring, balance wheel, pallet fork, crystal, etc.) and a **condition** (New, Used-Good, Used-Fair).
3. Part-to-movement compatibility is expressed as `COMPATIBLE | INCOMPATIBLE | UNCERTAIN`, where `UNCERTAIN` is the safe default for unregistered pairs.
4. The player browses, filters, and orders parts through a catalog UI backed by this model.
5. New movement families and part types will be added in subsequent content sprints with minimal friction.

Constraints from `docs/discovery-focus.md`:
- "Data model must support modular part compatibility across movement families."
- "Small team scope requires phased content rollout and reusable part/system libraries."
- "QA burden is high due to combinatorial repair states; test plans must focus on high-risk failure chains."

Python existed in the repository before ADR authoring, but this ADR revision formalizes the project direction: the catalog and compatibility model are owned by JavaScript modules.

The JavaScript data model uses:
- Enumerated constants for `MovementFamily`, `PartType`, `PartCondition`, and `CompatibilityStatus`.
- Immutable part records in catalog modules.
- `COMPATIBILITY_TABLE` keyed by `(movement_family, part_id)` equivalents.
- `UNCERTAIN` as default for unregistered pairs.

This model is consumed by `CatalogFilter`, `CompatibilityBadge`, and `PreviouslyOrdered` subsystems and validated by JavaScript tests.

---

## Decision Drivers

- **Single-language architecture**: JavaScript ownership for runtime and data model eliminates cross-language conversion and handoff complexity.
- **Type safety and readability**: Enumerated constants and schema validation keep movement families and part types explicit and maintainable.
- **Immutability**: Immutable part records prevent accidental mutation of definitions at runtime.
- **Safe defaults**: `UNCERTAIN` as the default for unregistered `(movement_family, part_id)` pairs prevents false incompatibility warnings when new content is added incrementally.
- **Additive extension pattern**: New movement families and part types require only new enum values and table entries — no schema migrations, no database.
- **Zero infrastructure dependency**: Static JavaScript data structures require no database server, ORM, or migration toolchain, matching small team scope.
- **Testability**: The static table is directly unit-testable with Jest — each compatibility assertion is a one-line lookup, enabling exhaustive coverage of high-risk failure chains.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| **A — JavaScript static catalog + compatibility table (chosen)** | Enumerations/constants + immutable records + `COMPATIBILITY_TABLE` | Single-language; zero infrastructure; additive extension; fast lookup | Requires migration from legacy Python catalog code |
| B — SQLite relational DB | Parts and compatibility in a SQLite file | Queryable; standard SQL; good tooling | Adds ORM or raw SQL; schema migrations on content updates; heavy for a lookup-only data source |
| C — JSON files only | Plain JSON files for parts catalog | Universal format; easy to hand-edit | No type safety; no validation at load time; typos cause silent failures; harder to test |
| D — TypeScript enums + JSON | Move to TypeScript with JSON config | Single-language; stronger static typing | Additional migration effort from current JavaScript runtime |
| E — YAML-driven catalog | Content-authored YAML files loaded at runtime | Non-programmer-friendly editing | Adds YAML parser dependency; less type-safe; validation requires extra tooling |

---

## Decision Outcome

**Chosen option: A — JavaScript static catalog with `COMPATIBILITY_TABLE`.**

The existing model shape remains valid, but ownership is now JavaScript-only. This aligns with the project's architecture constraints:

- **Phased content rollout**: Adding a new movement family (e.g., Seiko NH35) requires adding one enum value to `MovementFamily`, new part entries to `PARTS_CATALOG`, and new rows to `COMPATIBILITY_TABLE`. No migration, no schema change.
- **Combinatorial QA**: The static table is trivially testable — Jest can enumerate all entries and verify no `COMPATIBLE` entry exists for a cross-family conflict.
- **UNCERTAIN as safe default**: Newly added parts appear as `~` (Uncertain) in the catalog rather than a false `✗` (Incompatible), preventing player frustration during content sprints.

### Cross-Layer Consumption Pattern

The JS game layer consumes catalog data via:
1. In-test environments: direct JavaScript module loading via Jest.
2. Production integration: catalog data is loaded directly from JavaScript modules or generated JSON artifacts at startup.

The boundary rule: **JavaScript owns both data definitions and runtime state.**

### Positive Consequences

- Zero-infrastructure data layer — no database to spin up, migrate, or back up.
- Enum-like constants plus schema checks enforce valid values at test/build time.
- Additive extension pattern keeps content sprints independent of engine changes.
- UNCERTAIN default prevents content gaps from surfacing as false incompatibility errors.
- Comprehensive Jest coverage of all compatibility pairs is feasible (O(n) test cases where n = table size).

### Negative Consequences / Trade-offs

- Static dict requires a full catalog reload to pick up new content (no hot-reload in production without re-serialising to JSON).
- As the catalog grows to hundreds of parts across many movement families, the static table may become large enough to warrant a generator or builder pattern (tracked as a future ADR candidate, not a current concern at 3 movement families).
- Migration off legacy Python catalog modules requires careful parity validation during transition.

---

## Compliance Notes

- All data definitions are original authored content. No licensed third-party part databases are embedded.
- Movement family names (ETA-2824, AS-1950, Miyota-8215) are industry-standard calibre designations, not protected trademarks, when used descriptively.

---

## Links

- Related ADR(s): ADR-0001 (Runtime), ADR-0004 (Save/Load)
- Foundation Decision Pack entry: FD-003 (Data and Storage Strategy)
- Discovery Focus section: Technical Constraints — "Data model must support modular part compatibility across movement families." / "Small team scope requires phased content rollout and reusable part/system libraries."
- Source: `javascript/catalog/`, `src/catalog/`
