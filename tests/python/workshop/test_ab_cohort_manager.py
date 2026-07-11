"""
Tests: ABCohortManager — Issue #116, Acceptance Criterion 4 (cohort stability)
===============================================================================

AC4 — Given the probe cohort is active for 4 weeks, when the probe review
      runs, then session frequency data is available for probe vs. control
      cohorts.

Test Scenarios covered:
  S7 — Cohort assignment stability: player assigned to probe sees second slot
       on all sessions; player assigned to control never sees second slot;
       assignment does not change between sessions.

Run with:
    python -m pytest tests/ -v
"""

import pytest

from workshop.ab_cohort_manager import (
    ABCohortManager,
    COHORT_PROBE,
    COHORT_CONTROL,
    COHORT_VALUES,
)


class TestABCohortManagerAssignment:
    """Basic assignment logic."""

    def test_returns_valid_cohort(self):
        mgr = ABCohortManager()
        cohort = mgr.assign("player-abc")
        assert cohort in COHORT_VALUES

    def test_probe_fn_returns_probe(self):
        mgr = ABCohortManager(assignment_fn=lambda _: COHORT_PROBE)
        assert mgr.assign("any-player") == COHORT_PROBE

    def test_control_fn_returns_control(self):
        mgr = ABCohortManager(assignment_fn=lambda _: COHORT_CONTROL)
        assert mgr.assign("any-player") == COHORT_CONTROL

    def test_invalid_fn_result_raises(self):
        mgr = ABCohortManager(assignment_fn=lambda _: "invalid")
        with pytest.raises(ValueError, match="invalid cohort"):
            mgr.assign("player-xyz")


class TestABCohortManagerStability:
    """
    S7: Cohort assignment stability — assignment does not change between sessions.
    """

    def test_existing_probe_cohort_preserved(self):
        """Once assigned probe, the player is always in probe (read-only)."""
        mgr = ABCohortManager(assignment_fn=lambda _: COHORT_CONTROL)
        # Pre-existing assignment = probe; assignment_fn should NOT be consulted.
        result = mgr.assign("player-1", existing_cohort=COHORT_PROBE)
        assert result == COHORT_PROBE

    def test_existing_control_cohort_preserved(self):
        """Once assigned control, player stays in control."""
        mgr = ABCohortManager(assignment_fn=lambda _: COHORT_PROBE)
        result = mgr.assign("player-2", existing_cohort=COHORT_CONTROL)
        assert result == COHORT_CONTROL

    def test_none_existing_cohort_triggers_fresh_assignment(self):
        """When existing_cohort is None (first session), assignment_fn is called."""
        mgr = ABCohortManager(assignment_fn=lambda _: COHORT_PROBE)
        result = mgr.assign("player-new", existing_cohort=None)
        assert result == COHORT_PROBE

    def test_invalid_existing_cohort_raises(self):
        mgr = ABCohortManager()
        with pytest.raises(ValueError, match="Invalid existing cohort"):
            mgr.assign("player-x", existing_cohort="bad_value")

    def test_same_player_id_always_gets_same_cohort(self):
        """Deterministic hash → same player_id always yields same cohort."""
        mgr = ABCohortManager()
        first_result = mgr.assign("stable-player-id", existing_cohort=None)
        # Second call simulates a new session with the saved cohort
        second_result = mgr.assign("stable-player-id", existing_cohort=first_result)
        assert first_result == second_result

    def test_two_different_players_can_get_different_cohorts(self):
        """
        With 50/50 hash split, different player IDs should eventually yield
        both cohorts.  We test with two known IDs that produce different arms.
        """
        mgr = ABCohortManager()
        # We generate 20 unique IDs and collect cohorts — both arms must appear.
        cohorts = set()
        for i in range(20):
            cohorts.add(mgr.assign(f"test-player-{i:04d}"))
        assert COHORT_PROBE in cohorts
        assert COHORT_CONTROL in cohorts


class TestABCohortManagerPredicates:
    def test_is_probe(self):
        mgr = ABCohortManager()
        assert mgr.is_probe(COHORT_PROBE) is True
        assert mgr.is_probe(COHORT_CONTROL) is False

    def test_is_control(self):
        mgr = ABCohortManager()
        assert mgr.is_control(COHORT_CONTROL) is True
        assert mgr.is_control(COHORT_PROBE) is False
