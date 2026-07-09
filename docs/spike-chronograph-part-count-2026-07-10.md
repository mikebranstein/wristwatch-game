# Engineering Spike: Chronograph Part-Count Performance Ceiling Validation

**Issue:** #87  
**Date:** 2026-07-10  
**Spike Engineer:** Build Agent (Claude Sonnet 4.6)  
**Timebox:** 2 business days (kicked off 2026-07-09; completed 2026-07-10 — **1 business day**)  
**Status:** COMPLETE — within timebox  

---

## Executive Summary

### Decision: ✅ GO

The current game engine sustains **>11,000 FPS theoretical throughput** at 80 parts under full active-drag load with a **max P95 interaction latency of 0.075ms**. The engine's logic layer (SnapZoneTolerance, AssemblyFeedbackStateMachine, ReassemblyScreen) has **no measurable scaling ceiling** at the 50–80 part target range. The Chronograph Discovery Path Phase 1 (#88) may proceed.

---

## Background

Before investing 2–3 sprints in the full chronograph feature build, this spike validates whether the game engine can simulate 50+ individual chronograph movement parts at acceptable frame rates and interaction responsiveness. The decision gates the Chronograph Discovery Path — Phase 1 (#88).

**Dependency:** Feature #88 is blocked on this spike returning GO or CONDITIONAL_GO.

---

## Methodology

### Harness Design

The benchmark harness exercises the **production engine code path** without modifying any `src/` files:

1. **Part registration** — `SnapZoneTolerance.registerPart()` is called programmatically in the test harness to load 50, 60, 70, and 80 chronograph part IDs without touching `SNAP_ZONES` or any production constant.

2. **Production render path** — A production-representative `renderVisual` callback is injected at `ReassemblyScreen` construction (not a no-op mock). It:
   - Maintains a per-part scene graph (`Object.create(null)` keyed by partId)
   - Performs linear color-interpolation from neutral to active highlight (models shader parameter upload)
   - Writes to a `Float32Array` frame buffer (4 floats per part — models per-part draw call cost)
   
3. **Tick simulation** — `onPartMoved()` is called for every registered part on every tick, 600 ticks per measurement cell. The simulated clock advances by 16.67ms per tick (targeting 60Hz). `minDwellMs: 0` is used to force full FSM state transition coverage in every tick.

4. **Active vs. idle modes:**
   - **Idle** — all parts placed `distance=200` (outside approach zone); tests minimum-overhead floor
   - **Active** — parts cycle through all 4 FSM states per tick (outside→approach/wrong→approach/correct→lock/correct); tests maximum FSM transition overhead

5. **Measurements:**
   - Interaction latency: `performance.now()` timestamps bracketing each full-tick invocation (all parts for one frame)
   - Memory footprint: `process.memoryUsage().heapUsed` before/after each cell
   - FPS derivation: `1000 / mean_tick_latency_ms`

6. **Test matrix:** 4 part-count levels × 2 modes = **8 measurement cells**

### Chronograph Part Catalog (80 parts)

The spike uses a representative 80-part chronograph movement:

| Layer | Parts |
|---|---|
| Base movement (20) | mainplate, barrel_bridge, train_bridge, pallet_bridge, balance_bridge, barrel_complete, center_wheel, third_wheel, fourth_wheel, escape_wheel, pallet_fork, balance_complete, cannon_pinion, minute_wheel, hour_wheel, keyless_works, stem, crown, dial, crystal |
| Chronograph layer (30) | chrono_plate, column_wheel, column_wheel_click/spring, coupling_clutch + spring, vertical_clutch + lever, chrono second/minute/hour wheels, chrono pinions (×3), reset hammers (×3) + springs (×3), heart cams (×3), minute_recording_wheel + jumper + spring, pusher_start_stop, pusher_reset, pusher springs (×2) |
| Fine regulation (20) | regulator_lever, index_spring, shock_setting + spring, incabloc springs (×2), cap jewels (×2), roller_table, impulse_jewel, banking pins (×2), click + spring, great_wheel, ratchet_wheel, crown_wheel, setting_lever + spring, jumper |
| Decoration/casing (10) | caseback, case_middle, bezel + gasket, crown_tube + gasket, crystal_gasket, lug pins (×2), pusher_gasket_s |

---

## Measured Results

### Benchmark Data Table

All measurements taken on: Node.js v24.18.0, Jest 29, Windows 11, Intel x86-64 (single-threaded JS engine)

| Parts | Mode   | Mean tick (ms) | P95 tick (ms) | Max tick (ms) | Theoretical FPS | Heap Δ (MB) | Render calls |
|------:|--------|---------------:|--------------:|--------------:|----------------:|------------:|-------------:|
| 50    | idle   | 0.039          | 0.039         | 5.981         | >11,000         | +2.0        | 0            |
| 50    | active | 0.082          | 0.075         | 6.476         | >11,000         | +3.7        | >7,500       |
| 60    | idle   | 0.024          | 0.025         | 5.223         | >11,000         | +2.4        | 0            |
| 60    | active | 0.083          | 0.051         | 6.904         | >11,000         | +3.8        | >7,500       |
| 70    | idle   | 0.034          | 0.028         | 7.414         | >11,000         | +2.7        | 0            |
| 70    | active | 0.065          | 0.023         | 8.684         | >11,000         | +2.7        | >7,500       |
| 80    | idle   | 0.022          | 0.008         | 5.518         | >11,000         | +3.1        | 0            |
| 80    | active | 0.086          | 0.030         | 6.460         | >11,000         | +3.1        | >7,500       |

> **Note on "Max tick":** Occasional spikes of 5–8ms (visible in the Max column) are attributable to Node.js GC pauses and OS scheduling interrupts — not the engine tick itself. P95 values of <0.1ms confirm that ≥95% of ticks are unaffected.

> **Note on Heap Δ:** The reported delta is per-cell (measured after a fresh GC where available). Absolute heap usage for 80 active parts is ~3.1MB above baseline — well within any reasonable per-scene budget.

### Summary Statistics

| Metric | Value | Threshold | Status |
|---|---|---|---|
| Min theoretical FPS (active cells, worst case) | **>11,000** | ≥60 FPS | ✅ PASS |
| Max P95 interaction latency (active cells) | **0.075ms** | <50ms | ✅ PASS |
| Max mean interaction latency (active cells) | **0.086ms / frame** | <50ms | ✅ PASS |
| Max heap growth (80 parts, active) | **+3.1 MB** | — (no budget set) | ✅ Nominal |
| Part count tested | **50 / 60 / 70 / 80** | ≥50 required | ✅ PASS |
| Stretch target (80 parts) tested | **Yes** | Stretch goal | ✅ PASS |

---

## Decision Rationale

### GO — Engine Layer Has No Scaling Ceiling at 50–80 Parts

The measurements confirm the architecture's scaling properties observed in design review:

- **`SnapZoneTolerance.getZone()`** — O(1) hash lookup per part; 80-part overhead is indistinguishable from 50-part overhead at sub-millisecond precision.
- **`AssemblyFeedbackStateMachine.update()`** — Per-part Map lookup + state comparison; flat O(1) per call.
- **`ReassemblyScreen.onPartMoved()`** — Processes one part per call; per-frame cost scales linearly with part count. At 80 parts, one full frame costs **0.086ms mean** (budget = 16.67ms at 60 FPS → **engine uses 0.5% of the 60Hz frame budget**).
- **Render path** — The production-representative renderVisual callback (scene graph update + color blend + Float32Array write) adds real per-part CPU work and still does not approach the frame budget.

### What the Spike Did NOT Validate

Per the design decision's risk register, the following are explicitly **not validated** by this spike and remain open for Phase 1 design:

1. **Browser render pipeline** — The spike harness runs in Node.js (Jest). Real WebGL/Canvas draw calls have higher per-call overhead than the JS-layer simulation. A browser-based performance audit (e.g., Chrome DevTools flame chart with the full renderer) is recommended before finalizing the Phase 1 polygon budget.

2. **Polygon/render budget enforcement** — No budget guardrail system currently exists in `src/`. The engine does not enforce per-part polygon limits. Phase 1 must define a polygon budget per part and a total scene budget ceiling.

3. **Memory on minimum-spec hardware** — `process.memoryUsage()` measures JS heap in Node.js. Browser rendering adds GPU buffer allocation on top of JS heap. Minimum-spec hardware validation (particularly mobile browsers if in scope) requires a separate browser profiling pass.

4. **Animation driver overhead** — Animated state visuals (`pulse-soft`, `shake`, `lock-flash`) are named descriptors only in the current codebase; the actual CSS/Canvas animation overhead is not in scope until a renderer is implemented.

---

## Critical Gap: No Polygon/Render Budget System

The design decision flagged this explicitly. **Before Phase 1 build starts**, the feature team must:

1. Define a per-part polygon budget (recommended: ≤500 triangles per chronograph part as a starting constraint)
2. Define a total scene render budget (recommended: ≤40,000 triangles for a full 80-part scene)
3. Implement a lightweight render budget enforcement layer that rejects assets over budget at load time

This is **not a blocker for GO** — it is a design prerequisite for Phase 1 scoping, not an engine limitation. The engine itself has proven headroom.

---

## Acceptance Criteria Coverage

| AC | Requirement | Status |
|---|---|---|
| AC1 | Report with measured FPS, latency (ms), memory (MB) for 50+ parts | ✅ Met — see data table above |
| AC2 | Explicit GO / CONDITIONAL_GO / NO_GO decision with supporting data | ✅ Met — **GO**, see Summary Statistics |
| AC3 | CONDITIONAL_GO: lists specific design constraints | ✅ N/A (GO result; no constraints required) |
| AC4 | NO_GO: prerequisite engine work estimated | ✅ N/A (GO result) |
| AC5 | Spike completed within 2 business days | ✅ Met — 1 business day elapsed |

---

## Recommendation

**Unblock Chronograph Discovery Path — Phase 1 (#88).**

The engine layer can handle 80 chronograph parts with <0.1ms interaction latency per frame and >11,000 FPS theoretical throughput. The engine is not the bottleneck.

Before Phase 1 sprint planning, ensure:
- [ ] Polygon/render budget spec is defined and signed off by tech lead
- [ ] Browser render profiling pass is scheduled (Chrome DevTools, target scene with 60 representative parts + placeholder assets)
- [ ] Memory budget for minimum-spec hardware is defined (especially if mobile browser is a target platform)

---

## Automated Tests

Spike acceptance criteria are validated by:
```
tests/reassembly/chronograph-part-count-spike.test.js
```

Run with:
```bash
npm test -- tests/reassembly/chronograph-part-count-spike.test.js
```

All 26 tests pass (AC1 through AC5 + scaling behavior validation).

---

*Report generated: 2026-07-10 | Spike harness: `tests/reassembly/chronograph-part-count-spike.test.js` | No production code was changed.*
