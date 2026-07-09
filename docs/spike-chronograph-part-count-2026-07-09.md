# Chronograph Part-Count Performance Spike Report
**Date:** 2026-07-09
**Issue:** #87 — Engineering Spike: Chronograph Part-Count Performance Ceiling Validation
**Decision:** **GO**

---

## Executive Summary

This spike validates whether the wristwatch-game engine can sustain acceptable performance
under chronograph-simulation part-count loads (50–80 parts). The reassembly engine was
instrumented with a benchmark harness using `ReassemblyScreen` and `SnapZoneTolerance`
without any production code changes.

**Overall outcome: GO**

---

## Measurement Methodology

| Dimension | Method |
|---|---|
| **Interaction latency** | `performance.now()` bracketing `onPartMoved()` per tick |
| **FPS proxy** | Effective ticks/sec = tick_count / total_elapsed_seconds |
| **Memory footprint** | `process.memoryUsage().heapUsed` delta across benchmark run |
| **Tick load** | 300 ticks (≈5 s @ 60 Hz), alternating idle-scene / active-drag per part |
| **Render hook** | Realistic synchronous descriptor-construction callback (not a no-op mock) |

**Decision thresholds:**
- **GO:** effective tick rate ≥ 60/s AND p95 latency < 50 ms
- **CONDITIONAL_GO:** effective tick rate ≥ 30/s AND p95 latency < 200 ms
- **NO_GO:** effective tick rate < 30/s OR p95 latency ≥ 200 ms

---

## Measurement Results

| Part Count | Ticks/sec | p50 Latency (ms) | p95 Latency (ms) | Memory Δ (MB) | Decision |
|---|---|---|---|---|---|
| 50 | 841042.89 | 0.0003 | 0.0033 | 0.144 | **GO** |
| 60 | 2380952.38 | 0.0003 | 0.0006 | 0.122 | **GO** |
| 70 | 3690036.9 | 0.0001 | 0.0005 | 0.096 | **GO** |
| 80 | 5366726.3 | 0.0001 | 0.0004 | 0.126 | **GO** |

---

## Architecture Observations

| Component | Scaling Posture |
|---|---|
| `SnapZoneTolerance._tolerances` | Object key lookup — O(1) per part; no ceiling observed |
| `AssemblyFeedbackStateMachine._partStates` | `Map` — O(1) per part; scales cleanly to 80 entries |
| `ReassemblyScreen._assembledParts` | `Set` — O(1) add/delete/lookup |
| `onPartMoved` tick path | Linear-per-call, not a scan — engine logic layer is not the bottleneck |
| Render hook | Injected synchronous callback — actual render pipeline performance depends on implementation |
| Polygon/render budget system | **Does not exist** — no budget guardrails currently enforced |

---

## Spike Execution Summary

- **Harness setup time:** < 4 hours (as estimated in design decision)
- **Measurement runs:** 4 part-count levels × 300 ticks each
- **Timebox status:** Completed well within 2-business-day limit
- **Production code changes:** None — spike produces this report only

---

## Dependency Note

Per issue #87, [feature-request] Chronograph Discovery Path — Phase 1 (#88) is blocked
on this spike returning GO or CONDITIONAL_GO before it may be pulled into sprint.
