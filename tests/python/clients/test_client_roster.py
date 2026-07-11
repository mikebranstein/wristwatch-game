"""
Tests for ClientRoster — Issue #151: Workshop Economy Expanded
==============================================================

Covers AC1 (premium client unlock / gate), AC5 (Cozy Mode roster display),
Scenario 1 (happy path unlock), Scenario 8 (gate with insufficient reputation).

AC1  — Premium clients visible once reputation >= 5
AC5  — In Cozy Mode, all clients visible regardless of reputation
S1   — Premium client appears in roster after 5 high-quality jobs
S8   — Premium clients hidden until threshold; clear indication what threshold is
"""

import pytest

from reputation.reputation_system import ReputationSystem, PREMIUM_CLIENT_THRESHOLD
from clients.client_roster import (
    ClientRoster,
    DEFAULT_CLIENTS,
    STANDARD_PRICING_MULTIPLIER,
    PREMIUM_PRICING_MULTIPLIER,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_roster_with_score(score: int) -> ClientRoster:
    """Return a ClientRoster backed by a ReputationSystem at *score*."""
    rep = ReputationSystem(initial_score=score)
    return ClientRoster(rep)


# ---------------------------------------------------------------------------
# AC1 / Scenario 1 — Premium unlock happy path
# ---------------------------------------------------------------------------

class TestClientRosterPremiumUnlock:
    """AC1 / Scenario 1 — premium clients appear once reputation >= 5."""

    def test_only_standard_clients_visible_initially(self):
        """Score=0: only STANDARD-tier clients visible."""
        roster = make_roster_with_score(0)
        visible = roster.available_clients()
        assert all(c.tier == "STANDARD" for c in visible)
        assert len(visible) > 0

    def test_premium_clients_hidden_below_threshold(self):
        """Score = threshold - 1: premium clients still hidden."""
        roster = make_roster_with_score(PREMIUM_CLIENT_THRESHOLD - 1)
        visible = roster.available_clients()
        assert all(c.tier == "STANDARD" for c in visible)

    def test_premium_clients_visible_at_threshold(self):
        """Score == threshold: premium clients now visible (AC1)."""
        roster = make_roster_with_score(PREMIUM_CLIENT_THRESHOLD)
        visible = roster.available_clients()
        premium = [c for c in visible if c.tier == "PREMIUM"]
        assert len(premium) >= 1

    def test_premium_clients_visible_above_threshold(self):
        """Score > threshold: premium clients visible."""
        roster = make_roster_with_score(10)
        visible = roster.available_clients()
        tiers = {c.tier for c in visible}
        assert "PREMIUM" in tiers

    def test_premium_pricing_multiplier_higher_than_standard(self):
        """Premium clients have above-tier pricing multipliers (AC1)."""
        roster = make_roster_with_score(PREMIUM_CLIENT_THRESHOLD)
        visible = roster.available_clients()
        for client in visible:
            if client.tier == "PREMIUM":
                assert client.pricing_multiplier > STANDARD_PRICING_MULTIPLIER

    def test_premium_threshold_is_accessible(self):
        """roster.premium_unlock_threshold() returns the threshold value."""
        roster = make_roster_with_score(0)
        assert roster.premium_unlock_threshold() == PREMIUM_CLIENT_THRESHOLD

    def test_current_reputation_score_exposed(self):
        """roster.current_reputation_score() matches underlying system."""
        roster = make_roster_with_score(3)
        assert roster.current_reputation_score() == 3


# ---------------------------------------------------------------------------
# AC5 — Cozy Mode roster (all clients visible)
# ---------------------------------------------------------------------------

class TestClientRosterCozymodeAC5:
    """AC5 — In Cozy Mode all clients are visible; no locked states."""

    def test_cozy_mode_shows_all_clients_at_score_zero(self):
        """Score=0 in Cozy Mode: premium clients still shown (AC5)."""
        roster = make_roster_with_score(0)
        visible = roster.available_clients(cozy_mode=True)
        tiers = {c.tier for c in visible}
        assert "PREMIUM" in tiers

    def test_cozy_mode_shows_same_clients_as_unlocked_state(self):
        """Cozy Mode at score=0 shows the same clients as score >= threshold."""
        roster_cozy = make_roster_with_score(0)
        roster_unlocked = make_roster_with_score(PREMIUM_CLIENT_THRESHOLD)
        cozy_ids = {c.client_id for c in roster_cozy.available_clients(cozy_mode=True)}
        unlocked_ids = {c.client_id for c in roster_unlocked.available_clients()}
        assert cozy_ids == unlocked_ids

    def test_cozy_mode_false_restores_gate(self):
        """Explicitly passing cozy_mode=False re-applies the gate."""
        roster = make_roster_with_score(0)
        non_cozy = roster.available_clients(cozy_mode=False)
        assert all(c.tier == "STANDARD" for c in non_cozy)

    def test_cozy_mode_does_not_mutate_reputation_score(self):
        """Viewing clients in Cozy Mode does not change the reputation score."""
        rep = ReputationSystem(initial_score=2)
        roster = ClientRoster(rep)
        _ = roster.available_clients(cozy_mode=True)
        assert rep.score == 2   # unchanged


# ---------------------------------------------------------------------------
# Scenario 8 — Premium client gate visible to player
# ---------------------------------------------------------------------------

class TestPremiumClientGate:
    """Scenario 8 — UI gate: premium hidden, threshold information available."""

    def test_gate_blocks_premium_client_appearance(self):
        """Below-threshold roster contains no PREMIUM clients."""
        roster = make_roster_with_score(PREMIUM_CLIENT_THRESHOLD - 1)
        visible = roster.available_clients()
        assert not any(c.tier == "PREMIUM" for c in visible)

    def test_gate_exposes_threshold_for_display(self):
        """UI can read threshold for "Reputation required: X" indicator."""
        roster = make_roster_with_score(0)
        threshold = roster.premium_unlock_threshold()
        current = roster.current_reputation_score()
        # Gate info available for display:
        assert threshold == PREMIUM_CLIENT_THRESHOLD
        assert current < threshold

    def test_premium_client_has_description_text(self):
        """Premium clients have a description that can be shown in UI."""
        roster = make_roster_with_score(PREMIUM_CLIENT_THRESHOLD)
        premium = [c for c in roster.available_clients() if c.tier == "PREMIUM"]
        for client in premium:
            assert isinstance(client.description, str)
            assert len(client.description) > 0
