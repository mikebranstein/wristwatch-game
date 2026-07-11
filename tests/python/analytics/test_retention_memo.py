"""
Tests for retention_memo — Issue #201
======================================

Validates all 9 test scenarios defined in the issue acceptance criteria
after the extraction of memo-composition logic into ``retention_memo.py``.

Scenarios:
  S1 — _fmt_rate(None) → "N/A (insufficient data)"
  S2 — _fmt_rate(0.0)  → "0.0%"
  S3 — _fmt_rate(0.753) → "75.3%"
  S4 — _compose_memo happy path: all cohorts sufficient + material uplift +
       strong queue-gap → memo contains all 6 section headers and "DATA CONFIRMS"
  S5 — _compose_memo with total_distinct_players < MIN_SESSIONS → contains
       "WARNING" and "INSUFFICIENT_TELEMETRY"
  S6 — _compose_memo with uplift_pp < MATERIAL_UPLIFT_THRESHOLD (cohorts
       sufficient) → contains "DATA DOES NOT SUPPORT"
  S7 — _compose_memo with uplift_pp = None → contains "DATA INCONCLUSIVE"
  S8 — RetentionAnalytics().analyze() round-trip (happy-path dataset ≥500
       sessions, all cohorts populated) → result["memo"] is non-empty and
       contains "### 6. Recommendation"
  S9 — pytest tests/analytics/test_retention_analytics.py passes (covered by
       running the full suite; no new assertions needed here)
"""

import pytest

from analytics.retention_memo import (
    _fmt_rate,
    _compose_memo,
    MIN_SESSIONS,
    MATERIAL_UPLIFT_THRESHOLD,
    COHORT_0,
    COHORT_1,
    COHORT_2_3,
    COHORT_4_PLUS,
    COHORT_KEYS,
)
from analytics.retention_analytics import RetentionAnalytics, SECONDS_PER_DAY

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DAY = SECONDS_PER_DAY
BASE_TIME = 1_700_000_000.0


def _make_session(
    player_id: str,
    offset_days: float = 0.0,
    had_active_job: bool = False,
) -> dict:
    return {
        "player_id": player_id,
        "session_id": f"{player_id}_s{offset_days}",
        "started_at": BASE_TIME + offset_days * DAY,
        "had_active_job_at_start": had_active_job,
    }


def _make_event(player_id: str, offset_days: float = 0.5) -> dict:
    return {
        "player_id": player_id,
        "session_id": f"{player_id}_ev",
        "event_name": "reassembly_completed",
        "timestamp": BASE_TIME + offset_days * DAY,
    }


def _sufficient_cohort(n: int, d7_rate: float = 0.0, d30_rate: float = 0.0) -> dict:
    """Build a cohort stats dict that _compose_memo expects."""
    return {
        "n": n,
        "d7_rate": d7_rate,
        "d30_rate": d30_rate,
        "sufficient": True,
        "flag": None,
    }


def _insufficient_cohort(n: int = 5) -> dict:
    return {
        "n": n,
        "d7_rate": None,
        "d30_rate": None,
        "sufficient": False,
        "flag": "n<30",
    }


def _make_cohorts(
    *,
    cohort0_n: int = 150,
    cohort1_n: int = 150,
    cohort23_n: int = 100,
    cohort4p_n: int = 100,
    cohort1_d30: float = 0.20,
    cohort23_d30: float = 0.50,  # 30pp uplift by default
    cohort4p_d30: float = 0.50,
    all_sufficient: bool = True,
) -> dict:
    if all_sufficient:
        return {
            COHORT_0:      _sufficient_cohort(cohort0_n, d30_rate=0.10),
            COHORT_1:      _sufficient_cohort(cohort1_n, d30_rate=cohort1_d30),
            COHORT_2_3:    _sufficient_cohort(cohort23_n, d30_rate=cohort23_d30),
            COHORT_4_PLUS: _sufficient_cohort(cohort4p_n, d30_rate=cohort4p_d30),
        }
    return {
        COHORT_0:      _insufficient_cohort(),
        COHORT_1:      _insufficient_cohort(),
        COHORT_2_3:    _insufficient_cohort(),
        COHORT_4_PLUS: _insufficient_cohort(),
    }


def _make_phase1_threshold() -> dict:
    return {"metric": "D30 return rate", "target": ">=10.0 percentage points"}


def _build_happy_path_dataset(n_per_cohort: int = 150) -> tuple[list, list]:
    """
    Build a dataset with ≥500 distinct players and all cohorts ≥30.
    Each player: first session + one returning session within 7 days.
    completions_map: cohort0=0, cohort1=1, cohort2_3=2, cohort4p=5
    """
    sessions: list[dict] = []
    events: list[dict] = []
    completions_map = {COHORT_0: 0, COHORT_1: 1, COHORT_2_3: 2, COHORT_4_PLUS: 5}
    pid_counter = 0

    for cohort_key in COHORT_KEYS:
        n_completions = completions_map[cohort_key]
        for _ in range(n_per_cohort):
            pid = f"p_{cohort_key}_{pid_counter}"
            pid_counter += 1
            sessions.append(_make_session(pid, offset_days=0.0))
            sessions.append(_make_session(pid, offset_days=5.0))  # D7 return
            for j in range(n_completions):
                events.append(_make_event(pid, offset_days=0.5 + j * 0.1))

    return sessions, events


