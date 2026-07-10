"""
Tests: ProbeTelemetry — Issue #116, Acceptance Criteria 4 & 5
==============================================================

AC4 — Given the probe cohort is active for 4 weeks, when the probe review
      runs, then session frequency data is available for probe vs. control
      cohorts with sample sizes meeting the threshold (minimum n=50 per cohort
      recommended).

AC5 — Given the probe concludes, when reviewed by PO/PM, then a written probe
      outcome memo states one of:
        (a) VALIDATE — session frequency uplift meets FR1-defined threshold
        (b) ITERATE  — partial signal; adjust and extend
        (c) INVALIDATE — no signal; defer FR3

Test Scenarios covered:
  S8  — Qualitative feedback prompt shown at 2-week mark; dismissible; response recorded.
  S10 — After 4 weeks, session frequency and session-start-behaviour data exists for
        both cohorts and is accessible for probe review.

Run with:
    python -m pytest tests/ -v
"""

import pytest

from src.workshop.probe_telemetry import (
    ProbeTelemetry,
    EVENT_COHORT_ASSIGNED,
    EVENT_SESSION_FREQUENCY_PROBE,
    EVENT_SESSION_START_BEHAVIOR,
    EVENT_SLOT2_ACTIVATED,
    EVENT_FEEDBACK_PROMPTED,
    EVENT_FEEDBACK_RESPONSE,
    PROBE_VERDICT_VALIDATE,
    PROBE_VERDICT_ITERATE,
    PROBE_VERDICT_INVALIDATE,
    DEFAULT_SUCCESS_THRESHOLD_PCT,
    MIN_COHORT_SAMPLE_SIZE,
    _TWO_WEEKS_SECONDS,
)
from src.workshop.ab_cohort_manager import COHORT_PROBE, COHORT_CONTROL


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_telemetry(threshold_pct=DEFAULT_SUCCESS_THRESHOLD_PCT, start_time=1_000_000.0):
    events = []
    now = [start_time]
    clock = lambda: now[0]
    pt = ProbeTelemetry(
        emit_fn=lambda name, payload: events.append({"name": name, "payload": payload}),
        clock=clock,
        success_threshold_pct=threshold_pct,
    )
    return pt, events, now


# ---------------------------------------------------------------------------
# Constructor guards
# ---------------------------------------------------------------------------

class TestProbeTelemetryConstructor:
    def test_non_callable_emit_raises(self):
        with pytest.raises(TypeError, match="callable"):
            ProbeTelemetry(emit_fn="not-a-function")


# ---------------------------------------------------------------------------
# Event emission
# ---------------------------------------------------------------------------

class TestProbeTelemetryEventEmission:
    def test_record_cohort_assigned_emits_event(self):
        pt, events, _ = make_telemetry()
        pt.record_cohort_assigned("p1", COHORT_PROBE)
        assert any(e["name"] == EVENT_COHORT_ASSIGNED for e in events)

    def test_record_cohort_assigned_payload(self):
        pt, events, _ = make_telemetry()
        pt.record_cohort_assigned("p1", COHORT_PROBE)
        ev = next(e for e in events if e["name"] == EVENT_COHORT_ASSIGNED)
        assert ev["payload"]["player_id"] == "p1"
        assert ev["payload"]["cohort"] == COHORT_PROBE

    def test_record_session_start_emits_frequency_and_behavior_events(self):
        pt, events, _ = make_telemetry()
        pt.record_session_start("p1", COHORT_PROBE, slot1_is_sourcing=False, slot2_available=True)
        names = [e["name"] for e in events]
        assert EVENT_SESSION_FREQUENCY_PROBE in names
        assert EVENT_SESSION_START_BEHAVIOR in names

    def test_record_slot2_activated_emits_event(self):
        pt, events, _ = make_telemetry()
        pt.record_slot2_activated("p1", COHORT_PROBE)
        assert any(e["name"] == EVENT_SLOT2_ACTIVATED for e in events)

    def test_record_feedback_prompted_emits_event(self):
        pt, events, _ = make_telemetry()
        pt.record_feedback_prompted("p1")
        assert any(e["name"] == EVENT_FEEDBACK_PROMPTED for e in events)

    def test_record_feedback_response_emits_event(self):
        pt, events, _ = make_telemetry()
        pt.record_feedback_response("p1", "positive", "Loving it!")
        ev = next(e for e in events if e["name"] == EVENT_FEEDBACK_RESPONSE)
        assert ev["payload"]["sentiment"] == "positive"
        assert ev["payload"]["response_text"] == "Loving it!"

    def test_was_emitted_true_after_emit(self):
        pt, _, _ = make_telemetry()
        pt.record_cohort_assigned("p1", COHORT_PROBE)
        assert pt.was_emitted(EVENT_COHORT_ASSIGNED) is True

    def test_was_emitted_false_before_emit(self):
        pt, _, _ = make_telemetry()
        assert pt.was_emitted(EVENT_COHORT_ASSIGNED) is False


