"""
EconomyAnalytics — Issue #151: Workshop Economy Expanded
=========================================================

Expanded economy analytics panel providing income trends, job-type revenue
breakdown, client revenue contribution, and parts sourcing efficiency metrics.

Designed to be consumed by the Ledger/Analytics UI (AC4):
  - Income trends over time (per-session or per-N-jobs)
  - Best-performing job types by revenue
  - Client revenue contribution breakdown (STANDARD vs PREMIUM tier)
  - Parts sourcing efficiency: revenue per part-cost-spent by supplier tier

Input contract
--------------
completed_jobs : list[dict]
    Each record represents one completed job::

        {
            "job_id"         : str,
            "job_type"       : str,        # e.g. "Basic Service", "Complex Service"
            "client_id"      : str,
            "client_tier"    : str,        # "STANDARD" or "PREMIUM"
            "revenue"        : float,      # total payment received
            "parts_cost"     : float,      # total parts cost for this job
            "supplier_tier"  : str,        # "STANDARD" or "PREMIUM"
            "quality_score"  : int,        # 0–100
            "session_index"  : int,        # which session this job was completed in
        }

Output contract (AC4)
---------------------
``compute_report(completed_jobs)`` returns a dict with:

    sufficient_data         : bool         (True when len(completed_jobs) >= MIN_JOBS)
    total_jobs              : int
    income_trend            : list[dict]   per-session totals [{session_index, revenue}]
    job_type_revenue        : dict[str, float]   job_type -> total revenue
    client_tier_revenue     : dict[str, float]   client_tier -> total revenue
    sourcing_efficiency     : dict[str, dict]     supplier_tier -> {revenue, parts_cost,
                                                   efficiency_ratio, job_count}

Cozy Mode (AC5 — centralized enforcement):
  EconomyAnalytics is a read-only reporting module. It does not apply financial
  penalties; Cozy Mode has no effect on analytics computation. The UI layer is
  responsible for suppressing any "penalty" display elements.

Save / Load (Scenario 10 — session persistence):
  Serialises ``completed_jobs`` list to/from a save dict. Null-safe for pre-feature saves.
"""

from __future__ import annotations

from collections import defaultdict
from typing import List, Dict

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_JOBS: int = 10   # minimum jobs before "sufficient_data" is True (AC4)


# ---------------------------------------------------------------------------
# Analytics engine
# ---------------------------------------------------------------------------

class EconomyAnalytics:
    """
    Computes economy analytics from a list of completed job records.

    This is a pure-computation class with no mutable state — pass in the job
    history at query time. Persistence is via ``to_save_dict`` / ``from_save_dict``.

    Parameters
    ----------
    completed_jobs : list[dict] | None
        Job history. None or empty list treated as no history.
    """

    def __init__(self, completed_jobs: List[dict] | None = None) -> None:
        self._jobs: List[dict] = list(completed_jobs or [])

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def record_job(self, job: dict) -> None:
        """Append a completed job record to the history."""
        self._jobs.append(dict(job))

    def compute_report(self, jobs: List[dict] | None = None) -> dict:
        """
        Compute the full economy analytics report.

        Parameters
        ----------
        jobs : list[dict] | None
            If provided, overrides ``self._jobs`` for this computation (useful
            for ad-hoc queries without mutating internal state).

        Returns
        -------
        dict
            Analytics report conforming to the output contract above.
        """
        source = jobs if jobs is not None else self._jobs

        total = len(source)
        sufficient = total >= MIN_JOBS

        income_trend = self._compute_income_trend(source)
        job_type_revenue = self._compute_job_type_revenue(source)
        client_tier_revenue = self._compute_client_tier_revenue(source)
        sourcing_efficiency = self._compute_sourcing_efficiency(source)

        return {
            "sufficient_data": sufficient,
            "total_jobs": total,
            "income_trend": income_trend,
            "job_type_revenue": job_type_revenue,
            "client_tier_revenue": client_tier_revenue,
            "sourcing_efficiency": sourcing_efficiency,
        }

    # -----------------------------------------------------------------------
    # Internal computations
    # -----------------------------------------------------------------------

    @staticmethod
    def _compute_income_trend(jobs: List[dict]) -> List[dict]:
        """Aggregate total revenue per session_index, sorted ascending."""
        by_session: Dict[int, float] = defaultdict(float)
        for job in jobs:
            session = int(job.get("session_index", 0))
            revenue = float(job.get("revenue", 0.0))
            by_session[session] += revenue
        return [
            {"session_index": s, "revenue": round(r, 2)}
            for s, r in sorted(by_session.items())
        ]

    @staticmethod
    def _compute_job_type_revenue(jobs: List[dict]) -> Dict[str, float]:
        """Sum revenue per job_type."""
        totals: Dict[str, float] = defaultdict(float)
        for job in jobs:
            jtype = job.get("job_type", "Unknown")
            totals[jtype] += float(job.get("revenue", 0.0))
        return {k: round(v, 2) for k, v in sorted(totals.items(), key=lambda x: -x[1])}

    @staticmethod
    def _compute_client_tier_revenue(jobs: List[dict]) -> Dict[str, float]:
        """Sum revenue per client_tier."""
        totals: Dict[str, float] = defaultdict(float)
        for job in jobs:
            tier = job.get("client_tier", "STANDARD")
            totals[tier] += float(job.get("revenue", 0.0))
        return {k: round(v, 2) for k, v in totals.items()}

    @staticmethod
    def _compute_sourcing_efficiency(jobs: List[dict]) -> Dict[str, dict]:
        """
        For each supplier_tier, compute aggregate revenue, parts_cost,
        job_count, and efficiency_ratio = revenue / parts_cost (or None if cost=0).
        """
        agg: Dict[str, dict] = {}
        for job in jobs:
            tier = job.get("supplier_tier", "STANDARD")
            if tier not in agg:
                agg[tier] = {"revenue": 0.0, "parts_cost": 0.0, "job_count": 0}
            agg[tier]["revenue"] += float(job.get("revenue", 0.0))
            agg[tier]["parts_cost"] += float(job.get("parts_cost", 0.0))
            agg[tier]["job_count"] += 1

        result = {}
        for tier, data in agg.items():
            cost = data["parts_cost"]
            efficiency = round(data["revenue"] / cost, 4) if cost > 0 else None
            result[tier] = {
                "revenue": round(data["revenue"], 2),
                "parts_cost": round(data["parts_cost"], 2),
                "job_count": data["job_count"],
                "efficiency_ratio": efficiency,
            }
        return result

    # -----------------------------------------------------------------------
    # Serialisation (Scenario 10)
    # -----------------------------------------------------------------------

    def to_save_dict(self) -> dict:
        """Return a JSON-serialisable dict for the save file."""
        return {"completed_jobs": list(self._jobs)}

    @classmethod
    def from_save_dict(cls, data: dict | None) -> "EconomyAnalytics":
        """
        Reconstruct from a saved dict.

        Null-safe: if *data* is None or lacks 'completed_jobs', returns an empty instance.
        """
        jobs = (data or {}).get("completed_jobs", None)
        return cls(completed_jobs=jobs if isinstance(jobs, list) else None)
