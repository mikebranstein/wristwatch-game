"""
RetentionAnalytics — D7/D30 Segmentation by Job Completion Count
================================================================

Implements Issue #109: Retention Analytics — D7/D30 Segmentation by Job
Completion Count.

Design summary (from approved design decision):
  Pure data-analysis task — no game code changes.  Queries existing session/
  telemetry data to compute D7/D30 player return rates segmented by
  restoration-completion cohort (0, 1, 2–3, 4+), analyses session-start
  behaviour as a queue-gap proxy, and delivers a written findings memo with
  an explicit GO/NO-GO/CONDITIONAL recommendation and a Phase 1 success
  threshold.

Input contract
--------------
sessions : list[dict]
    Each record represents one play session::

        {
            "player_id": str,          # Anonymised persistent player identifier
                                       # (cross-session linkage provided by analytics
                                       #  backend — NOT the per-session sessionId from
                                       #  TelemetryEmitter).
            "session_id": str,         # Unique session identifier
            "started_at": float,       # Unix timestamp (seconds) of session start
            "had_active_job_at_start": bool,  # True if order_queue had an active job
                                       # at load_session() time for this session
        }

events : list[dict]
    Each record is a telemetry event::

        {
            "player_id": str,          # Same anonymised persistent player identifier
            "session_id": str,
            "event_name": str,         # e.g. "reassembly_completed"
            "timestamp": float,        # Unix timestamp of the event
        }

    Only ``reassembly_completed`` events are consumed by this module; all
    others are ignored.

Output contract
---------------
Returns a dict with the following keys:

    sufficient_data : bool
        True when total_distinct_players >= MIN_SESSIONS.
    total_distinct_players : int
    cohorts : dict[str, dict]
        Keys: "0_completions", "1_completion", "2_3_completions",
              "4_plus_completions".
        Each value::

            {
                "n": int,           # number of players in this cohort
                "d7_rate": float|None,   # fraction [0,1] or None if insufficient
                "d30_rate": float|None,  # fraction [0,1] or None if insufficient
                "sufficient": bool, # n >= MIN_COHORT_SIZE
                "flag": str|None,   # "n<30" when insufficient, else None
            }

    multi_completer_d30_uplift_pp : float|None
        D30 rate of the best sufficiently-sized multi-completer cohort (2-3 or
        4+) minus the D30 rate of the 1-completion cohort, in percentage points.
        None when the 1-completion cohort or all multi-completer cohorts are
        insufficiently sized.
    uplift_is_material : bool|None
        True when multi_completer_d30_uplift_pp >= MATERIAL_UPLIFT_THRESHOLD.
        None when uplift cannot be computed.
    session_start_no_active_job_pct : float|None
        Percentage of *returning* player sessions (player has a prior session)
        where ``had_active_job_at_start`` is False.
        None when there are no returning sessions.
    queue_gap_signal_strong : bool|None
        True when session_start_no_active_job_pct > QUEUE_GAP_STRONG_THRESHOLD (40%).
        False when < QUEUE_GAP_WEAK_THRESHOLD (15%).
        None when insufficient returning sessions or percentage is between thresholds.
    recommendation : str
        One of "DATA CONFIRMS", "DATA INCONCLUSIVE", "DATA DOES NOT SUPPORT",
        or "INSUFFICIENT_TELEMETRY" when total_distinct_players < MIN_SESSIONS.
    phase1_success_threshold : dict
        {"metric": str, "target": str} — recommended success threshold for
        Phase 1 A/B probe (FR2).
    memo : str
        Full written findings memo.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from src.analytics.retention_memo import (
    # Shared constants — defined in retention_memo to avoid circular imports;
    # re-imported here so existing callers of retention_analytics still resolve them.
    COHORT_0,
    COHORT_1,
    COHORT_2_3,
    COHORT_4_PLUS,
    COHORT_KEYS,
    MIN_SESSIONS,
    MATERIAL_UPLIFT_THRESHOLD,
    QUEUE_GAP_STRONG_THRESHOLD,
    QUEUE_GAP_WEAK_THRESHOLD,
    # Moved function
    _compose_memo,
)

# ---------------------------------------------------------------------------
# Constants (analytics-layer-only; not needed by memo composition)
# ---------------------------------------------------------------------------

EVENT_REASSEMBLY_COMPLETED = "reassembly_completed"

MIN_COHORT_SIZE = 30       # Minimum per-cohort n for reliable rates (AC1)

SECONDS_PER_DAY = 86_400


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
        cohorts = self._compute_cohort_rates(cohort_players)

        # Step 5 — compute multi-completer uplift
        uplift_pp, uplift_is_material = self._compute_uplift(cohorts)

        # Step 6 — compute session-start-without-active-job signal
        no_job_pct, queue_gap_signal_strong = self._compute_queue_gap_signal(
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

    def _compute_cohort_rates(
        self, cohort_players: dict[str, list[list[dict]]]
    ) -> dict[str, dict[str, Any]]:
        """
        For each cohort, compute D7 and D30 return rates.

        A player "returns" within N days if they have at least one session
        that started more than 0 seconds AND at most N*SECONDS_PER_DAY after
        their FIRST session's started_at.
        """
        cohorts: dict[str, dict] = {}
        for key in COHORT_KEYS:
            players = cohort_players[key]
            n = len(players)
            sufficient = n >= MIN_COHORT_SIZE
            if sufficient:
                d7_count  = sum(1 for p in players if self._returned_within(p, 7))
                d30_count = sum(1 for p in players if self._returned_within(p, 30))
                d7_rate  = d7_count  / n
                d30_rate = d30_count / n
            else:
                d7_rate  = None
                d30_rate = None
            cohorts[key] = {
                "n":        n,
                "d7_rate":  d7_rate,
                "d30_rate": d30_rate,
                "sufficient": sufficient,
                "flag":     "n<30" if not sufficient else None,
            }
        return cohorts

    @staticmethod
    def _returned_within(
        player_sessions: list[dict], days: int
    ) -> bool:
        """
        Return True if the player has at least one session beyond their first
        session that started within `days` days of the first session.
        """
        if len(player_sessions) < 2:
            return False
        first_ts = player_sessions[0]["started_at"]
        window   = days * SECONDS_PER_DAY
        return any(
            0 < (s["started_at"] - first_ts) <= window
            for s in player_sessions[1:]
        )

    @staticmethod
    def _compute_uplift(
        cohorts: dict[str, dict[str, Any]]
    ) -> tuple[float | None, bool | None]:
        """
        Compute best multi-completer D30 uplift vs 1-completion cohort.

        Returns (uplift_pp, is_material).
        Both are None when rates cannot be computed (insufficient cohort n).
        """
        baseline = cohorts[COHORT_1]
        if not baseline["sufficient"] or baseline["d30_rate"] is None:
            return None, None

        best_uplift: float | None = None
        for key in [COHORT_2_3, COHORT_4_PLUS]:
            c = cohorts[key]
            if c["sufficient"] and c["d30_rate"] is not None:
                uplift = (c["d30_rate"] - baseline["d30_rate"]) * 100.0
                if best_uplift is None or uplift > best_uplift:
                    best_uplift = uplift

        if best_uplift is None:
            return None, None
        return best_uplift, best_uplift >= MATERIAL_UPLIFT_THRESHOLD

    @staticmethod
    def _compute_queue_gap_signal(
        player_sessions: dict[str, list[dict]]
    ) -> tuple[float | None, bool | None]:
        """
        Compute the percentage of *returning* player sessions (not the first
        session for that player) where had_active_job_at_start is False.

        Returns (percentage, queue_gap_signal_strong).
        """
        returning_total = 0
        returning_no_job = 0

        for pid, sess_list in player_sessions.items():
            # Only sessions after the first qualify as "returning"
            for s in sess_list[1:]:
                returning_total += 1
                if not s.get("had_active_job_at_start", True):
                    returning_no_job += 1

        if returning_total == 0:
            return None, None

        pct = (returning_no_job / returning_total) * 100.0
        if pct > QUEUE_GAP_STRONG_THRESHOLD:
            signal = True
        elif pct < QUEUE_GAP_WEAK_THRESHOLD:
            signal = False
        else:
            signal = None
        return pct, signal

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
