"""
Tests for ReputationSystem — Issue #119, Workshop Queue Meta-Game Phase 2
=========================================================================

Covers acceptance criteria:
  AC3 — reputation increases on high-quality, timely delivery; visible on dashboard
  AC3 — late delivery reduces gain but never subtracts (cozy-invariant)
  AC3 — reputation tier thresholds gate access to higher-tier jobs

Run with: pytest tests/
"""

import pytest
from src.reputation.reputation_system import (
    ReputationSystem,
    BASE_DELTA,
    ON_TIME_MULTIPLIER,
    LATE_MULTIPLIER,
    TIER_THRESHOLDS,
)


# ─── record_delivery ─────────────────────────────────────────────────────────

class TestRecordDelivery:
    def test_high_quality_on_time_increases_score(self):
        """AC3: Quality ≥80% + on time → reputation increases by expected delta."""
        rep = ReputationSystem()
        delta = rep.record_delivery(quality_rating=80, on_time=True)
        expected = (80 / 100) * BASE_DELTA * ON_TIME_MULTIPLIER
        assert abs(delta - expected) < 1e-9
        assert abs(rep.current_score() - expected) < 1e-9

    def test_perfect_quality_on_time_produces_full_base_delta(self):
        """Quality=100, on_time → delta equals BASE_DELTA exactly."""
        rep = ReputationSystem()
        delta = rep.record_delivery(quality_rating=100, on_time=True)
        assert abs(delta - BASE_DELTA) < 1e-9

    def test_late_delivery_reduces_gain_but_stays_positive(self):
        """AC3: Late delivery → positive delta (never negative); cozy-invariant preserved."""
        rep = ReputationSystem()
        delta = rep.record_delivery(quality_rating=100, on_time=False)
        expected = BASE_DELTA * LATE_MULTIPLIER
        assert delta > 0
        assert abs(delta - expected) < 1e-9
        assert rep.current_score() > 0

    def test_score_never_goes_negative(self):
        """AC3 / cozy-invariant: score is always ≥ 0, even with zero quality."""
        rep = ReputationSystem()
        delta = rep.record_delivery(quality_rating=0, on_time=False)
        assert delta == 0.0
        assert rep.current_score() == 0.0

    def test_cumulative_score_accumulates(self):
        """Multiple deliveries accumulate score correctly."""
        rep = ReputationSystem()
        rep.record_delivery(quality_rating=80, on_time=True)
        rep.record_delivery(quality_rating=90, on_time=True)
        assert rep.current_score() > 0

    def test_raises_on_quality_below_zero(self):
        rep = ReputationSystem()
        with pytest.raises(ValueError, match="quality_rating"):
            rep.record_delivery(quality_rating=-1, on_time=True)

    def test_raises_on_quality_above_100(self):
        rep = ReputationSystem()
        with pytest.raises(ValueError, match="quality_rating"):
            rep.record_delivery(quality_rating=101, on_time=True)

    def test_quality_boundary_0_is_accepted(self):
        rep = ReputationSystem()
        delta = rep.record_delivery(quality_rating=0, on_time=True)
        assert delta == 0.0

    def test_quality_boundary_100_is_accepted(self):
        rep = ReputationSystem()
        delta = rep.record_delivery(quality_rating=100, on_time=True)
        assert delta > 0


# ─── current_tier ────────────────────────────────────────────────────────────

class TestCurrentTier:
    def test_new_reputation_is_tier_1(self):
        rep = ReputationSystem()
        assert rep.current_tier() == 1

    def test_tier_advances_past_threshold(self):
        """AC3: Reputation tier advances when score reaches tier threshold."""
        rep = ReputationSystem()
        # Drive score past TIER_THRESHOLDS[1] (tier 2 threshold)
        tier2_threshold = TIER_THRESHOLDS[1]
        while rep.current_score() < tier2_threshold:
            rep.record_delivery(quality_rating=100, on_time=True)
        assert rep.current_tier() >= 2

    def test_tier_3_at_highest_threshold(self):
        """Reaching tier 3 threshold correctly returns tier 3."""
        rep = ReputationSystem()
        tier3_threshold = TIER_THRESHOLDS[2]
        while rep.current_score() < tier3_threshold:
            rep.record_delivery(quality_rating=100, on_time=True)
        assert rep.current_tier() == 3


# ─── Persistence ─────────────────────────────────────────────────────────────

class TestReputationSystemPersistence:
    def test_round_trip_save_and_load(self):
        """AC9: Reputation score survives a save → load cycle."""
        rep = ReputationSystem()
        rep.record_delivery(quality_rating=90, on_time=True)
        score_before = rep.current_score()

        saved = rep.to_save_data()
        restored = ReputationSystem(saved)

        assert abs(restored.current_score() - score_before) < 1e-9

    def test_null_safe_construction_from_none(self):
        rep = ReputationSystem(None)
        assert rep.current_score() == 0.0
        assert rep.current_tier() == 1

    def test_null_safe_construction_from_empty_dict(self):
        rep = ReputationSystem({})
        assert rep.current_score() == 0.0

    def test_null_safe_construction_missing_reputation_key(self):
        rep = ReputationSystem({"order_queue": {}})
        assert rep.current_score() == 0.0
