"""
Tests: probe_data_summary pure functions — Issue #327
======================================================

Directly exercises each pure function in probe_data_summary without requiring a
ProbeTelemetry instance, improving isolation and supporting the ≥ 80 % line
coverage target for the new module.

Pure functions tested
---------------------
- collect_session_counts(records)        → tuple[int, int]
- collect_start_behavior_stats(records)  → tuple[int, int]
- collect_slot2_activations(records)     → int
- collect_feedback_responses(records)    → list[dict]

Run with:
    python -m pytest tests/ -v
"""

import pytest

from workshop.probe_data_summary import (
    collect_session_counts,
    collect_start_behavior_stats,
    collect_slot2_activations,
    collect_feedback_responses,
    EVENT_SESSION_FREQUENCY_PROBE,
    EVENT_SESSION_START_BEHAVIOR,
    EVENT_SLOT2_ACTIVATED,
    EVENT_FEEDBACK_RESPONSE,
)
from workshop.ab_cohort_manager import COHORT_PROBE, COHORT_CONTROL


# ---------------------------------------------------------------------------
# Helpers — build minimal raw record dicts without a ProbeTelemetry instance
# ---------------------------------------------------------------------------

def _freq_record(cohort: str) -> dict:
    return {"name": EVENT_SESSION_FREQUENCY_PROBE, "payload": {"cohort": cohort}, "timestamp": 0}


def _behavior_record(cohort: str, slot1_is_sourcing: bool, slot2_available: bool) -> dict:
    return {
        "name": EVENT_SESSION_START_BEHAVIOR,
        "payload": {
            "cohort": cohort,
            "slot1_is_sourcing": slot1_is_sourcing,
            "slot2_available": slot2_available,
        },
        "timestamp": 0,
    }


def _slot2_record(cohort: str = COHORT_PROBE) -> dict:
    return {"name": EVENT_SLOT2_ACTIVATED, "payload": {"cohort": cohort}, "timestamp": 0}


def _feedback_record(player_id: str, sentiment: str, response_text: str = "") -> dict:
    return {
        "name": EVENT_FEEDBACK_RESPONSE,
        "payload": {"player_id": player_id, "sentiment": sentiment, "response_text": response_text},
        "timestamp": 0,
    }


# ---------------------------------------------------------------------------
# TestProbeDataSummaryPureFunctions — collect_session_counts
# ---------------------------------------------------------------------------

