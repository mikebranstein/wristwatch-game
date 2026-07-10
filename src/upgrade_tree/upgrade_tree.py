"""
UpgradeTree — Issue #151: Workshop Economy Expanded
====================================================

Full three-tier workshop upgrade tree extending the MVP upgrade structure (#145).

Upgrade structure (AC3 — at minimum 3 tool levels + 2 workspace levels):
  Tool upgrades (sequential — cannot skip):
    TOOL_T1  : Basic Tool Set (MVP baseline — already owned at game start)
    TOOL_T2  : Precision Tool Set (unlock after TOOL_T1)
    TOOL_T3  : Master Tool Set (unlock after TOOL_T2)

  Workspace upgrades (sequential — cannot skip):
    WORKSPACE_T1 : Standard Bench (MVP baseline — already owned at game start)
    WORKSPACE_T2 : Expanded Bench (unlock after WORKSPACE_T1)

Total: 5 upgrade slots (3 tool + 2 workspace) — well within the ≤12 ceiling (Non-Goal).

Sequencing rule (AC3):
  Each tier is locked until the previous tier in that track is purchased.
  Tracks are independent — tool and workspace upgrades do not gate each other.

Cozy Mode (AC5 — centralized enforcement):
  In Cozy Mode the purchase API accepts all valid sequence-ordered purchases without
  applying any financial penalty logic. The UpgradeTree itself does not implement
  cozy-mode display suppression — that is the responsibility of the UI layer consuming
  this module. The cozy_mode flag is accepted at purchase time for forward-compat.

Save / Load (Scenario 10 — session persistence):
  Serialises to/from a dict. Null-safe: pre-feature saves default to MVP baseline
  (TOOL_T1 and WORKSPACE_T1 already purchased).

Usage::

    tree = UpgradeTree()
    tree.can_purchase("TOOL_T2")          # True (T1 owned)
    tree.purchase("TOOL_T2")
    tree.can_purchase("TOOL_T3")          # True (T2 now owned)
    tree.is_fully_upgraded()              # False (T3 + WORKSPACE_T2 still pending)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_UPGRADES: int = 12   # Non-goal ceiling — total upgrades must not exceed this


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class UpgradeNode:
    """A single upgrade tier within one track."""
    upgrade_id: str
    track: str           # "TOOL" or "WORKSPACE"
    tier: int            # 1-based tier number within the track
    name: str
    description: str
    cost: float
    gameplay_effect: str
    prerequisite_id: Optional[str]  # upgrade_id that must be owned first; None for T1


# Default upgrade catalogue
UPGRADE_CATALOGUE: List[UpgradeNode] = [
    # ── Tool track ─────────────────────────────────────────────────────────
    UpgradeNode(
        upgrade_id="TOOL_T1",
        track="TOOL",
        tier=1,
        name="Basic Tool Set",
        description="Standard watchmaker tools included with the workshop. (MVP baseline)",
        cost=0.0,            # Already owned at game start
        gameplay_effect="Enables all basic movement repair operations.",
        prerequisite_id=None,
    ),
    UpgradeNode(
        upgrade_id="TOOL_T2",
        track="TOOL",
        tier=2,
        name="Precision Tool Set",
        description="High-precision calipers, jewelling tools, and micrometric screwdrivers.",
        cost=450.0,
        gameplay_effect=(
            "Reduces part installation time by 20%%. "
            "Unlocks jobs requiring precision-fit complications."
        ),
        prerequisite_id="TOOL_T1",
    ),
    UpgradeNode(
        upgrade_id="TOOL_T3",
        track="TOOL",
        tier=3,
        name="Master Tool Set",
        description=(
            "Specialist tourbillon and chronograph tools used by master watchmakers."
        ),
        cost=900.0,
        gameplay_effect=(
            "Unlocks Grand Complication and Tourbillon job types. "
            "Increases quality ceiling to 100 on complex jobs."
        ),
        prerequisite_id="TOOL_T2",
    ),

    # ── Workspace track ─────────────────────────────────────────────────────
    UpgradeNode(
        upgrade_id="WORKSPACE_T1",
        track="WORKSPACE",
        tier=1,
        name="Standard Bench",
        description="The basic workshop bench included at game start. (MVP baseline)",
        cost=0.0,            # Already owned at game start
        gameplay_effect="Supports a single active repair job.",
        prerequisite_id=None,
    ),
    UpgradeNode(
        upgrade_id="WORKSPACE_T2",
        track="WORKSPACE",
        tier=2,
        name="Expanded Bench",
        description="Extended bench surface with dedicated parts tray and magnification arm.",
        cost=600.0,
        gameplay_effect=(
            "Increases concurrent active job slots to 2. "
            "Reduces cleaning time on all jobs by 15%%."
        ),
        prerequisite_id="WORKSPACE_T1",
    ),
]

# Index by upgrade_id for O(1) lookup
_CATALOGUE_INDEX: Dict[str, UpgradeNode] = {u.upgrade_id: u for u in UPGRADE_CATALOGUE}


# ---------------------------------------------------------------------------
# Upgrade tree state machine
# ---------------------------------------------------------------------------

class UpgradeTree:
    """
    Tracks which upgrades are purchased and enforces sequential ordering.

    Parameters
    ----------
    owned_ids : set[str] | None
        Upgrade IDs already owned. Defaults to MVP baseline (T1 tiers).
    """

    # MVP baseline — these are owned from game start
    _MVP_BASELINE: frozenset[str] = frozenset({"TOOL_T1", "WORKSPACE_T1"})

    def __init__(self, owned_ids: set[str] | None = None) -> None:
        if owned_ids is None:
            self._owned: set[str] = set(self._MVP_BASELINE)
        else:
            self._owned = set(owned_ids) | set(self._MVP_BASELINE)

    # -----------------------------------------------------------------------
    # Queries
    # -----------------------------------------------------------------------

    def is_owned(self, upgrade_id: str) -> bool:
        """Return True if the upgrade has been purchased (or is MVP baseline)."""
        return upgrade_id in self._owned

    def can_purchase(self, upgrade_id: str) -> bool:
        """
        Return True when *upgrade_id* is a valid next purchase:
          - upgrade exists in the catalogue
          - not already owned
          - prerequisite (if any) is owned
        """
        node = _CATALOGUE_INDEX.get(upgrade_id)
        if node is None:
            return False
        if upgrade_id in self._owned:
            return False
        if node.prerequisite_id is not None and node.prerequisite_id not in self._owned:
            return False
        return True

    def purchasable_upgrades(self) -> List[UpgradeNode]:
        """Return all upgrades that can be purchased right now."""
        return [u for u in UPGRADE_CATALOGUE if self.can_purchase(u.upgrade_id)]

    def is_fully_upgraded(self) -> bool:
        """True when every upgrade in the catalogue is owned."""
        return all(u.upgrade_id in self._owned for u in UPGRADE_CATALOGUE)

    def owned_upgrades(self) -> List[UpgradeNode]:
        """Return UpgradeNode objects for all owned upgrades."""
        return [_CATALOGUE_INDEX[uid] for uid in self._owned if uid in _CATALOGUE_INDEX]

    def get_node(self, upgrade_id: str) -> Optional[UpgradeNode]:
        """Return the UpgradeNode for *upgrade_id*, or None if not found."""
        return _CATALOGUE_INDEX.get(upgrade_id)

    # -----------------------------------------------------------------------
    # Mutations
    # -----------------------------------------------------------------------

    def purchase(self, upgrade_id: str, *, cozy_mode: bool = False) -> UpgradeNode:
        """
        Mark *upgrade_id* as purchased.

        Cozy Mode (AC5): purchase is accepted in cozy_mode without additional
        restrictions. The cozy_mode flag is accepted here for forward-compat;
        UpgradeTree does not suppress purchase logic in cozy mode — financial
        consequence suppression is handled at the UI layer.

        Parameters
        ----------
        upgrade_id : str
        cozy_mode : bool

        Returns
        -------
        UpgradeNode
            The node that was purchased.

        Raises
        ------
        ValueError
            If the upgrade cannot be purchased (unknown, already owned, or
            prerequisite not met).
        """
        if not self.can_purchase(upgrade_id):
            node = _CATALOGUE_INDEX.get(upgrade_id)
            if node is None:
                raise ValueError(f"Unknown upgrade: '{upgrade_id}'")
            if upgrade_id in self._owned:
                raise ValueError(f"Upgrade '{upgrade_id}' is already owned.")
            prereq = node.prerequisite_id
            raise ValueError(
                f"Upgrade '{upgrade_id}' requires '{prereq}' to be purchased first."
            )
        self._owned.add(upgrade_id)
        return _CATALOGUE_INDEX[upgrade_id]

    # -----------------------------------------------------------------------
    # Serialisation (Scenario 10)
    # -----------------------------------------------------------------------

    def to_save_dict(self) -> dict:
        """Return a JSON-serialisable dict for the save file."""
        return {"owned_ids": sorted(self._owned)}

    @classmethod
    def from_save_dict(cls, data: dict | None) -> "UpgradeTree":
        """
        Reconstruct from a saved dict.

        Null-safe: if *data* is None or lacks 'owned_ids', returns MVP baseline state.
        """
        owned_raw = (data or {}).get("owned_ids", None)
        owned = set(owned_raw) if owned_raw else None
        return cls(owned_ids=owned)
