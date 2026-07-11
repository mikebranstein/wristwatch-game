"""
probe_data_summary — Pure data-collection helpers for the Second Bench Probe.
==============================================================================

Issue #327: Extract probe data-collection helpers to pure functions.

This module imports and re-exports the event name constants used by the
data-collection helpers so probe_telemetry.py can keep its public API unchanged
without duplicating constant definitions.

Pure functions
--------------
Each function accepts ``records: list[dict]`` (the raw event log stored inside
``ProbeTelemetry._records``) and returns a summary value.  They have **no**
side effects and do **not** depend on any instance state.

Event constants
---------------
EVENT_SESSION_FREQUENCY_PROBE, EVENT_SESSION_START_BEHAVIOR,
EVENT_SLOT2_ACTIVATED, EVENT_FEEDBACK_RESPONSE are imported from
probe_telemetry_constants.py and re-exported here for compatibility with
existing callers and tests.
"""

from __future__ import annotations

from typing import List

from src.workshop.ab_cohort_manager import COHORT_PROBE, COHORT_CONTROL
from src.workshop.probe_telemetry_constants import (
    EVENT_FEEDBACK_RESPONSE,
    EVENT_SESSION_FREQUENCY_PROBE,
    EVENT_SESSION_START_BEHAVIOR,
    EVENT_SLOT2_ACTIVATED,
)

# ---------------------------------------------------------------------------
# Pure data-collection helpers
# ---------------------------------------------------------------------------

def collect_session_counts(records: List[dict]) -> tuple:
    """
    Return ``(probe_n, control_n)`` — counts of SESSION_FREQUENCY_PROBE
    records segmented by cohort.

    Parameters
    ----------
    records : list[dict]
        Raw event records from ``ProbeTelemetry._records``.

    Returns
    -------
    tuple[int, int]
        ``(probe_session_count, control_session_count)``
    """
    probe_n = len([
        r for r in records
        if r["name"] == EVENT_SESSION_FREQUENCY_PROBE
        and r["payload"].get("cohort") == COHORT_PROBE
    ])
    control_n = len([
        r for r in records
        if r["name"] == EVENT_SESSION_FREQUENCY_PROBE
        and r["payload"].get("cohort") == COHORT_CONTROL
    ])
    return probe_n, control_n


def collect_start_behavior_stats(records: List[dict]) -> tuple:
    """
    Return ``(probe_starts_with_sourcing, probe_immediate_slot2)`` from
    SESSION_START_BEHAVIOR records for the probe cohort.

    Parameters
    ----------
    records : list[dict]
        Raw event records from ``ProbeTelemetry._records``.

    Returns
    -------
    tuple[int, int]
        ``(probe_slot1_sourcing_starts, probe_slot2_immediate_starts)``
    """
    start_behavior = [
        r for r in records if r["name"] == EVENT_SESSION_START_BEHAVIOR
    ]
    probe_starts_with_sourcing = sum(
        1 for r in start_behavior
        if r["payload"].get("cohort") == COHORT_PROBE
        and r["payload"].get("slot1_is_sourcing")
    )
    probe_immediate_slot2 = sum(
        1 for r in start_behavior
        if r["payload"].get("cohort") == COHORT_PROBE
        and r["payload"].get("slot1_is_sourcing")
        and r["payload"].get("slot2_available")
    )
    return probe_starts_with_sourcing, probe_immediate_slot2


def collect_slot2_activations(records: List[dict]) -> int:
    """
    Return the count of SLOT2_ACTIVATED events.

    Parameters
    ----------
    records : list[dict]
        Raw event records from ``ProbeTelemetry._records``.

    Returns
    -------
    int
    """
    return len([
        r for r in records if r["name"] == EVENT_SLOT2_ACTIVATED
    ])


def collect_feedback_responses(records: List[dict]) -> list:
    """
    Return list of feedback response payloads.

    Parameters
    ----------
    records : list[dict]
        Raw event records from ``ProbeTelemetry._records``.

    Returns
    -------
    list[dict]
    """
    return [
        r["payload"] for r in records
        if r["name"] == EVENT_FEEDBACK_RESPONSE
    ]
