"""
src/accessibility/accessibility_settings.py
============================================
AccessibilitySettings — core settings model for the Accessibility Suite.

Implements Issue #115 — AC1, AC2, AC3, AC4, AC5.

Fields
------
cvd_mode : str | None
    One of None (default — no transformation), 'deuteranopia', 'protanopia',
    'tritanopia'.  None = baseline visuals, no color shift (AC5).

ui_scale : float
    Scale percentage for all UI text and chrome elements.
    Valid range: 80.0–150.0 (inclusive).  Default: 100.0.
    Persisted to save profile (AC2, AC4).

snap_tolerance_level : str
    One of 'standard', 'assisted', 'high_assist'.
    Controls the hitbox/magnetic-attraction radius for part placement (AC3).
    Default: 'standard'.

Persistence
-----------
to_save_data()         → dict   serialises all three fields into a dict ready
                                 for JSON persistence (AC4).
from_save_data(data)   → cls    classmethod; deserialises from a raw save-data
                                 dict (forward-compatible: missing keys fall back
                                 to defaults so old saves load cleanly).
"""

from __future__ import annotations

from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CVD_MODES: tuple[Optional[str], ...] = (None, "deuteranopia", "protanopia", "tritanopia")
"""Valid values for ``cvd_mode``."""

SNAP_TOLERANCE_LEVELS: tuple[str, ...] = ("standard", "assisted", "high_assist")
"""Valid values for ``snap_tolerance_level``."""

UI_SCALE_MIN: float = 80.0
UI_SCALE_MAX: float = 150.0
UI_SCALE_DEFAULT: float = 100.0

_SAVE_KEY = "accessibility"
"""Top-level key in the player save profile dict."""


# ---------------------------------------------------------------------------
# AccessibilitySettings
# ---------------------------------------------------------------------------

class AccessibilitySettings:
    """Immutable-friendly settings container for the Accessibility Suite (Issue #115)."""

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def __init__(
        self,
        cvd_mode: Optional[str] = None,
        ui_scale: float = UI_SCALE_DEFAULT,
        snap_tolerance_level: str = "standard",
    ) -> None:
        """
        Parameters
        ----------
        cvd_mode : str | None
            Palette mode.  One of ``CVD_MODES``.
        ui_scale : float
            Scale percentage in [80.0, 150.0].
        snap_tolerance_level : str
            One of ``SNAP_TOLERANCE_LEVELS``.

        Raises
        ------
        ValueError
            If any parameter is out of range or not a recognised constant.
        """
        self._cvd_mode = self._validate_cvd_mode(cvd_mode)
        self._ui_scale = self._validate_ui_scale(ui_scale)
        self._snap_tolerance_level = self._validate_snap_tolerance(snap_tolerance_level)

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def cvd_mode(self) -> Optional[str]:
        """Active CVD palette mode, or ``None`` for baseline visuals (AC5)."""
        return self._cvd_mode

    @property
    def ui_scale(self) -> float:
        """UI scale percentage (80.0–150.0)."""
        return self._ui_scale

    @property
    def snap_tolerance_level(self) -> str:
        """Snap-tolerance assist level: 'standard', 'assisted', or 'high_assist'."""
        return self._snap_tolerance_level

    # ------------------------------------------------------------------
    # Mutation helpers (return new instances — keep settings immutable)
    # ------------------------------------------------------------------

    def with_cvd_mode(self, cvd_mode: Optional[str]) -> "AccessibilitySettings":
        """Return a copy with a new ``cvd_mode``."""
        return AccessibilitySettings(cvd_mode, self._ui_scale, self._snap_tolerance_level)

    def with_ui_scale(self, ui_scale: float) -> "AccessibilitySettings":
        """Return a copy with a new ``ui_scale``."""
        return AccessibilitySettings(self._cvd_mode, ui_scale, self._snap_tolerance_level)

    def with_snap_tolerance_level(self, level: str) -> "AccessibilitySettings":
        """Return a copy with a new ``snap_tolerance_level``."""
        return AccessibilitySettings(self._cvd_mode, self._ui_scale, level)

    @classmethod
    def defaults(cls) -> "AccessibilitySettings":
        """Return the canonical default settings (AC5 baseline)."""
        return cls(cvd_mode=None, ui_scale=UI_SCALE_DEFAULT, snap_tolerance_level="standard")

    # ------------------------------------------------------------------
    # Persistence (AC4)
    # ------------------------------------------------------------------

    def to_save_data(self) -> dict:
        """
        Serialise to a JSON-compatible dict for inclusion in the player save profile.

        Example output::

            {"cvd_mode": "deuteranopia", "ui_scale": 130.0, "snap_tolerance_level": "high_assist"}
        """
        return {
            "cvd_mode": self._cvd_mode,
            "ui_scale": self._ui_scale,
            "snap_tolerance_level": self._snap_tolerance_level,
        }

    @classmethod
    def from_save_data(cls, save_data: Optional[dict]) -> "AccessibilitySettings":
        """
        Deserialise from a raw save-profile dict (or from ``None`` for new saves).

        Missing keys fall back to defaults so saves created before this feature
        loads cleanly without KeyError (backward-compat, AC4).

        Parameters
        ----------
        save_data : dict | None
            The ``accessibility`` sub-dict from the player save profile, or the
            full save-profile dict.  Both shapes are handled.
        """
        raw = save_data or {}
        # Support both full save profile and the sub-dict directly
        section = raw.get(_SAVE_KEY, raw)

        cvd_mode = section.get("cvd_mode", None)
        ui_scale = float(section.get("ui_scale", UI_SCALE_DEFAULT))
        snap_level = section.get("snap_tolerance_level", "standard")

        return cls(cvd_mode=cvd_mode, ui_scale=ui_scale, snap_tolerance_level=snap_level)

    def apply_to_save_data(self, save_data: Optional[dict]) -> dict:
        """
        Inject accessibility preferences into an existing save-data dict and return it.

        Does not mutate the input — returns a new dict with the ``accessibility``
        key set to the current settings.
        """
        return {
            **(save_data or {}),
            _SAVE_KEY: self.to_save_data(),
        }

    # ------------------------------------------------------------------
    # Equality / repr
    # ------------------------------------------------------------------

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, AccessibilitySettings):
            return NotImplemented
        return (
            self._cvd_mode == other._cvd_mode
            and self._ui_scale == other._ui_scale
            and self._snap_tolerance_level == other._snap_tolerance_level
        )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"AccessibilitySettings("
            f"cvd_mode={self._cvd_mode!r}, "
            f"ui_scale={self._ui_scale}, "
            f"snap_tolerance_level={self._snap_tolerance_level!r})"
        )

    # ------------------------------------------------------------------
    # Private validators
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_cvd_mode(value: Optional[str]) -> Optional[str]:
        if value not in CVD_MODES:
            raise ValueError(
                f"cvd_mode must be one of {CVD_MODES}. Got: {value!r}"
            )
        return value

    @staticmethod
    def _validate_ui_scale(value: float) -> float:
        value = float(value)
        if not (UI_SCALE_MIN <= value <= UI_SCALE_MAX):
            raise ValueError(
                f"ui_scale must be between {UI_SCALE_MIN} and {UI_SCALE_MAX}. Got: {value}"
            )
        return value

    @staticmethod
    def _validate_snap_tolerance(value: str) -> str:
        if value not in SNAP_TOLERANCE_LEVELS:
            raise ValueError(
                f"snap_tolerance_level must be one of {SNAP_TOLERANCE_LEVELS}. Got: {value!r}"
            )
        return value
