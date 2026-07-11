"""
probe_telemetry_constants — module-level constants for the Second Bench Probe.
===============================================================================

Extracted from probe_telemetry.py (Issue #324) to keep probe_telemetry.py
within the 300-line Warning threshold (Issue #196).

All constants are re-exported from src.workshop.probe_telemetry for full
backward compatibility — existing consumers of probe_telemetry do not need
to change their imports.
"""

# ---------------------------------------------------------------------------
# __all__ — explicit export list so that `from probe_telemetry_constants
# import *` re-exports every name, including the underscore-prefixed
# _TWO_WEEKS_SECONDS (Python's import* skips private names without __all__).
# ---------------------------------------------------------------------------

__all__ = [
    "EVENT_COHORT_ASSIGNED",
    "EVENT_SESSION_FREQUENCY_PROBE",
    "EVENT_SESSION_START_BEHAVIOR",
    "EVENT_SLOT2_ACTIVATED",
    "EVENT_FEEDBACK_PROMPTED",
    "EVENT_FEEDBACK_RESPONSE",
    "PROBE_EVENTS_ALL",
    "PROBE_VERDICT_VALIDATE",
    "PROBE_VERDICT_ITERATE",
    "PROBE_VERDICT_INVALIDATE",
    "DEFAULT_SUCCESS_THRESHOLD_PCT",
    "MIN_COHORT_SAMPLE_SIZE",
    "_TWO_WEEKS_SECONDS",
]

# ---------------------------------------------------------------------------
# Event name constants
# ---------------------------------------------------------------------------

EVENT_COHORT_ASSIGNED            = "second_bench_cohort_assigned"
EVENT_SESSION_FREQUENCY_PROBE    = "session_frequency_probe"
EVENT_SESSION_START_BEHAVIOR     = "session_start_behavior_probe"
EVENT_SLOT2_ACTIVATED            = "second_bench_slot_activated"
EVENT_FEEDBACK_PROMPTED          = "second_bench_feedback_prompted"
EVENT_FEEDBACK_RESPONSE          = "second_bench_feedback_response"

PROBE_EVENTS_ALL = (
    EVENT_COHORT_ASSIGNED,
    EVENT_SESSION_FREQUENCY_PROBE,
    EVENT_SESSION_START_BEHAVIOR,
    EVENT_SLOT2_ACTIVATED,
    EVENT_FEEDBACK_PROMPTED,
    EVENT_FEEDBACK_RESPONSE,
)

# ---------------------------------------------------------------------------
# Probe outcome verdicts (AC5)
# ---------------------------------------------------------------------------

PROBE_VERDICT_VALIDATE   = "VALIDATE"
PROBE_VERDICT_ITERATE    = "ITERATE"
PROBE_VERDICT_INVALIDATE = "INVALIDATE"

# Default success threshold: 15% session-frequency uplift in the probe arm.
# Overridable based on FR1-defined threshold findings.
DEFAULT_SUCCESS_THRESHOLD_PCT = 15.0

# Minimum recommended sample size per cohort (from issue scope).
MIN_COHORT_SAMPLE_SIZE = 50

# Seconds in two weeks — used for the qualitative feedback prompt gate.
_TWO_WEEKS_SECONDS = 14 * 24 * 3600
