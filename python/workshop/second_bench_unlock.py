"""
SecondBenchUnlock — unlock gate for the second bench slot.
==========================================================

Issue #116: Two-Bench Workshop Probe — Second Parallel Bench Slot (Phase 1 A/B)

Design constraint (from approved design decision and issue scope):
    - Gate: player must have completed ≥ DEFAULT_UNLOCK_THRESHOLD (2) restorations.
    - Gate threshold is configurable in case FR1 findings suggest adjusting it
      (e.g., ≥3 completions).
    - A/B cohort assignment is a separate concern (see ABCohortManager); this
      module only evaluates the mastery gate.

Usage
-----
    unlock = SecondBenchUnlock()
    if unlock.is_unlocked(player_restorations):
        manager = BenchSlotManager(has_second_slot=True)
"""

from __future__ import annotations

# Default mastery gate: player must have completed this many restorations.
DEFAULT_UNLOCK_THRESHOLD = 2


class SecondBenchUnlock:
    """
    Evaluates whether a player has met the mastery gate to use the second bench slot.

    Parameters
    ----------
    threshold : int, optional
        Minimum number of completed restorations required.  Defaults to
        ``DEFAULT_UNLOCK_THRESHOLD`` (2).  Configurable per FR1 findings.
    """

    def __init__(self, threshold: int = DEFAULT_UNLOCK_THRESHOLD):
        if threshold < 1:
            raise ValueError(f"threshold must be >= 1; got {threshold}.")
        self._threshold = threshold

    @property
    def threshold(self) -> int:
        """The current minimum completions required."""
        return self._threshold

    def is_unlocked(self, restorations_completed: int) -> bool:
        """
        Return True when the player has completed enough restorations to
        access the second bench slot.

        Parameters
        ----------
        restorations_completed : int
            Number of watch restorations the player has fully completed
            (delivery confirmed and restoration count incremented).

        Returns
        -------
        bool
            True  → second bench slot is available for this player.
            False → player has not yet reached the mastery gate.
        """
        if restorations_completed < 0:
            raise ValueError("restorations_completed cannot be negative.")
        return restorations_completed >= self._threshold

    def restorations_needed(self, restorations_completed: int) -> int:
        """
        Return how many more restorations are needed to unlock the second slot.
        Returns 0 if already unlocked.
        """
        return max(0, self._threshold - restorations_completed)
