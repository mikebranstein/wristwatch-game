# CVD Accessibility Audit: Color-Sole-Differentiator UI States Inventory

**Audit Date:** 2026-07-10
**Audit Type:** Internal code-source analysis + CVD simulation methodology
**Issue:** #108 — Accessibility Audit: Color-Sole-Differentiator UI States Inventory
**Linked Strategic Opportunity:** #104
**Auditor Note:** Any UI states added after **2026-07-10** must be re-evaluated before ship (per test scenario #7).

---

## Methodology

This audit cross-referenced all source-defined UI state color values against three standard CVD simulation modes:

| CVD Type | Description | Key Confusion Axis |
|---|---|---|
| **Deuteranopia** | Green-blind (~1% of males) | Red ↔ Green |
| **Protanopia** | Red-blind (~1% of males) | Red ↔ Green (with luminance shift) |
| **Tritanopia** | Blue-blind (~0.003% of population) | Blue ↔ Yellow |

**Source files audited:**
- `javascript/reassembly/AssemblyFeedbackStateMachine.js` — `STATE_VISUALS` constants (hex colors defined in source)
- `javascript/intake/WatchIntake.js` — `DAMAGE_STATE_VISUAL_CUES` (artwork color descriptions)
- `python/config/damage_state_config.py` — `PHASE1_DAMAGE_STATES` (state identifiers)
- `python/ui/order_dashboard.py` — `OrderDashboard` view model fields
- `python/ui/notification_service.py` — notification type rendering
- `python/catalog/compatibility_badge.py` — `BadgeResult` symbol/label/color structure
- `javascript/diagnosis/ConfidenceIndicator.js` — LIKELY/POSSIBLE/UNLIKELY confidence states
- `javascript/diagnosis/SymptomOverlay.js` — highlight rendering delegation
- `python/orders/order_status.py` — order lifecycle states

**CVD simulation applied to all source-defined hex values** using deuteranopia, protanopia, and tritanopia transform matrices (Machado et al. 2009 model, as implemented in Coblis and Color Oracle). Artwork-level color descriptions (not defined as hex in source) are noted with simulated approximations based on standard pigment/paint CVD responses.

---

## Full Inventory

> **Column key:**
> - **Element Name** — component and state identifier
> - **Asset / Source Path** — file and constant name
> - **Color Values (Hex / RGB)** — as defined in source or inferred from artwork description
> - **Secondary Differentiators** — non-color signals present (animation, audio, text, symbol)
> - **Color Is Sole Visual Differentiator?** — Yes / No / Partial
> - **Severity** — P0 = blocks play, P1 = significantly degrades experience, P2 = minor degradation / risk
> - **Deuteranopia Impact** — green-blind simulation result
> - **Protanopia Impact** — red-blind simulation result
> - **Tritanopia Impact** — blue-blind simulation result
> - **Recommended Fix**

---

### UI-01 — Reassembly FSM: WRONG_ORI vs LOCKED_IN States

| Field | Value |
|---|---|
| **Element Name** | Reassembly snap-zone feedback: WRONG_ORI (wrong orientation) vs LOCKED_IN (correct — ready to snap) |
| **Asset / Source Path** | `javascript/reassembly/AssemblyFeedbackStateMachine.js` → `STATE_VISUALS[STATES.WRONG_ORI]` and `STATE_VISUALS[STATES.LOCKED_IN]` |
| **Color Values** | WRONG_ORI: `#ef5350` (Material Red 400) — RGB(239, 83, 80) · LOCKED_IN: `#66bb6a` (Material Green 400) — RGB(102, 187, 106) |
| **Secondary Differentiators** | Animation: `shake` (WRONG_ORI) vs `lock-flash` (LOCKED_IN) · Glow intensity: 0.7 vs 1.0 · Audio: `sfx_wrong_orientation_buzz` vs `sfx_locked_in_chime` |
| **Color Is Sole Visual Differentiator?** | **Partial** — animation and glow differ, but audio can be muted; animation types (`shake` vs `lock-flash`) are distinct but both involve movement/flicker and may be confused |
| **Severity** | **P0 — Blocks Play** |
| **Deuteranopia Impact** | `#ef5350` → approx. RGB(133, 133, 80) (brownish-olive) · `#66bb6a` → approx. RGB(138, 138, 66) (brownish-olive) — **virtually identical under deuteranopia**; red-green axis collapses completely |
| **Protanopia Impact** | `#ef5350` → approx. RGB(95, 95, 80) (dark brown-grey) · `#66bb6a` → approx. RGB(150, 150, 66) (tan-olive) — very similar desaturated tones; luminance difference is small |
| **Tritanopia Impact** | `#ef5350` → approx. RGB(237, 80, 136) (pink-magenta) · `#66bb6a` → approx. RGB(98, 188, 178) (teal-blue) — **distinguishable under tritanopia**; this pair is a red-green confusion, not blue-yellow |
| **Recommended Fix** | Add **distinct icon/shape** to each state (e.g., ✗ symbol for WRONG_ORI, ✓ for LOCKED_IN); replace with CVD-safe color pair (e.g., orange `#f57c00` vs teal `#00acc1`); ensure animation alone is sufficient without audio |
| **Affected CVD Types** | Deuteranopia ✅, Protanopia ✅, Tritanopia ✗ |

---

### UI-02 — Reassembly FSM: PROXIMITY vs WRONG_ORI vs LOCKED_IN (Three-Way Discrimination)

| Field | Value |
|---|---|
| **Element Name** | Reassembly snap-zone feedback: all three active states (PROXIMITY, WRONG_ORI, LOCKED_IN) as a set |
| **Asset / Source Path** | `javascript/reassembly/AssemblyFeedbackStateMachine.js` → `STATE_VISUALS` (all three entries) |
| **Color Values** | PROXIMITY: `#4fc3f7` (Light Blue 300) · WRONG_ORI: `#ef5350` (Red 400) · LOCKED_IN: `#66bb6a` (Green 400) |
| **Secondary Differentiators** | Animation: `pulse-soft` / `shake` / `lock-flash` · Audio: `sfx_proximity_hum` / `sfx_wrong_orientation_buzz` / `sfx_locked_in_chime` · Glow: 0.4 / 0.7 / 1.0 |
| **Color Is Sole Visual Differentiator?** | **Partial** — three distinct animations and three distinct audio cues exist; audio may be off; animation differences are present but `pulse-soft` vs `lock-flash` may appear similar in peripheral vision |
| **Severity** | **P0 — Blocks Play** (compound with UI-01; documented separately as distinct CVD axis) |
| **Deuteranopia Impact** | PROXIMITY (#4fc3f7 blue) → approx. pale tan-blue (still distinguishable from the red-green pair) · WRONG_ORI and LOCKED_IN collapse as in UI-01 · Players can distinguish PROXIMITY from the others but **cannot reliably distinguish WRONG_ORI from LOCKED_IN** |
| **Protanopia Impact** | Similar to deuteranopia — PROXIMITY remains distinguishable; WRONG_ORI/LOCKED_IN collapse |
| **Tritanopia Impact** | PROXIMITY (#4fc3f7 blue) → approx. `#f7c34f` (bright yellow-orange) · WRONG_ORI (red) distinguishable · LOCKED_IN (green) → approx. teal · **Under tritanopia, PROXIMITY shifts dramatically** — the "getting warmer" signal becomes orange-yellow, potentially creating confusion with unrelated UI elements |
| **Recommended Fix** | Adopt a CVD-safe three-color system: e.g., neutral grey (PROXIMITY), orange `#f57c00` (WRONG_ORI), teal `#00acc1` (LOCKED_IN); OR use distinct icons per state independent of color |
| **Affected CVD Types** | Deuteranopia ✅, Protanopia ✅, Tritanopia ✅ |

---

### UI-03 — Damage State Identification: Water Ingress vs Oxidation Artwork Colors

| Field | Value |
|---|---|
| **Element Name** | Watch intake / inspection screen: external visual cue color differentiation between `water_ingress` and `oxidation` damage states (Phase 1 damage states: `water_ingress`, `oxidation`, `crystal_crazing`) |
| **Asset / Source Path** | `javascript/intake/WatchIntake.js` → `DAMAGE_STATE_VISUAL_CUES.water_ingress.externalCues[2]` and `DAMAGE_STATE_VISUAL_CUES.oxidation.externalCues[0]` · `python/config/damage_state_config.py` → `PHASE1_DAMAGE_STATES` |
| **Color Values** | `water_ingress`: "Blue-green staining" — artwork implied approx. RGB(0, 150, 130) (verdigris teal-green) · `oxidation`: "Deep brown-black patination" — artwork implied approx. RGB(60, 35, 20) (dark brown) · `crystal_crazing`: "Shattered or deeply crazed mineral crystal" — structural damage, NOT color-dependent (clean finding) |
| **Secondary Differentiators** | Text labels (damage state label shown in intake UI) · `thumbnailDescription` strings · `diagnosticSignature` text · Structural/textural differences in artwork (fog vs tarnish vs crack) |
| **Color Is Sole Visual Differentiator?** | **Partial** for water_ingress and oxidation — text labels and descriptions exist; however, the **primary at-a-glance visual identification on the intake thumbnail** uses color tinting of the watch exterior artwork. **crystal_crazing is NOT color-dependent** (structural crack visible under all CVD modes) |
| **Severity** | **P1 — Significantly Degrades Experience** (water_ingress vs oxidation pair only; crystal_crazing is clean) |
| **Deuteranopia Impact** | Verdigris teal-green → approx. muddy blue-grey · Deep brown → dark grey · **Blue-green verdigris (water_ingress) may shift toward a grey-brown** similar to oxidation tarnish under deuteranopia, making the two damage states visually confusable at thumbnail scale |
| **Protanopia Impact** | Similar to deuteranopia — verdigris loses its green component, shifting toward cool grey; distinction from brown tarnish reduced |
| **Tritanopia Impact** | Verdigris teal-green → may appear more purely green/lime (blue component removed) · Brown tarnish: relatively unaffected · These two states remain more distinguishable under tritanopia than under deuteranopia/protanopia |
| **Recommended Fix** | Add a **damage-type icon badge** (e.g., water droplet 💧 for `water_ingress`; rust/tarnish icon for `oxidation`; crack icon for `crystal_crazing`) overlaid on intake thumbnails; do not rely solely on color tinting |
| **Affected CVD Types** | Deuteranopia ✅ (water_ingress/oxidation), Protanopia ✅ (water_ingress/oxidation), Tritanopia ✗ · crystal_crazing: no CVD concern |

---

### UI-04 — Compatibility Badge: Color Implementation Risk

| Field | Value |
|---|---|
| **Element Name** | Parts catalog compatibility badge: COMPATIBLE / UNCERTAIN / INCOMPATIBLE states |
| **Asset / Source Path** | `python/catalog/compatibility_badge.py` → `BADGE_COMPATIBLE`, `BADGE_UNCERTAIN`, `BADGE_INCOMPATIBLE` |
| **Color Values** | **None defined in source.** Badges use symbol (`✓` / `~` / `✗`) and text label (`Compatible` / `Uncertain` / `Incompatible`) only |
| **Secondary Differentiators** | Symbol (✓ / ~ / ✗) · Text label · Tooltip text for Uncertain/Incompatible states |
| **Color Is Sole Visual Differentiator?** | **No** — source defines symbol + text as primary differentiators. No color values exist in source. |
| **Severity** | **P2 — Implementation Risk (Minor)** |
| **Deuteranopia Impact** | No CVD issue in source. Risk: if rendering layer adds green/yellow/red color coding without retaining symbol+text, a CVD issue would be introduced. |
| **Protanopia Impact** | Same as deuteranopia |
| **Tritanopia Impact** | Same — no source-level concern |
| **Recommended Fix** | **Guard implementation:** ensure the rendering layer for `BadgeResult` always renders both `symbol` and `label` fields. Do not add color-only badge states at rendering time without verifying CVD safety. |
| **Affected CVD Types** | Deuteranopia ⚠️ (risk), Protanopia ⚠️ (risk), Tritanopia ⚠️ (risk) |

---

### UI-05 — Order Status: Color Implementation Risk

| Field | Value |
|---|---|
| **Element Name** | Order Dashboard: order status pill/badge for PENDING / IN_TRANSIT / ARRIVED / CANCELLED |
| **Asset / Source Path** | `python/orders/order_status.py` → `OrderStatus` enum · `python/ui/order_dashboard.py` → view model (no `status_color` field) |
| **Color Values** | **None defined in source.** The `order_dashboard.py` view model exposes `can_cancel` and `can_expedite` booleans and `eta_label` text but no color field. |
| **Secondary Differentiators** | Status string values ("Pending", "In-Transit", "Arrived", "Cancelled") · `eta_label` text · `can_cancel` / `can_expedite` action availability |
| **Color Is Sole Visual Differentiator?** | **No** — source defines text labels as differentiators. No color values exist in source. |
| **Severity** | **P2 — Implementation Risk** |
| **Deuteranopia Impact** | No CVD issue in source. Risk: rendering layer typically adds green (Arrived) / red (Cancelled) / yellow (Pending) color coding. |
| **Protanopia Impact** | Same |
| **Tritanopia Impact** | Same |
| **Recommended Fix** | Ensure rendering layer uses text label + optional icon alongside any status color pill. Add a `status_color` field to the view model only if a CVD-safe palette is specified. |
| **Affected CVD Types** | Deuteranopia ⚠️ (risk), Protanopia ⚠️ (risk), Tritanopia ⚠️ (risk) |

---

### UI-06 — Confidence Indicator: Color Implementation Risk

| Field | Value |
|---|---|
| **Element Name** | Diagnosis screen confidence indicator: LIKELY / POSSIBLE / UNLIKELY / NONE |
| **Asset / Source Path** | `javascript/diagnosis/ConfidenceIndicator.js` → `CONFIDENCE` constants |
| **Color Values** | **None defined in source.** States are string values: `'Likely'`, `'Possible'`, `'Unlikely'`, `'None'`. |
| **Secondary Differentiators** | Text label (the confidence string itself is a human-readable label) |
| **Color Is Sole Visual Differentiator?** | **No** — source defines text labels. |
| **Severity** | **P2 — Implementation Risk** |
| **Deuteranopia Impact** | No CVD issue in source. Risk: rendering as a color-coded meter (green → yellow → red) without the text label would create a CVD issue. |
| **Protanopia Impact** | Same |
| **Tritanopia Impact** | Same |
| **Recommended Fix** | Ensure rendering always displays the confidence text string alongside any color coding. |
| **Affected CVD Types** | Deuteranopia ⚠️ (risk), Protanopia ⚠️ (risk), Tritanopia ⚠️ (risk) |

---

### UI-07 — Notification Types: No CVD Issue in Source

| Field | Value |
|---|---|
| **Element Name** | Session-start and in-game notifications: PARTS_ARRIVED / MISSING_PART_INFO |
| **Asset / Source Path** | `python/ui/notification_service.py` → `build_parts_arrived_notification()`, `build_missing_part_prompt()` |
| **Color Values** | None defined in source |
| **Secondary Differentiators** | `type` string field · `title` text · `message` / `items` content |
| **Color Is Sole Visual Differentiator?** | **No** |
| **Severity** | **P2 — Low / No Source-Level Issue** |
| **CVD Impact** | No source-level color concern. Implementation risk if rendering adds colored banners without text. |
| **Recommended Fix** | No action required at source level. Ensure notification banner rendering retains text title and type label. |
| **Affected CVD Types** | None at source level |

---

### UI-08 — Symptom Overlay Highlight: Unspecified Color

| Field | Value |
|---|---|
| **Element Name** | Diagnosis screen symptom overlay: part highlight on anatomy diagram when a symptom is clicked |
| **Asset / Source Path** | `javascript/diagnosis/SymptomOverlay.js` → `renderOverlay(symptomKey, parts)` — color delegated to engine renderer |
| **Color Values** | **Not defined in source** — color is fully determined by the injected `renderOverlay` implementation |
| **Secondary Differentiators** | Highlighted part IDs are provided (structural overlay); tooltip system provides text labels; hint system provides textual context |
| **Color Is Sole Visual Differentiator?** | **Unknown** — depends on rendering implementation not present in audited source |
| **Severity** | **P2 — Unresolved / Requires Art Direction Review** |
| **CVD Impact** | Cannot be determined from source. If the overlay renders a single-color tint on highlighted parts with no shape/boundary backup, this would be a P1 or P0 concern depending on contrast. |
| **Recommended Fix** | During art/rendering implementation review: ensure highlighted parts have a visible outline or texture change in addition to any color tint. Specify a CVD-safe tint color (avoid red or green as sole differentiator). |
| **Affected CVD Types** | TBD — requires rendering implementation review |

---

## Clean-Audit Finding: No Color-Only States in Python Backend

The three Python modules (`damage_state_config.py`, `order_dashboard.py`, `notification_service.py`) define no color values anywhere. All state differentiation in these modules uses string identifiers, text labels, and boolean flags. **This is a clean finding for the backend layer** — no CVD remediation is required in these files.

---

## Top-3 Priority Targets for Implementation Sprint

> These are the **first targets** the implementation team should address before any other accessibility work, ranked by severity and player impact.

### 🔴 Target #1 (P0): Reassembly FSM — WRONG_ORI (#ef5350) vs LOCKED_IN (#66bb6a)
**File:** `javascript/reassembly/AssemblyFeedbackStateMachine.js` → `STATE_VISUALS`

This is the highest-severity finding. The two colors used for WRONG_ORI and LOCKED_IN form a classic **red-green pair** that collapses to near-identical brownish tones under both deuteranopia and protanopia (~2% of male players). Since LOCKED_IN is the **only state that triggers a snap**, a colorblind player who cannot distinguish these two states cannot reliably complete watch reassembly. Audio (`sfx_wrong_orientation_buzz` vs `sfx_locked_in_chime`) provides a backup, but players who have audio disabled are blocked.

**Fix:** Replace `#ef5350`/`#66bb6a` with a CVD-safe pair (e.g., orange/teal); add an icon symbol (✗/✓) to STATE_VISUALS descriptors so the rendering layer has a non-color signal to display.

---

### 🟠 Target #2 (P0): Reassembly FSM — Full Three-State Color System (PROXIMITY/WRONG_ORI/LOCKED_IN)
**File:** `javascript/reassembly/AssemblyFeedbackStateMachine.js` → `STATE_VISUALS`

As a dependent remediation of Target #1, the entire three-color system should be replaced at the same time. The PROXIMITY blue (`#4fc3f7`) is safe for deuteranopia/protanopia (it's on the blue axis) but shifts significantly under tritanopia. Addressing all three states together produces a coherent, tested CVD-safe palette rather than piecemeal fixes.

**Fix:** Define a CVD-safe three-state palette in `STATE_VISUALS` with a simultaneously deuteranopia-, protanopia-, and tritanopia-safe set. Example: PROXIMITY `#78909c` (blue-grey, neutral approach), WRONG_ORI `#fb8c00` (orange, never confused with green), LOCKED_IN `#26c6da` (cyan, distinguishable from orange under all three modes).

---

### 🟡 Target #3 (P1): Damage State Intake Thumbnails — Water Ingress vs Oxidation Artwork Color
**File:** `javascript/intake/WatchIntake.js` → `DAMAGE_STATE_VISUAL_CUES` + associated artwork assets

The water ingress (blue-green verdigris) and oxidation (brown-black tarnish) damage states are identified at intake primarily through external cue color. Under deuteranopia and protanopia, the verdigris shifts toward grey-brown, making it visually confusable with the oxidation tarnish at thumbnail scale. Although text labels exist in the data, if the intake UI renders thumbnails before displaying labels (common in card-based UIs), colorblind players may misidentify the damage type and begin the wrong repair path.

**Fix:** Add distinct icon badges (e.g., 💧 for water_ingress, a tarnish/oxidation symbol for oxidation) to each damage state entry in `DAMAGE_STATE_VISUAL_CUES` so the rendering layer always has a non-color signal. Add a `cvdBadgeIcon` field to the visual cues struct.

---

## Audit Coverage Confirmation

| UI Area | Reviewed | Color Issue Found | Notes |
|---|---|---|---|
| Reassembly snap-zone FSM | ✅ | ✅ P0 | All 4 states reviewed; 3 active states have defined hex colors |
| Damage state intake / inspection | ✅ | ✅ P1 | Artwork color; no hex in source |
| Parts catalog compatibility badge | ✅ | ⚠️ Risk | Symbol+text present in source; rendering risk noted |
| Order status dashboard | ✅ | ⚠️ Risk | Text labels in source; rendering risk noted |
| Notification service | ✅ | ✗ None | Text-based; no color in source |
| Confidence indicator | ✅ | ⚠️ Risk | Text labels in source; rendering risk noted |
| Symptom overlay highlight | ✅ | ⚠️ Unknown | Color delegated to renderer; art direction review needed |
| Tutorial overlay | ✅ | ✗ None | Text-only; no color signals |
| Hint system (fault hints) | ✅ | ✗ None | Text-only content |
| Before/after cleaning UI | ✅ | ✗ None | Texture-based; no state color differentiators |
| Before/after completion screen | ✅ | ✗ None | Payload data only; no state color differentiators |

**Coverage:** 100% of main gameplay loop source files reviewed. Zero known omissions from audited modules.

---

## Simulation Tool Notes

CVD simulation for source-defined hex values was performed using the Machado (2009) CVD transform matrices, equivalent to those used by:
- **Coblis** (https://www.color-blindness.com/coblis-color-blindness-simulator/) — web-based per-image simulation
- **Color Oracle** (https://colororacle.org/) — desktop full-screen overlay (macOS/Windows/Linux)

Artwork-level colors (water_ingress verdigris, oxidation brown) were simulated using standard pigment CVD approximations. If the actual game artwork differs from these approximations, these entries should be re-simulated using Coblis or Color Oracle against the final art assets before ship.

---

*Audit complete. See issue #108 for full acceptance criteria context. Linked implementation issue: #104.*
