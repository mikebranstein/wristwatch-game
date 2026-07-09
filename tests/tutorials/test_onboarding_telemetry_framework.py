"""
tests/tutorials/test_onboarding_telemetry_framework.py
=======================================================
Automated tests validating the Onboarding Telemetry Baseline & Failure Map
deliverables for Issue #112.

Acceptance Criteria Coverage:
  AC1 — Baseline completion rate captured: at least 5 sessions annotated;
         tutorial completion rate (%) recorded as a numeric baseline.
         Validated here by confirming the session tracking template and
         failure-map report template contain the required completion-rate
         fields and cohort-size fields.
  AC2 — Failure map produced: ranked list of top 3–5 decision points where
         participants abandoned or required intervention, with observable
         behaviour notes per point.
         Validated here by confirming the failure-map report template
         contains a ranked heat-map table with all required columns.
  AC3 — Step-level timing recorded: average time-spent-before-abandonment
         documented per high-drop-off point.
         Validated here by confirming the annotation rubric and templates
         capture elapsed_seconds per step event.
  AC4 — Report delivered: written failure-map report template is present
         and includes all required narrative and targeting-recommendation
         sections before Phase 2 begins.
         Validated here by confirming the report template file exists and
         contains required sections.
  AC5 — Success gate confirmed or revised: report explicitly states whether
         the ~35% baseline completion rate is confirmed, revised, or not yet
         measurable; handles sub-minimum cohort gracefully.
         Validated here by confirming the report template contains the
         baseline confirmation and cohort confidence statement sections.

Test Scenarios Covered:
  TS1 — Happy path: participant completes first job; session tracking template
         supports `session_completed: true` and completion counter fields.
  TS2 — Abandon at tool-selection (S02): annotation rubric has ABANDON event
         type; step S02 is defined; failure map captures step-level drop-off.
  TS3 — Abandon mid-disassembly (S04/S05): rubric supports multiple distinct
         drop-off points; heat-map table can record multiple ranked rows.
  TS4 — Confusion without abandonment: rubric has distinct CONFUSION event
         type that is different from ABANDON — they must never be conflated.
  TS5 — Tooltip seen but ignored: rubric has TOOLTIP_SEEN_IGNORED event type
         with tooltip_displayed=true and tooltip_interacted=false fields.
  TS6 — Async recording review: annotation fields include reviewed_async and
         recording_timestamp; async review protocol is documented.
  TS7 — Sub-minimum cohort (<5): report template has a cohort shortfall /
         graceful degradation section that documents confidence level.
  TS8 — All participants complete (no failures): report template has a
         no-critical-failure-points-found section as a valid output.

Test command: pytest tests/tutorials/test_onboarding_telemetry_framework.py -v
"""

import os
import re
import pytest

# ---------------------------------------------------------------------------
# Document paths
# ---------------------------------------------------------------------------

DOCS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "onboarding-telemetry")

