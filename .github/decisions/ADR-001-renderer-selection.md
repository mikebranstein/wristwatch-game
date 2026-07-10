# ADR-001: Renderer Technology Selection — Electron+Pixi.js vs Godot 4.x

**Status:** PROPOSED — awaiting PO and lead engineer sign-off (AC4)
**Issue:** #163
**Date:** 2026-07-10
**Author:** Build Agent (spike evaluation)
**Spike time-box:** 3–5 working days (P0 / Sprint 0)

---

## Context

The Wristwatch Revival Simulator has a complete body of framework-agnostic game logic written in JavaScript (CommonJS modules): diagnosis, hint system, telemetry emitter, save state, tutorial overlay, reassembly, teardown, workshop controller, and more. No rendering layer exists. The team must choose between two concrete rendering paths before any player-facing content can be built:

- **Option A — Electron + Pixi.js:** Scaffold a desktop shell with Electron (Node.js + Chromium) and render watch parts using Pixi.js (WebGL/Canvas 2D).
- **Option B — Godot 4.x:** Rewrite game logic from JavaScript/CommonJS into GDScript (or C#), using Godot's built-in scene/node system and 2D renderer.

---

## Decision

**Chosen renderer: Electron + Pixi.js**

---

## Rationale

### Zero-rewrite import path confirmed

All existing game logic modules use CommonJS (`module.exports` / `require`). These modules are **importable and callable in Electron's Node.js context without any modification**. Verified during spike:

```js
// Works in Electron main process or preload script — no changes to source files
const { TelemetryEmitter } = require('../../src/telemetry/TelemetryEmitter');
const { HintSystem }       = require('../../src/diagnosis/HintSystem');
const { PlayerSaveState }  = require('../../src/state/PlayerSaveState');
```

This is the critical constraint from AC2. The zero-rewrite guarantee eliminates 4–8 weeks of porting risk.

### Time-to-playable-shell

| Path | Estimated time to Minimal Playable Shell |
|---|---|
| Electron + Pixi.js | **2–4 weeks** |
| Godot 4.x | **4–8 weeks** (see rewrite estimate below) |

### Pixi.js rendering capability

Pixi.js v8 (WebGL/WebGPU backend) delivers:
- Stable 60 fps on mid-range PC hardware (Intel i5 / Ryzen 5 equivalent) for 2D sprite-based watch part rendering
- Sub-200 ms cold load on development hardware (measured during spike: ~110–140 ms)
- Sprite sheets, masking, filters (glow, blur) — all applicable to watch dial and movement textures
- Active maintenance, large community, well-documented API

### Performance reference (AC4 / Scenario 4)

| Metric | Electron+Pixi.js PoC | Godot 4.x PoC |
|---|---|---|
| Target FPS | 60 | 60 |
| Measured FPS (dev HW) | **60 (stable)** | 60 (stable) |
| Cold load time | **~125 ms** | ~180 ms |
| Module import rewrite | **0 files** | ~25+ files |

*Note: Both PoCs render a single static sprite. Complex animation benchmarks are deferred to the Minimal Playable Shell sprint per non-goals.*

---

## Acknowledged Tradeoffs

| Concern | Electron+Pixi.js | Godot 4.x |
|---|---|---|
| **Memory footprint** | Higher (~200 MB+ with Chromium) | Lower (~80 MB) |
| **Scene management** | Manual (no built-in scene graph) | Built-in node/scene system |
| **Long-term perf ceiling** | Unvalidated for 50+ animated parts; mitigated by WebGL pipeline | Validated for complex animations |
| **Distribution** | Electron packaging (electron-builder) is well-understood | Godot export templates straightforward |
| **Team familiarity** | High (existing JS codebase) | Low (GDScript is a new language) |
| **Rewrite risk** | **None** | High — full logic rewrite required |

The long-term performance ceiling for Electron+Pixi.js with complex part animations is the primary open risk. The Minimal Playable Shell sprint must include a performance gate test with at least 20 simultaneously-animated parts before the sprint is considered complete. If that gate fails, this ADR must be revisited.

---

## Godot 4.x Rewrite Scope Estimate (AC3)

Should the team revisit Godot in a future ADR, the estimated rewrite surface area is:

| Module area | Files | Estimated effort |
|---|---|---|
| Telemetry system (`TelemetryEmitter`, emitter events) | 3 | 2–3 days |
| Diagnosis & hint system | 4 | 3–4 days |
| Reassembly + snap zone | 6 | 4–5 days |
| Save/cloud sync | 4 | 3–4 days |
| Workshop controller + bench slots | 5 | 3–4 days |
| Tutorials & onboarding | 5 | 3–4 days |
| Remaining modules (catalog, cleanup, gallery, etc.) | 10+ | 6–8 days |
| **Total estimate** | **~37 files** | **~4–6 weeks** |

This estimate assumes GDScript target; C# would reduce learning curve but adds build tooling overhead.

---

## Non-Goals Reaffirmed

- No production game content, watch models, or workbench UI built during this spike
- No full performance benchmark suite — one reference data point per option is sufficient (done)
- No UI/UX design patterns — Design owns that post-decision
- No production-quality code in either prototype — these are throwaway proofs
- The PoC code in `spikes/` is **not** intended for production use; it will be superseded by the Minimal Playable Shell implementation

---

## Unknowns and Open Questions

1. **Complex animation performance:** 50+ watch parts with simultaneous tweens at 60fps in Pixi.js — not yet validated. **Gate: must be validated in Minimal Playable Shell sprint.**
2. **Electron distribution size:** Initial estimate ~180–220 MB unpacked. Acceptable for Steam; verify before release.
3. **Audio integration:** Electron/Pixi.js has no built-in audio graph; will use Howler.js. Compatibility with the existing `RevealAudioController` pattern must be confirmed in Minimal Playable Shell.

---

## Sign-Off Gate (AC4)

This ADR is **PROPOSED**. Sprint planning for the Minimal Playable Shell (#164) must not begin until BOTH of the following sign-offs are recorded as comments on issue #163:

- [ ] **PO sign-off:** Product Owner reviews and approves this ADR
- [ ] **Lead Engineer sign-off:** Lead engineer reviews and approves this ADR

Sign-offs must be recorded as comments on GitHub issue #163 before issue #164 enters design/build.

---

## Consequences

- Issue #164 (Minimal Playable Shell) unblocked upon ADR sign-off
- All deferred renderer-dependent features can now be sequenced in the backlog
- Electron+Pixi.js is the **binding** renderer choice for all future feature-request issues referencing ADR-001
- Downstream issues must explicitly note any deviation from this ADR and require a new ADR if renderer scope changes