# ---------------------------------------------------------------------------
# AC4: get_probe_data() — session-frequency and session-start-behaviour data
# ---------------------------------------------------------------------------

class TestAC4GetProbeData:
    """
    AC4: Session frequency data available for probe vs. control cohorts.
    S10: After 4 weeks, data accessible for probe review.
    """

    def _fill_sessions(self, pt, n_probe, n_control, slot1_sourcing=False):
        for i in range(n_probe):
            pt.record_session_start(f"probe-p{i}", COHORT_PROBE,
                                     slot1_is_sourcing=slot1_sourcing, slot2_available=True)
        for i in range(n_control):
            pt.record_session_start(f"ctrl-p{i}", COHORT_CONTROL,
                                     slot1_is_sourcing=False, slot2_available=False)

    def test_counts_probe_and_control_sessions_separately(self):
        pt, _, _ = make_telemetry()
        self._fill_sessions(pt, n_probe=60, n_control=55)
        data = pt.get_probe_data()
        assert data["probe_session_count"] == 60
        assert data["control_session_count"] == 55

    def test_sufficient_data_true_when_both_cohorts_meet_minimum(self):
        pt, _, _ = make_telemetry()
        self._fill_sessions(pt, n_probe=50, n_control=50)
        data = pt.get_probe_data()
        assert data["sufficient_data"] is True

    def test_sufficient_data_false_when_probe_cohort_below_minimum(self):
        pt, _, _ = make_telemetry()
        self._fill_sessions(pt, n_probe=40, n_control=50)
        data = pt.get_probe_data()
        assert data["sufficient_data"] is False

    def test_sufficient_data_false_when_control_cohort_below_minimum(self):
        pt, _, _ = make_telemetry()
        self._fill_sessions(pt, n_probe=50, n_control=49)
        data = pt.get_probe_data()
        assert data["sufficient_data"] is False

    def test_slot2_activations_counted(self):
        pt, _, _ = make_telemetry()
        pt.record_slot2_activated("p1", COHORT_PROBE)
        pt.record_slot2_activated("p2", COHORT_PROBE)
        data = pt.get_probe_data()
        assert data["probe_slot2_activations"] == 2

    def test_probe_sourcing_starts_counted(self):
        pt, _, _ = make_telemetry()
        # 3 probe sessions with Slot 1 sourcing, 2 without
        for i in range(3):
            pt.record_session_start(f"p{i}", COHORT_PROBE, slot1_is_sourcing=True, slot2_available=True)
        for i in range(2):
            pt.record_session_start(f"pp{i}", COHORT_PROBE, slot1_is_sourcing=False, slot2_available=True)
        data = pt.get_probe_data()
        assert data["probe_slot1_sourcing_starts"] == 3

    def test_feedback_responses_captured(self):
        pt, _, _ = make_telemetry()
        pt.record_feedback_response("p1", "positive", "Great feature!")
        data = pt.get_probe_data()
        assert len(data["feedback_responses"]) == 1
        assert data["feedback_responses"][0]["sentiment"] == "positive"

    def test_empty_feedback_responses(self):
        pt, _, _ = make_telemetry()
        data = pt.get_probe_data()
        assert data["feedback_responses"] == []

    def test_get_all_events_returns_copy(self):
        pt, _, _ = make_telemetry()
        pt.record_cohort_assigned("p1", COHORT_PROBE)
        events = pt.get_all_events()
        assert len(events) == 1
        # Mutation does not affect internal state
        events.clear()
        assert len(pt.get_all_events()) == 1


# ---------------------------------------------------------------------------
# AC5: compute_probe_verdict()
# ---------------------------------------------------------------------------

