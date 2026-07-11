"""
tests/accessibility/test_accessibility_settings.py
====================================================
Automated tests for the Accessibility Suite (Issue #115).

Acceptance Criteria Coverage:
  AC1 — CVD palette mode selection: deuteranopia, protanopia, tritanopia
         render all color-sole-differentiator UI states in CVD-safe palette.
  AC2 — UI Scale slider (80–150%): real-time rescale, no breakage at bounds,
         persists between sessions.
  AC3 — Snap-tolerance assist: measurably wider radius at Assisted and
         High Assist than at Standard.
  AC4 — Settings persistence: all preferences restored after save/reload,
         no regression to defaults.
  AC5 — Default (no CVD mode): visuals unchanged from baseline.

Test command: pytest tests/accessibility/test_accessibility_settings.py -v
"""

import pytest

from src.accessibility.accessibility_settings import (
    AccessibilitySettings,
    CVD_MODES,
    SNAP_TOLERANCE_LEVELS,
    UI_SCALE_MIN,
    UI_SCALE_MAX,
    UI_SCALE_DEFAULT,
)
from src.accessibility.cvd_palette import CvdPalette, CVD_SAFE_PALETTES
from src.accessibility.ui_scale import UiScaleManager
from src.accessibility.snap_tolerance_assist import SnapToleranceAssist, ASSIST_MULTIPLIERS


# ===========================================================================
# AC1 — CVD Palette Mode Selection
# ===========================================================================

class TestAC1CvdPaletteMode:
    """AC1: CVD palette modes render color-sole-differentiator states safely."""

    def test_all_three_cvd_modes_accepted(self):
        """AccessibilitySettings accepts all three CVD mode strings."""
        for mode in ("deuteranopia", "protanopia", "tritanopia"):
            s = AccessibilitySettings(cvd_mode=mode)
            assert s.cvd_mode == mode

    def test_invalid_cvd_mode_raises(self):
        """An unrecognised CVD mode raises ValueError."""
        with pytest.raises(ValueError, match="cvd_mode"):
            AccessibilitySettings(cvd_mode="unknown_mode")

    def test_cvd_palette_deuteranopia_remaps_wrong_ori(self):
        """Deuteranopia mode remaps WRONG_ORI red (#ef5350) to orange (#e69f00)."""
        palette = CvdPalette(mode="deuteranopia")
        assert palette.remap_hex("#ef5350") == "#e69f00"

    def test_cvd_palette_deuteranopia_remaps_locked_in(self):
        """Deuteranopia mode remaps LOCKED_IN green (#66bb6a) to blue (#0072b2)."""
        palette = CvdPalette(mode="deuteranopia")
        assert palette.remap_hex("#66bb6a") == "#0072b2"

    def test_cvd_palette_protanopia_remaps_wrong_ori(self):
        """Protanopia mode remaps WRONG_ORI red (#ef5350) to orange (#e69f00)."""
        palette = CvdPalette(mode="protanopia")
        assert palette.remap_hex("#ef5350") == "#e69f00"

    def test_cvd_palette_protanopia_remaps_locked_in(self):
        """Protanopia mode remaps LOCKED_IN green (#66bb6a) to blue (#0072b2)."""
        palette = CvdPalette(mode="protanopia")
        assert palette.remap_hex("#66bb6a") == "#0072b2"

    def test_cvd_palette_tritanopia_remaps_proximity(self):
        """Tritanopia mode remaps PROXIMITY cyan (#4fc3f7) to magenta (#cc79a7)."""
        palette = CvdPalette(mode="tritanopia")
        assert palette.remap_hex("#4fc3f7") == "#cc79a7"

    def test_cvd_palette_tritanopia_remaps_locked_in(self):
        """Tritanopia mode remaps LOCKED_IN green (#66bb6a) to teal (#009e73)."""
        palette = CvdPalette(mode="tritanopia")
        assert palette.remap_hex("#66bb6a") == "#009e73"

    def test_remap_state_visuals_applies_palette(self):
        """remap_state_visuals() returns a new dict with CVD-safe colors."""
        palette = CvdPalette(mode="deuteranopia")
        original_visuals = {
            1: {"highlight": False, "color": None,      "glow": 0},
            2: {"highlight": True,  "color": "#4fc3f7", "glow": 0.4},
            3: {"highlight": True,  "color": "#ef5350", "glow": 0.7},
            4: {"highlight": True,  "color": "#66bb6a", "glow": 1.0},
        }
        remapped = palette.remap_state_visuals(original_visuals)
        assert remapped[3]["color"] == "#e69f00"
        assert remapped[4]["color"] == "#0072b2"
        assert remapped[1]["color"] is None  # neutral unchanged

    def test_remap_state_visuals_does_not_mutate_original(self):
        """remap_state_visuals() must NOT mutate the input dict."""
        palette = CvdPalette(mode="protanopia")
        original = {3: {"color": "#ef5350"}}
        _ = palette.remap_state_visuals(original)
        assert original[3]["color"] == "#ef5350", "Original dict must not be mutated."

    def test_all_three_modes_have_palette_entries(self):
        """CVD_SAFE_PALETTES contains entries for all three modes."""
        for mode in ("deuteranopia", "protanopia", "tritanopia"):
            assert mode in CVD_SAFE_PALETTES
            assert len(CVD_SAFE_PALETTES[mode]) >= 3

    def test_deuteranopia_protanopia_same_red_green_axis(self):
        """Deuteranopia and protanopia share the same red/green remap (blue–orange axis)."""
        d = CvdPalette("deuteranopia")
        p = CvdPalette("protanopia")
        assert d.remap_hex("#ef5350") == p.remap_hex("#ef5350")
        assert d.remap_hex("#66bb6a") == p.remap_hex("#66bb6a")


