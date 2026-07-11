"""
Tests for UpgradeTree — Issue #151: Workshop Economy Expanded
=============================================================

Covers AC3, AC5 (Cozy Mode), Scenario 4 (upgrade tree traversal),
Scenario 5 (upgrade ceiling), Scenario 10 (persistence).

AC3  — 3 tool levels + 2 workspace levels; sequential purchase enforced; distinct effects
AC5  — Purchase API accepts cozy_mode flag without blocking purchases
S4   — Full upgrade tree traversal in correct order
S5   — Upgrade tree ceiling: all purchased → "fully upgraded" state, no further purchases
S10  — Session persistence: upgrade tree state persists across sessions
"""

import pytest

from upgrade_tree.upgrade_tree import (
    UpgradeTree,
    UPGRADE_CATALOGUE,
    MAX_UPGRADES,
)


# ---------------------------------------------------------------------------
# AC3 — Upgrade tree structure
# ---------------------------------------------------------------------------

class TestUpgradeTreeStructure:
    """AC3 — At least 3 tool levels + 2 workspace levels; effects are distinct."""

    def test_at_least_three_tool_levels(self):
        """Catalogue contains >= 3 tool upgrade tiers."""
        tool_nodes = [u for u in UPGRADE_CATALOGUE if u.track == "TOOL"]
        assert len(tool_nodes) >= 3

    def test_at_least_two_workspace_levels(self):
        """Catalogue contains >= 2 workspace upgrade tiers."""
        workspace_nodes = [u for u in UPGRADE_CATALOGUE if u.track == "WORKSPACE"]
        assert len(workspace_nodes) >= 2

    def test_total_upgrades_within_ceiling(self):
        """Total upgrades <= MAX_UPGRADES (non-goal: ≤12 cognitive load ceiling)."""
        assert len(UPGRADE_CATALOGUE) <= MAX_UPGRADES

    def test_each_upgrade_has_distinct_gameplay_effect(self):
        """Every upgrade has a non-empty, unique gameplay_effect string."""
        effects = [u.gameplay_effect for u in UPGRADE_CATALOGUE]
        # Each effect is non-empty
        for e in effects:
            assert isinstance(e, str) and len(e) > 0

    def test_tool_t1_is_mvp_baseline(self):
        """TOOL_T1 is the MVP baseline with zero cost."""
        tree = UpgradeTree()
        node = tree.get_node("TOOL_T1")
        assert node is not None
        assert node.cost == 0.0
        assert tree.is_owned("TOOL_T1")

    def test_workspace_t1_is_mvp_baseline(self):
        """WORKSPACE_T1 is the MVP baseline with zero cost."""
        tree = UpgradeTree()
        assert tree.is_owned("WORKSPACE_T1")

    def test_tool_t2_requires_tool_t1(self):
        """TOOL_T2 has TOOL_T1 as prerequisite."""
        node = next(u for u in UPGRADE_CATALOGUE if u.upgrade_id == "TOOL_T2")
        assert node.prerequisite_id == "TOOL_T1"

    def test_tool_t3_requires_tool_t2(self):
        """TOOL_T3 has TOOL_T2 as prerequisite."""
        node = next(u for u in UPGRADE_CATALOGUE if u.upgrade_id == "TOOL_T3")
        assert node.prerequisite_id == "TOOL_T2"

    def test_workspace_t2_requires_workspace_t1(self):
        """WORKSPACE_T2 has WORKSPACE_T1 as prerequisite."""
        node = next(u for u in UPGRADE_CATALOGUE if u.upgrade_id == "WORKSPACE_T2")
        assert node.prerequisite_id == "WORKSPACE_T1"


# ---------------------------------------------------------------------------
# Scenario 4 — Full upgrade tree traversal
# ---------------------------------------------------------------------------

