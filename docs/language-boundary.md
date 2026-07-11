# Language Boundary — JS / Python Path Registry

**Reference document for ADR-0001 and `check:boundary` CI enforcement.**

---

## Overview

The Wristwatch Revival Simulator uses a dual-language architecture (ADR-0001):

| Layer | Language | Responsibility |
|---|---|---|
| Game runtime | **JavaScript (Node.js 18+)** | Real-time simulation, UI, interaction, assembly state machines, player state, event-driven game loop |
| Data & persistence | **Python 3.12** | Static data definitions, parts catalogue, compatibility tables, save file I/O, analytics event emission, configuration |

The interop boundary is enforced by `npm run check:boundary`, which performs a static file-extension scan against the path groupings below.

---

## Python-Only Paths

No `.js` files are permitted anywhere under these directories.

| Path | Responsibility |
|---|---|
| `python/accessibility/` | Accessibility settings, CVD palette, snap tolerance, UI scale config |
| `python/analytics/` | Retention analytics and cohort reporting |
| `python/catalog/` | Parts catalogue, compatibility badges, filtering, order history |
| `python/clients/` | Client roster data |
| `python/config/` | Game configuration data (damage states, cozy mode, supplier tiers, diagnostics) |
| `python/cosmetic/` | Cosmetic package metadata and Python-side config |
| `python/economy_analytics/` | Economy analytics and modelling |
| `python/orders/` | Order domain model, queue, and status |
| `python/reputation/` | Reputation system |
| `python/save/` | Save system, cloud sync, conflict resolver |
| `python/ui/` | Notification service and order dashboard |
| `python/upgrade_tree/` | Upgrade tree data model |
| `python/workshop/` | Bench slot management, AB cohort, probe telemetry, second-bench unlock |

---

## JavaScript-Only Paths

No `.py` files are permitted anywhere under these directories.

| Path | Responsibility |
|---|---|
| `javascript/accessibility/` | Accessibility runtime controls, palette management, snap tolerance assist, UI scale |
| `javascript/audio/` | Audio design system, event library, volume settings |
| `javascript/cleaning/` | Cleaning-phase UI and cinematic reveal sequence |
| `javascript/clients/` | Backstory card selection UI |
| `javascript/completion/` | Completion reveal, job quality, balance wheel, delivery, first-tick cinematic |
| `javascript/cosmetic/` | Cosmetic restoration flow, shaders, strap selection, polishing reveal |
| `javascript/damage/` | Damage event detection, recovery, part replacement UI |
| `javascript/data/` | Runtime game data (backstory templates, damage-state hints, fault hints, movement data, symptom-parts map) |
| `javascript/diagnosis/` | Diagnosis screen, hint system, coaching, symptom overlay |
| `javascript/disassembly/` | Fastener state |
| `javascript/economy/` | Economy UI — cosy-mode manager, ledger, upgrade shop |
| `javascript/gallery/` | Collection gallery and delivery handler UI |
| `javascript/intake/` | Intake inspection, backstory card, job card, scope negotiation |
| `javascript/onboarding/` | Onboarding annotation rubric and failure-map report |
| `javascript/reassembly/` | Reassembly screen, snap-zone tolerance, scatter layout, micro-confirmation |
| `javascript/regulation/` | Regulation phase controller, grade engine, timegrapher display, tutorial |
| `javascript/save/` | Runtime repair-session record model |
| `javascript/sourcing/` | Sourcing screen |
| `javascript/state/` | Player save state (runtime) |
| `javascript/teardown/` | Teardown screen and tool-pickup audio |
| `javascript/telemetry/` | Telemetry emitter, hint escalation analyser, playtest annotation framework |
| `javascript/tools/` | Tool panel, proficiency engine, tool registry, contextual highlights, multi-step tracker |
| `javascript/tooltips/` | Horology glossary and tooltip system |
| `javascript/tutorials/` | Tutorial overlay, guided onboarding, part scaffolding, chronograph discovery |
| `javascript/ui/` | Collection gallery shell and workshop navigation views |
| `javascript/workbench/` | Workbench scene, HUD, save adapter, watch part model |
| `javascript/workshop/` | Bench slot UI, cohort assignment, timing calibration tracker, workshop controller |

---

## Paired Split-Layer Directories

Some gameplay domains now have matching directories under both roots. The Python implementation remains under `python/`, while the JavaScript runtime implementation lives under `javascript/`. Each directory is enforced independently by `check:boundary`.

| Python path | JavaScript counterpart | Shared domain |
|---|---|---|
| `python/accessibility/` | `javascript/accessibility/` | Accessibility settings and runtime accessibility controls |
| `python/clients/` | `javascript/clients/` | Client data and backstory card presentation |
| `python/cosmetic/` | `javascript/cosmetic/` | Cosmetic restoration configuration and runtime flow |
| `python/save/` | `javascript/save/` | Save-system data and runtime repair-session state |
| `python/ui/` | `javascript/ui/` | Shared UI-facing concepts split by language responsibility |
| `python/workshop/` | `javascript/workshop/` | Workshop domain data and workshop runtime controllers |

---

## Enforcement

```bash
npm run check:boundary
```

The script `scripts/check-boundary.js` scans the Python-only and JS-only paths listed above and exits with:

- **`0`** — no cross-boundary file placements (boundary-clean).
- **`1`** — one or more violations found; offending file paths printed to stderr.

Run this check before raising a PR. It is also intended as an additive CI step alongside the existing `test` script.

---

## Related Documents

- ADR-0001: `docs/adr/0001-runtime-and-language.md`
- Foundation Decision Pack: `docs/foundation-decision-pack.md` (FD-001)
- Build pipeline: `docs/adr/0005-build-pipeline.md` (ADR-0005)