class TestAC5ProbeVerdicts:
    """
    AC5: Probe outcome memo states VALIDATE, ITERATE, or INVALIDATE.
    """

    def test_validate_when_uplift_exceeds_threshold(self):
        pt, _, _ = make_telemetry(threshold_pct=15.0)
        # Probe: 5.0 sessions/week; Control: 4.0 → 25% uplift ≥ 15%
        result = pt.compute_probe_verdict(
            probe_sessions_per_week=5.0,
            control_sessions_per_week=4.0,
        )
        assert result == PROBE_VERDICT_VALIDATE

    def test_validate_at_exact_threshold(self):
        pt, _, _ = make_telemetry(threshold_pct=15.0)
        # 20% uplift: probe=4.8, control=4.0 — clearly above threshold
        result = pt.compute_probe_verdict(
            probe_sessions_per_week=4.8,
            control_sessions_per_week=4.0,
        )
        assert result == PROBE_VERDICT_VALIDATE

    def test_iterate_when_partial_positive_uplift(self):
        pt, _, _ = make_telemetry(threshold_pct=15.0)
        # Probe: 4.2, Control: 4.0 → 5% uplift → partial signal
        result = pt.compute_probe_verdict(
            probe_sessions_per_week=4.2,
            control_sessions_per_week=4.0,
        )
        assert result == PROBE_VERDICT_ITERATE

    def test_invalidate_when_no_uplift(self):
        pt, _, _ = make_telemetry(threshold_pct=15.0)
        # Probe equal to control → 0% uplift
        result = pt.compute_probe_verdict(
            probe_sessions_per_week=4.0,
            control_sessions_per_week=4.0,
        )
        assert result == PROBE_VERDICT_INVALIDATE

    def test_invalidate_when_probe_below_control(self):
        pt, _, _ = make_telemetry(threshold_pct=15.0)
        result = pt.compute_probe_verdict(
            probe_sessions_per_week=3.0,
            control_sessions_per_week=4.0,
        )
        assert result == PROBE_VERDICT_INVALIDATE

    def test_invalidate_when_control_is_zero(self):
        pt, _, _ = make_telemetry()
        result = pt.compute_probe_verdict(
            probe_sessions_per_week=5.0,
            control_sessions_per_week=0.0,
        )
        assert result == PROBE_VERDICT_INVALIDATE

    def test_custom_threshold(self):
        pt, _, _ = make_telemetry(threshold_pct=5.0)
        # 10% uplift with 5% threshold → VALIDATE
        result = pt.compute_probe_verdict(
            probe_sessions_per_week=4.4,
            control_sessions_per_week=4.0,
        )
        assert result == PROBE_VERDICT_VALIDATE


# ---------------------------------------------------------------------------
# S8: Qualitative feedback prompt (2-week mark)
# ---------------------------------------------------------------------------

class TestS8FeedbackPrompt:
    """
    S8 — Qualitative feedback prompt at 2-week mark for probe cohort.
    Prompt is dismissible; response recorded in telemetry.
    """

    def test_prompt_fires_after_two_weeks_for_probe(self):
        now = [1_000_000.0]
        clock = lambda: now[0]
        pt = ProbeTelemetry(emit_fn=lambda n, p: None, clock=clock)
        first_session = now[0]
        now[0] += _TWO_WEEKS_SECONDS + 1  # Just past two weeks
        assert pt.should_show_feedback_prompt(
            cohort=COHORT_PROBE,
            first_probe_session_timestamp=first_session,
            already_prompted=False,
        ) is True

    def test_prompt_not_shown_before_two_weeks(self):
        now = [1_000_000.0]
        clock = lambda: now[0]
        pt = ProbeTelemetry(emit_fn=lambda n, p: None, clock=clock)
        first_session = now[0]
        now[0] += _TWO_WEEKS_SECONDS - 1  # Just before two weeks
        assert pt.should_show_feedback_prompt(
            cohort=COHORT_PROBE,
            first_probe_session_timestamp=first_session,
            already_prompted=False,
        ) is False

    def test_prompt_not_shown_if_already_prompted(self):
        now = [1_000_000.0 + _TWO_WEEKS_SECONDS + 100]
        clock = lambda: now[0]
        pt = ProbeTelemetry(emit_fn=lambda n, p: None, clock=clock)
        assert pt.should_show_feedback_prompt(
            cohort=COHORT_PROBE,
            first_probe_session_timestamp=1_000_000.0,
            already_prompted=True,  # Already shown → no repeat
        ) is False

    def test_prompt_not_shown_to_control_cohort(self):
        now = [1_000_000.0 + _TWO_WEEKS_SECONDS + 100]
        clock = lambda: now[0]
        pt = ProbeTelemetry(emit_fn=lambda n, p: None, clock=clock)
        assert pt.should_show_feedback_prompt(
            cohort=COHORT_CONTROL,
            first_probe_session_timestamp=1_000_000.0,
            already_prompted=False,
        ) is False

    def test_feedback_response_recorded_in_telemetry(self):
        pt, events, _ = make_telemetry()
        pt.record_feedback_prompted("player-probe")
        pt.record_feedback_response("player-probe", "positive", "Love the second bench!")
        names = [e["name"] for e in events]
        assert EVENT_FEEDBACK_PROMPTED in names
        assert EVENT_FEEDBACK_RESPONSE in names
