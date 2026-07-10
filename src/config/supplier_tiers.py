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
    quality_modifier            : additive quality modifier applied at job completion
                                  (Issue #151 — Parts Sourcing Quality Layer).
                                  PREMIUM = positive bonus (e.g. +0.10); STANDARD = 0.0.
    rework_probability          : probability [0.0–1.0] that a job using this tier requires
                                  rework (Issue #151). PREMIUM = lower probability; STANDARD =
                                  higher probability. Existing delivery/expedite behaviour
                                  is unchanged by these new attributes.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SupplierTierConfig:
    name: str
    sessions_to_arrive: int
    expedite_cost_multiplier: float
    expedite_min_playtime_secs: int
    # Issue #151 — Parts Sourcing Quality Layer (additive; backward-compatible defaults)
    quality_modifier: float = 0.0
    rework_probability: float = 0.0


SUPPLIER_TIERS: dict[str, SupplierTierConfig] = {
    "STANDARD": SupplierTierConfig(
        name="Standard",
        sessions_to_arrive=1,
        expedite_cost_multiplier=2.5,
        expedite_min_playtime_secs=600,  # 10 minutes
        quality_modifier=0.0,
        rework_probability=0.25,         # budget tier — higher rework risk
    ),
    "PREMIUM": SupplierTierConfig(
        name="Premium",
        sessions_to_arrive=1,
        expedite_cost_multiplier=1.5,
        expedite_min_playtime_secs=300,  # 5 minutes
        quality_modifier=0.10,           # premium tier — positive quality bonus
        rework_probability=0.05,         # premium tier — low rework risk
    ),
}
