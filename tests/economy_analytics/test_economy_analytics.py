"""
Tests for EconomyAnalytics — Issue #151: Workshop Economy Expanded
===================================================================

Covers AC4 (analytics panel accuracy), Scenario 10 (persistence),
and the underlying report computation contract.

AC4  — After 10+ completed jobs: income trends, job-type revenue, client revenue,
       and parts sourcing efficiency displayed and match ledger data
S10  — Economy analytics data persists across sessions
"""

import pytest

from src.economy_analytics.economy_analytics import EconomyAnalytics, MIN_JOBS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_job(
    job_id="j1",
    job_type="Basic Service",
    client_id="c1",
    client_tier="STANDARD",
    revenue=100.0,
    parts_cost=20.0,
    supplier_tier="STANDARD",
    quality_score=75,
    session_index=0,
) -> dict:
    return {
        "job_id": job_id,
        "job_type": job_type,
        "client_id": client_id,
        "client_tier": client_tier,
        "revenue": revenue,
        "parts_cost": parts_cost,
        "supplier_tier": supplier_tier,
        "quality_score": quality_score,
        "session_index": session_index,
    }


def make_jobs(n: int, **kwargs) -> list:
    """Generate *n* jobs with optional field overrides."""
    return [make_job(job_id=f"j{i}", session_index=i % 3, **kwargs) for i in range(n)]


# ---------------------------------------------------------------------------
# AC4 — Sufficient data gate (10+ jobs)
# ---------------------------------------------------------------------------

class TestEconomyAnalyticsSufficientData:
    """AC4 — Analytics panel requires 10+ completed jobs (MIN_JOBS)."""

    def test_insufficient_data_below_min_jobs(self):
        """Fewer than MIN_JOBS: sufficient_data is False."""
        analytics = EconomyAnalytics(completed_jobs=make_jobs(MIN_JOBS - 1))
        report = analytics.compute_report()
        assert not report["sufficient_data"]

    def test_sufficient_data_at_min_jobs(self):
        """Exactly MIN_JOBS: sufficient_data is True (AC4)."""
        analytics = EconomyAnalytics(completed_jobs=make_jobs(MIN_JOBS))
        report = analytics.compute_report()
        assert report["sufficient_data"]

    def test_sufficient_data_above_min_jobs(self):
        """More than MIN_JOBS: sufficient_data is True."""
        analytics = EconomyAnalytics(completed_jobs=make_jobs(MIN_JOBS + 5))
        report = analytics.compute_report()
        assert report["sufficient_data"]

    def test_total_jobs_matches_input(self):
        """total_jobs in report equals number of input records."""
        jobs = make_jobs(15)
        analytics = EconomyAnalytics(completed_jobs=jobs)
        report = analytics.compute_report()
        assert report["total_jobs"] == 15


# ---------------------------------------------------------------------------
# AC4 — Income trend computation
# ---------------------------------------------------------------------------

class TestIncometrend:
    """AC4 — Income trends per session must match ledger data."""

    def test_income_trend_single_session(self):
        """All jobs in session 0 sum into one trend entry."""
        jobs = [make_job(job_id=f"j{i}", session_index=0, revenue=100.0) for i in range(3)]
        analytics = EconomyAnalytics()
        report = analytics.compute_report(jobs)
        trend = report["income_trend"]
        assert len(trend) == 1
        assert trend[0]["session_index"] == 0
        assert abs(trend[0]["revenue"] - 300.0) < 0.01

    def test_income_trend_multiple_sessions(self):
        """Jobs in different sessions produce separate trend entries."""
        jobs = [
            make_job(job_id="j1", session_index=0, revenue=100.0),
            make_job(job_id="j2", session_index=1, revenue=200.0),
            make_job(job_id="j3", session_index=1, revenue=50.0),
            make_job(job_id="j4", session_index=2, revenue=75.0),
        ]
        analytics = EconomyAnalytics()
        report = analytics.compute_report(jobs)
        trend = {entry["session_index"]: entry["revenue"] for entry in report["income_trend"]}
        assert abs(trend[0] - 100.0) < 0.01
        assert abs(trend[1] - 250.0) < 0.01
        assert abs(trend[2] - 75.0) < 0.01

    def test_income_trend_sorted_ascending_by_session(self):
        """Income trend entries are sorted ascending by session_index."""
        jobs = [
            make_job(job_id="j1", session_index=5, revenue=50.0),
            make_job(job_id="j2", session_index=2, revenue=80.0),
        ]
        analytics = EconomyAnalytics()
        trend = analytics.compute_report(jobs)["income_trend"]
        indices = [e["session_index"] for e in trend]
        assert indices == sorted(indices)


