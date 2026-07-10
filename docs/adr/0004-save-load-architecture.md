# ADR-0004 — Save/Load Architecture: Atomic JSON Checkpoints with Async Background Writes

**Status:** ACCEPTED  
**Date:** 2026-07-10  
**Deciders:** Foundation Research Agent  
**Tags:** save-load, persistence, reliability, session-management

---

## Context

The Wristwatch Revival Simulator supports long-running restoration sessions — players may spend 20–90 minutes on a single repair job spanning multiple phases (teardown → cleaning → sourcing → reassembly). Progress loss during these sessions is a critical failure mode.

Constraints from `docs/discovery-focus.md`:
- "Save/load reliability is critical to prevent progress loss during long restorations."
- Sessions from 20 to 90 minutes must be completable without risk of losing state.
- The recovery loop includes part orders with delivery timers — in-transit order state must survive abnormal exits (force-quit, crash).

The existing save/load architecture is implemented across two layers:

**Python persistence layer** (`src/save/save_system.py`):
- `autosave_checkpoint(stage, game_state, save_path)` — writes a stage checkpoint at each phase boundary (teardown, cleaning, sourcing, reassembly) using `tempfile + os.replace()` for atomic writes. No partial/corrupt file is ever visible on disk.
- `save_async(game_state, save_path, on_success, on_error)` — non-blocking background thread write that never pauses the game loop.
- `load_session(raw_save_data)` — deserialises save data with null-safe defaults for pre-feature saves; resolves in-transit order arrivals at session boundary.
- `_atomic_write()` — writes to a sibling `.tmp` file, then calls `os.replace()` (POSIX-atomic on NTFS same-volume moves).

**JavaScript state layer** (`src/state/PlayerSaveState.js`):
- In-memory `DEFAULT_SAVE` object with additive backward-compatible fields.
- `setCurrentStage(stage)` / `markCheckpointStage(stage)` — track restoration phase progress.
- `snapshot()` — serialises current state for persistence handoff.
- Designed for localStorage, IndexedDB, or save-file API in the production integration layer.

This two-layer design was implemented for Issue #82 (Save/Load Reliability System) with full pytest and Jest test coverage.

---

## Decision Drivers

- **Reliability over complexity**: Progress loss on a 90-minute restoration is game-breaking. Atomic writes with `.tmp` + `os.replace()` eliminate partial-write corruption on Windows NTFS.
- **Non-blocking game loop**: Async background writes ensure the game loop never pauses at save boundaries — critical for the real-time simulation target.
- **Additive backward compatibility**: The `DEFAULT_SAVE` pattern (Object.assign with defaults) means new fields added in future features load cleanly on existing save files with null/false/zero defaults.
- **Stage checkpoints**: Checkpoint at each of 4 restoration phases (teardown, cleaning, sourcing, reassembly) means the maximum progress loss on abnormal exit is one phase — not the full session.
- **In-transit order survival**: Orders placed during sourcing are persisted immediately at `place_order()` time, not deferred to session end — ensuring delivery timers survive force-quit.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| **A — Atomic JSON + stage checkpoints + async writes (current)** | `tempfile + os.replace()`, per-phase checkpoints, background thread writes | Atomic; non-blocking; proven on NTFS; additive schema; in-transit order survival | JSON grows with save slots; threading requires careful callback design |
| B — SQLite save database | All game state in SQLite | Transactional; queryable; WAL mode for concurrent access | Requires SQLite on Windows; schema migrations on every new field; overkill for single-player local saves |
| C — localStorage / IndexedDB only | Browser-native persistent storage | Works in browser out-of-the-box; no file I/O | 5–10MB quota limits; not suitable for large save slots; no atomic write guarantees; Electron requires polyfill |
| D — Cloud save only | Remote REST API for save state | Cross-device; backup handled | Requires network; violates "no live-service dependency for core play" constraint from discovery-focus.md |
| E — Manual save only (no autosave) | Player-triggered saves only | Simplest implementation | Progress loss on crash/force-quit; 90-minute sessions too risky; violates reliability constraint |

---

## Decision Outcome

**Chosen option: A — Atomic JSON checkpoints with async background writes.**

This architecture satisfies all reliability constraints stated in `docs/discovery-focus.md` with minimal infrastructure:

- **Atomic write**: No partial/corrupt save files on Windows NTFS — `os.replace()` on same-volume is atomic.
- **Non-blocking**: Game loop continuity maintained — async thread fires and the game loop proceeds immediately.
- **Stage checkpoints**: Maximum progress loss = one restoration phase (minutes, not the full session).
- **Order survival**: In-transit orders persisted at placement time, not session end.
- **Backward compatibility**: Every new save field uses an additive pattern — old saves load correctly with safe defaults.

Option D (cloud save) is explicitly excluded by the discovery focus constraint: "No online PvP, MMO economy, or live-service dependency for core play."

### Save File Schema Summary

Save files are JSON with a flat structure. Key fields:

```json
{
  "current_stage": "teardown|cleaning|sourcing|reassembly|null",
  "last_checkpoint_stage": "teardown|cleaning|sourcing|reassembly|null",
  "autosave_slot": true,
  "order_queue": { ... },
  "completed_watches": [ ... ],
  "job_state_captures": { ... },
  "damage_recovery_state": null
}
```

All fields are additive with null/false/zero/empty-array defaults to support forward and backward compatibility.

### Rollback Strategy

If save corruption is detected at load time:
1. Detect via JSON parse failure or missing required fields.
2. Fall back to the previous `.bak` checkpoint file (written by the atomic swap pattern).
3. If no backup exists, offer the player a new-game start with a warning UI.

---

## Positive Consequences

- Zero progress loss on clean exits; maximum one-phase loss on abnormal exits.
- In-transit part orders survive force-quit and crash scenarios.
- JSON format is human-readable for debugging and player mod support.
- Additive schema pattern allows unlimited new fields without migration tooling.
- Full pytest test coverage of all autosave/load paths.

## Negative Consequences / Trade-offs

- Background write threading requires callback coordination — errors on the background thread do not surface to the game loop without the `on_error` callback.
- JSON save files grow with restoration history; large `completed_watches` or `job_state_captures` dicts may need pruning in a future patch.
- Production integration layer (localStorage / IndexedDB / Electron file API) must be explicitly wired to the `PlayerSaveState.snapshot()` output — this wiring is not yet implemented (flagged as Phase 1 prerequisite).

---

## Compliance Notes

- Save files are stored locally on the player's Windows PC. No cloud transmission of save data unless the player explicitly opts into a future cloud-save feature (out of scope for initial release).
- `tempfile` and `os.replace()` are Python standard library functions with no third-party dependency.

---

## Links

- Related ADR(s): ADR-0001 (Runtime), ADR-0003 (Data Model)
- Foundation Decision Pack entry: FD-004 (Save/Load Architecture)
- Discovery Focus section: Technical Constraints — "Save/load reliability is critical to prevent progress loss during long restorations."
- Source: `src/save/save_system.py`, `src/state/PlayerSaveState.js`
- Issue: #82 (Save/Load Reliability System)
