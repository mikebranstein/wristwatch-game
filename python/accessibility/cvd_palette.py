"""
src/accessibility/cvd_palette.py
=================================
CvdPalette — CVD-safe color palette remap for the Accessibility Suite.

Implements Issue #115 — AC1 (CVD palette modes), AC5 (baseline unchanged).

Scientific basis
----------------
Palette simulation matrices are derived from:
  Machado, G. M., Oliveira, M. M., & Fernandes, L. A. F. (2009).
  "A Physiologically-based Model for Simulation of Color Vision Deficiency."
  IEEE Transactions on Visualization and Computer Graphics, 15(6), 1291–1298.

The matrices transform sRGB (linear) values into CVD-simulated sRGB values.
For a palette-remap (not full per-pixel post-process), we apply the *inverse*
direction: we pick replacement colors that remain distinguishable under the
simulated CVD perception.

CVD_SAFE_PALETTES
-----------------
Maps each CVD mode to a dict of ``original_hex → cvd_safe_hex`` for each
color-sole-differentiator UI state identified by the audit (#108).

The three critical FSM colors (audit P0 items UI-01, UI-02) are remapped to
a blue–orange axis that is distinguishable by deuteranopia and protanopia
observers; tritanopia observers retain the green/red pair (unaffected by
blue–yellow deficiency on that pair).

Usage
-----
    palette = CvdPalette(mode='deuteranopia')
    safe_color = palette.remap_hex('#ef5350')   # → '#e69f00' (orange)
    safe_visuals = palette.remap_state_visuals(STATE_VISUALS)
"""

from __future__ import annotations

from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CVD_MODES: tuple[Optional[str], ...] = (None, "deuteranopia", "protanopia", "tritanopia")

# ---------------------------------------------------------------------------
# CVD-safe palette remaps
# ---------------------------------------------------------------------------
# Key: original hex color (lowercase, 7-char)
# Value: CVD-safe replacement hex (lowercase, 7-char)
#
# Remapping strategy (Machado et al. and Okabe & Ito 2002 palette):
#   WRONG_ORI red   (#ef5350) → orange  (#e69f00) — D/P safe (blue–orange axis)
#   LOCKED_IN green (#66bb6a) → blue    (#0072b2) — D/P safe (blue–orange axis)
#   PROXIMITY blue  (#4fc3f7) → skyblue (#56b4e9) — retained, still distinct
#
# For tritanopia (blue–yellow axis):
#   WRONG_ORI red   (#ef5350) → red–pink (#cc3311) — kept red; T not affected by red/green
#   LOCKED_IN green (#66bb6a) → teal    (#009e73) — T safe
#   PROXIMITY blue  (#4fc3f7) → magenta (#cc79a7) — T safe replacement for blue

_REMAP_DEUTERANOPIA: dict[str, str] = {
    "#ef5350": "#e69f00",  # WRONG_ORI: red → orange
    "#66bb6a": "#0072b2",  # LOCKED_IN: green → blue
    "#4fc3f7": "#56b4e9",  # PROXIMITY: cyan → sky-blue (maintained)
}

_REMAP_PROTANOPIA: dict[str, str] = {
    "#ef5350": "#e69f00",  # WRONG_ORI: red → orange  (same axis as D)
    "#66bb6a": "#0072b2",  # LOCKED_IN: green → blue
    "#4fc3f7": "#56b4e9",  # PROXIMITY: cyan → sky-blue
}

_REMAP_TRITANOPIA: dict[str, str] = {
    "#ef5350": "#cc3311",  # WRONG_ORI: red → deep red (T unaffected by red/green)
    "#66bb6a": "#009e73",  # LOCKED_IN: green → teal  (T safe)
    "#4fc3f7": "#cc79a7",  # PROXIMITY: cyan → magenta (T safe blue replacement)
}

CVD_SAFE_PALETTES: dict[str, dict[str, str]] = {
    "deuteranopia": _REMAP_DEUTERANOPIA,
    "protanopia":   _REMAP_PROTANOPIA,
    "tritanopia":   _REMAP_TRITANOPIA,
}
"""
Lookup table: ``cvd_mode → {original_hex: safe_hex}``.

Colors not present in the lookup are returned unchanged (no unintended shift).
"""


# ---------------------------------------------------------------------------
# CvdPalette
# ---------------------------------------------------------------------------

class CvdPalette:
    """
    Applies CVD-safe palette remaps to individual hex colors and state-visual dicts.

    Parameters
    ----------
    mode : str | None
        One of ``CVD_MODES``.  When ``None`` (default), all remaps are identity
        (AC5 — baseline visuals unchanged).
    """

    def __init__(self, mode: Optional[str] = None) -> None:
        if mode not in CVD_MODES:
            raise ValueError(
                f"CvdPalette: mode must be one of {CVD_MODES}. Got: {mode!r}"
            )
        self._mode = mode
        self._palette: dict[str, str] = CVD_SAFE_PALETTES.get(mode, {}) if mode else {}

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def mode(self) -> Optional[str]:
        """Active CVD mode, or ``None`` for baseline."""
        return self._mode

    @property
    def is_active(self) -> bool:
        """True when a CVD mode is active (i.e., ``mode is not None``)."""
        return self._mode is not None

    # ------------------------------------------------------------------
    # Color remap
    # ------------------------------------------------------------------

    def remap_hex(self, hex_color: Optional[str]) -> Optional[str]:
        """
        Remap a single hex color string to its CVD-safe equivalent.

        Parameters
        ----------
        hex_color : str | None
            Seven-character hex string (e.g. ``'#ef5350'``).  ``None`` is
            returned as-is (neutral/off states have ``color: null``).

        Returns
        -------
        str | None
            CVD-safe replacement, or the original if not in the palette, or
            ``None`` if input is ``None``.
        """
        if hex_color is None:
            return None
        normalised = hex_color.lower()
        return self._palette.get(normalised, normalised)

    def remap_state_visuals(self, state_visuals: dict) -> dict:
        """
        Return a copy of ``STATE_VISUALS`` with all ``color`` values remapped.

        The input dict is not mutated.  Each entry is shallow-copied with only
        the ``color`` field replaced if a remap exists.

        Parameters
        ----------
        state_visuals : dict
            Mapping of ``state_id → {highlight, color, glow, animation, ...}``.

        Returns
        -------
        dict
            New mapping with CVD-safe colors applied.
        """
        remapped = {}
        for state_id, visuals in state_visuals.items():
            entry = dict(visuals)
            if "color" in entry:
                entry["color"] = self.remap_hex(entry["color"])
            remapped[state_id] = entry
        return remapped

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @classmethod
    def for_mode(cls, mode: Optional[str]) -> "CvdPalette":
        """Convenience factory; equivalent to ``CvdPalette(mode)``."""
        return cls(mode=mode)

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:  # pragma: no cover
        return f"CvdPalette(mode={self._mode!r})"