# ===========================================================================
# AC2 — UI Scale Slider
# ===========================================================================

class TestAC2UiScale:
    """AC2: UI scale slider 80–150%, no layout breakage at bounds, persists."""

    def test_default_scale_is_100(self):
        """Default ui_scale is 100.0."""
        s = AccessibilitySettings()
        assert s.ui_scale == UI_SCALE_DEFAULT

    def test_valid_scale_accepted(self):
        """Any value in [80, 150] is accepted."""
        for scale in (80.0, 100.0, 120.0, 130.5, 150.0):
            s = AccessibilitySettings(ui_scale=scale)
            assert s.ui_scale == scale

    def test_scale_below_minimum_raises(self):
        """Scale below 80 raises ValueError."""
        with pytest.raises(ValueError, match="ui_scale"):
            AccessibilitySettings(ui_scale=79.9)

    def test_scale_above_maximum_raises(self):
        """Scale above 150 raises ValueError."""
        with pytest.raises(ValueError, match="ui_scale"):
            AccessibilitySettings(ui_scale=150.1)

    def test_ui_scale_manager_apply(self):
        """UiScaleManager.apply() correctly scales a base value."""
        mgr = UiScaleManager(130.0)
        assert abs(mgr.apply(16) - 20.8) < 1e-9

    def test_ui_scale_manager_apply_at_minimum(self):
        """UiScaleManager at 80% scales correctly."""
        mgr = UiScaleManager.minimum()
        assert abs(mgr.apply(100) - 80.0) < 1e-9

    def test_ui_scale_manager_apply_at_maximum(self):
        """UiScaleManager at 150% scales correctly."""
        mgr = UiScaleManager.maximum()
        assert abs(mgr.apply(100) - 150.0) < 1e-9

    def test_ui_scale_manager_apply_int(self):
        """apply_int() rounds to nearest integer."""
        mgr = UiScaleManager(130.0)
        assert mgr.apply_int(16) == 21

    def test_ui_scale_manager_invalid_raises(self):
        """UiScaleManager raises ValueError for out-of-range scale."""
        with pytest.raises(ValueError):
            UiScaleManager(200.0)

    def test_ui_scale_manager_validate_scale(self):
        """validate_scale() returns True for valid and False for invalid values."""
        assert UiScaleManager.validate_scale(80.0) is True
        assert UiScaleManager.validate_scale(150.0) is True
        assert UiScaleManager.validate_scale(79.9) is False
        assert UiScaleManager.validate_scale(150.1) is False

    def test_ui_scale_multiplier(self):
        """multiplier property returns scale / 100."""
        mgr = UiScaleManager(130.0)
        assert abs(mgr.multiplier - 1.3) < 1e-9

    # Layout regression at boundary values (AC2 constraint)

    def test_minimum_scale_boundary(self):
        """80% scale: minimum value accepted, multiplier is 0.8."""
        mgr = UiScaleManager(UI_SCALE_MIN)
        assert mgr.scale_pct == UI_SCALE_MIN
        assert abs(mgr.multiplier - 0.8) < 1e-9

    def test_maximum_scale_boundary(self):
        """150% scale: maximum value accepted, multiplier is 1.5."""
        mgr = UiScaleManager(UI_SCALE_MAX)
        assert mgr.scale_pct == UI_SCALE_MAX
        assert abs(mgr.multiplier - 1.5) < 1e-9


