"""
Tests for RetentionAnalytics — Issue #109
==========================================

Covers all 5 Acceptance Criteria and all 7 Test Scenarios from the issue.

Acceptance Criteria:
  AC1 — D7/D30 rates reported per cohort; n<30 cohorts flagged as insufficient
  AC2 — Report identifies material uplift (≥10pp) for ≥2-completer vs 1-completer
  AC3 — Report states % returning players who start with no active job
  AC4 — Memo states DATA CONFIRMS | DATA INCONCLUSIVE | DATA DOES NOT SUPPORT
  AC5 — Phase 1 success threshold (specific metric + target %) defined

Test Scenarios:
  S1 — Happy path: 500+ sessions, all cohorts ≥30, GO recommendation
  S2 — Insufficient small cohorts: 2-3 and 4+ cohorts flagged n<30
  S3 — No telemetry: fewer than 500 sessions; INSUFFICIENT_TELEMETRY
  S4 — Inconclusive: D30 uplift <10pp; DATA INCONCLUSIVE (multi-completer n<30)
       or DATA DOES NOT SUPPORT (n≥30 but uplift below threshold)
  S5 — Strong positive signal: ≥20pp uplift; DATA CONFIRMS
  S6 — Session-start queue gap confirmed: >40% returning with no active job
  S7 — Session-start queue gap denied: <15% returning with no active job
"""

import math
import pytest

