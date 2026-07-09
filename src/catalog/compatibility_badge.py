"""
CompatibilityBadge — deterministic compatibility badge logic (AC2)
===================================================================

Given a part_id and an active movement_family, returns the badge state.

Rules (from design decision):
  - "Uncertain badge is the correct default — parts with no defined
     compatibility entry should render ~ Uncertain, not Incompatible."
  - "Player agency on incompatible parts preserved — Incompatible badge
     informs but does not block ordering."
  - Badge logic is deterministic: same part + movement always yield same badge.

When there is NO active job movement context (browsing without an active job),
no badge is shown — this matches Scenario 10.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from src.catalog.data.part_compatibility import CompatibilityStatus, COMPATIBILITY_TABLE, MovementFamily


@dataclass(frozen=True)
class BadgeResult:
    symbol: Optional[str]          # ✓ / ~ / ✗ / None
    label: Optional[str]           # "Compatible" / "Uncertain" / "Incompatible" / None
    status: Optional[CompatibilityStatus]
    tooltip: Optional[str] = None  # Shown for Uncertain and Incompatible


# Singleton badge instances (determinism guaranteed by identity)
BADGE_COMPATIBLE = BadgeResult(
    symbol="✓",
    label="Compatible",
    status=CompatibilityStatus.COMPATIBLE,
)

BADGE_UNCERTAIN = BadgeResult(
    symbol="~",
    label="Uncertain",
    status=CompatibilityStatus.UNCERTAIN,
    tooltip=(
        "Compatibility with your movement could not be confirmed. "
        "Bench verification is required after installation to confirm fit and function."
    ),
)

BADGE_INCOMPATIBLE = BadgeResult(
    symbol="✗",
    label="Incompatible",
    status=CompatibilityStatus.INCOMPATIBLE,
    tooltip=(
        "This part is not compatible with your active movement. "
        "You may still order it, but it will not function correctly in this job."
    ),
)

BADGE_NONE = BadgeResult(
    symbol=None,
    label=None,
    status=None,
)


def evaluate_badge(part_id: str, active_movement_family: Optional[str]) -> BadgeResult:
    """
    Evaluate the compatibility badge for a part relative to an active movement.

    Args:
        part_id: Unique identifier of the part.
        active_movement_family: Movement family of the active job, or None if
            the catalog was opened without an active job (Scenario 10).

    Returns:
        A BadgeResult instance. The same inputs always return the same instance
        (deterministic, AC2 invariant).
    """
    # Scenario 10: no active job — no badges shown
    if not active_movement_family:
        return BADGE_NONE

    status = COMPATIBILITY_TABLE.get((active_movement_family, part_id))

    if status == CompatibilityStatus.COMPATIBLE:
        return BADGE_COMPATIBLE
    if status == CompatibilityStatus.INCOMPATIBLE:
        return BADGE_INCOMPATIBLE

    # Default: Uncertain (covers explicit 'uncertain' and missing entries)
    return BADGE_UNCERTAIN
