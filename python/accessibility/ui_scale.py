"""
src/accessibility/ui_scale.py
==============================
UiScaleManager — UI scale multiplier for the Accessibility Suite.

Implements Issue #115 — AC2 (UI scale slider, real-time rescale, persistence).

The manager holds a single ``scale_pct`` value (80–150) and exposes helpers
to apply it to base pixel/em values for text and chrome elements.

Persistence is handled externally via ``AccessibilitySettings`` (which owns
the canonical ``ui_scale`` field); ``UiScaleManager`` is a stateless utility
that can be constructed from any validated scale percentage.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

UI_SCALE_MIN: float = 80.0
"""Minimum supported UI scale (%)."""

UI_SCALE_MAX: float = 150.0
"""Maximum supported UI scale (%)."""

UI_SCALE_DEFAULT: float = 100.0
"""Default UI scale (%) — baseline, no change."""

UI_SCALE_STEP: float = 5.0
"""Suggested slider step increment (5 pp)."""


# ---------------------------------------------------------------------------
# UiScaleManager
# ---------------------------------------------------------------------------

class UiScaleManager:
    """
    Applies a global UI scale multiplier to pixel/em values.

    Parameters
    ----------
    scale_pct : float
        Scale percentage, e.g. ``130.0`` for 130%.
        Must be in [``UI_SCALE_MIN``, ``UI_SCALE_MAX``].

    Raises
    ------
    ValueError
        If ``scale_pct`` is outside the valid range.
    """

    def __init__(self, scale_pct: float = UI_SCALE_DEFAULT) -> None:
        self._scale_pct = self._validate(scale_pct)

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def scale_pct(self) -> float:
        """Current scale percentage (80–150)."""
        return self._scale_pct

    @property
    def multiplier(self) -> float:
        """Scale expressed as a multiplier, e.g. ``1.30`` for 130%."""
        return self._scale_pct / 100.0

    # ------------------------------------------------------------------
    # Core operation
    # ------------------------------------------------------------------

    def apply(self, base_value: float) -> float:
        """
        Scale *base_value* by the current multiplier.

        Parameters
        ----------
        base_value : float
            A pixel size, em value, or layout dimension at 100% scale.

        Returns
        -------
        float
            The scaled value.

        Examples
        --------
        >>> UiScaleManager(130.0).apply(16)   # 16px @ 130% → 20.8px
        20.8
        """
        return base_value * self.multiplier

    def apply_int(self, base_value: float) -> int:
        """Like :meth:`apply` but rounds to the nearest integer (pixel-aligned)."""
        return round(self.apply(base_value))

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate(value: float) -> float:
        value = float(value)
        if not (UI_SCALE_MIN <= value <= UI_SCALE_MAX):
            raise ValueError(
                f"UiScaleManager: scale_pct must be in [{UI_SCALE_MIN}, {UI_SCALE_MAX}]. "
                f"Got: {value}"
            )
        return value

    @staticmethod
    def validate_scale(value: float) -> bool:
        """Return ``True`` if *value* is a valid scale percentage, ``False`` otherwise."""
        try:
            v = float(value)
            return UI_SCALE_MIN <= v <= UI_SCALE_MAX
        except (TypeError, ValueError):
            return False

    # ------------------------------------------------------------------
    # Layout regression helpers (AC2: no layout breakage at bounds)
    # ------------------------------------------------------------------

    @classmethod
    def minimum(cls) -> "UiScaleManager":
        """Return a manager at the minimum scale (80%)."""
        return cls(UI_SCALE_MIN)

    @classmethod
    def maximum(cls) -> "UiScaleManager":
        """Return a manager at the maximum scale (150%)."""
        return cls(UI_SCALE_MAX)

    @classmethod
    def default(cls) -> "UiScaleManager":
        """Return a manager at the default scale (100%)."""
        return cls(UI_SCALE_DEFAULT)

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:  # pragma: no cover
        return f"UiScaleManager(scale_pct={self._scale_pct})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, UiScaleManager):
            return NotImplemented
        return self._scale_pct == other._scale_pct
