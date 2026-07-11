"""
Tests: SecondBenchUnlock — Issue #116, Acceptance Criterion 1
==============================================================

AC1 — Given a player has completed ≥2 restorations, when they visit the
      workshop, then a second bench slot is visible and available for use
      (not visible or unlocked for players with <2 completions).

Test Scenarios covered:
  S1 — Happy path: player with 3 completions → second slot visible
  S2 — Single-job player (1 completion) → second slot NOT visible
  S3 — Player ignores second slot (4 completions → slot available but unused)
  Edge — 0 completions → locked; exactly 2 completions → unlocked

Run with:
    python -m pytest tests/ -v
"""

import pytest

from workshop.second_bench_unlock import (
    SecondBenchUnlock,
    DEFAULT_UNLOCK_THRESHOLD,
)


class TestSecondBenchUnlockDefault:
    """Default threshold = 2 restorations."""

    def test_default_threshold_is_two(self):
        unlock = SecondBenchUnlock()
        assert unlock.threshold == DEFAULT_UNLOCK_THRESHOLD
        assert unlock.threshold == 2

    # ── AC1: unlock gate ──────────────────────────────────────────────────────

    def test_zero_completions_locked(self):
        """S2-like: player with 0 completions cannot access second slot."""
        unlock = SecondBenchUnlock()
        assert unlock.is_unlocked(0) is False

    def test_one_completion_locked(self):
        """S2: player with only 1 completion cannot access second slot."""
        unlock = SecondBenchUnlock()
        assert unlock.is_unlocked(1) is False

    def test_exactly_two_completions_unlocked(self):
        """AC1: exactly 2 completions → second slot becomes available."""
        unlock = SecondBenchUnlock()
        assert unlock.is_unlocked(2) is True

    def test_three_completions_unlocked(self):
        """S1 happy path: player with 3 completions → second slot visible."""
        unlock = SecondBenchUnlock()
        assert unlock.is_unlocked(3) is True

    def test_four_completions_unlocked(self):
        """S3: player with 4 completions has second slot available (ignored or used)."""
        unlock = SecondBenchUnlock()
        assert unlock.is_unlocked(4) is True

    def test_large_completion_count_unlocked(self):
        unlock = SecondBenchUnlock()
        assert unlock.is_unlocked(100) is True

    # ── Negative input guard ──────────────────────────────────────────────────

    def test_negative_completions_raises(self):
        unlock = SecondBenchUnlock()
        with pytest.raises(ValueError, match="negative"):
            unlock.is_unlocked(-1)

    # ── restorations_needed ───────────────────────────────────────────────────

    def test_needs_two_when_zero_completions(self):
        unlock = SecondBenchUnlock()
        assert unlock.restorations_needed(0) == 2

    def test_needs_one_when_one_completion(self):
        unlock = SecondBenchUnlock()
        assert unlock.restorations_needed(1) == 1

    def test_needs_zero_when_already_unlocked(self):
        unlock = SecondBenchUnlock()
        assert unlock.restorations_needed(2) == 0
        assert unlock.restorations_needed(5) == 0


class TestSecondBenchUnlockConfigurableThreshold:
    """
    Design constraint: threshold is configurable if FR1 findings suggest
    a different gate (e.g., ≥3 restorations).
    """

    def test_threshold_three_requires_three(self):
        unlock = SecondBenchUnlock(threshold=3)
        assert unlock.is_unlocked(2) is False
        assert unlock.is_unlocked(3) is True

    def test_threshold_one_unlocks_at_one_completion(self):
        unlock = SecondBenchUnlock(threshold=1)
        assert unlock.is_unlocked(0) is False
        assert unlock.is_unlocked(1) is True

    def test_threshold_zero_raises(self):
        with pytest.raises(ValueError, match="1"):
            SecondBenchUnlock(threshold=0)

    def test_threshold_negative_raises(self):
        with pytest.raises(ValueError):
            SecondBenchUnlock(threshold=-1)

    def test_threshold_five(self):
        unlock = SecondBenchUnlock(threshold=5)
        assert unlock.is_unlocked(4) is False
        assert unlock.is_unlocked(5) is True
        assert unlock.restorations_needed(3) == 2
