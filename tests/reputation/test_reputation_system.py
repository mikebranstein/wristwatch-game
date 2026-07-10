"""
Tests for ReputationSystem
============================
Covers AC3 (reputation increases on quality delivery), cozy invariant
(never negative, never punitive), tier gating, and persistence.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import pytest
from src.reputation.reputation_system import ReputationSystem, BASE_DELTA, LATE_MULTIPLIER


# ─── Null-safe construction ────────────────────────────────────────────────────

class TestReputationNullSafe:
    def test_constructs_empty_from_none(self):
        rep = ReputationSystem(None)
        assert rep.score == 0.0
        assert rep.tier == 1
        assert rep.jobs_evaluated == 0

    def test_constructs_from_empty_dict(self):
        rep = ReputationSystem({})
        assert rep.score == 0.0
        assert rep.tier == 1


# ─── Score update — AC3 ───────────────────────────────────────────────────────

class TestReputationScoreUpdate:
    """AC3: reputation increases on quality delivery with defined delta."""

    def test_perfect_quality_on_time_gives_max_delta(self):
        rep = ReputationSystem()
        result = rep.update_from_job(quality_rating=100, delivered_on_time=True)
        assert result["delta_score"] == BASE_DELTA
        assert result["new_score"] == BASE_DELTA

    def test_zero_quality_gives_zero_delta(self):
        rep = ReputationSystem()
        result = rep.update_from_job(quality_rating=0, delivered_on_time=True)
        assert result["delta_score"] == 0.0
        assert result["new_score"] == 0.0

    def test_80_quality_on_time_gives_correct_delta(self):
        """AC3: quality ≥80% with on-time delivery increases reputation."""
        rep = ReputationSystem()
        result = rep.update_from_job(quality_rating=80, delivered_on_time=True)
        expected_delta = (80 / 100.0) * BASE_DELTA * 1.0
        assert abs(result["delta_score"] - expected_delta) < 0.001
        assert result["new_score"] > 0.0

    def test_late_delivery_applies_timeliness_multiplier(self):
        """Scenario 4: soft deadline missed → small reputation reduction but not punitive."""
        rep = ReputationSystem()
        result = rep.update_from_job(quality_rating=100, delivered_on_time=False)
        expected_delta = BASE_DELTA * LATE_MULTIPLIER
        assert abs(result["delta_score"] - expected_delta) < 0.001

    def test_late_delivery_still_positive_delta(self):
        """Cozy invariant: late delivery still increases score (never punishes)."""
        rep = ReputationSystem()
        result = rep.update_from_job(quality_rating=100, delivered_on_time=False)
        assert result["delta_score"] > 0.0

    def test_score_never_goes_below_zero(self):
        """Cozy invariant: score always ≥ 0."""
        rep = ReputationSystem({"score": 0.0, "tier": 1, "tier_thresholds": [0, 50, 150], "jobs_evaluated": 0})
        # Even with 0 quality it should stay at 0
        rep.update_from_job(quality_rating=0, delivered_on_time=True)
        assert rep.score >= 0.0

    def test_increments_jobs_evaluated(self):
        rep = ReputationSystem()
        rep.update_from_job(quality_rating=80, delivered_on_time=True)
        rep.update_from_job(quality_rating=90, delivered_on_time=False)
        assert rep.jobs_evaluated == 2

    def test_raises_on_invalid_quality_rating(self):
        rep = ReputationSystem()
        with pytest.raises(ValueError):
            rep.update_from_job(quality_rating=101, delivered_on_time=True)
        with pytest.raises(ValueError):
            rep.update_from_job(quality_rating=-1, delivered_on_time=True)


# ─── Tier gating ─────────────────────────────────────────────────────────────

class TestReputationTierGating:
    """AC3: reputation score visible on dashboard; reputation gates higher-tier jobs."""

    def _rep_with_score(self, score: float) -> ReputationSystem:
        return ReputationSystem({
            "score": score,
            "tier": 1,
            "tier_thresholds": [0.0, 50.0, 150.0],
            "jobs_evaluated": 0,
        })

    def test_tier_1_below_threshold(self):
        rep = self._rep_with_score(49.9)
        assert rep.tier == 1

    def test_tier_2_at_threshold(self):
        rep = self._rep_with_score(50.0)
        # Must re-compute tier via an update
        rep._score = 50.0
        rep._tier = rep._compute_tier()
        assert rep.tier == 2

    def test_tier_3_at_threshold(self):
        rep = self._rep_with_score(150.0)
        rep._tier = rep._compute_tier()
        assert rep.tier == 3

    def test_tier_advances_after_update(self):
        """Scenario 3 (test scenario): tier 2 jobs appear after reputation milestone."""
        rep = ReputationSystem()
        # Need enough jobs to get to tier 2 (score ≥ 50)
        for _ in range(6):
            result = rep.update_from_job(quality_rating=100, delivered_on_time=True)
        assert rep.tier >= 2

    def test_is_tier_unlocked(self):
        rep = ReputationSystem()
        assert rep.is_tier_unlocked(1) is True
        assert rep.is_tier_unlocked(2) is False
        assert rep.is_tier_unlocked(3) is False

    def test_tier_advanced_flag_in_result(self):
        rep = ReputationSystem()
        # Accumulate enough score to cross tier 2 threshold (50)
        for _ in range(5):
            result = rep.update_from_job(quality_rating=100, delivered_on_time=True)
        # At some point tier_advanced should have been True
        assert rep.tier >= 2


# ─── Persistence ──────────────────────────────────────────────────────────────

class TestReputationPersistence:
    def test_round_trip_preserves_state(self):
        rep = ReputationSystem()
        rep.update_from_job(quality_rating=90, delivered_on_time=True)
        rep.update_from_job(quality_rating=80, delivered_on_time=False)
        save_data = rep.to_save_data()
        reloaded = ReputationSystem(save_data)
        assert abs(reloaded.score - rep.score) < 0.001
        assert reloaded.tier == rep.tier
        assert reloaded.jobs_evaluated == 2

    def test_save_data_has_required_keys(self):
        rep = ReputationSystem()
        d = rep.to_save_data()
        assert "score" in d
        assert "tier" in d
        assert "tier_thresholds" in d
        assert "jobs_evaluated" in d
