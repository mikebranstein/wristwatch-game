"""
Cohort-rate computation functions for RetentionAnalytics.
=========================================================

Implements Issue #202: Extract retention_cohort_rates.py from retention_analytics.py.

This module contains the four cohort-rate computation functions that were
extracted from RetentionAnalytics to improve module cohesion and reduce the
size of retention_analytics.py.

Functions
---------
_compute_cohort_rates  — Compute D7/D30 return rates per cohort.
_returned_within       — Test whether a player returned within N days.
_compute_uplift        — Compute best multi-completer D30 uplift vs 1-completion.
_compute_queue_gap_signal — Compute session-start-without-active-job percentage.

Constants
---------
All shared constants used by the extracted functions (and re-exported so that
retention_analytics.py can import them from a single location).
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Constants (shared with retention_analytics — re-exported from here)
# ---------------------------------------------------------------------------

COHORT_0      = "0_completions"
COHORT_1      = "1_completion"
COHORT_2_3    = "2_3_completions"
COHORT_4_PLUS = "4_plus_completions"
COHORT_KEYS   = [COHORT_0, COHORT_1, COHORT_2_3, COHORT_4_PLUS]

MIN_COHORT_SIZE            = 30     # Minimum per-cohort n for reliable rates
MATERIAL_UPLIFT_THRESHOLD  = 10.0   # pp D30 uplift to confirm hypothesis
QUEUE_GAP_STRONG_THRESHOLD = 40.0   # % returning sessions with no active job → strong signal
QUEUE_GAP_WEAK_THRESHOLD   = 15.0   # % returning sessions with no active job → weak/against signal

SECONDS_PER_DAY = 86_400


# ---------------------------------------------------------------------------
# Cohort-rate computation functions
# ---------------------------------------------------------------------------

def _compute_cohort_rates(
    cohort_players: dict[str, list[list[dict]]]
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
            d7_count  = sum(1 for p in players if _returned_within(p, 7))
            d30_count = sum(1 for p in players if _returned_within(p, 30))
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