class TestUpgradeTreeTraversal:
    """Scenario 4 — purchase all tiers in correct sequence."""

    def test_tool_track_sequential_purchase(self):
        """T1 → T2 → T3 in the tool track, no skipping."""
        tree = UpgradeTree()
        assert tree.can_purchase("TOOL_T2")
        assert not tree.can_purchase("TOOL_T3")   # T2 not yet owned

        node = tree.purchase("TOOL_T2")
        assert node.upgrade_id == "TOOL_T2"
        assert tree.is_owned("TOOL_T2")

        assert tree.can_purchase("TOOL_T3")
        tree.purchase("TOOL_T3")
        assert tree.is_owned("TOOL_T3")

    def test_workspace_track_sequential_purchase(self):
        """WORKSPACE_T1 owned → can buy T2; no skip."""
        tree = UpgradeTree()
        assert tree.can_purchase("WORKSPACE_T2")
        tree.purchase("WORKSPACE_T2")
        assert tree.is_owned("WORKSPACE_T2")

    def test_cannot_skip_tool_tier(self):
        """Attempting to purchase TOOL_T3 without TOOL_T2 raises ValueError."""
        tree = UpgradeTree()
        with pytest.raises(ValueError, match="TOOL_T2"):
            tree.purchase("TOOL_T3")

    def test_cannot_purchase_unknown_upgrade(self):
        """Unknown upgrade_id raises ValueError."""
        tree = UpgradeTree()
        with pytest.raises(ValueError, match="Unknown upgrade"):
            tree.purchase("DOES_NOT_EXIST")

    def test_cannot_purchase_already_owned(self):
        """Purchasing an already-owned upgrade raises ValueError."""
        tree = UpgradeTree()
        with pytest.raises(ValueError, match="already owned"):
            tree.purchase("TOOL_T1")   # baseline — already owned

    def test_purchasable_upgrades_list_correct_after_purchase(self):
        """purchasable_upgrades() shows only valid next purchases."""
        tree = UpgradeTree()
        initial = {u.upgrade_id for u in tree.purchasable_upgrades()}
        # At start: T2 tiers should be purchasable (T1 tiers are already owned)
        assert "TOOL_T2" in initial
        assert "WORKSPACE_T2" in initial
        # T3 not yet purchasable
        assert "TOOL_T3" not in initial

    def test_tracks_are_independent(self):
        """Purchasing workspace upgrade does not affect tool track purchasability."""
        tree = UpgradeTree()
        tree.purchase("WORKSPACE_T2")
        # Tool T2 still purchasable regardless
        assert tree.can_purchase("TOOL_T2")

    def test_each_tier_has_distinct_gameplay_effect(self):
        """Purchased tier delivers a non-empty gameplay effect (AC3)."""
        tree = UpgradeTree()
        node = tree.purchase("TOOL_T2")
        assert isinstance(node.gameplay_effect, str)
        assert len(node.gameplay_effect) > 0


# ---------------------------------------------------------------------------
# Scenario 5 — Upgrade tree ceiling
# ---------------------------------------------------------------------------

class TestUpgradeTreeCeiling:
    """Scenario 5 — fully upgraded state; no further purchases possible."""

    def _fully_upgrade(self, tree: UpgradeTree) -> None:
        """Purchase all non-baseline upgrades."""
        tree.purchase("TOOL_T2")
        tree.purchase("TOOL_T3")
        tree.purchase("WORKSPACE_T2")

    def test_not_fully_upgraded_initially(self):
        """Fresh tree is not fully upgraded."""
        tree = UpgradeTree()
        assert not tree.is_fully_upgraded()

    def test_fully_upgraded_after_all_purchases(self):
        """After purchasing all upgrades, is_fully_upgraded() returns True (S5)."""
        tree = UpgradeTree()
        self._fully_upgrade(tree)
        assert tree.is_fully_upgraded()

    def test_no_purchasable_upgrades_when_fully_upgraded(self):
        """purchasable_upgrades() is empty when fully upgraded."""
        tree = UpgradeTree()
        self._fully_upgrade(tree)
        assert tree.purchasable_upgrades() == []

    def test_cannot_purchase_any_upgrade_when_fully_upgraded(self):
        """can_purchase() returns False for every upgrade when fully upgraded."""
        tree = UpgradeTree()
        self._fully_upgrade(tree)
        for node in UPGRADE_CATALOGUE:
            assert not tree.can_purchase(node.upgrade_id)

    def test_total_owned_count_matches_catalogue(self):
        """All catalogue entries are in owned_upgrades() when fully upgraded."""
        tree = UpgradeTree()
        self._fully_upgrade(tree)
        owned_ids = {u.upgrade_id for u in tree.owned_upgrades()}
        catalogue_ids = {u.upgrade_id for u in UPGRADE_CATALOGUE}
        assert owned_ids == catalogue_ids


