"""
ProbeTelemetry — session-frequency and session-start behaviour telemetry for the
Second Bench Probe (Issue #116).
================================================================================

Issue #116: Two-Bench Workshop Probe — Second Parallel Bench Slot (Phase 1 A/B)

Design summary (from approved design decision):
    Telemetry adds session-frequency events and session-start-behavior events,
    segmented by cohort arm (probe / control).  Uses the EXISTING in-game
    telemetry infrastructure — does NOT create a parallel telemetry system.

    The qualitative feedback prompt fires at the 2-week mark for probe cohort
    players; the response is recorded in telemetry.

Events emitted
--------------
SECOND_BENCH_COHORT_ASSIGNED    — written once at first session (cohort stabilisation)
SESSION_FREQUENCY_PROBE         — written at every session start, with cohort tag
SESSION_START_BEHAVIOR_PROBE    — written at session start, records whether player
                                   immediately starts a second job when Slot 1 is sourcing
SECOND_BENCH_SLOT_ACTIVATED     — written when a player first intakes a job into Slot 2
SECOND_BENCH_FEEDBACK_PROMPTED  — written when the 2-week feedback prompt is shown
SECOND_BENCH_FEEDBACK_RESPONSE  — written when the player responds to the prompt

Probe review data
-----------------
After 4 weeks, call get_probe_data() to retrieve session-frequency and
session-start-behaviour summaries per cohort, suitable for the probe outcome memo.

Probe outcome verdicts (AC5)
----------------------------
PROBE_VERDICT_VALIDATE      — session-frequency uplift ≥ threshold; proceed to FR3
PROBE_VERDICT_ITERATE       — partial signal; adjust and extend
PROBE_VERDICT_INVALIDATE    — no signal; defer FR3
"""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional

from workshop.ab_cohort_manager import COHORT_PROBE, COHORT_CONTROL
from workshop.probe_data_summary import (
    collect_session_counts,
    collect_start_behavior_stats,
    collect_slot2_activations,
    collect_feedback_responses,
)
from workshop.probe_telemetry_constants import *  # noqa: F401,F403  (intentional re-export)