# ---------------------------------------------------------------------------
# AC4 — Job type revenue breakdown
# ---------------------------------------------------------------------------

class TestJobTypeRevenue:
    """AC4 — Job type revenue contribution must match ledger data."""

    def test_job_type_revenue_sums_correctly(self):
        """Revenue is correctly summed per job_type."""
        jobs = [
            make_job(job_id="j1", job_type="Basic Service", revenue=100.0),
            make_job(job_id="j2", job_type="Basic Service", revenue=150.0),
            make_job(job_id="j3", job_type="Complex Service", revenue=300.0),
        ]
        analytics = EconomyAnalytics()
        report = analytics.compute_report(jobs)
        jtr = report["job_type_revenue"]
        assert abs(jtr["Basic Service"] - 250.0) < 0.01
        assert abs(jtr["Complex Service"] - 300.0) < 0.01

    def test_job_type_revenue_sorted_by_highest_first(self):
        """job_type_revenue is sorted descending by revenue value."""
        jobs = [
            make_job(job_id="j1", job_type="Type A", revenue=50.0),
            make_job(job_id="j2", job_type="Type B", revenue=200.0),
            make_job(job_id="j3", job_type="Type C", revenue=100.0),
        ]
        analytics = EconomyAnalytics()
        report = analytics.compute_report(jobs)
        values = list(report["job_type_revenue"].values())
        assert values == sorted(values, reverse=True)


# ---------------------------------------------------------------------------
# AC4 — Client tier revenue contribution
# ---------------------------------------------------------------------------

class TestClientTierRevenue:
    """AC4 — Client revenue contribution breakdown must match ledger data."""

    def test_client_tier_revenue_sums_correctly(self):
        """Revenue is correctly summed per client_tier."""
        jobs = [
            make_job(job_id="j1", client_tier="STANDARD", revenue=100.0),
            make_job(job_id="j2", client_tier="STANDARD", revenue=80.0),
            make_job(job_id="j3", client_tier="PREMIUM", revenue=250.0),
        ]
        analytics = EconomyAnalytics()
        report = analytics.compute_report(jobs)
        ctr = report["client_tier_revenue"]
        assert abs(ctr["STANDARD"] - 180.0) < 0.01
        assert abs(ctr["PREMIUM"] - 250.0) < 0.01

    def test_client_tier_revenue_contains_both_tiers(self):
        """Both STANDARD and PREMIUM tiers appear when both are present."""
        jobs = [
            make_job(job_id="j1", client_tier="STANDARD", revenue=50.0),
            make_job(job_id="j2", client_tier="PREMIUM", revenue=120.0),
        ]
        analytics = EconomyAnalytics()
        ctr = analytics.compute_report(jobs)["client_tier_revenue"]
        assert "STANDARD" in ctr
        assert "PREMIUM" in ctr


# ---------------------------------------------------------------------------
# AC4 — Parts sourcing efficiency
# ---------------------------------------------------------------------------