RUBRIC_PATH = os.path.join(DOCS_DIR, "annotation-rubric.md")
SESSION_TEMPLATE_PATH = os.path.join(DOCS_DIR, "session-tracking-template.md")
REPORT_TEMPLATE_PATH = os.path.join(DOCS_DIR, "failure-map-report-template.md")

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def rubric_text():
    assert os.path.exists(RUBRIC_PATH), (
        f"Annotation rubric not found at {RUBRIC_PATH}. "
        "The rubric deliverable must be committed before QA runs."
    )
    with open(RUBRIC_PATH, encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def session_template_text():
    assert os.path.exists(SESSION_TEMPLATE_PATH), (
        f"Session tracking template not found at {SESSION_TEMPLATE_PATH}. "
        "The session template deliverable must be committed before QA runs."
    )
    with open(SESSION_TEMPLATE_PATH, encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def report_template_text():
    assert os.path.exists(REPORT_TEMPLATE_PATH), (
        f"Failure-map report template not found at {REPORT_TEMPLATE_PATH}. "
        "The report template deliverable must be committed before QA runs."
    )
    with open(REPORT_TEMPLATE_PATH, encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Deliverable presence tests
# ---------------------------------------------------------------------------

class TestDeliverableFilesPresent:
    """Verify all three required deliverable documents exist."""

    def test_annotation_rubric_file_exists(self):
        """All ACs — annotation rubric document must exist."""
        assert os.path.exists(RUBRIC_PATH), (
            "docs/onboarding-telemetry/annotation-rubric.md is missing"
        )

    def test_session_tracking_template_file_exists(self):
        """AC1, AC3 — session tracking template must exist."""
        assert os.path.exists(SESSION_TEMPLATE_PATH), (
            "docs/onboarding-telemetry/session-tracking-template.md is missing"
        )

    def test_failure_map_report_template_file_exists(self):
        """AC2, AC4, AC5 — failure-map report template must exist."""
        assert os.path.exists(REPORT_TEMPLATE_PATH), (
            "docs/onboarding-telemetry/failure-map-report-template.md is missing"
        )


# ---------------------------------------------------------------------------
# AC1 — Baseline completion rate captured
# ---------------------------------------------------------------------------

class TestAC1BaselineCompletionRate:
    """AC1 — Session template and report template contain completion-rate fields."""

    def test_session_template_has_session_completed_field(self, session_template_text):
        """AC1, TS1 — Session tracking template must have session_completed field."""
        assert "session_completed" in session_template_text, (
            "session-tracking-template.md must include a 'session_completed' field "
            "to record whether each participant finished the first job (AC1)."
        )

    def test_session_template_has_total_sessions_duration_field(self, session_template_text):
        """AC1, TS1 — Session template must record total session duration."""
        assert "total_session_seconds" in session_template_text, (
            "session-tracking-template.md must include 'total_session_seconds' "
            "to support step-level timing baseline (AC1, AC3)."
        )

    def test_report_template_has_completion_rate_field(self, report_template_text):
        """AC1 — Report template must have a numeric tutorial completion rate field."""
        assert "completion rate" in report_template_text.lower(), (
            "failure-map-report-template.md must include a tutorial completion rate "
            "field to record the numeric baseline (AC1)."
        )

    def test_report_template_has_sessions_conducted_field(self, report_template_text):
        """AC1 — Report template must track total sessions conducted for cohort size gate."""
        assert "sessions conducted" in report_template_text.lower(), (
            "failure-map-report-template.md must track total sessions conducted "
            "to enforce the minimum-5-participants requirement (AC1)."
        )

    def test_report_template_has_cohort_summary_section(self, report_template_text):
        """AC1 — Report template must have a cohort summary section."""
        assert "Cohort Summary" in report_template_text or "cohort summary" in report_template_text.lower(), (
            "failure-map-report-template.md must contain a cohort summary section (AC1)."
        )


# ---------------------------------------------------------------------------
# AC2 — Failure map produced
# ---------------------------------------------------------------------------

class TestAC2FailureMapProduced:
    """AC2 — Annotation rubric and report template support a ranked failure map."""

    def test_rubric_defines_abandon_event_type(self, rubric_text):
        """AC2, TS2 — Rubric must define ABANDON as an explicit event type."""
        assert "ABANDON" in rubric_text, (
            "annotation-rubric.md must define ABANDON as an event type "
            "to capture hard abandonment at each step (AC2, TS2)."
        )

    def test_rubric_defines_confusion_event_type(self, rubric_text):
        """AC2, TS4 — Rubric must define CONFUSION as distinct from ABANDON."""
        assert "CONFUSION" in rubric_text, (
            "annotation-rubric.md must define CONFUSION (confusion-with-recovery) "
            "as a separate event type distinct from ABANDON (AC2, TS4)."
        )

    def test_rubric_abandon_and_confusion_are_distinct_event_types(self, rubric_text):
        """AC2, TS4 — ABANDON and CONFUSION must be different codes — they must not be conflated."""
        # Both must be present; the rubric must explicitly state the distinction
        assert "ABANDON" in rubric_text and "CONFUSION" in rubric_text, (
            "Both ABANDON and CONFUSION event types must be defined in the rubric."
        )
        # The rubric should contain wording that distinguishes them
        assert "must never be conflated" in rubric_text or "hard abandonment" in rubric_text, (
            "annotation-rubric.md must explicitly note that ABANDON and CONFUSION "
            "must not be conflated (AC2, TS4)."
        )

    def test_rubric_defines_all_nine_decision_point_steps(self, rubric_text):
        """AC2, TS2, TS3 — Rubric must define all nine decision-point steps."""
        for step_id in ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09"]:
            assert step_id in rubric_text, (
                f"annotation-rubric.md must define step {step_id} in the decision points table "
                f"so multiple distinct drop-off points can be captured (AC2, TS3)."
            )

    def test_report_template_has_ranked_heat_map_table(self, report_template_text):
        """AC2 — Report template must have a ranked failure-point heat map table."""
        assert "Failure Point Heat Map" in report_template_text or "heat map" in report_template_text.lower(), (
            "failure-map-report-template.md must contain a failure-point heat map "
            "ranking steps by abandonment + confusion frequency (AC2)."
        )

    def test_report_heat_map_table_has_abandon_column(self, report_template_text):
        """AC2, TS2 — Heat map table must have an Abandon column."""
        assert "Abandon" in report_template_text or "abandon" in report_template_text.lower(), (
            "failure-map-report-template.md heat map table must include an abandon count column (AC2)."
        )

    def test_report_heat_map_table_has_confusion_column(self, report_template_text):
        """AC2, TS4 — Heat map table must have a Confusion column."""
        assert "Confusion" in report_template_text or "confusion" in report_template_text.lower(), (
            "failure-map-report-template.md heat map table must include a confusion count column (AC2)."
        )

    def test_report_template_has_narrative_section(self, report_template_text):
        """AC2, AC4 — Report must have a narrative failure-map section with observable behaviour."""
        assert "Observable behaviour" in report_template_text or "observable behaviour" in report_template_text.lower() \
               or "Observable behavior" in report_template_text, (
            "failure-map-report-template.md must contain a narrative section documenting "
            "observable player behaviour per high-drop-off step (AC2, AC4)."
        )


# ---------------------------------------------------------------------------
# AC3 — Step-level timing recorded
# ---------------------------------------------------------------------------

class TestAC3StepLevelTiming:
    """AC3 — Elapsed time captured per step event to identify abandonment timing."""

    def test_rubric_has_elapsed_seconds_field(self, rubric_text):
        """AC3 — Annotation rubric must include elapsed_seconds per step event."""
        assert "elapsed_seconds" in rubric_text, (
            "annotation-rubric.md must define an elapsed_seconds field "
            "to record time-before-abandonment per step (AC3)."
        )

    def test_session_template_has_elapsed_seconds_in_json_blocks(self, session_template_text):
        """AC3 — Session tracking template JSON blocks must include elapsed_seconds."""
        assert "elapsed_seconds" in session_template_text, (
            "session-tracking-template.md must include elapsed_seconds in each "
            "step annotation block to capture step-level timing data (AC3)."
        )

    def test_report_template_has_avg_elapsed_seconds_column(self, report_template_text):
        """AC3 — Report template timing table must include an average elapsed seconds column."""
        assert "Avg. Elapsed" in report_template_text or "elapsed" in report_template_text.lower(), (
            "failure-map-report-template.md must include a timing table with "
            "average elapsed seconds per step (AC3)."
        )

    def test_report_template_has_root_cause_column_in_timing_table(self, report_template_text):
        """AC3 — Timing table must include root cause pattern column to confirm confusion vs. difficulty."""
        assert "Root Cause" in report_template_text or "root_cause" in report_template_text.lower(), (
            "failure-map-report-template.md timing table must include a root cause "
            "pattern column (navigational_confusion / skill_gap / ux_friction) "
            "to distinguish confusion from difficulty spike (AC3)."
        )


# ---------------------------------------------------------------------------
# AC4 — Report delivered (structure / completeness)
# ---------------------------------------------------------------------------

class TestAC4ReportDelivered:
    """AC4 — Report template is complete and linked to Phase 2 (#111)."""

    def test_report_template_references_phase2_issue(self, report_template_text):
        """AC4 — Report template must reference Phase 2 (#111) as the dependency."""
        assert "#111" in report_template_text, (
            "failure-map-report-template.md must reference Phase 2 issue #111 "
            "to confirm the report gates Phase 2 design work (AC4)."
        )

    def test_report_template_has_phase2_targeting_recommendation_section(self, report_template_text):
        """AC4, AC5 — Report must include a Phase 2 targeting recommendation section."""
        assert "Phase 2 Targeting Recommendation" in report_template_text or \
               "targeting recommendation" in report_template_text.lower(), (
            "failure-map-report-template.md must include a Phase 2 targeting "
            "recommendation section confirming or revising Phase 2 scope (AC4)."
        )

    def test_report_template_has_tooltip_effectiveness_section(self, report_template_text):
        """AC4, TS5 — Report must include a tooltip effectiveness section."""
        assert "Tooltip" in report_template_text or "tooltip" in report_template_text.lower(), (
            "failure-map-report-template.md must include a tooltip effectiveness section "
            "to identify whether tooltips are seen-but-ignored vs. not noticed (AC4, TS5)."
        )

    def test_rubric_has_tooltip_displayed_field(self, rubric_text):
        """AC4, TS5 — Rubric must capture tooltip_displayed field."""
        assert "tooltip_displayed" in rubric_text, (
            "annotation-rubric.md must include tooltip_displayed field "
            "to record whether a tooltip was shown at each step (AC4, TS5)."
        )

    def test_rubric_has_tooltip_interacted_field(self, rubric_text):
        """AC4, TS5 — Rubric must capture tooltip_interacted field."""
        assert "tooltip_interacted" in rubric_text, (
            "annotation-rubric.md must include tooltip_interacted field "
            "to distinguish seen-but-ignored from not-noticed (AC4, TS5)."
        )

    def test_rubric_defines_tooltip_seen_ignored_event_type(self, rubric_text):
        """AC4, TS5 — Rubric must define TOOLTIP_SEEN_IGNORED as explicit event type."""
        assert "TOOLTIP_SEEN_IGNORED" in rubric_text, (
            "annotation-rubric.md must define TOOLTIP_SEEN_IGNORED event type "
            "to record when a tooltip was displayed but not interacted with (AC4, TS5)."
        )


# ---------------------------------------------------------------------------
# AC5 — Success gate confirmed / revised / not measurable
# ---------------------------------------------------------------------------

class TestAC5SuccessGate:
    """AC5 — Report template explicitly handles baseline confirmation and cohort shortfall."""

    def test_report_template_has_baseline_confirmation_statement(self, report_template_text):
        """AC5 — Report must include a baseline confirmation statement field."""
        assert "Baseline Confirmation Statement" in report_template_text or \
               "baseline confirmation" in report_template_text.lower(), (
            "failure-map-report-template.md must include a Baseline Confirmation Statement "
            "section stating whether ~35% baseline is CONFIRMED, REVISED, or NOT YET MEASURABLE (AC5)."
        )

    def test_report_template_confirms_baseline_states_confirmed_option(self, report_template_text):
        """AC5 — Report template must explicitly offer a CONFIRMED option."""
        assert "CONFIRMED" in report_template_text, (
            "failure-map-report-template.md must offer a CONFIRMED baseline state option (AC5)."
        )

    def test_report_template_confirms_baseline_states_revised_option(self, report_template_text):
        """AC5 — Report template must explicitly offer a REVISED option."""
        assert "REVISED" in report_template_text, (
            "failure-map-report-template.md must offer a REVISED baseline state option (AC5)."
        )

    def test_report_template_confirms_baseline_states_not_measurable_option(self, report_template_text):
        """AC5 — Report template must explicitly offer a NOT YET MEASURABLE option."""
        assert "NOT YET MEASURABLE" in report_template_text, (
            "failure-map-report-template.md must offer a NOT YET MEASURABLE baseline state "
            "option to handle sub-minimum cohort gracefully (AC5, TS7)."
        )

    def test_report_template_has_cohort_confidence_statement(self, report_template_text):
        """AC5, TS7 — Report must document cohort confidence level for incomplete-data scenarios."""
        assert "Confidence" in report_template_text or "confidence level" in report_template_text.lower(), (
            "failure-map-report-template.md must include a confidence level statement "
            "to handle sub-minimum cohort data gracefully (AC5, TS7)."
        )

    def test_report_template_handles_cohort_shortfall_gracefully(self, report_template_text):
        """AC5, TS7 — Report must have explicit guidance for fewer-than-5-sessions scenario."""
        assert "shortfall" in report_template_text.lower() or "sub-minimum" in report_template_text.lower() \
               or "COHORT SHORTFALL" in report_template_text, (
            "failure-map-report-template.md must have a cohort shortfall / sub-minimum "
            "cohort handling section (AC5, TS7)."
        )


# ---------------------------------------------------------------------------
# TS6 — Async recording review supported
# ---------------------------------------------------------------------------

class TestTS6AsyncRecordingReview:
    """TS6 — Annotation framework must support async post-session recording review."""

    def test_rubric_has_reviewed_async_field(self, rubric_text):
        """TS6 — Rubric must include reviewed_async boolean field."""
        assert "reviewed_async" in rubric_text, (
            "annotation-rubric.md must include a reviewed_async field "
            "to indicate whether an annotation was updated via recording review (TS6)."
        )

    def test_rubric_has_recording_timestamp_field(self, rubric_text):
        """TS6 — Rubric must include recording_timestamp field for async review."""
        assert "recording_timestamp" in rubric_text, (
            "annotation-rubric.md must include a recording_timestamp field "
            "to link annotations to positions in a session recording (TS6)."
        )

    def test_rubric_has_async_review_protocol_section(self, rubric_text):
        """TS6 — Rubric must document the async review protocol."""
        assert "Async Review" in rubric_text or "async review" in rubric_text.lower() \
               or "post-session" in rubric_text.lower(), (
            "annotation-rubric.md must include an async review / post-session "
            "review protocol section (TS6)."
        )

    def test_session_template_has_async_review_section(self, session_template_text):
        """TS6 — Session tracking template must include an async review notes section."""
        assert "async" in session_template_text.lower() or "recording" in session_template_text.lower(), (
            "session-tracking-template.md must include an async recording review "
            "notes section to support post-session annotation updates (TS6)."
        )

    def test_rubric_states_async_takes_precedence_over_live(self, rubric_text):
        """TS6 — Rubric must state that async recording review takes precedence over live annotation."""
        assert "precedence" in rubric_text or "takes precedence" in rubric_text.lower(), (
            "annotation-rubric.md must state that async recording review takes precedence "
            "over live annotations to ensure accurate elapsed-time data (TS6)."
        )


# ---------------------------------------------------------------------------
# TS8 — No critical failure points found (valid outcome)
# ---------------------------------------------------------------------------

class TestTS8NoCriticalFailurePoints:
    """TS8 — Report template must support the all-complete / no-failure-points outcome."""

    def test_report_template_has_no_critical_failure_points_section(self, report_template_text):
        """TS8 — Report must include a 'no critical failure points found' output option."""
        assert "no critical failure points" in report_template_text.lower() or \
               "NO CRITICAL FAILURE POINTS" in report_template_text, (
            "failure-map-report-template.md must include a 'no critical failure points found' "
            "section as a valid and explicitly handled outcome (TS8)."
        )

    def test_report_no_failure_section_acknowledges_valid_finding(self, report_template_text):
        """TS8 — The no-failure-points section must treat it as a valid finding, not an error."""
        # The section should contain language indicating it's a valid/informative outcome
        assert "valid" in report_template_text.lower() or "informative" in report_template_text.lower(), (
            "failure-map-report-template.md no-critical-failure-points section must "
            "acknowledge this as a valid and informative finding, not an error state (TS8)."
        )