class ProbeTelemetry:
    """
    Records and queries Second Bench Probe telemetry events.

    Parameters
    ----------
    emit_fn : callable
        ``(event_name: str, payload: dict) -> None``
        The existing instrumentation hook (injected at startup).
    clock : callable, optional
        Zero-arg callable returning a float Unix timestamp.  Defaults to
        ``time.time``.  Injectable for deterministic testing.
    success_threshold_pct : float, optional
        Session-frequency uplift % required for a VALIDATE verdict.
        Defaults to DEFAULT_SUCCESS_THRESHOLD_PCT (15 %).
    """

    def __init__(
        self,
        emit_fn: Callable[[str, dict], None],
        clock=None,
        success_threshold_pct: float = DEFAULT_SUCCESS_THRESHOLD_PCT,
    ):
        if not callable(emit_fn):
            raise TypeError("emit_fn must be callable.")
        self._emit = emit_fn
        self._clock = clock if clock is not None else time.time
        self._success_threshold_pct = success_threshold_pct
        self._records: List[Dict[str, Any]] = []

    # -----------------------------------------------------------------------
    # Telemetry event methods
    # -----------------------------------------------------------------------

    def record_cohort_assigned(self, player_id: str, cohort: str) -> None:
        """
        Emit once at first session when cohort is written (cohort stabilisation).

        Parameters
        ----------
        player_id : str
        cohort : str
            'probe' | 'control'
        """
        self._emit_event(EVENT_COHORT_ASSIGNED, {
            "player_id": player_id,
            "cohort": cohort,
        })

    def record_session_start(
        self,
        player_id: str,
        cohort: str,
        slot1_is_sourcing: bool,
        slot2_available: bool,
        session_timestamp: Optional[float] = None,
    ) -> None:
        """
        Emit at every session start; captures session-frequency and
        session-start-behaviour data segmented by cohort.

        Parameters
        ----------
        player_id : str
        cohort : str
            'probe' | 'control'
        slot1_is_sourcing : bool
            True when Slot 1 has an active sourcing wait at session load.
        slot2_available : bool
            True when the player has access to Slot 2 (probe arm + mastery gate met).
        session_timestamp : float, optional
            Unix timestamp of the session start (defaults to now).
        """
        ts = session_timestamp if session_timestamp is not None else self._clock()
        self._emit_event(EVENT_SESSION_FREQUENCY_PROBE, {
            "player_id": player_id,
            "cohort": cohort,
            "timestamp": ts,
        })
        self._emit_event(EVENT_SESSION_START_BEHAVIOR, {
            "player_id": player_id,
            "cohort": cohort,
            "slot1_is_sourcing": slot1_is_sourcing,
            "slot2_available": slot2_available,
            "timestamp": ts,
        })

    def record_slot2_activated(self, player_id: str, cohort: str) -> None:
        """
        Emit when a player first intakes a job into Slot 2.

        Parameters
        ----------
        player_id : str
        cohort : str
        """
        self._emit_event(EVENT_SLOT2_ACTIVATED, {
            "player_id": player_id,
            "cohort": cohort,
        })

    def record_feedback_prompted(self, player_id: str) -> None:
        """
        Emit when the 2-week qualitative feedback prompt is shown to the player.

        Parameters
        ----------
        player_id : str
        """
        self._emit_event(EVENT_FEEDBACK_PROMPTED, {"player_id": player_id})

    def record_feedback_response(self, player_id: str, sentiment: str, response_text: str = "") -> None:
        """
        Emit when the player responds to the 2-week feedback prompt.

        Parameters
        ----------
        player_id : str
        sentiment : str
            'positive' | 'neutral' | 'negative'
        response_text : str, optional
            Optional free-text response captured from the prompt.
        """
        self._emit_event(EVENT_FEEDBACK_RESPONSE, {
            "player_id": player_id,
            "sentiment": sentiment,
            "response_text": response_text,
        })

    # -----------------------------------------------------------------------
    # Probe review helpers (AC4, AC5)
    # -----------------------------------------------------------------------

    def should_show_feedback_prompt(
        self,
        cohort: str,
        first_probe_session_timestamp: float,
        already_prompted: bool = False,
    ) -> bool:
        """
        Return True when the player should receive the 2-week feedback prompt.

        Parameters
        ----------
        cohort : str
            'probe' | 'control'
        first_probe_session_timestamp : float
            Unix timestamp of the player's first session in the probe.
        already_prompted : bool
            True if the prompt has already been shown (idempotent guard).
        """
        if cohort != COHORT_PROBE or already_prompted:
            return False
        elapsed = self._clock() - first_probe_session_timestamp
        return elapsed >= _TWO_WEEKS_SECONDS

    def get_probe_data(self) -> Dict[str, Any]:
        """
        Return session-frequency and session-start-behaviour summaries
        for both cohorts, suitable for the 4-week probe outcome review.

        Returns
        -------
        dict with keys:
            probe_session_count : int
            control_session_count : int
            probe_slot2_activations : int
            probe_slot1_sourcing_starts : int   — Slot-1 sourcing wait at session start
            probe_slot2_immediate_starts : int  — player started Slot 2 while Slot 1 sourcing
            feedback_responses : list[dict]
            sufficient_data : bool              — True when both cohorts have ≥ MIN_COHORT_SAMPLE_SIZE
        """
        probe_n, control_n = collect_session_counts(self._records)
        probe_sourcing, probe_immediate = collect_start_behavior_stats(self._records)
        slot2_count = collect_slot2_activations(self._records)
        feedback_responses = collect_feedback_responses(self._records)

        return {
            "probe_session_count": probe_n,
            "control_session_count": control_n,
            "probe_slot2_activations": slot2_count,
            "probe_slot1_sourcing_starts": probe_sourcing,
            "probe_slot2_immediate_starts": probe_immediate,
            "feedback_responses": feedback_responses,
            "sufficient_data": (
                probe_n >= MIN_COHORT_SAMPLE_SIZE
                and control_n >= MIN_COHORT_SAMPLE_SIZE
            ),
        }

    def compute_probe_verdict(
        self,
        probe_sessions_per_week: float,
        control_sessions_per_week: float,
    ) -> str:
        """
        Compute the probe outcome verdict (AC5).

        Parameters
        ----------
        probe_sessions_per_week : float
            Average sessions per week for the probe cohort over the 4-week window.
        control_sessions_per_week : float
            Average sessions per week for the control cohort over the same window.

        Returns
        -------
        str
            PROBE_VERDICT_VALIDATE | PROBE_VERDICT_ITERATE | PROBE_VERDICT_INVALIDATE
        """
        if control_sessions_per_week <= 0:
            return PROBE_VERDICT_INVALIDATE

        uplift_pct = (
            (probe_sessions_per_week - control_sessions_per_week)
            / control_sessions_per_week
        ) * 100.0

        if uplift_pct >= self._success_threshold_pct:
            return PROBE_VERDICT_VALIDATE
        if uplift_pct > 0:
            return PROBE_VERDICT_ITERATE
        return PROBE_VERDICT_INVALIDATE

    def get_all_events(self) -> List[Dict[str, Any]]:
        """Return a copy of all recorded events (for testing / QA)."""
        return list(self._records)

    def was_emitted(self, event_name: str) -> bool:
        """Return True if *event_name* was emitted at least once."""
        return any(r["name"] == event_name for r in self._records)

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _emit_event(self, name: str, payload: Dict[str, Any]) -> None:
        record = {"name": name, "payload": payload, "timestamp": self._clock()}
        self._records.append(record)
        self._emit(name, payload)
