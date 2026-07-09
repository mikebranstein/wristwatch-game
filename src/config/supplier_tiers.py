"""
Supplier Tier Configuration
===========================
Defines delivery behaviour and cost multipliers for each supplier tier.

- Standard: arrives at the start of the player's next session (1 session boundary).
- Premium : can be expedited within the current session at a lower premium;
            baseline also resolves in 1 session boundary.

Fields:
    name                        : human-readable tier name
    sessions_to_arrive          : minimum session boundaries before auto-arrival
    expedite_cost_multiplier    : factor applied to base part cost for in-session expedite
    expedite_min_playtime_secs  : minimum in-session playtime (seconds) before expedite unlocks
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SupplierTierConfig:
    name: str
    sessions_to_arrive: int
    expedite_cost_multiplier: float
    expedite_min_playtime_secs: int


SUPPLIER_TIERS: dict[str, SupplierTierConfig] = {
    "STANDARD": SupplierTierConfig(
        name="Standard",
        sessions_to_arrive=1,
        expedite_cost_multiplier=2.5,
        expedite_min_playtime_secs=600,  # 10 minutes
    ),
    "PREMIUM": SupplierTierConfig(
        name="Premium",
        sessions_to_arrive=1,
        expedite_cost_multiplier=1.5,
        expedite_min_playtime_secs=300,  # 5 minutes
    ),
}