# ---------------------------------------------------------------------------
# S1 — _fmt_rate(None)
# ---------------------------------------------------------------------------

class TestS1FmtRateNone:
    def test_fmt_rate_none_returns_na_string(self):
        assert _fmt_rate(None) == "N/A (insufficient data)"


# ---------------------------------------------------------------------------
# S2 — _fmt_rate(0.0)
# ---------------------------------------------------------------------------

class TestS2FmtRateZero:
    def test_fmt_rate_zero_returns_zero_percent(self):
        assert _fmt_rate(0.0) == "0.0%"


# ---------------------------------------------------------------------------
# S3 — _fmt_rate(0.753)
# ---------------------------------------------------------------------------

class TestS3FmtRateNonTrivial:
    def test_fmt_rate_753_returns_75_3_percent(self):
        assert _fmt_rate(0.753) == "75.3%"


# ---------------------------------------------------------------------------
# S4 — _compose_memo happy path: DATA CONFIRMS
# ---------------------------------------------------------------------------

class TestS4ComposeMemoHappyPath:
    """All cohorts sufficient, material uplift, strong queue-gap → DATA CONFIRMS."""

    SECTION_HEADERS = [
        "### 1. Data Availability",
        "### 2. Cohort Breakdown",
        "### 3. Multi-Completer D30 Uplift",
        "### 4. Session-Start Behaviour (Queue-Gap Proxy)",
        "### 5. Phase 1 (FR2) Success Threshold",
        "### 6. Recommendation",
    ]

    def _build_memo(self) -> str:
        cohorts = _make_cohorts(cohort1_d30=0.20, cohort23_d30=0.50)  # 30pp uplift
        return _compose_memo(
            total_distinct_players=600,
            cohorts=cohorts,
            uplift_pp=30.0,
            uplift_is_material=True,
            no_job_pct=55.0,
            queue_gap_signal_strong=True,
            recommendation="DATA CONFIRMS",
            phase1_threshold=_make_phase1_threshold(),
        )

    def test_all_six_section_headers_present(self):
        memo = self._build_memo()
        for header in self.SECTION_HEADERS:
            assert header in memo, f"Missing header: {header}"

    def test_contains_data_confirms_token(self):
        memo = self._build_memo()
        assert "DATA CONFIRMS" in memo


# ---------------------------------------------------------------------------
# S5 — _compose_memo insufficient telemetry
# ---------------------------------------------------------------------------

class TestS5ComposeMemoInsufficientTelemetry:
    def test_contains_warning_and_insufficient_telemetry(self):
        cohorts = _make_cohorts(all_sufficient=False)
        memo = _compose_memo(
            total_distinct_players=50,       # < MIN_SESSIONS (500)
            cohorts=cohorts,
            uplift_pp=None,
            uplift_is_material=None,
            no_job_pct=None,
            queue_gap_signal_strong=None,
            recommendation="INSUFFICIENT_TELEMETRY",
            phase1_threshold=_make_phase1_threshold(),
        )
        assert "WARNING" in memo
        assert "INSUFFICIENT_TELEMETRY" in memo


# ---------------------------------------------------------------------------
# S6 — _compose_memo uplift below threshold: DATA DOES NOT SUPPORT
# ---------------------------------------------------------------------------

class TestS6ComposeMemoUpliftBelowThreshold:
    def test_contains_data_does_not_support(self):
        cohorts = _make_cohorts(cohort1_d30=0.20, cohort23_d30=0.23)  # 3pp uplift
        memo = _compose_memo(
            total_distinct_players=600,
            cohorts=cohorts,
            uplift_pp=3.0,
            uplift_is_material=False,
            no_job_pct=30.0,
            queue_gap_signal_strong=None,
            recommendation="DATA DOES NOT SUPPORT",
            phase1_threshold=_make_phase1_threshold(),
        )
        assert "DATA DOES NOT SUPPORT" in memo


# ---------------------------------------------------------------------------
# S7 — _compose_memo uplift_pp = None: DATA INCONCLUSIVE
# ---------------------------------------------------------------------------

class TestS7ComposeMemoInconclusive:
    def test_contains_data_inconclusive(self):
        # uplift_pp is None because multi-completer cohorts are insufficient
        cohorts = {
            COHORT_0:      _sufficient_cohort(150),
            COHORT_1:      _sufficient_cohort(150, d30_rate=0.20),
            COHORT_2_3:    _insufficient_cohort(10),
            COHORT_4_PLUS: _insufficient_cohort(8),
        }
        memo = _compose_memo(
            total_distinct_players=600,
            cohorts=cohorts,
            uplift_pp=None,
            uplift_is_material=None,
            no_job_pct=45.0,
            queue_gap_signal_strong=True,
            recommendation="DATA INCONCLUSIVE",
            phase1_threshold=_make_phase1_threshold(),
        )
        assert "DATA INCONCLUSIVE" in memo


# ---------------------------------------------------------------------------
# S8 — End-to-end round-trip via analyze()
# ---------------------------------------------------------------------------

class TestS8AnalyzeRoundTrip:
    def test_memo_is_non_empty_string_containing_recommendation_header(self):
        sessions, events = _build_happy_path_dataset(n_per_cohort=150)
        result = RetentionAnalytics().analyze(sessions, events)

        assert isinstance(result["memo"], str)
        assert len(result["memo"]) > 0
        assert "### 6. Recommendation" in result["memo"]
