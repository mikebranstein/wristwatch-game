"""
ClientRoster — Issue #151: Workshop Economy Expanded
=====================================================

Manages the available client types visible to the player, gating premium clients
behind the reputation threshold defined by ReputationSystem.

Client types
------------
STANDARD : Always visible. Standard pricing tier.
PREMIUM  : Hidden until reputation score >= PREMIUM_CLIENT_THRESHOLD (5 points).
           Offers above-tier pricing multipliers and access to exclusive movement types.

Cozy Mode (AC5 — centralized enforcement):
    When cozy_mode=True, all clients are visible regardless of reputation score,
    and no locked state appears. The cozy_mode flag is a single centralized check
    passed in at query time; no per-sub-system Cozy Mode state is stored here.

Pricing multipliers
-------------------
STANDARD_PRICING_MULTIPLIER : 1.0  (baseline)
PREMIUM_PRICING_MULTIPLIER  : 1.35 (35% above-tier premium)

Usage::

    roster = ClientRoster(reputation_system)
    clients = roster.available_clients(cozy_mode=False)
    # returns only STANDARD clients until reputation >= 5
    # returns all clients once premium unlocked
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from reputation.reputation_system import ReputationSystem, PREMIUM_CLIENT_THRESHOLD

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STANDARD_PRICING_MULTIPLIER: float = 1.0
PREMIUM_PRICING_MULTIPLIER: float = 1.35


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class ClientType:
    """Describes a client archetype available for job assignment."""
    client_id: str
    name: str
    tier: str                        # "STANDARD" or "PREMIUM"
    pricing_multiplier: float
    description: str
    requires_premium_unlock: bool


# Default client catalogue (MVP content — expandable)
DEFAULT_CLIENTS: List[ClientType] = [
    ClientType(
        client_id="standard_basic",
        name="Walk-In Customer",
        tier="STANDARD",
        pricing_multiplier=STANDARD_PRICING_MULTIPLIER,
        description="Regular customer with a straightforward repair request.",
        requires_premium_unlock=False,
    ),
    ClientType(
        client_id="standard_enthusiast",
        name="Watch Enthusiast",
        tier="STANDARD",
        pricing_multiplier=STANDARD_PRICING_MULTIPLIER,
        description="A hobbyist with a vintage watch needing attention.",
        requires_premium_unlock=False,
    ),
    ClientType(
        client_id="premium_collector",
        name="Collector",
        tier="PREMIUM",
        pricing_multiplier=PREMIUM_PRICING_MULTIPLIER,
        description=(
            "A serious collector offering premium rates and access to "
            "rare movement types. Requires an established workshop reputation."
        ),
        requires_premium_unlock=True,
    ),
    ClientType(
        client_id="premium_estate",
        name="Estate Client",
        tier="PREMIUM",
        pricing_multiplier=PREMIUM_PRICING_MULTIPLIER,
        description=(
            "An estate client with heirloom pieces and above-market budgets. "
            "Unlocked by proven quality workmanship."
        ),
        requires_premium_unlock=True,
    ),
]


# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------

class ClientRoster:
    """
    Manages client visibility gated by reputation score.

    Parameters
    ----------
    reputation_system : ReputationSystem
        Live reputation state used to determine premium unlock status.
    clients : list[ClientType] | None
        Client catalogue. Defaults to DEFAULT_CLIENTS when None.
    """

    def __init__(
        self,
        reputation_system: ReputationSystem,
        clients: List[ClientType] | None = None,
    ) -> None:
        self._reputation = reputation_system
        self._clients = clients if clients is not None else list(DEFAULT_CLIENTS)

    def available_clients(self, *, cozy_mode: bool = False) -> List[ClientType]:
        """
        Return the list of clients currently visible to the player.

        In Cozy Mode (AC5) all clients are shown regardless of reputation.
        Otherwise, premium clients are hidden until the reputation threshold is met.

        Parameters
        ----------
        cozy_mode : bool
            Centralized Cozy Mode flag. When True, no locked states apply.

        Returns
        -------
        list[ClientType]
            Visible client types for the current roster state.
        """
        premium_unlocked = cozy_mode or self._reputation.premium_clients_unlocked
        return [c for c in self._clients if not c.requires_premium_unlock or premium_unlocked]

    def premium_unlock_threshold(self) -> int:
        """Return the reputation score required to unlock premium clients."""
        return PREMIUM_CLIENT_THRESHOLD

    def current_reputation_score(self) -> int:
        """Return the player's current reputation score."""
        return self._reputation.score
