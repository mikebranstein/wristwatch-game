"""
Damage State Configuration (Phase 1)
=====================================
Designer-configurable parameters for Phase 1 watch damage states
(water ingress, oxidation/tarnish, crystal crazing).

Follows the supplier_tiers.py config pattern: frozen dataclass + module-level
constant dict so designers can tweak values without touching runtime logic.

DAMAGE_STATE_INTAKE_RATE
    Probability (0.0–1.0) that any given incoming watch carries a Phase 1
    damage state instead of standard wear.  Requirement: ≥0.20 (AC1).
    Default: 0.25 (25%) — slightly above the floor for some headroom.

DAMAGE_STATE_WEIGHTS
    Relative probability weight of each Phase 1 damage type when a damaged
    watch is being assigned.  Weights are normalised at runtime so they do
    not need to sum to 1.0 — designers can scale them freely.
"""

from dataclasses import dataclass, field
from typing import Dict


@dataclass(frozen=True)
class DamageStateConfig:
    """Configuration for the Phase 1 damage state system."""
    # Intake rate: fraction of incoming watches assigned a Phase 1 damage state.
    # Must be ≥ 0.20 to satisfy AC1.
    intake_rate: float

    # Relative weights per damage type.  Keys must match PHASE1_DAMAGE_STATES.
    weights: Dict[str, float]


# ---------------------------------------------------------------------------
# Phase 1 damage state identifiers
# ---------------------------------------------------------------------------

PHASE1_DAMAGE_STATES = [
    "water_ingress",
    "oxidation",
    "crystal_crazing",
]

# ---------------------------------------------------------------------------
# Default designer-configurable settings
# ---------------------------------------------------------------------------

DAMAGE_STATE_CONFIG = DamageStateConfig(
    intake_rate=0.25,  # 25% of incoming watches — exceeds the ≥20% AC1 requirement
    weights={
        "water_ingress": 1.0,
        "oxidation": 1.0,
        "crystal_crazing": 1.0,
    },
)