# ===========================================================================
# AC3 — Snap-Tolerance Difficulty Assist
# ===========================================================================

class TestAC3SnapToleranceAssist:
    """AC3: Snap activation radius is measurably wider at Assisted/High Assist."""

    BASE_TOLERANCE = {"approach_radius": 60.0, "lock_radius": 20.0}

    def test_all_three_levels_accepted(self):
        """SnapToleranceAssist accepts all three valid levels."""
        for level in SNAP_TOLERANCE_LEVELS:
            a = SnapToleranceAssist(level=level)
            assert a.level == level

    def test_invalid_level_raises(self):
        """An unrecognised assist level raises ValueError."""
        with pytest.raises(ValueError, match="level"):
            SnapToleranceAssist(level="turbo_assist")

    def test_standard_leaves_radii_unchanged(self):
        """Standard level applies 1× multiplier — radii unchanged."""
        assist = SnapToleranceAssist("standard")
        result = assist.adjust(self.BASE_TOLERANCE)
        assert result["approach_radius"] == 60.0
        assert result["lock_radius"] == 20.0

    def test_assisted_widens_approach_radius_by_50_pct(self):
        """Assisted level widens approach_radius by 50%."""
        assist = SnapToleranceAssist("assisted")
        result = assist.adjust(self.BASE_TOLERANCE)
        assert abs(result["approach_radius"] - 90.0) < 1e-9

    def test_assisted_widens_lock_radius_by_50_pct(self):
        """Assisted level widens lock_radius by 50%."""
        assist = SnapToleranceAssist("assisted")
        result = assist.adjust(self.BASE_TOLERANCE)
        assert abs(result["lock_radius"] - 30.0) < 1e-9

    def test_high_assist_doubles_approach_radius(self):
        """High Assist level doubles approach_radius (2× baseline)."""
        assist = SnapToleranceAssist("high_assist")
        result = assist.adjust(self.BASE_TOLERANCE)
        assert abs(result["approach_radius"] - 120.0) < 1e-9

    def test_high_assist_doubles_lock_radius(self):
        """High Assist level doubles lock_radius (2× baseline)."""
        assist = SnapToleranceAssist("high_assist")
        result = assist.adjust(self.BASE_TOLERANCE)
        assert abs(result["lock_radius"] - 40.0) < 1e-9

    def test_assisted_wider_than_standard(self):
        """Assisted lock_radius is strictly wider than Standard (AC3 measurable)."""
        standard = SnapToleranceAssist("standard").adjust(self.BASE_TOLERANCE)
        assisted = SnapToleranceAssist("assisted").adjust(self.BASE_TOLERANCE)
        assert assisted["lock_radius"] > standard["lock_radius"]

    def test_high_assist_wider_than_assisted(self):
        """High Assist lock_radius is strictly wider than Assisted (AC3 measurable)."""
        assisted = SnapToleranceAssist("assisted").adjust(self.BASE_TOLERANCE)
        high = SnapToleranceAssist("high_assist").adjust(self.BASE_TOLERANCE)
        assert high["lock_radius"] > assisted["lock_radius"]

    def test_two_times_constraint_preserved_at_all_levels(self):
        """approach_radius >= 2 × lock_radius holds at all assist levels."""
        for level in SNAP_TOLERANCE_LEVELS:
            result = SnapToleranceAssist(level).adjust(self.BASE_TOLERANCE)
            assert result["approach_radius"] >= 2 * result["lock_radius"], (
                f"2× constraint violated at level={level!r}: "
                f"approach={result['approach_radius']}, lock={result['lock_radius']}"
            )

    def test_snap_succeeds_at_distance_standard_threshold(self):
        """Part at exactly lock_radius distance snaps at Standard."""
        assist = SnapToleranceAssist("standard")
        base_lock = 20.0
        assert assist.snap_succeeds_at_distance(20.0, base_lock) is True

    def test_snap_fails_outside_standard_succeeds_at_high_assist(self):
        """
        AC3 core test: a part at distance=25 (outside Standard lock_radius=20)
        fails on Standard but succeeds on High Assist (lock_radius=40).
        """
        distance = 25.0
        base_lock = 20.0
        assert SnapToleranceAssist("standard").snap_succeeds_at_distance(distance, base_lock) is False
        assert SnapToleranceAssist("high_assist").snap_succeeds_at_distance(distance, base_lock) is True

    def test_adjust_part_catalog(self):
        """adjust_part_catalog applies assist to every entry in a dict."""
        catalog = {
            "mainspring":    {"approach_radius": 60, "lock_radius": 20},
            "balance_wheel": {"approach_radius": 60, "lock_radius": 20},
        }
        assist = SnapToleranceAssist("assisted")
        adjusted = assist.adjust_part_catalog(catalog)
        for part in catalog:
            assert adjusted[part]["approach_radius"] == 90.0
            assert adjusted[part]["lock_radius"] == 30.0

    def test_assist_multipliers_table_completeness(self):
        """ASSIST_MULTIPLIERS covers all three levels."""
        for level in SNAP_TOLERANCE_LEVELS:
            assert level in ASSIST_MULTIPLIERS
            assert "approach" in ASSIST_MULTIPLIERS[level]
            assert "lock" in ASSIST_MULTIPLIERS[level]