class TestProbeDataSummaryPureFunctions:
    """
    AC: New test class directly exercising the four pure functions
        without a ProbeTelemetry instance.
    """

    # ------------------------------------------------------------------
    # collect_session_counts
    # ------------------------------------------------------------------

    def test_collect_session_counts_empty_records(self):
        probe_n, control_n = collect_session_counts([])
        assert probe_n == 0
        assert control_n == 0

    def test_collect_session_counts_probe_only(self):
        records = [_freq_record(COHORT_PROBE), _freq_record(COHORT_PROBE)]
        probe_n, control_n = collect_session_counts(records)
        assert probe_n == 2
        assert control_n == 0

    def test_collect_session_counts_control_only(self):
        records = [_freq_record(COHORT_CONTROL)]
        probe_n, control_n = collect_session_counts(records)
        assert probe_n == 0
        assert control_n == 1

    def test_collect_session_counts_both_cohorts(self):
        records = (
            [_freq_record(COHORT_PROBE)] * 5
            + [_freq_record(COHORT_CONTROL)] * 3
        )
        probe_n, control_n = collect_session_counts(records)
        assert probe_n == 5
        assert control_n == 3

    def test_collect_session_counts_unknown_cohort_not_counted(self):
        records = [
            {"name": EVENT_SESSION_FREQUENCY_PROBE, "payload": {"cohort": "unknown"}, "timestamp": 0}
        ]
        probe_n, control_n = collect_session_counts(records)
        assert probe_n == 0
        assert control_n == 0

    def test_collect_session_counts_ignores_other_event_types(self):
        """Non-frequency events should not be counted."""
        records = [
            _slot2_record(),
            _feedback_record("p1", "positive"),
        ]
        probe_n, control_n = collect_session_counts(records)
        assert probe_n == 0
        assert control_n == 0

    def test_collect_session_counts_missing_cohort_key_not_counted(self):
        """Records with no 'cohort' key in payload are silently skipped."""
        records = [
            {"name": EVENT_SESSION_FREQUENCY_PROBE, "payload": {}, "timestamp": 0}
        ]
        probe_n, control_n = collect_session_counts(records)
        assert probe_n == 0
        assert control_n == 0

    # ------------------------------------------------------------------
    # collect_start_behavior_stats
    # ------------------------------------------------------------------

    def test_collect_start_behavior_stats_empty_records(self):
        sourcing, immediate = collect_start_behavior_stats([])
        assert sourcing == 0
        assert immediate == 0

    def test_collect_start_behavior_stats_probe_sourcing_counted(self):
        records = [
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=True, slot2_available=True),
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=True, slot2_available=False),
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=False, slot2_available=True),
        ]
        sourcing, _ = collect_start_behavior_stats(records)
        assert sourcing == 2  # only records where slot1_is_sourcing=True

    def test_collect_start_behavior_stats_immediate_slot2_requires_both_flags(self):
        records = [
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=True, slot2_available=True),   # counts
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=True, slot2_available=False),  # not immediate
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=False, slot2_available=True),  # not sourcing
        ]
        _, immediate = collect_start_behavior_stats(records)
        assert immediate == 1

    def test_collect_start_behavior_stats_control_cohort_excluded(self):
        records = [
            _behavior_record(COHORT_CONTROL, slot1_is_sourcing=True, slot2_available=True),
        ]
        sourcing, immediate = collect_start_behavior_stats(records)
        assert sourcing == 0
        assert immediate == 0

    def test_collect_start_behavior_stats_unknown_cohort_excluded(self):
        records = [
            {
                "name": EVENT_SESSION_START_BEHAVIOR,
                "payload": {"cohort": "unknown", "slot1_is_sourcing": True, "slot2_available": True},
                "timestamp": 0,
            }
        ]
        sourcing, immediate = collect_start_behavior_stats(records)
        assert sourcing == 0
        assert immediate == 0

    def test_collect_start_behavior_stats_ignores_other_event_types(self):
        records = [
            _freq_record(COHORT_PROBE),
            _slot2_record(),
        ]
        sourcing, immediate = collect_start_behavior_stats(records)
        assert sourcing == 0
        assert immediate == 0

    # ------------------------------------------------------------------
    # collect_slot2_activations
    # ------------------------------------------------------------------

    def test_collect_slot2_activations_empty_records(self):
        assert collect_slot2_activations([]) == 0

    def test_collect_slot2_activations_single(self):
        assert collect_slot2_activations([_slot2_record()]) == 1

    def test_collect_slot2_activations_multiple(self):
        records = [_slot2_record() for _ in range(4)]
        assert collect_slot2_activations(records) == 4

    def test_collect_slot2_activations_ignores_other_events(self):
        records = [
            _freq_record(COHORT_PROBE),
            _feedback_record("p1", "positive"),
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=True, slot2_available=True),
        ]
        assert collect_slot2_activations(records) == 0

    # ------------------------------------------------------------------
    # collect_feedback_responses
    # ------------------------------------------------------------------

    def test_collect_feedback_responses_empty_records(self):
        assert collect_feedback_responses([]) == []

    def test_collect_feedback_responses_single(self):
        records = [_feedback_record("p1", "positive", "Great!")]
        responses = collect_feedback_responses(records)
        assert len(responses) == 1
        assert responses[0]["player_id"] == "p1"
        assert responses[0]["sentiment"] == "positive"
        assert responses[0]["response_text"] == "Great!"

    def test_collect_feedback_responses_multiple(self):
        records = [
            _feedback_record("p1", "positive", "Love it"),
            _feedback_record("p2", "neutral", "It's ok"),
            _feedback_record("p3", "negative", "Not for me"),
        ]
        responses = collect_feedback_responses(records)
        assert len(responses) == 3
        sentiments = {r["sentiment"] for r in responses}
        assert sentiments == {"positive", "neutral", "negative"}

    def test_collect_feedback_responses_empty_response_text(self):
        records = [_feedback_record("p1", "neutral")]
        responses = collect_feedback_responses(records)
        assert len(responses) == 1
        assert responses[0]["response_text"] == ""

    def test_collect_feedback_responses_ignores_other_events(self):
        records = [
            _freq_record(COHORT_PROBE),
            _slot2_record(),
            _behavior_record(COHORT_PROBE, slot1_is_sourcing=True, slot2_available=True),
        ]
        assert collect_feedback_responses(records) == []

    def test_collect_feedback_responses_does_not_include_prompted_event(self):
        """EVENT_FEEDBACK_PROMPTED is NOT EVENT_FEEDBACK_RESPONSE — must be excluded."""
        records = [
            {"name": "second_bench_feedback_prompted", "payload": {"player_id": "p1"}, "timestamp": 0}
        ]
        assert collect_feedback_responses(records) == []
