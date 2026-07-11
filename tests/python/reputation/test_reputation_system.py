"""
Tests for ReputationSystem — Issue #151: Workshop Economy Expanded
===================================================================

Covers AC1, AC5, Scenario 1, Scenario 7, Scenario 8, Scenario 10 (persistence).

AC1  — 5+ high-quality jobs unlock premium clients
AC5  — Cozy Mode suppresses all reputation changes (centralized check)
S1   — Reputation unlock happy path
S7   — Reputation quality decay (quality < 40 → -1 point; lock-back below 5)
S8   — Insufficient reputation gate
S10  — Session persistence (save/load round-trip)
"""

import pytest

from src.reputation.reputation_system import (
    ReputationSystem,
    HIGH_QUALITY_THRESHOLD,
    POOR_QUALITY_THRESHOLD,
    PREMIUM_CLIENT_THRESHOLD,
    REPUTATION_FLOOR,
)


# ---------------------------------------------------------------------------
# AC1 — Scenario 1: Reputation unlock happy path
# ---------------------------------------------------------------------------

class TestReputationUnlockHappyPath:
    """AC1 / Scenario 1 — 5 high-quality jobs unlock premium clients."""

    def test_premium_not_unlocked_initially(self):
        """Brand-new system: premium not unlocked."""
        system = ReputationSystem()
        assert system.score == 0
        assert not system.premium_clients_unlocked

    def test_single_high_quality_job_increments_score(self):
        """One high-quality job increments score by 1."""
        system = ReputationSystem()
        delta = system.record_job_outcome(quality_score=HIGH_QUALITY_THRESHOLD)
        assert delta == 1
        assert system.score == 1

    def test_five_high_quality_jobs_unlock_premium(self):
        """5 high-quality jobs unlock premium clients (AC1)."""
        system = ReputationSystem()
        for _ in range(PREMIUM_CLIENT_THRESHOLD):
            system.record_job_outcome(quality_score=80)
        assert system.score == PREMIUM_CLIENT_THRESHOLD
        assert system.premium_clients_unlocked

    def test_four_high_quality_jobs_do_not_unlock_premium(self):
        """4 jobs are not enough — threshold is 5."""
        system = ReputationSystem()
        for _ in range(PREMIUM_CLIENT_THRESHOLD - 1):
            system.record_job_outcome(quality_score=80)
        assert not system.premium_clients_unlocked

    def test_score_continues_to_accumulate_beyond_threshold(self):
        """Score accumulates beyond the unlock threshold."""
        system = ReputationSystem()
        for _ in range(10):
            system.record_job_outcome(quality_score=90)
        assert system.score == 10
        assert system.premium_clients_unlocked

    def test_mid_range_quality_has_no_effect(self):
        """Quality in range [40, 70) has no impact on score."""
        system = ReputationSystem()
        delta = system.record_job_outcome(quality_score=55)
        assert delta == 0
        assert system.score == 0

    def test_quality_at_threshold_boundary_is_positive(self):
        """Quality == HIGH_QUALITY_THRESHOLD earns +1 (boundary inclusive)."""
        system = ReputationSystem()
        delta = system.record_job_outcome(quality_score=HIGH_QUALITY_THRESHOLD)
        assert delta == 1

    def test_quality_at_poor_boundary_is_negative(self):
        """Quality == POOR_QUALITY_THRESHOLD - 1 loses -1 (below threshold)."""
        system = ReputationSystem()
        # Give it a point first so we can observe the deduction
        system.record_job_outcome(quality_score=80)
        delta = system.record_job_outcome(quality_score=POOR_QUALITY_THRESHOLD - 1)
        assert delta == -1
        assert system.score == 0


# ---------------------------------------------------------------------------
# AC5 — Cozy Mode suppresses reputation changes (centralized check)
# ---------------------------------------------------------------------------

class TestCozymodeReputationSuppression:
    """AC5 — Cozy Mode suppresses all reputation mutations."""

    def test_high_quality_job_in_cozy_mode_earns_nothing(self):
        """High-quality job in Cozy Mode: delta=0, score unchanged."""
        system = ReputationSystem()
        delta = system.record_job_outcome(quality_score=90, cozy_mode=True)
        assert delta == 0
        assert system.score == 0

    def test_poor_quality_job_in_cozy_mode_loses_nothing(self):
        """Poor-quality job in Cozy Mode: no penalty applied (AC5)."""
        system = ReputationSystem(initial_score=3)
        delta = system.record_job_outcome(quality_score=10, cozy_mode=True)
        assert delta == 0
        assert system.score == 3   # unchanged

    def test_cozy_mode_false_applies_normal_logic(self):
        """Explicit cozy_mode=False uses normal reputation logic."""
        system = ReputationSystem()
        delta = system.record_job_outcome(quality_score=90, cozy_mode=False)
        assert delta == 1

    def test_cozy_mode_toggle_does_not_mutate_score(self):
        """Repeated Cozy Mode calls leave score stable."""
        system = ReputationSystem(initial_score=5)
        for _ in range(10):
            system.record_job_outcome(quality_score=10, cozy_mode=True)
        assert system.score == 5   # no decay in Cozy Mode


# ---------------------------------------------------------------------------
# Scenario 7 — Reputation quality decay
# ---------------------------------------------------------------------------