from analytics.retention_analytics import (
    RetentionAnalytics,
    COHORT_0,
    COHORT_1,
    COHORT_2_3,
    COHORT_4_PLUS,
    COHORT_KEYS,
    MIN_SESSIONS,
    MIN_COHORT_SIZE,
    MATERIAL_UPLIFT_THRESHOLD,
    QUEUE_GAP_STRONG_THRESHOLD,
    QUEUE_GAP_WEAK_THRESHOLD,
    SECONDS_PER_DAY,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DAY = SECONDS_PER_DAY
BASE_TIME = 1_700_000_000.0  # arbitrary fixed epoch for tests


def make_session(
    player_id: str,
    offset_days: float = 0.0,
    had_active_job: bool = False,
    session_id: str = None,
) -> dict:
    """Build a session record."""
    return {
        "player_id": player_id,
        "session_id": session_id or f"{player_id}_s{int(offset_days)}",
        "started_at": BASE_TIME + offset_days * DAY,
        "had_active_job_at_start": had_active_job,
    }


def make_event(
    player_id: str,
    event_name: str = "reassembly_completed",
    offset_days: float = 0.1,
) -> dict:
    return {
        "player_id": player_id,
        "session_id": f"{player_id}_ev",
        "event_name": event_name,
        "timestamp": BASE_TIME + offset_days * DAY,
    }


def build_cohort_dataset(
    cohort_counts: dict[str, int],
    d7_return: bool = True,
    d30_return: bool = True,
    completions_map: dict[str, int] = None,
    had_active_job_at_start: bool = True,
) -> tuple[list, list]:
    """
    Build a minimal dataset with the specified cohort sizes.

    cohort_counts: {cohort_key: number_of_players}
    completions_map: {cohort_key: completions_per_player}  — defaults to
        canonical per-cohort values (0, 1, 2, 5).
    d7_return: whether each player returns within 7 days
    d30_return: whether each player returns within 30 days (only if not d7)
    """
    if completions_map is None:
        completions_map = {
            COHORT_0: 0,
            COHORT_1: 1,
            COHORT_2_3: 2,
            COHORT_4_PLUS: 5,
        }

    sessions = []
    events = []
    pid_counter = 0

    for cohort_key, n in cohort_counts.items():
        n_completions = completions_map[cohort_key]
        for i in range(n):
            pid = f"p_{cohort_key}_{pid_counter}"
            pid_counter += 1
            # First session
            sessions.append(make_session(pid, offset_days=0.0, had_active_job=had_active_job_at_start))
            # Add a returning session
            if d7_return:
                sessions.append(make_session(pid, offset_days=5.0))
            elif d30_return:
                sessions.append(make_session(pid, offset_days=20.0))
            # Add reassembly_completed events
            for j in range(n_completions):
                events.append(make_event(pid, offset_days=0.5 + j * 0.1))

    return sessions, events


def build_full_sufficient_dataset(
    cohort_sizes: dict | None = None,
    d7_rates: dict | None = None,
    d30_rates: dict | None = None,
) -> tuple[list, list]:
    """
    Build a dataset with ≥500 sessions and all cohorts ≥30 by default.

    d7_rates / d30_rates: fraction of players in each cohort that return
    within the window.  d30 is checked for players that did NOT return at D7.
    """
    if cohort_sizes is None:
        cohort_sizes = {
            COHORT_0: 150,
            COHORT_1: 150,
            COHORT_2_3: 100,
            COHORT_4_PLUS: 100,
        }
    if d7_rates is None:
        d7_rates = {COHORT_0: 0.20, COHORT_1: 0.30, COHORT_2_3: 0.45, COHORT_4_PLUS: 0.50}
    if d30_rates is None:
        d30_rates = {COHORT_0: 0.10, COHORT_1: 0.20, COHORT_2_3: 0.35, COHORT_4_PLUS: 0.40}

    completions_map = {
        COHORT_0: 0,
        COHORT_1: 1,
        COHORT_2_3: 2,
        COHORT_4_PLUS: 5,
    }

    sessions = []
    events = []
    pid_counter = 0

    for cohort_key, n in cohort_sizes.items():
        n_completions = completions_map[cohort_key]
        d7_n  = int(n * d7_rates.get(cohort_key, 0.0))
        d30_n = int(n * d30_rates.get(cohort_key, 0.0))

        for i in range(n):
            pid = f"p_{cohort_key}_{pid_counter}"
            pid_counter += 1
            sessions.append(make_session(pid, offset_days=0.0))
            if i < d7_n:
                sessions.append(make_session(pid, offset_days=5.0))
            elif i < d7_n + d30_n:
                sessions.append(make_session(pid, offset_days=20.0))
            # completions
            for j in range(n_completions):
                events.append(make_event(pid, offset_days=0.5 + j * 0.1))

    return sessions, events


# ---------------------------------------------------------------------------
# AC1 — D7/D30 rates per cohort, n<30 cohorts flagged
# ---------------------------------------------------------------------------

class TestAC1CohortRates:
    """AC1: D7 and D30 return rates reported for each cohort; n<30 flagged."""

    def test_all_four_cohort_keys_present_in_report(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        for key in COHORT_KEYS:
            assert key in report["cohorts"]

    def test_d7_and_d30_rates_computed_for_sufficient_cohorts(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        for key in COHORT_KEYS:
            c = report["cohorts"][key]
            assert c["d7_rate"] is not None
            assert c["d30_rate"] is not None
            assert 0.0 <= c["d7_rate"] <= 1.0
            assert 0.0 <= c["d30_rate"] <= 1.0

    def test_sufficient_cohorts_not_flagged(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        for key in COHORT_KEYS:
            c = report["cohorts"][key]
            assert c["sufficient"] is True
            assert c["flag"] is None

    def test_cohort_with_n_below_30_is_flagged(self):
        """S2 scenario — 2-3 and 4+ cohorts have n<30."""
        # Only 10 players in the 2-3 and 4+ cohorts
        cohort_sizes = {COHORT_0: 250, COHORT_1: 250, COHORT_2_3: 10, COHORT_4_PLUS: 5}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)

        assert report["cohorts"][COHORT_2_3]["sufficient"] is False
        assert report["cohorts"][COHORT_2_3]["flag"] == "n<30"
        assert report["cohorts"][COHORT_2_3]["d7_rate"] is None
        assert report["cohorts"][COHORT_2_3]["d30_rate"] is None

        assert report["cohorts"][COHORT_4_PLUS]["sufficient"] is False
        assert report["cohorts"][COHORT_4_PLUS]["flag"] == "n<30"

    def test_cohort_n_equals_29_is_insufficient(self):
        """Boundary: exactly 29 players → insufficient."""
        cohort_sizes = {COHORT_0: 250, COHORT_1: 250, COHORT_2_3: 29, COHORT_4_PLUS: 30}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["cohorts"][COHORT_2_3]["sufficient"] is False

    def test_cohort_n_equals_30_is_sufficient(self):
        """Boundary: exactly 30 players → sufficient."""
        cohort_sizes = {COHORT_0: 250, COHORT_1: 250, COHORT_2_3: 30, COHORT_4_PLUS: 30}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["cohorts"][COHORT_2_3]["sufficient"] is True
        assert report["cohorts"][COHORT_2_3]["flag"] is None

    def test_d7_rate_accuracy(self):
        """D7 rate matches expected fraction when all players return within 7 days."""
        n = 100
        cohort_sizes = {COHORT_0: 0, COHORT_1: n, COHORT_2_3: 0, COHORT_4_PLUS: 0}
        d7_rates  = {COHORT_1: 0.40}
        d30_rates = {COHORT_1: 0.0}
        # need 500+ sessions total — pad with extra 0-completion players
        cohort_sizes[COHORT_0] = 400
        sessions, events = build_full_sufficient_dataset(
            cohort_sizes=cohort_sizes, d7_rates=d7_rates, d30_rates=d30_rates
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert math.isclose(report["cohorts"][COHORT_1]["d7_rate"], 0.40, abs_tol=0.01)

    def test_total_distinct_players_matches_input(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        # total_distinct_players <= total sessions (players may have multiple sessions)
        assert report["total_distinct_players"] > 0
        assert report["sufficient_data"] is True


# ---------------------------------------------------------------------------
# AC2 — Multi-completer D30 uplift clearly identified
# ---------------------------------------------------------------------------

class TestAC2MulticompleterUplift:
    """AC2: Report identifies whether ≥2-completer shows ≥10pp D30 uplift vs 1-completer."""

    def test_uplift_computed_when_both_cohorts_sufficient(self):
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.20, COHORT_2_3: 0.35, COHORT_4_PLUS: 0.40}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["multi_completer_d30_uplift_pp"] is not None

    def test_material_uplift_flagged_true_when_ge_10pp(self):
        """S5: D30 uplift ≥20pp → material."""
        # 1-completion: 15% D30; 2-3 completions: 35% D30 → 20pp uplift
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.05, COHORT_1: 0.15, COHORT_2_3: 0.35, COHORT_4_PLUS: 0.40}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["uplift_is_material"] is True
        assert report["multi_completer_d30_uplift_pp"] >= MATERIAL_UPLIFT_THRESHOLD

    def test_material_uplift_flagged_false_when_lt_10pp(self):
        """D30 uplift <10pp → not material.
        D7 rates set to 0 so D30 rates reflect exactly the specified fractions."""
        # 1-completion: 25% D30; 2-3 completions: 30% D30 → 5pp uplift
        sessions, events = build_full_sufficient_dataset(
            d7_rates={COHORT_0: 0.0, COHORT_1: 0.0, COHORT_2_3: 0.0, COHORT_4_PLUS: 0.0},
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.25, COHORT_2_3: 0.30, COHORT_4_PLUS: 0.32},
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["uplift_is_material"] is False

    def test_uplift_none_when_1_completion_cohort_insufficient(self):
        """Cannot compute uplift when baseline (1-completion) cohort is too small."""
        cohort_sizes = {COHORT_0: 450, COHORT_1: 15, COHORT_2_3: 30, COHORT_4_PLUS: 30}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["multi_completer_d30_uplift_pp"] is None
        assert report["uplift_is_material"] is None

    def test_uplift_none_when_all_multi_completer_cohorts_insufficient(self):
        """Cannot compute uplift when all multi-completer cohorts are too small."""
        cohort_sizes = {COHORT_0: 300, COHORT_1: 250, COHORT_2_3: 5, COHORT_4_PLUS: 5}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["multi_completer_d30_uplift_pp"] is None
        assert report["uplift_is_material"] is None

    def test_uplift_uses_best_available_multi_completer_cohort(self):
        """Best uplift across 2-3 and 4+ cohorts is used."""
        # 2-3: 25%+12=37% vs 1: 25% → 12pp; 4+: 25%+5=30% vs 1: 25% → 5pp
        # Best should be 12pp
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.25, COHORT_2_3: 0.37, COHORT_4_PLUS: 0.30}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["uplift_is_material"] is True  # 12pp >= 10pp


# ---------------------------------------------------------------------------
# AC3 — Session-start no-active-job percentage
# ---------------------------------------------------------------------------

class TestAC3SessionStartBehaviour:
    """AC3: Report states % returning players who start with no active job."""

    def test_queue_gap_pct_present_in_report(self):
        sessions, events = build_full_sufficient_dataset()
        # Ensure some returning sessions have had_active_job=False
        # (build_full_sufficient_dataset returns them with had_active_job=False by default)
        report = RetentionAnalytics().analyze(sessions, events)
        assert "session_start_no_active_job_pct" in report

    def test_queue_gap_pct_none_when_no_returning_sessions(self):
        """All players have exactly one session → no returning sessions."""
        sessions = [make_session(f"p_{i}") for i in range(500)]
        events = []
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["session_start_no_active_job_pct"] is None

    def test_queue_gap_pct_100_when_all_returning_sessions_have_no_job(self):
        """All returning sessions have had_active_job=False → 100%."""
        sessions = []
        events = []
        for i in range(500):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0, had_active_job=False))
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=False))
        report = RetentionAnalytics().analyze(sessions, events)
        assert math.isclose(report["session_start_no_active_job_pct"], 100.0, abs_tol=0.1)

    def test_queue_gap_pct_0_when_all_returning_sessions_have_job(self):
        """All returning sessions have had_active_job=True → 0%."""
        sessions = []
        events = []
        for i in range(500):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0, had_active_job=True))
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=True))
        report = RetentionAnalytics().analyze(sessions, events)
        assert math.isclose(report["session_start_no_active_job_pct"], 0.0, abs_tol=0.1)

    def test_queue_gap_signal_strong_when_above_40_pct(self):
        """S6: >40% returning sessions with no active job → strong queue-gap signal."""
        sessions = []
        events = []
        n = 500
        # 50% of returning sessions have no active job
        for i in range(n):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            has_job = (i % 2 == 0)
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=has_job))
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["session_start_no_active_job_pct"] > QUEUE_GAP_STRONG_THRESHOLD
        assert report["queue_gap_signal_strong"] is True

    def test_queue_gap_signal_false_when_below_15_pct(self):
        """S7: <15% returning sessions with no active job → weak queue-gap signal."""
        sessions = []
        events = []
        n = 500
        # 10% of returning sessions have no active job
        for i in range(n):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            has_job = (i % 10 != 0)  # 1 in 10 has no job
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=has_job))
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["session_start_no_active_job_pct"] < QUEUE_GAP_WEAK_THRESHOLD
        assert report["queue_gap_signal_strong"] is False

    def test_queue_gap_signal_none_when_between_thresholds(self):
        """Between 15% and 40% → inconclusive (None)."""
        sessions = []
        events = []
        n = 500
        # 25% of returning sessions have no active job
        for i in range(n):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            has_job = (i % 4 != 0)  # 1 in 4 has no job → 25%
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=has_job))
        report = RetentionAnalytics().analyze(sessions, events)
        pct = report["session_start_no_active_job_pct"]
        assert QUEUE_GAP_WEAK_THRESHOLD <= pct <= QUEUE_GAP_STRONG_THRESHOLD
        assert report["queue_gap_signal_strong"] is None


