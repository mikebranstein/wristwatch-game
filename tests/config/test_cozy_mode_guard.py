"""
Tests for CozymodeGuard — Issue #151: Workshop Economy Expanded (AC5)
=====================================================================

Verifies the centralized Cozy Mode enforcement utility:
  - Single check reads cozy_mode from game_state dict
  - Null-safe (None game_state or missing key defaults to False)
  - set_active() returns updated state without mutating input
  - All sub-systems use the same flag value (integration spot-check)

AC5 — Cozy Mode enforcement uses a single centralized check for all four sub-systems.
"""

import pytest

from src.config.cozy_mode_guard import CozymodeGuard, COZY_MODE_KEY
from src.reputation.reputation_system import ReputationSystem
from src.clients.client_roster import ClientRoster
from src.upgrade_tree.upgrade_tree import UpgradeTree


class TestCozymodeGuard:
    """CozymodeGuard reads and writes cozy_mode from/to game_state."""

    def test_is_active_returns_false_for_none_state(self):
        """None game_state → Cozy Mode off (null-safe)."""
        guard = CozymodeGuard()
        assert not guard.is_active(None)

    def test_is_active_returns_false_when_key_absent(self):
        """Missing key in game_state → Cozy Mode off."""
        guard = CozymodeGuard()
        assert not guard.is_active({})

    def test_is_active_returns_false_when_key_false(self):
        """Key present and False → Cozy Mode off."""
        guard = CozymodeGuard()
        assert not guard.is_active({COZY_MODE_KEY: False})

    def test_is_active_returns_true_when_key_true(self):
        """Key present and True → Cozy Mode on."""
        guard = CozymodeGuard()
        assert guard.is_active({COZY_MODE_KEY: True})

    def test_set_active_returns_new_dict(self):
        """set_active() returns a new dict (does not mutate input)."""
        guard = CozymodeGuard()
        state = {"other": 123}
        updated = guard.set_active(state, True)
        assert updated[COZY_MODE_KEY] is True
        # Original not mutated
        assert COZY_MODE_KEY not in state

    def test_set_active_false_clears_cozy_mode(self):
        """set_active(False) sets cozy_mode to False."""
        guard = CozymodeGuard()
        state = {COZY_MODE_KEY: True}
        updated = guard.set_active(state, False)
        assert updated[COZY_MODE_KEY] is False

    def test_set_active_preserves_existing_keys(self):
        """set_active() preserves all other keys in game_state."""
        guard = CozymodeGuard()
        state = {"order_queue": [], "completed_watches": []}
        updated = guard.set_active(state, True)
        assert updated["order_queue"] == []
        assert updated["completed_watches"] == []


class TestCozymodeGuardIntegration:
    """
    AC5 — Spot-check that the centralized flag propagates consistently to sub-systems.
    All four sub-systems receive the same cozy_mode value from a single guard call.
    """

    def test_cozy_mode_on_suppresses_reputation_gain(self):
        """is_active()=True → reputation system earns no points."""
        guard = CozymodeGuard()
        game_state = guard.set_active({}, True)
        rep = ReputationSystem()
        delta = rep.record_job_outcome(quality_score=90, cozy_mode=guard.is_active(game_state))
        assert delta == 0
        assert rep.score == 0

    def test_cozy_mode_on_shows_all_clients(self):
        """is_active()=True → roster shows premium clients at score=0."""
        guard = CozymodeGuard()
        game_state = guard.set_active({}, True)
        rep = ReputationSystem(initial_score=0)
        roster = ClientRoster(rep)
        clients = roster.available_clients(cozy_mode=guard.is_active(game_state))
        tiers = {c.tier for c in clients}
        assert "PREMIUM" in tiers

    def test_cozy_mode_off_applies_normal_reputation_logic(self):
        """is_active()=False → normal reputation and roster behavior."""
        guard = CozymodeGuard()
        game_state = guard.set_active({}, False)
        rep = ReputationSystem(initial_score=0)
        roster = ClientRoster(rep)
        # reputation gain works
        rep.record_job_outcome(quality_score=90, cozy_mode=guard.is_active(game_state))
        assert rep.score == 1
        # roster still gates premium clients (score=1 < threshold 5)
        clients = roster.available_clients(cozy_mode=guard.is_active(game_state))
        assert all(c.tier == "STANDARD" for c in clients)

    def test_single_guard_call_consistent_across_sub_systems(self):
        """
        The same is_active() call value used across all sub-systems ensures
        consistent enforcement (AC5 centralized check pattern).
        """
        guard = CozymodeGuard()
        game_state = {COZY_MODE_KEY: True}

        # One guard call — all sub-systems receive the same value
        cozy = guard.is_active(game_state)
        assert cozy is True

        # Sub-system 1: reputation
        rep = ReputationSystem(initial_score=5)
        rep.record_job_outcome(quality_score=10, cozy_mode=cozy)   # no penalty
        assert rep.score == 5  # unchanged

        # Sub-system 2: client roster
        roster = ClientRoster(ReputationSystem(initial_score=0))
        clients = roster.available_clients(cozy_mode=cozy)
        assert any(c.tier == "PREMIUM" for c in clients)

        # Sub-system 3: upgrade tree
        tree = UpgradeTree()
        node = tree.purchase("TOOL_T2", cozy_mode=cozy)
        assert node is not None