class TestSourcingEfficiency:
    """AC4 / Scenario 2-3 — Parts sourcing efficiency matches ledger data."""

    def test_sourcing_efficiency_standard_tier(self):
        """STANDARD tier efficiency ratio = revenue / parts_cost."""
        jobs = [make_job(job_id="j1", supplier_tier="STANDARD", revenue=100.0, parts_cost=25.0)]
        analytics = EconomyAnalytics()
        eff = analytics.compute_report(jobs)["sourcing_efficiency"]
        assert "STANDARD" in eff
        assert abs(eff["STANDARD"]["efficiency_ratio"] - 4.0) < 0.01

    def test_sourcing_efficiency_premium_tier(self):
        """PREMIUM tier efficiency computed correctly."""
        jobs = [make_job(job_id="j1", supplier_tier="PREMIUM", revenue=150.0, parts_cost=50.0)]
        analytics = EconomyAnalytics()
        eff = analytics.compute_report(jobs)["sourcing_efficiency"]
        assert "PREMIUM" in eff
        assert abs(eff["PREMIUM"]["efficiency_ratio"] - 3.0) < 0.01

    def test_sourcing_efficiency_zero_cost_is_none(self):
        """Efficiency ratio is None when parts_cost=0 (avoid division by zero)."""
        jobs = [make_job(job_id="j1", supplier_tier="STANDARD", revenue=100.0, parts_cost=0.0)]
        analytics = EconomyAnalytics()
        eff = analytics.compute_report(jobs)["sourcing_efficiency"]
        assert eff["STANDARD"]["efficiency_ratio"] is None

    def test_sourcing_efficiency_job_count_correct(self):
        """job_count per tier matches the number of jobs using that tier."""
        jobs = [
            make_job(job_id=f"j{i}", supplier_tier="STANDARD" if i < 3 else "PREMIUM")
            for i in range(5)
        ]
        analytics = EconomyAnalytics()
        eff = analytics.compute_report(jobs)["sourcing_efficiency"]
        assert eff["STANDARD"]["job_count"] == 3
        assert eff["PREMIUM"]["job_count"] == 2

    def test_report_ledger_consistency_spot_check(self):
        """
        Spot-check: sourcing revenue totals match client_tier_revenue totals
        when all jobs have the same client_tier == supplier_tier.
        """
        jobs = [
            make_job(job_id=f"j{i}", client_tier="STANDARD", supplier_tier="STANDARD",
                     revenue=100.0, parts_cost=20.0)
            for i in range(5)
        ]
        analytics = EconomyAnalytics()
        report = analytics.compute_report(jobs)
        total_from_sourcing = report["sourcing_efficiency"]["STANDARD"]["revenue"]
        total_from_client = report["client_tier_revenue"]["STANDARD"]
        assert abs(total_from_sourcing - total_from_client) < 0.01


# ---------------------------------------------------------------------------
# record_job() mutation method
# ---------------------------------------------------------------------------

class TestRecordJob:
    """record_job() appends jobs to internal history."""

    def test_record_job_increases_total_jobs(self):
        """Each call to record_job() increments total_jobs by 1."""
        analytics = EconomyAnalytics()
        for i in range(5):
            analytics.record_job(make_job(job_id=f"j{i}"))
        report = analytics.compute_report()
        assert report["total_jobs"] == 5

    def test_record_job_does_not_mutate_original_dict(self):
        """record_job() stores a copy — mutating the original doesn't affect history."""
        analytics = EconomyAnalytics()
        job = make_job(job_id="j1", revenue=100.0)
        analytics.record_job(job)
        job["revenue"] = 999.0  # mutate original
        report = analytics.compute_report()
        assert abs(report["income_trend"][0]["revenue"] - 100.0) < 0.01


# ---------------------------------------------------------------------------
# Scenario 10 — Session persistence
# ---------------------------------------------------------------------------

class TestEconomyAnalyticsPersistence:
    """Scenario 10 — economy analytics data persists across sessions."""

    def test_save_load_round_trip_preserves_jobs(self):
        """to_save_dict / from_save_dict preserves job history."""
        jobs = make_jobs(MIN_JOBS)
        analytics = EconomyAnalytics(completed_jobs=jobs)
        saved = analytics.to_save_dict()
        restored = EconomyAnalytics.from_save_dict(saved)
        assert restored.compute_report()["total_jobs"] == MIN_JOBS

    def test_null_save_data_returns_empty_analytics(self):
        """None save data (pre-feature save) returns an empty EconomyAnalytics."""
        analytics = EconomyAnalytics.from_save_dict(None)
        report = analytics.compute_report()
        assert report["total_jobs"] == 0
        assert not report["sufficient_data"]

    def test_empty_dict_returns_empty_analytics(self):
        """Empty dict returns empty EconomyAnalytics."""
        analytics = EconomyAnalytics.from_save_dict({})
        assert analytics.compute_report()["total_jobs"] == 0

    def test_save_dict_structure(self):
        """to_save_dict contains 'completed_jobs' key with a list."""
        analytics = EconomyAnalytics(completed_jobs=make_jobs(3))
        saved = analytics.to_save_dict()
        assert "completed_jobs" in saved
        assert isinstance(saved["completed_jobs"], list)
        assert len(saved["completed_jobs"]) == 3
