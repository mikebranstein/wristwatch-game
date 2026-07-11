"""
Tests for SaveSystem backward-compatibility — Issue #151: Workshop Economy Expanded
====================================================================================

Verifies that pre-feature saves (saves lacking reputation, upgrade_tree,
economy_analytics, and sourcing_history keys) are handled null-safely when
loaded by the updated SaveSystem (Scenario 10 — session persistence).

These tests complement the existing test_save_system.py tests and focus
exclusively on the Issue #151 backward-compatibility requirements.
"""

import pytest

from save.save_system import SaveSystem
from reputation.reputation_system import ReputationSystem
from upgrade_tree.upgrade_tree import UpgradeTree
from economy_analytics.economy_analytics import EconomyAnalytics


class TestSaveSystemIssue151BackwardCompat:
    """Scenario 10 — pre-feature saves get null-safe defaults for new keys."""

    save_system = SaveSystem()

    def test_pre_feature_save_gets_reputation_key(self):
        """Pre-feature save: 'reputation' key added as None after load."""
        _, _, updated = self.save_system.load_session({})
        assert "reputation" in updated
        # None signals "no saved reputation state" — sub-system uses default

    def test_pre_feature_save_gets_upgrade_tree_key(self):
        """Pre-feature save: 'upgrade_tree' key added as None after load."""
        _, _, updated = self.save_system.load_session({})
        assert "upgrade_tree" in updated

    def test_pre_feature_save_gets_economy_analytics_key(self):
        """Pre-feature save: 'economy_analytics' key added as None after load."""
        _, _, updated = self.save_system.load_session({})
        assert "economy_analytics" in updated

    def test_pre_feature_save_gets_sourcing_history_key(self):
        """Pre-feature save: 'sourcing_history' key added as None after load."""
        _, _, updated = self.save_system.load_session({})
        assert "sourcing_history" in updated

    def test_none_save_data_gets_all_new_keys(self):
        """None raw_save_data (first run): all four new keys present."""
        _, _, updated = self.save_system.load_session(None)
        for key in ("reputation", "upgrade_tree", "economy_analytics", "sourcing_history"):
            assert key in updated

    def test_existing_new_keys_are_not_overwritten(self):
        """Saves that already have the new keys are not overwritten."""
        existing_rep = {"score": 7}
        raw = {"reputation": existing_rep, "order_queue": None}
        _, _, updated = self.save_system.load_session(raw)
        # Should preserve the existing reputation data
        assert updated["reputation"] == existing_rep

    def test_reputation_from_save_dict_null_safe(self):
        """ReputationSystem.from_save_dict(None) returns score=0."""
        _, _, updated = self.save_system.load_session(None)
        rep = ReputationSystem.from_save_dict(updated.get("reputation"))
        assert rep.score == 0

    def test_upgrade_tree_from_save_dict_null_safe(self):
        """UpgradeTree.from_save_dict(None) returns MVP baseline."""
        _, _, updated = self.save_system.load_session(None)
        tree = UpgradeTree.from_save_dict(updated.get("upgrade_tree"))
        assert tree.is_owned("TOOL_T1")
        assert tree.is_owned("WORKSPACE_T1")
        assert not tree.is_owned("TOOL_T2")

    def test_economy_analytics_from_save_dict_null_safe(self):
        """EconomyAnalytics.from_save_dict(None) returns empty analytics."""
        _, _, updated = self.save_system.load_session(None)
        analytics = EconomyAnalytics.from_save_dict(updated.get("economy_analytics"))
        assert analytics.compute_report()["total_jobs"] == 0

    def test_full_round_trip_with_all_four_subsystems(self):
        """
        Full round-trip: save all four sub-systems' state, reload, verify correct
        restoration — complete Scenario 10 session persistence test.
        """
        # Build initial state
        rep = ReputationSystem(initial_score=6)
        tree = UpgradeTree()
        tree.purchase("TOOL_T2")
        analytics = EconomyAnalytics()
        analytics.record_job({
            "job_id": "j1", "job_type": "Basic Service",
            "client_id": "c1", "client_tier": "STANDARD",
            "revenue": 150.0, "parts_cost": 30.0,
            "supplier_tier": "STANDARD", "quality_score": 80,
            "session_index": 0,
        })

        # Write to save state
        save_data = {
            "reputation": rep.to_save_dict(),
            "upgrade_tree": tree.to_save_dict(),
            "economy_analytics": analytics.to_save_dict(),
            "sourcing_history": [],
        }

        # Simulate reload
        _, _, updated = self.save_system.load_session(save_data)

        # Restore sub-systems
        rep2 = ReputationSystem.from_save_dict(updated["reputation"])
        tree2 = UpgradeTree.from_save_dict(updated["upgrade_tree"])
        analytics2 = EconomyAnalytics.from_save_dict(updated["economy_analytics"])

        # Verify state preserved
        assert rep2.score == 6
        assert rep2.premium_clients_unlocked
        assert tree2.is_owned("TOOL_T2")
        assert not tree2.is_owned("TOOL_T3")
        assert analytics2.compute_report()["total_jobs"] == 1
