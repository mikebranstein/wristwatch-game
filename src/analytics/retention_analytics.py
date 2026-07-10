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
    _returned_within,
    _compute_uplift,
    _compute_queue_gap_signal,
)

# ---------------------------------------------------------------------------
# Constants (local to retention_analytics)
# ---------------------------------------------------------------------------

EVENT_REASSEMBLY_COMPLETED = "reassembly_completed"

MIN_SESSIONS = 500    # Minimum distinct sessions for sufficient data (AC1)

# Constants imported from retention_cohort_rates (re-exported for backwards
# compatibility with callers that import them from this module):
#   COHORT_0, COHORT_1, COHORT_2_3, COHORT_4_PLUS, COHORT_KEYS
#   MIN_COHORT_SIZE, MATERIAL_UPLIFT_THRESHOLD
#   QUEUE_GAP_STRONG_THRESHOLD, QUEUE_GAP_WEAK_THRESHOLD
#   SECONDS_PER_DAY


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
        memo = self._compose_memo(
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

    # ------------------------------------------------------------------ #
    # Memo composition                                                     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _fmt_rate(rate: float | None) -> str:
        if rate is None:
            return "N/A (insufficient data)"
        return f"{rate * 100:.1f}%"

    def _compose_memo(
        self,
        total_distinct_players: int,
        cohorts: dict[str, dict],
        uplift_pp: float | None,
        uplift_is_material: bool | None,
        no_job_pct: float | None,
        queue_gap_signal_strong: bool | None,
        recommendation: str,
        phase1_threshold: dict,
    ) -> str:
        """
        Compose the written findings memo (AC4).
        """
        lines: list[str] = []
        lines.append("# Retention Analytics: D7/D30 Segmentation by Job Completion Count")
        lines.append("## Findings Memo — Issue #109")
        lines.append("")

        # --- Data availability ---
        lines.append("### 1. Data Availability")
        lines.append(f"- Total distinct players in telemetry: {total_distinct_players}")
        if total_distinct_players < MIN_SESSIONS:
            lines.append(
                f"- **WARNING:** Fewer than {MIN_SESSIONS} player sessions available. "
                f"Analysis reliability is limited. Consider creating an instrumentation "
                f"story before scheduling FR2 (Two-Bench Probe)."
            )
        else:
            lines.append(
                f"- Data threshold of {MIN_SESSIONS} sessions met. Analysis proceeds."
            )
        lines.append("")

        # --- Cohort breakdown ---
        lines.append("### 2. Cohort Breakdown")
        cohort_labels = {
            COHORT_0:      "0 completions",
            COHORT_1:      "1 completion",
            COHORT_2_3:    "2–3 completions",
            COHORT_4_PLUS: "4+ completions",
        }
        for key in COHORT_KEYS:
            c = cohorts[key]
            label = cohort_labels[key]
            d7  = RetentionAnalytics._fmt_rate(c["d7_rate"])
            d30 = RetentionAnalytics._fmt_rate(c["d30_rate"])
            flag = f" ⚠ {c['flag']}" if c["flag"] else ""
            lines.append(
                f"- **{label}** (n={c['n']}{flag}): D7={d7}, D30={d30}"
            )
        lines.append("")

        # --- Multi-completer uplift ---
        lines.append("### 3. Multi-Completer D30 Uplift")
        if uplift_pp is None:
            lines.append(
                "- Uplift could not be computed: either the 1-completion cohort or all "
                "multi-completer cohorts have insufficient sample size (n<30)."
            )
        else:
            lines.append(
                f"- Best multi-completer cohort D30 uplift vs 1-completion: "
                f"{uplift_pp:+.1f} percentage points"
            )
            if uplift_is_material:
                lines.append(
                    f"- ✅ Uplift is **material** (≥{MATERIAL_UPLIFT_THRESHOLD:.0f}pp threshold met)."
                )
            else:
                lines.append(
                    f"- ❌ Uplift is **not material** (<{MATERIAL_UPLIFT_THRESHOLD:.0f}pp threshold)."
                )
        lines.append("")

        # --- Session-start queue-gap signal ---
        lines.append("### 4. Session-Start Behaviour (Queue-Gap Proxy)")
        if no_job_pct is None:
            lines.append(
                "- Insufficient returning session data to compute queue-gap signal."
            )
        else:
            lines.append(
                f"- {no_job_pct:.1f}% of returning player sessions started with no "
                f"active job in progress."
            )
            if queue_gap_signal_strong is True:
                lines.append(
                    f"- ✅ Queue-gap signal is **strong** (>{QUEUE_GAP_STRONG_THRESHOLD:.0f}% "
                    f"threshold). Supports urgency of FR2 (Two-Bench Workshop Probe)."
                )
            elif queue_gap_signal_strong is False:
                lines.append(
                    f"- ℹ️  Queue-gap signal is **weak** (<{QUEUE_GAP_WEAK_THRESHOLD:.0f}%). "
                    f"Note as risk factor but does not override retention signal."
                )
            else:
                lines.append(
                    f"- ℹ️  Queue-gap signal is **inconclusive** "
                    f"(between {QUEUE_GAP_WEAK_THRESHOLD:.0f}% and "
                    f"{QUEUE_GAP_STRONG_THRESHOLD:.0f}%)."
                )
        lines.append("")

        # --- Phase 1 success threshold ---
        lines.append("### 5. Phase 1 (FR2) Success Threshold")
        lines.append(f"- Metric: {phase1_threshold['metric']}")
        lines.append(f"- Target: {phase1_threshold['target']}")
        lines.append("")

        # --- Recommendation ---
        lines.append("### 6. Recommendation")
        if recommendation == "DATA CONFIRMS":
            lines.append(
                "**DATA CONFIRMS** — D30 retention uplift for multi-restoration completers "
                "is statistically meaningful. Proceed to Phase 1 probe (FR2) with the "
                "success threshold defined above."
            )
        elif recommendation == "DATA DOES NOT SUPPORT":
            lines.append(
                "**DATA DOES NOT SUPPORT** — D30 retention uplift for multi-restoration "
                "completers is below the materiality threshold. Recommend deferring "
                "Two-Bench Workshop investment and reassessing after player base grows."
            )
        elif recommendation == "DATA INCONCLUSIVE":
            lines.append(
                "**DATA INCONCLUSIVE** — Multi-completer cohort sample sizes are too small "
                "for reliable statistical conclusions. Recommend minimal Phase 1 probe with "
                "an extended 8-week observation window to accumulate sufficient multi-completer "
                "data before making the full investment decision."
            )
        else:
            lines.append(
                "**INSUFFICIENT_TELEMETRY** — Total session count is below the 500-session "
                "minimum. Create an instrumentation story to ensure per-player restoration "
                "completion counts and return timestamps are captured before re-running "
                "this analysis. FR2 (Two-Bench Probe) is blocked until data is available."
            )

        return "\n".join(lines)
