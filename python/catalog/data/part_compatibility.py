"""
Part Compatibility Data Model — thin aggregator
================================================
Re-exports all public names from the catalog data layer.

CompatibilityStatus.UNCERTAIN is the correct default for any pair
that has no explicit entry — parts without a defined compatibility
entry render ~ Uncertain, NOT Incompatible (per design decision).

Initial scope covers three movement families:
  ETA-2824, AS-1950, Miyota-8215.
Additional families are added in follow-on content sprints by adding a
new per-family sub-module and one line to each composition below.

Internal sub-modules (_catalog_*.py, _types.py) are implementation details.
All external consumers must import from this module only.
"""

from ._types import (
    CompatibilityStatus,
    PartCondition,
    PartType,
    MovementFamily,
    Part,
)
from . import _catalog_eta_2824 as _eta
from . import _catalog_as_1950 as _as
from . import _catalog_miyota_8215 as _miyota
from . import _catalog_universal as _universal

# ---------------------------------------------------------------------------
# Composed public API
# ---------------------------------------------------------------------------

PARTS_CATALOG: list[Part] = [
    *_eta.PARTS,
    *_as.PARTS,
    *_miyota.PARTS,
    *_universal.PARTS,
]

COMPATIBILITY_TABLE: dict[tuple[str, str], CompatibilityStatus] = {
    **_eta.COMPAT,
    **_as.COMPAT,
    **_miyota.COMPAT,
}

__all__ = [
    "CompatibilityStatus",
    "PartCondition",
    "PartType",
    "MovementFamily",
    "Part",
    "PARTS_CATALOG",
    "COMPATIBILITY_TABLE",
]
