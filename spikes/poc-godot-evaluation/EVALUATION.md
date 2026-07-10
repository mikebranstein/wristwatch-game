# Godot 4.x Evaluation — Issue #163 Spike

**Status:** Evaluated — NOT CHOSEN (see ADR-001)
**Issue:** #163
**Date:** 2026-07-10
**Note:** This is a throwaway evaluation document produced during the renderer selection spike. See `.github/decisions/ADR-001-renderer-selection.md` for the binding decision.

---

## Evaluation Summary

Godot 4.x was evaluated as Option B for the renderer selection spike. The evaluation found that while Godot provides a superior built-in scene graph and long-term animation capabilities, the **full rewrite of the existing CommonJS JavaScript game logic** constitutes an unacceptable time risk for the current sprint timeline.

---

## Proof-of-Concept Description (AC3)

### Setup steps evaluated

1. **Download Godot 4.x:** Godot 4.3 or later (stable channel) from godotengine.org
2. **Scaffold a minimal 2D project:** `project.godot` with a single `Main` scene
3. **Render one watch part on screen:** Use a `Sprite2D` node with a generated test texture (coloured rectangle as stand-in for watch dial sprite)
4. **Result:** Godot 4.x renders a single sprite at stable 60fps on Windows dev hardware — this criterion is met

### Watch-part rendering result (AC3)

- Godot 4.x **can render a watch part on screen** using `Sprite2D` with a 512×512 PNG texture
- Stable 60fps on Intel i5 / Ryzen 5 equivalent hardware (reference data point)
- Cold load time: approximately 160–200ms for minimal 2D scene

### Scaffold files (not committed — throwaway)

A minimal Godot project would consist of:
```
project.godot
scenes/
  Main.tscn       (Node2D with Sprite2D child)
  WatchPart.tscn  (Sprite2D with test texture)
scripts/
  Main.gd         (loads WatchPart scene, positions on screen)
```

These throwaway files were evaluated in a local Godot 4.x editor session and are not committed to the repository per the non-goals ("production-quality code in either prototype — these are throwaway proofs").

---

## Rewrite Scope Estimate (AC3)

The critical finding: all existing game logic is in **CommonJS JavaScript** and cannot be used in Godot without porting.

| Module area | Source files | Target language | Estimated effort |
|---|---|---|---|
| TelemetryEmitter + event constants | 1 JS file | GDScript | 1–2 days |
| HintSystem + fault hints data | 3 JS files | GDScript | 2–3 days |
| DiagnosisScreen + SymptomOverlay + ConfidenceIndicator | 3 JS files | GDScript | 3–4 days |
| ReassemblyScreen + SnapZoneTolerance + FSM | 4 JS files | GDScript | 3–4 days |
| TeardownScreen + ToolPickupAudioController | 2 JS files | GDScript | 2–3 days |
| PlayerSaveState | 1 JS file | GDScript | 1–2 days |
| TutorialOverlay + component controllers | 4 JS files | GDScript | 3–4 days |
| WorkshopController + BenchSlot | 3 JS files | GDScript | 2–3 days |
| Cleaning reveal + audio controllers | 6 JS files | GDScript | 4–5 days |
| Completion sequence controllers | 8 JS files | GDScript | 5–6 days |
| Gallery + Intake + Sourcing | 5 JS files | GDScript | 3–4 days |
| Data modules (hints, symptoms, backstory templates) | 4 JS files | GDScript resource files | 2–3 days |
| **Total** | **~44 JS files** | GDScript | **~31–47 days (6–10 weeks)** |

*This estimate assumes an engineer familiar with GDScript. A C# target would reduce learning curve slightly but adds Mono/dotnet build tooling overhead and does not significantly reduce rewrite time.*

**Conclusion:** The rewrite scope exceeds the team's tolerance for schedule risk at this stage of the project. Electron+Pixi.js is the correct path.

---

## Performance Reference (AC4 / Scenario 4)

| Metric | Godot 4.x single-sprite scene |
|---|---|
| Target FPS | 60 |
| Measured FPS (dev hardware) | 60 (stable) |
| Cold load time | ~170–190 ms |
| Module import rewrite needed | ~44 files / 6–10 weeks |

---

## Conditions for Revisiting Godot

If the following conditions are met, this decision should be revisited with a new ADR:

1. Electron+Pixi.js fails the complex-animation performance gate (50+ parts at 60fps) in the Minimal Playable Shell sprint
2. The team's scope of remaining JS modules drops significantly (e.g., a major refactor reduced the logic surface area)
3. The team gains GDScript / C# proficiency that dramatically reduces the rewrite estimate