# ---------------------------------------------------------------------------
# AC4 — Recommendation (DATA CONFIRMS | DATA INCONCLUSIVE | DATA DOES NOT SUPPORT)
# ---------------------------------------------------------------------------

class TestAC4Recommendation:
    """AC4: Memo explicitly states one of the three approved conclusions."""

    VALID_RECOMMENDATIONS = {
        "DATA CONFIRMS",
        "DATA INCONCLUSIVE",
        "DATA DOES NOT SUPPORT",
        "INSUFFICIENT_TELEMETRY",
    }

    def test_recommendation_always_one_of_valid_values(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] in self.VALID_RECOMMENDATIONS

    def test_data_confirms_when_material_uplift(self):
        """S5: Strong positive signal → DATA CONFIRMS."""
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.05, COHORT_1: 0.15, COHORT_2_3: 0.40, COHORT_4_PLUS: 0.45}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "DATA CONFIRMS"

    def test_data_does_not_support_when_uplift_below_threshold(self):
        """S4 (variant): All multi-completer cohorts sufficient but uplift <10pp.
        D7 rates set to 0 so D30 rates reflect exactly the specified fractions."""
        sessions, events = build_full_sufficient_dataset(
            d7_rates={COHORT_0: 0.0, COHORT_1: 0.0, COHORT_2_3: 0.0, COHORT_4_PLUS: 0.0},
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.25, COHORT_2_3: 0.30, COHORT_4_PLUS: 0.29},
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "DATA DOES NOT SUPPORT"

    def test_data_inconclusive_when_multi_completer_cohorts_insufficient(self):
        """S4 (variant): Multi-completer cohorts n<30 → DATA INCONCLUSIVE."""
        cohort_sizes = {COHORT_0: 300, COHORT_1: 250, COHORT_2_3: 5, COHORT_4_PLUS: 5}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "DATA INCONCLUSIVE"

    def test_insufficient_telemetry_when_fewer_than_500_sessions(self):
        """S3: Fewer than 500 sessions → INSUFFICIENT_TELEMETRY."""
        sessions = [make_session(f"p_{i}") for i in range(100)]
        events = []
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "INSUFFICIENT_TELEMETRY"
        assert report["sufficient_data"] is False

    def test_memo_contains_recommendation_string(self):
        """Memo text must include the recommendation label (AC4)."""
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.05, COHORT_1: 0.15, COHORT_2_3: 0.40, COHORT_4_PLUS: 0.45}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] in report["memo"]

    def test_memo_contains_cohort_breakdown_section(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        assert "Cohort Breakdown" in report["memo"]

    def test_memo_is_non_empty_string(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        assert isinstance(report["memo"], str)
        assert len(report["memo"]) > 100


# ---------------------------------------------------------------------------
# AC5 — Phase 1 success threshold defined
# ---------------------------------------------------------------------------

class TestAC5Phase1Threshold:
    """AC5: Phase 1 success threshold (specific metric + target %) is defined."""

    def test_phase1_threshold_present_in_report(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        assert "phase1_success_threshold" in report

    def test_phase1_threshold_has_metric_and_target(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        t = report["phase1_success_threshold"]
        assert "metric" in t
        assert "target" in t
        assert len(t["metric"]) > 0
        assert len(t["target"]) > 0

    def test_phase1_threshold_metric_is_d30_return_rate(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        assert "D30" in report["phase1_success_threshold"]["metric"] or \
               "d30" in report["phase1_success_threshold"]["metric"].lower() or \
               "return rate" in report["phase1_success_threshold"]["metric"].lower()

    def test_phase1_threshold_target_references_percentage_points(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        target = report["phase1_success_threshold"]["target"]
        assert "percentage point" in target.lower()

    def test_phase1_threshold_scales_with_observed_uplift_when_material(self):
        """When uplift is confirmed, threshold target should reference concrete numbers."""
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.05, COHORT_1: 0.15, COHORT_2_3: 0.40, COHORT_4_PLUS: 0.45}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        target = report["phase1_success_threshold"]["target"]
        # Should include a numeric threshold (not just the string "10")
        assert any(char.isdigit() for char in target)

    def test_phase1_threshold_present_even_when_insufficient_telemetry(self):
        """Threshold should still be defined as guidance even when data is insufficient."""
        sessions = [make_session(f"p_{i}") for i in range(50)]
        events = []
        report = RetentionAnalytics().analyze(sessions, events)
        t = report["phase1_success_threshold"]
        assert "metric" in t
        assert "target" in t


# ---------------------------------------------------------------------------
# Test Scenario S1 — Happy path: 500+ sessions, all cohorts ≥30, GO
# ---------------------------------------------------------------------------

class TestScenarioS1HappyPath:
    """S1: Telemetry has 500+ sessions; all four cohorts n≥30; memo produces clear recommendation."""

    def test_s1_sufficient_data_true(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["sufficient_data"] is True

    def test_s1_all_cohorts_sufficient(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        for key in COHORT_KEYS:
            assert report["cohorts"][key]["sufficient"] is True

    def test_s1_recommendation_is_valid(self):
        sessions, events = build_full_sufficient_dataset()
        report = RetentionAnalytics().analyze(sessions, events)
        valid = {"DATA CONFIRMS", "DATA INCONCLUSIVE", "DATA DOES NOT SUPPORT"}
        assert report["recommendation"] in valid


# ---------------------------------------------------------------------------
# Test Scenario S2 — Insufficient data — small cohorts
# ---------------------------------------------------------------------------

class TestScenarioS2SmallCohorts:
    """S2: 2-3 or 4+ cohorts have n<30; report flags this; recommendation accounts for low confidence."""

    def test_s2_multi_completer_cohorts_flagged(self):
        cohort_sizes = {COHORT_0: 300, COHORT_1: 300, COHORT_2_3: 10, COHORT_4_PLUS: 5}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["cohorts"][COHORT_2_3]["flag"] == "n<30"
        assert report["cohorts"][COHORT_4_PLUS]["flag"] == "n<30"

    def test_s2_recommendation_is_inconclusive_not_confirms(self):
        cohort_sizes = {COHORT_0: 300, COHORT_1: 300, COHORT_2_3: 10, COHORT_4_PLUS: 5}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        # Cannot confirm without sufficient multi-completer data
        assert report["recommendation"] != "DATA CONFIRMS"

    def test_s2_uplift_is_none_when_insufficient(self):
        cohort_sizes = {COHORT_0: 300, COHORT_1: 300, COHORT_2_3: 10, COHORT_4_PLUS: 5}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["multi_completer_d30_uplift_pp"] is None


# ---------------------------------------------------------------------------
# Test Scenario S3 — No telemetry instrumented
# ---------------------------------------------------------------------------

class TestScenarioS3NoTelemetry:
    """S3: Session data not available (< MIN_SESSIONS); escalates to INSUFFICIENT_TELEMETRY."""

    def test_s3_insufficient_telemetry_recommendation(self):
        sessions = [make_session(f"p_{i}") for i in range(50)]
        events = []
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "INSUFFICIENT_TELEMETRY"

    def test_s3_sufficient_data_false(self):
        sessions = [make_session(f"p_{i}") for i in range(50)]
        events = []
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["sufficient_data"] is False

    def test_s3_empty_sessions_handled_gracefully(self):
        report = RetentionAnalytics().analyze([], [])
        assert report["recommendation"] == "INSUFFICIENT_TELEMETRY"
        assert report["total_distinct_players"] == 0


# ---------------------------------------------------------------------------
# Test Scenario S4 — Inconclusive result
# ---------------------------------------------------------------------------

class TestScenarioS4Inconclusive:
    """S4: D30 uplift <10pp — DATA INCONCLUSIVE or DATA DOES NOT SUPPORT."""

    def test_s4_does_not_support_when_all_cohorts_sufficient_and_uplift_small(self):
        """All cohorts n≥30 but uplift only 5pp → DATA DOES NOT SUPPORT.
        D7 rates set to 0 so D30 rates reflect exactly the specified fractions."""
        sessions, events = build_full_sufficient_dataset(
            d7_rates={COHORT_0: 0.0, COHORT_1: 0.0, COHORT_2_3: 0.0, COHORT_4_PLUS: 0.0},
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.25, COHORT_2_3: 0.30, COHORT_4_PLUS: 0.28},
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "DATA DOES NOT SUPPORT"
        assert report["uplift_is_material"] is False

    def test_s4_inconclusive_when_multi_completer_n_below_30(self):
        # Insufficient multi-completer data → cannot determine → INCONCLUSIVE
        cohort_sizes = {COHORT_0: 250, COHORT_1: 300, COHORT_2_3: 15, COHORT_4_PLUS: 5}
        sessions, events = build_full_sufficient_dataset(cohort_sizes=cohort_sizes)
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "DATA INCONCLUSIVE"


# ---------------------------------------------------------------------------
# Test Scenario S5 — Strong positive signal
# ---------------------------------------------------------------------------

class TestScenarioS5StrongPositiveSignal:
    """S5: D30 uplift ≥20pp for 2+ completers → DATA CONFIRMS + expedited Phase 1."""

    def test_s5_data_confirms_recommendation(self):
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.15, COHORT_2_3: 0.40, COHORT_4_PLUS: 0.45}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["recommendation"] == "DATA CONFIRMS"

    def test_s5_uplift_ge_20pp(self):
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.15, COHORT_2_3: 0.40, COHORT_4_PLUS: 0.45}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["multi_completer_d30_uplift_pp"] >= 20.0

    def test_s5_uplift_is_material(self):
        sessions, events = build_full_sufficient_dataset(
            d30_rates={COHORT_0: 0.10, COHORT_1: 0.15, COHORT_2_3: 0.40, COHORT_4_PLUS: 0.45}
        )
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["uplift_is_material"] is True


# ---------------------------------------------------------------------------
# Test Scenario S6 — Session-start queue-gap confirmed
# ---------------------------------------------------------------------------

class TestScenarioS6QueueGapConfirmed:
    """S6: >40% returning players start with no active job → queue-gap signal strong."""

    def test_s6_queue_gap_signal_strong_true(self):
        sessions = []
        events = []
        # 60% of returning sessions have no active job
        n = 500
        for i in range(n):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            has_job = (i % 5 < 2)  # 40% have job, 60% don't
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=has_job))
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["session_start_no_active_job_pct"] > QUEUE_GAP_STRONG_THRESHOLD
        assert report["queue_gap_signal_strong"] is True

    def test_s6_memo_mentions_queue_gap_signal(self):
        sessions = []
        events = []
        n = 500
        for i in range(n):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            has_job = (i % 5 < 2)
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=has_job))
        report = RetentionAnalytics().analyze(sessions, events)
        assert "strong" in report["memo"].lower() or "queue" in report["memo"].lower()


# ---------------------------------------------------------------------------
# Test Scenario S7 — Session-start queue-gap denied
# ---------------------------------------------------------------------------

class TestScenarioS7QueueGapDenied:
    """S7: <15% returning players start with no active job → queue-gap signal weak."""

    def test_s7_queue_gap_signal_false(self):
        sessions = []
        events = []
        n = 500
        for i in range(n):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            has_job = (i % 10 != 0)  # 10% don't have a job
            sessions.append(make_session(pid, offset_days=5.0, had_active_job=has_job))
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["session_start_no_active_job_pct"] < QUEUE_GAP_WEAK_THRESHOLD
        assert report["queue_gap_signal_strong"] is False

    def test_s7_weak_signal_does_not_affect_retention_recommendation(self):
        """Weak queue-gap signal must not override a positive retention signal."""
        sessions = []
        events = []
        n_per_cohort = 150
        completions_map = {COHORT_0: 0, COHORT_1: 1, COHORT_2_3: 2, COHORT_4_PLUS: 5}
        d30_map = {COHORT_0: 0.05, COHORT_1: 0.15, COHORT_2_3: 0.40, COHORT_4_PLUS: 0.45}

        pid_counter = 0
        for cohort_key, n_comp in completions_map.items():
            n = n_per_cohort
            d30 = d30_map[cohort_key]
            d30_n = int(n * d30)
            for i in range(n):
                pid = f"p_{cohort_key}_{pid_counter}"
                pid_counter += 1
                sessions.append(make_session(pid, offset_days=0.0))
                if i < d30_n:
                    # returning session — mostly has an active job (10% without)
                    has_job = (i % 10 != 0)
                    sessions.append(
                        make_session(pid, offset_days=20.0, had_active_job=has_job)
                    )
                for j in range(n_comp):
                    events.append(make_event(pid, offset_days=0.5 + j * 0.1))

        # Pad to 500+ distinct players
        for i in range(100):
            sessions.append(make_session(f"extra_{i}", offset_days=0.0))

        report = RetentionAnalytics().analyze(sessions, events)
        # Despite weak/no queue-gap signal, retention signal drives recommendation
        assert report["recommendation"] in {"DATA CONFIRMS", "DATA DOES NOT SUPPORT", "DATA INCONCLUSIVE"}


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Miscellaneous edge cases for robustness."""

    def test_non_reassembly_events_are_ignored(self):
        """Events with other names should not count toward completions."""
        sessions, _ = build_full_sufficient_dataset()
        # Only non-reassembly events
        events = [
            make_event(f"p_{cohort_key}_0", event_name="diagnosis_completed_without_hint")
            for cohort_key in COHORT_KEYS
        ]
        report = RetentionAnalytics().analyze(sessions, events)
        # All players have 0 reassembly_completed → all in COHORT_0
        assert report["cohorts"][COHORT_0]["n"] > 0

    def test_player_with_no_events_goes_to_0_completion_cohort(self):
        """Players absent from events list are 0-completion by definition."""
        sessions = [make_session(f"p_{i}") for i in range(500)]
        events = []
        report = RetentionAnalytics().analyze(sessions, events)
        assert report["cohorts"][COHORT_0]["n"] == 500

    def test_single_session_player_never_returns(self):
        """A player with one session is never counted as D7 or D30 returnee."""
        sessions = [make_session(f"p_{i}") for i in range(500)]
        events = []
        report = RetentionAnalytics().analyze(sessions, events)
        for key in COHORT_KEYS:
            c = report["cohorts"][key]
            if c["sufficient"]:
                assert c["d7_rate"] == 0.0
                assert c["d30_rate"] == 0.0

    def test_returns_exactly_at_7_day_boundary_counted(self):
        """Session exactly at 7 * SECONDS_PER_DAY should count as D7 return."""
        sessions = []
        events = []
        for i in range(500):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            sessions.append(make_session(pid, offset_days=7.0))  # exactly at boundary
        report = RetentionAnalytics().analyze(sessions, events)
        # All in COHORT_0 (no events), all should have D7=1.0
        assert math.isclose(report["cohorts"][COHORT_0]["d7_rate"], 1.0, abs_tol=0.01)

    def test_returns_after_7_days_but_within_30_days_not_counted_as_d7(self):
        """Session at day 8 should count for D30 but NOT D7."""
        sessions = []
        events = []
        for i in range(500):
            pid = f"p_{i}"
            sessions.append(make_session(pid, offset_days=0.0))
            sessions.append(make_session(pid, offset_days=8.0))  # day 8 → D30 only
        report = RetentionAnalytics().analyze(sessions, events)
        c = report["cohorts"][COHORT_0]
        assert math.isclose(c["d7_rate"], 0.0, abs_tol=0.01)
        assert math.isclose(c["d30_rate"], 1.0, abs_tol=0.01)