class TestReputationDecay:
    """Scenario 7 — quality < 40/100 loses -1 reputation; lock-back below 5."""

    def test_poor_quality_job_reduces_score(self):
        """Quality < POOR_QUALITY_THRESHOLD reduces score by 1 (S7)."""
        system = ReputationSystem(initial_score=3)
        delta = system.record_job_outcome(quality_score=39)
        assert delta == -1
        assert system.score == 2

    def test_score_does_not_go_below_floor(self):
        """Score is floored at REPUTATION_FLOOR (0); cannot be negative."""
        system = ReputationSystem(initial_score=0)
        delta = system.record_job_outcome(quality_score=10)
        assert delta == -1
        assert system.score == REPUTATION_FLOOR
        assert system.score >= 0

    def test_premium_clients_hidden_after_decay_below_threshold(self):
        """
        Decay below PREMIUM_CLIENT_THRESHOLD hides premium clients (S7).
        """
        system = ReputationSystem(initial_score=PREMIUM_CLIENT_THRESHOLD)
        assert system.premium_clients_unlocked   # just above threshold
        # One poor-quality job drops score to threshold - 1
        system.record_job_outcome(quality_score=20)
        assert system.score == PREMIUM_CLIENT_THRESHOLD - 1
        assert not system.premium_clients_unlocked   # locked out again

    def test_premium_relocks_and_unlocks_again_on_recovery(self):
        """Score oscillation: drops below then recovers to threshold."""
        system = ReputationSystem(initial_score=PREMIUM_CLIENT_THRESHOLD)
        assert system.premium_clients_unlocked
        system.record_job_outcome(quality_score=20)   # drop to 4
        assert not system.premium_clients_unlocked
        system.record_job_outcome(quality_score=80)   # recover to 5
        assert system.premium_clients_unlocked

    def test_zero_quality_score_loses_point(self):
        """Edge case: quality_score=0 triggers the -1 penalty."""
        system = ReputationSystem(initial_score=2)
        delta = system.record_job_outcome(quality_score=0)
        assert delta == -1
        assert system.score == 1

    def test_quality_exactly_at_poor_threshold_no_penalty(self):
        """Quality exactly == POOR_QUALITY_THRESHOLD does NOT trigger penalty."""
        system = ReputationSystem(initial_score=3)
        delta = system.record_job_outcome(quality_score=POOR_QUALITY_THRESHOLD)
        assert delta == 0   # boundary is exclusive (< 40, not <=40)
        assert system.score == 3


# ---------------------------------------------------------------------------
# Scenario 8 — Insufficient reputation gate
# ---------------------------------------------------------------------------

class TestPremiumReputationGate:
    """Scenario 8 — premium_clients_unlocked is False until threshold met."""

    def test_premium_gate_with_score_below_threshold(self):
        """Score = 4: premium clients NOT unlocked."""
        system = ReputationSystem(initial_score=PREMIUM_CLIENT_THRESHOLD - 1)
        assert not system.premium_clients_unlocked

    def test_premium_gate_exactly_at_threshold(self):
        """Score == threshold: premium clients unlocked (boundary inclusive)."""
        system = ReputationSystem(initial_score=PREMIUM_CLIENT_THRESHOLD)
        assert system.premium_clients_unlocked

    def test_premium_gate_above_threshold(self):
        """Score > threshold: premium clients unlocked."""
        system = ReputationSystem(initial_score=PREMIUM_CLIENT_THRESHOLD + 3)
        assert system.premium_clients_unlocked

    def test_score_zero_premium_not_unlocked(self):
        """New player has zero score: premium not unlocked."""
        system = ReputationSystem()
        assert system.score == 0
        assert not system.premium_clients_unlocked


# ---------------------------------------------------------------------------
# Scenario 10 — Session persistence
# ---------------------------------------------------------------------------

class TestReputationPersistence:
    """Scenario 10 — save/load round-trip preserves reputation score."""

    def test_save_load_round_trip(self):
        """to_save_dict / from_save_dict preserves score exactly."""
        system = ReputationSystem(initial_score=7)
        saved = system.to_save_dict()
        restored = ReputationSystem.from_save_dict(saved)
        assert restored.score == 7

    def test_null_save_data_returns_zero_score(self):
        """None save data (pre-feature save) returns score=0."""
        restored = ReputationSystem.from_save_dict(None)
        assert restored.score == 0

    def test_empty_dict_save_data_returns_zero_score(self):
        """Empty dict save data returns score=0."""
        restored = ReputationSystem.from_save_dict({})
        assert restored.score == 0

    def test_save_dict_structure(self):
        """to_save_dict returns the expected dict structure."""
        system = ReputationSystem(initial_score=3)
        saved = system.to_save_dict()
        assert "score" in saved
        assert saved["score"] == 3

    def test_premium_unlock_state_preserved_after_load(self):
        """Premium unlock status is correctly restored from saved score."""
        system = ReputationSystem(initial_score=PREMIUM_CLIENT_THRESHOLD)
        saved = system.to_save_dict()
        restored = ReputationSystem.from_save_dict(saved)
        assert restored.premium_clients_unlocked

    def test_score_floor_applied_on_load(self):
        """Negative score in save data is clamped to floor on load."""
        # Defensive: shouldn't happen, but guard against corrupt saves
        restored = ReputationSystem.from_save_dict({"score": -5})
        assert restored.score == REPUTATION_FLOOR
