"""
RetentionAnalytics — D7/D30 Segmentation by Job Completion Count
================================================================

Bounded orchestrator for the retention-analysis pipeline (Issue #109).
Slimmed to orchestrator role as part of Issue #203.

Extracted modules
-----------------
- ``src.analytics.retention_memo``          — memo composition (Issue #201)
- ``src.analytics.retention_cohort_rates``  — cohort-rate computation (Issue #202)

Retained in this module
-----------------------
- Module-level constants and back-compat re-exports
- Session indexing helpers
- Cohort assignment logic
- Recommendation + threshold logic
- Entry point: ``RetentionAnalytics.analyze()``

See ``retention_memo.py`` and ``retention_cohort_rates.py`` for the full
input/output contract documentation.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from src.analytics.retention_cohort_rates import (
    COHORT_0,
    COHORT_1,
    COHORT_2_3,
    COHORT_4_PLUS,
    COHORT_KEYS,
    MIN_COHORT_SIZE,
    MATERIAL_UPLIFT_THRESHOLD,
    QUEUE_GAP_STRONG_THRESHOLD,
    QUEUE_GAP_WEAK_THRESHOLD,
    SECONDS_PER_DAY,
    _compute_cohort_rates,
    _compute_uplift,
    _compute_queue_gap_signal,
)
from src.analytics.retention_memo import (
    MIN_SESSIONS,
    _compose_memo,
)

# ---------------------------------------------------------------------------
# Constants (local to retention_analytics)
# ---------------------------------------------------------------------------

EVENT_REASSEMBLY_COMPLETED = "reassembly_completed"

# The following constants are re-exported from the extracted modules for
# backwards compatibility with callers that import them from this module:
#   COHORT_0, COHORT_1, COHORT_2_3, COHORT_4_PLUS, COHORT_KEYS,
#   MIN_COHORT_SIZE, MATERIAL_UPLIFT_THRESHOLD, QUEUE_GAP_STRONG_THRESHOLD,
#   QUEUE_GAP_WEAK_THRESHOLD, SECONDS_PER_DAY, MIN_SESSIONS


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class RetentionAnalytics:
    """
    Compute D7/D30 retention segmented by restoration-completion count.

    Usage::

        analytics = RetentionAnalytics()
        report = analytics.analyze(sessions, events)
    """

    # ------------------------------------------------------------------ #
    # Public method                                                        #
    # ------------------------------------------------------------------ #

    def analyze(
        self,
        sessions: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Run the full retention analysis and return a report dict.

        Parameters
        ----------
        sessions:
            See module docstring for schema.
        events:
            See module docstring for schema.

        Returns
        -------
        dict — full report; see module docstring for output contract.
        """
        # Step 1 — build per-player session index
        player_sessions = self._index_player_sessions(sessions)
        total_distinct_players = len(player_sessions)

        # Step 2 — count reassembly_completed events per player
        completion_counts = self._count_completions_per_player(events)

        # Step 3 — assign players to cohorts
        cohort_players = self._assign_cohorts(player_sessions, completion_counts)

        # Step 4 — compute D7/D30 rates per cohort
        cohorts = _compute_cohort_rates(cohort_players)

        # Step 5 — compute multi-completer uplift
        uplift_pp, uplift_is_material = _compute_uplift(cohorts)

        # Step 6 — compute session-start-without-active-job signal
        no_job_pct, queue_gap_signal_strong = _compute_queue_gap_signal(
            player_sessions
        )

        # Step 7 — determine recommendation
        sufficient_data = total_distinct_players >= MIN_SESSIONS
        recommendation = self._determine_recommendation(
            sufficient_data, cohorts, uplift_is_material
        )

        # Step 8 — derive Phase 1 success threshold
        phase1_threshold = self._derive_phase1_threshold(uplift_pp, cohorts)

        # Step 9 — compose memo
        memo = _compose_memo(
            total_distinct_players,
            cohorts,
            uplift_pp,
            uplift_is_material,
            no_job_pct,
            queue_gap_signal_strong,
            recommendation,
            phase1_threshold,
        )

        return {
            "sufficient_data": sufficient_data,
            "total_distinct_players": total_distinct_players,
            "cohorts": cohorts,
            "multi_completer_d30_uplift_pp": uplift_pp,
            "uplift_is_material": uplift_is_material,
            "session_start_no_active_job_pct": no_job_pct,
            "queue_gap_signal_strong": queue_gap_signal_strong,
            "recommendation": recommendation,
            "phase1_success_threshold": phase1_threshold,
            "memo": memo,
        }

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _index_player_sessions(
        sessions: list[dict[str, Any]]
    ) -> dict[str, list[dict[str, Any]]]:
        """
        Return mapping of player_id → sorted list of session dicts.
        Sessions are sorted ascending by started_at.
        """
        index: dict[str, list] = defaultdict(list)
        for s in sessions:
            index[s["player_id"]].append(s)
        # Sort each player's sessions by start time
        for pid in index:
            index[pid].sort(key=lambda s: s["started_at"])
        return dict(index)

    @staticmethod
    def _count_completions_per_player(
        events: list[dict[str, Any]]
    ) -> dict[str, int]:
        """
        Return mapping of player_id → total reassembly_completed event count.
        Players with no reassembly_completed events are NOT included;
        they implicitly have count 0.
        """
        counts: dict[str, int] = defaultdict(int)
        for e in events:
            if e.get("event_name") == EVENT_REASSEMBLY_COMPLETED:
                counts[e["player_id"]] += 1
        return dict(counts)

    @staticmethod
    def _cohort_key(completion_count: int) -> str:
        """Map a completion count to the cohort key string."""
        if completion_count == 0:
            return COHORT_0
        if completion_count == 1:
            return COHORT_1
        if completion_count <= 3:
            return COHORT_2_3
        return COHORT_4_PLUS

    def _assign_cohorts(
        self,
        player_sessions: dict[str, list[dict]],
        completion_counts: dict[str, int],
    ) -> dict[str, list[list[dict]]]:
        """
        Return mapping of cohort_key → list of per-player session lists.

        A player's cohort is determined by their TOTAL restoration completion
        count across all sessions.  Players absent from completion_counts have
        count 0 (they never completed a restoration).
        """
        cohort_players: dict[str, list] = {k: [] for k in COHORT_KEYS}
        for pid, sess_list in player_sessions.items():
            count = completion_counts.get(pid, 0)
            key = self._cohort_key(count)
            cohort_players[key].append(sess_list)
        return cohort_players

    # _compute_cohort_rates, _returned_within, _compute_uplift, and
    # _compute_queue_gap_signal have been extracted to
    # src/analytics/retention_cohort_rates.py (Issue #202).

    @staticmethod
    def _determine_recommendation(
        sufficient_data: bool,
        cohorts: dict[str, dict],
        uplift_is_material: bool | None,
    ) -> str:
        """
        Return one of the four recommendation strings (AC4).

        Decision tree:
        1. Insufficient total data → INSUFFICIENT_TELEMETRY
        2. uplift_is_material is True → DATA CONFIRMS (proceed to Phase 1)
        3. uplift_is_material is False → DATA DOES NOT SUPPORT
        4. uplift_is_material is None (insufficient multi-completer cohort) →
           DATA INCONCLUSIVE
        """
        if not sufficient_data:
            return "INSUFFICIENT_TELEMETRY"
        if uplift_is_material is True:
            return "DATA CONFIRMS"
        if uplift_is_material is False:
            return "DATA DOES NOT SUPPORT"
        # uplift_is_material is None → multi-completer cohorts too small
        return "DATA INCONCLUSIVE"

    @staticmethod
    def _derive_phase1_threshold(
        uplift_pp: float | None,
        cohorts: dict[str, dict],
    ) -> dict[str, str]:
        """
        Derive a recommended success threshold for the Phase 1 A/B probe (AC5).

        If a material uplift was observed we recommend the observed effect size
        as the minimum bar; otherwise we fall back to the standard 10pp threshold.
        """
        if uplift_pp is not None and uplift_pp >= MATERIAL_UPLIFT_THRESHOLD:
            # Recommend matching or exceeding the observed effect
            target_pp = max(MATERIAL_UPLIFT_THRESHOLD, round(uplift_pp * 0.75, 1))
            target = (
                f">={target_pp:.1f} percentage point increase in D30 return rate "
                f"in probe cohort vs control at 4 weeks"
            )
        else:
            target = (
                f">={MATERIAL_UPLIFT_THRESHOLD:.0f} percentage point increase "
                f"in D30 return rate in probe cohort vs control at 4 weeks "
                f"(minimum-bar threshold; extend observation if not reached by week 4)"
            )
        return {
            "metric": "D30 return rate",
            "target": target,
        }
