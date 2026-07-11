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
| `src/analytics/` | Retention analytics and cohort reporting |
| `src/catalog/` | Parts catalogue, compatibility badges, filtering, order history |
| `src/config/` | Game configuration data (damage states, cozy mode, supplier tiers, diagnostics) |
| `src/economy_analytics/` | Economy analytics and modelling |
| `src/orders/` | Order domain model, queue, and status |
| `src/reputation/` | Reputation system |
| `src/upgrade_tree/` | Upgrade tree data model |

---

## JavaScript-Only Paths

No `.py` files are permitted anywhere under these directories.

| Path | Responsibility |
|---|---|
| `src/audio/` | Audio design system, event library, volume settings |
| `src/cleaning/` | Cleaning-phase UI and cinematic reveal sequence |
| `src/completion/` | Completion reveal, job quality, balance wheel, delivery, first-tick cinematic |
| `src/damage/` | Damage event detection, recovery, part replacement UI |
| `src/data/` | Runtime game data (backstory templates, damage-state hints, fault hints, movement data, symptom-parts map) |
| `src/diagnosis/` | Diagnosis screen, hint system, coaching, symptom overlay |
| `src/disassembly/` | Fastener state |
| `src/economy/` | Economy UI — cosy-mode manager, ledger, upgrade shop |
| `src/gallery/` | Collection gallery and delivery handler UI |
| `src/intake/` | Intake inspection, backstory card, job card, scope negotiation |
| `src/onboarding/` | Onboarding annotation rubric and failure-map report |
| `src/reassembly/` | Reassembly screen, snap-zone tolerance, scatter layout, micro-confirmation |
| `src/regulation/` | Regulation phase controller, grade engine, timegrapher display, tutorial |
| `src/sourcing/` | Sourcing screen |
| `src/state/` | Player save state (runtime) |
| `src/teardown/` | Teardown screen and tool-pickup audio |
| `src/telemetry/` | Telemetry emitter, hint escalation analyser, playtest annotation framework |
| `src/tools/` | Tool panel, proficiency engine, tool registry, contextual highlights, multi-step tracker |
| `src/tooltips/` | Horology glossary and tooltip system |
| `src/tutorials/` | Tutorial overlay, guided onboarding, part scaffolding, chronograph discovery |
| `src/workbench/` | Workbench scene, HUD, save adapter, watch part model |

---

## Mixed (Co-Resident) Paths

These directories contain both Python and JavaScript files **by design** — the Python module provides data or configuration that the co-located JavaScript module consumes directly. No cross-boundary enforcement is applied to these paths.

| Path | Python role | JavaScript role |
|---|---|---|
| `src/accessibility/` | Accessibility settings, CVD palette, snap tolerance, UI scale config | `AccessibilitySettings.js`, `CvdPaletteManager.js`, `SnapToleranceAssist.js`, `UiScaleController.js` / `UiScaleManager.js` |
| `src/clients/` | Client roster data | `BackstoryCardSelector.js` |
| `src/cosmetic/` | Package init (`__init__.py`) | Full cosmetic restoration system in JS |
| `src/save/` | Save system, cloud sync, conflict resolver | `RepairSessionRecord.js` |
| `src/ui/` | Notification service, order dashboard | `CollectionGallery.js`, `GalleryDetailView.js`, `WorkshopHubNav.js` |
| `src/workshop/` | Bench slot management, AB cohort, probe telemetry, second-bench unlock | `BenchSlot.js`, `CohortAssignment.js`, `TimingCalibrationTracker.js`, `WorkshopController.js` |

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