# ===========================================================================
# AC4 — Settings Persistence
# ===========================================================================

class TestAC4SettingsPersistence:
    """AC4: All accessibility preferences restored exactly after save/reload."""

    def test_to_save_data_contains_all_fields(self):
        """to_save_data() includes cvd_mode, ui_scale, and snap_tolerance_level."""
        s = AccessibilitySettings(
            cvd_mode="deuteranopia",
            ui_scale=130.0,
            snap_tolerance_level="high_assist",
        )
        data = s.to_save_data()
        assert data["cvd_mode"] == "deuteranopia"
        assert data["ui_scale"] == 130.0
        assert data["snap_tolerance_level"] == "high_assist"

    def test_from_save_data_restores_all_fields(self):
        """from_save_data() restores all three fields exactly (AC4)."""
        raw = {
            "cvd_mode": "deuteranopia",
            "ui_scale": 130.0,
            "snap_tolerance_level": "high_assist",
        }
        s = AccessibilitySettings.from_save_data(raw)
        assert s.cvd_mode == "deuteranopia"
        assert s.ui_scale == 130.0
        assert s.snap_tolerance_level == "high_assist"

    def test_round_trip_save_restore(self):
        """Round-trip to_save_data → from_save_data preserves settings exactly."""
        original = AccessibilitySettings(
            cvd_mode="tritanopia",
            ui_scale=80.0,
            snap_tolerance_level="assisted",
        )
        restored = AccessibilitySettings.from_save_data(original.to_save_data())
        assert restored == original

    def test_from_save_data_from_full_profile(self):
        """from_save_data handles a full save profile dict (accessibility sub-key)."""
        full_profile = {
            "player_name": "Alice",
            "level": 5,
            "accessibility": {
                "cvd_mode": "protanopia",
                "ui_scale": 120.0,
                "snap_tolerance_level": "standard",
            },
        }
        s = AccessibilitySettings.from_save_data(full_profile)
        assert s.cvd_mode == "protanopia"
        assert s.ui_scale == 120.0
        assert s.snap_tolerance_level == "standard"

    def test_from_save_data_none_uses_defaults(self):
        """from_save_data(None) returns default settings (new save compat)."""
        s = AccessibilitySettings.from_save_data(None)
        assert s.cvd_mode is None
        assert s.ui_scale == UI_SCALE_DEFAULT
        assert s.snap_tolerance_level == "standard"

    def test_from_save_data_empty_dict_uses_defaults(self):
        """from_save_data({}) returns defaults (pre-feature save compat)."""
        s = AccessibilitySettings.from_save_data({})
        assert s.cvd_mode is None
        assert s.ui_scale == UI_SCALE_DEFAULT
        assert s.snap_tolerance_level == "standard"

    def test_apply_to_save_data_injects_accessibility_key(self):
        """apply_to_save_data() injects 'accessibility' key into a save profile."""
        s = AccessibilitySettings(
            cvd_mode="deuteranopia",
            ui_scale=130.0,
            snap_tolerance_level="high_assist",
        )
        profile = {"player_name": "Bob", "level": 3}
        updated = s.apply_to_save_data(profile)
        assert "accessibility" in updated
        assert updated["accessibility"]["cvd_mode"] == "deuteranopia"
        assert updated["player_name"] == "Bob"  # original keys preserved

    def test_apply_to_save_data_does_not_mutate_original(self):
        """apply_to_save_data() does not mutate the input dict."""
        s = AccessibilitySettings.defaults()
        profile = {"player_name": "Bob"}
        _ = s.apply_to_save_data(profile)
        assert "accessibility" not in profile

    def test_persistence_of_all_three_settings_combined(self):
        """AC4 full scenario: deuteranopia + 130% scale + High Assist → restored."""
        original = AccessibilitySettings(
            cvd_mode="deuteranopia",
            ui_scale=130.0,
            snap_tolerance_level="high_assist",
        )
        full_profile = original.apply_to_save_data({"player_name": "Tester"})
        restored = AccessibilitySettings.from_save_data(full_profile)
        assert restored.cvd_mode == "deuteranopia"
        assert restored.ui_scale == 130.0
        assert restored.snap_tolerance_level == "high_assist"


