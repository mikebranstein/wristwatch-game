"""
src/accessibility
=================
Accessibility Suite — Issue #115.

Exposes:
  - AccessibilitySettings   : core settings model + persistence
  - CvdPalette              : CVD-safe palette remap (Machado et al.)
  - UiScaleManager          : UI scale multiplier management
  - SnapToleranceAssist     : snap-tolerance difficulty assist
"""

from src.accessibility.accessibility_settings import AccessibilitySettings
from src.accessibility.cvd_palette import CvdPalette, CVD_MODES
from src.accessibility.ui_scale import UiScaleManager, UI_SCALE_MIN, UI_SCALE_MAX
from src.accessibility.snap_tolerance_assist import SnapToleranceAssist, ASSIST_LEVELS

__all__ = [
    "AccessibilitySettings",
    "CvdPalette",
    "CVD_MODES",
    "UiScaleManager",
    "UI_SCALE_MIN",
    "UI_SCALE_MAX",
    "SnapToleranceAssist",
    "ASSIST_LEVELS",
]