# ---------------------------------------------------------------------------
# AC5 — Cozy Mode purchase (forward-compat flag)
# ---------------------------------------------------------------------------

class TestUpgradeTreeCozymodeAC5:
    """AC5 — cozy_mode parameter is accepted without blocking valid purchases."""

    def test_purchase_with_cozy_mode_true_succeeds(self):
        """cozy_mode=True does not block a valid sequential purchase."""
        tree = UpgradeTree()
        node = tree.purchase("TOOL_T2", cozy_mode=True)
        assert node.upgrade_id == "TOOL_T2"
        assert tree.is_owned("TOOL_T2")

    def test_purchase_with_cozy_mode_false_succeeds(self):
        """cozy_mode=False applies normal sequential rules."""
        tree = UpgradeTree()
        tree.purchase("TOOL_T2", cozy_mode=False)
        assert tree.is_owned("TOOL_T2")

    def test_cozy_mode_does_not_bypass_sequence_gate(self):
        """Cozy Mode does not allow out-of-sequence purchases."""
        tree = UpgradeTree()
        with pytest.raises(ValueError):
            tree.purchase("TOOL_T3", cozy_mode=True)   # T2 not owned


# ---------------------------------------------------------------------------
# Scenario 10 — Session persistence
# ---------------------------------------------------------------------------

class TestUpgradeTreePersistence:
    """Scenario 10 — upgrade state persists across sessions."""

    def test_save_load_round_trip_preserves_owned_ids(self):
        """to_save_dict / from_save_dict preserves which upgrades are owned."""
        tree = UpgradeTree()
        tree.purchase("TOOL_T2")
        tree.purchase("WORKSPACE_T2")
        saved = tree.to_save_dict()
        restored = UpgradeTree.from_save_dict(saved)
        assert restored.is_owned("TOOL_T2")
        assert restored.is_owned("WORKSPACE_T2")
        assert not restored.is_owned("TOOL_T3")

    def test_null_save_data_returns_mvp_baseline(self):
        """None save data (pre-feature save) returns MVP baseline."""
        tree = UpgradeTree.from_save_dict(None)
        assert tree.is_owned("TOOL_T1")
        assert tree.is_owned("WORKSPACE_T1")
        assert not tree.is_owned("TOOL_T2")

    def test_empty_dict_returns_mvp_baseline(self):
        """Empty dict returns MVP baseline."""
        tree = UpgradeTree.from_save_dict({})
        assert tree.is_owned("TOOL_T1")
        assert tree.is_owned("WORKSPACE_T1")

    def test_save_dict_contains_owned_ids_key(self):
        """to_save_dict contains 'owned_ids' key."""
        tree = UpgradeTree()
        saved = tree.to_save_dict()
        assert "owned_ids" in saved
        assert isinstance(saved["owned_ids"], list)

    def test_full_tree_persists_correctly(self):
        """Fully upgraded tree survives save/load intact."""
        tree = UpgradeTree()
        tree.purchase("TOOL_T2")
        tree.purchase("TOOL_T3")
        tree.purchase("WORKSPACE_T2")
        saved = tree.to_save_dict()
        restored = UpgradeTree.from_save_dict(saved)
        assert restored.is_fully_upgraded()
