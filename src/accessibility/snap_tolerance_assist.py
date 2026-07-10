"""
src/accessibility/snap_tolerance_assist.py
==========================================
SnapToleranceAssist — difficulty assist for snap-zone tolerances.

Implements Issue #115 — AC3 (adjustable snap-tolerance, measurably wider at
Assisted / High Assist than Standard).

The three assist levels apply multipliers to the ``approach_radius`` and
``lock_radius`` values defined in ``SnapZoneTolerance``.  The assist is
isolated to placement physics only — game logic, scoring, and part
authenticity validation are NOT affected (non-goal, per design).

Multipliers (Machado-inspired tiered precision axis)
----------------------------------------------------
Level        approach_multiplier   lock_multiplier   net effect
-----------  -------------------   ---------------   ----------
standard     1.0                   1.0               Baseline — no change.
assisted     1.5                   1.5               50% wider on both radii.
high_assist  2.0                   2.0               100% wider (2× baseline).

The 2× constraint from SnapZoneTolerance (approach >= 2 × lock) is preserved
at all levels because both radii are scaled by the same factor.

Usage
-----
    assist = SnapToleranceAssist(level='assisted')
    adjusted = assist.adjust({'approach_radius': 60, 'lock_radius': 20})
    # → {'approach_radius': 90.0, 'lock_radius': 30.0}
"""

from __future__ import annotations

from typing import TypedDict

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ASSIST_LEVELS: tuple[str, ...] = ("standard", "assisted", "high_assist")
"""Valid assist level identifiers."""


class _Multiplier(TypedDict):
    approach: float
    lock: float


ASSIST_MULTIPLIERS: dict[str, _Multiplier] = {
    "standard":   {"approach": 1.0, "lock": 1.0},
    "assisted":   {"approach": 1.5, "lock": 1.5},
    "high_assist": {"approach": 2.0, "lock": 2.0},
}
"""
Radius multipliers per assist level.

The same multiplier is applied to both ``approach_radius`` and ``lock_radius``
so the 2× constraint (approach >= 2 × lock) is always preserved.
"""


class ToleranceSpec(TypedDict):
    approach_radius: float
    lock_radius: float


# ---------------------------------------------------------------------------
# SnapToleranceAssist
# ---------------------------------------------------------------------------

class SnapToleranceAssist:
    """
    Adjusts snap-zone tolerances based on the active assist level (AC3).

    Parameters
    ----------
    level : str
        One of ``ASSIST_LEVELS``.

    Raises
    ------
    ValueError
        If *level* is not a recognised assist level.
    """

    def __init__(self, level: str = "standard") -> None:
        if level not in ASSIST_LEVELS:
            raise ValueError(
                f"SnapToleranceAssist: level must be one of {ASSIST_LEVELS}. Got: {level!r}"
            )
        self._level = level
        self._multipliers: _Multiplier = ASSIST_MULTIPLIERS[level]

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def level(self) -> str:
        """Active assist level."""
        return self._level

    @property
    def approach_multiplier(self) -> float:
        """Multiplier applied to ``approach_radius``."""
        return self._multipliers["approach"]

    @property
    def lock_multiplier(self) -> float:
        """Multiplier applied to ``lock_radius``."""
        return self._multipliers["lock"]

    # ------------------------------------------------------------------
    # Core operation
    # ------------------------------------------------------------------

    def adjust(self, base_tolerance: ToleranceSpec) -> ToleranceSpec:
        """
        Return an adjusted tolerance spec for a part.

        The 2× constraint (``approach_radius >= 2 × lock_radius``) is preserved
        because both radii are multiplied by the same factor.

        Parameters
        ----------
        base_tolerance : dict
            ``{'approach_radius': float, 'lock_radius': float}``

        Returns
        -------
        dict
            ``{'approach_radius': float, 'lock_radius': float}`` — new values.

        Examples
        --------
        >>> assist = SnapToleranceAssist('assisted')
        >>> assist.adjust({'approach_radius': 60, 'lock_radius': 20})
        {'approach_radius': 90.0, 'lock_radius': 30.0}
        """
        approach = base_tolerance["approach_radius"] * self._multipliers["approach"]
        lock = base_tolerance["lock_radius"] * self._multipliers["lock"]
        return {"approach_radius": approach, "lock_radius": lock}

    def adjust_part_catalog(
        self, catalog: dict[str, ToleranceSpec]
    ) -> dict[str, ToleranceSpec]:
        """
        Apply assist adjustment to every entry in a part-catalog tolerance dict.

        Parameters
        ----------
        catalog : dict
            ``{part_id: {'approach_radius': float, 'lock_radius': float}, ...}``

        Returns
        -------
        dict
            New catalog with adjusted tolerances.
        """
        return {part_id: self.adjust(tol) for part_id, tol in catalog.items()}

    def snap_succeeds_at_distance(
        self, distance: float, base_lock_radius: float
    ) -> bool:
        """
        Return ``True`` if a snap attempt at *distance* would succeed at the current
        assist level (i.e. distance <= adjusted lock_radius).

        This is the measurability check used by AC3 test fixtures.

        Parameters
        ----------
        distance : float
        base_lock_radius : float
            The baseline (standard) lock radius for the part.
        """
        adjusted_lock = base_lock_radius * self._multipliers["lock"]
        return distance <= adjusted_lock

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:  # pragma: no cover
        return f"SnapToleranceAssist(level={self._level!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, SnapToleranceAssist):
            return NotImplemented
        return self._level == other._level