# ===========================================================================
# AC5 — Default (no CVD mode) — baseline unchanged
# ===========================================================================

class TestAC5DefaultBaselineUnchanged:
    """AC5: Default (no palette mode) active — gameplay visuals unchanged."""

    def test_default_cvd_mode_is_none(self):
        """Default AccessibilitySettings has cvd_mode=None (AC5 baseline)."""
        s = AccessibilitySettings()
        assert s.cvd_mode is None

    def test_none_palette_remap_is_identity(self):
        """CvdPalette(None).remap_hex() returns colors unchanged."""
        palette = CvdPalette(mode=None)
        for color in ("#ef5350", "#66bb6a", "#4fc3f7", "#ffffff", "#000000"):
            assert palette.remap_hex(color) == color

    def test_none_palette_remap_null_returns_null(self):
        """CvdPalette(None).remap_hex(None) returns None."""
        palette = CvdPalette(mode=None)
        assert palette.remap_hex(None) is None

    def test_none_palette_is_not_active(self):
        """CvdPalette(None).is_active is False."""
        palette = CvdPalette(mode=None)
        assert palette.is_active is False

    def test_none_palette_remap_state_visuals_identity(self):
        """remap_state_visuals with None mode returns colors unchanged."""
        palette = CvdPalette(mode=None)
        visuals = {
            3: {"color": "#ef5350", "glow": 0.7},
            4: {"color": "#66bb6a", "glow": 1.0},
        }
        remapped = palette.remap_state_visuals(visuals)
        assert remapped[3]["color"] == "#ef5350"
        assert remapped[4]["color"] == "#66bb6a"

    def test_defaults_factory_returns_baseline(self):
        """AccessibilitySettings.defaults() has all baseline values."""
        s = AccessibilitySettings.defaults()
        assert s.cvd_mode is None
        assert s.ui_scale == UI_SCALE_DEFAULT
        assert s.snap_tolerance_level == "standard"

    def test_reset_to_defaults_restores_baseline(self):
        """with_cvd_mode(None) returns settings with no CVD transform."""
        s = AccessibilitySettings(cvd_mode="deuteranopia", ui_scale=120.0)
        reset = s.with_cvd_mode(None)
        assert reset.cvd_mode is None
        assert reset.ui_scale == 120.0  # other settings preserved

    def test_standard_snap_tolerance_is_unchanged(self):
        """Standard snap tolerance applies 1× multiplier — no change from baseline."""
        assist = SnapToleranceAssist("standard")
        base = {"approach_radius": 60.0, "lock_radius": 20.0}
        result = assist.adjust(base)
        assert result == {"approach_radius": 60.0, "lock_radius": 20.0}
