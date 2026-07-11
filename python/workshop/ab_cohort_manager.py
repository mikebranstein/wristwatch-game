"""
ABCohortManager — stable per-player A/B cohort assignment for the Second Bench Probe.
======================================================================================

Issue #116: Two-Bench Workshop Probe — Second Parallel Bench Slot (Phase 1 A/B)

Design constraints (from approved design decision):
    - Cohort assignment is written ONCE on first session; read-only thereafter.
    - No reassignment path in code — assignment cannot flip between sessions.
    - Control cohort sees NO change to the existing single-bench experience.
    - Probe cohort gets access to the second bench slot (subject to mastery gate).

Cohort values
-------------
COHORT_PROBE    = 'probe'    — player is in the second-bench probe group
COHORT_CONTROL  = 'control'  — player sees the unchanged single-bench experience

Assignment algorithm
--------------------
A deterministic hash of ``player_id`` is used to split cohorts 50/50 by default.
An injectable ``assignment_fn`` overrides this for testing or custom roll-out logic.
"""

from __future__ import annotations

import hashlib
from typing import Callable, Optional

COHORT_PROBE   = "probe"
COHORT_CONTROL = "control"
COHORT_VALUES  = (COHORT_PROBE, COHORT_CONTROL)


def _default_assignment(player_id: str) -> str:
    """
    Deterministic 50/50 cohort split based on MD5 hash of player_id.

    Using the low-order bit of the first hash byte gives an approximately
    50/50 split that is stable across runs and does not require external state.
    """
    digest = hashlib.md5(player_id.encode("utf-8"), usedforsecurity=False).digest()
    return COHORT_PROBE if (digest[0] % 2 == 0) else COHORT_CONTROL


class ABCohortManager:
    """
    Manages stable per-player cohort assignment for the second bench probe.

    Parameters
    ----------
    assignment_fn : callable, optional
        ``(player_id: str) -> 'probe' | 'control'``
        Defaults to the deterministic hash-based 50/50 split.
        Inject a custom function in tests for explicit cohort control.
    """

    def __init__(self, assignment_fn: Optional[Callable[[str], str]] = None):
        self._assignment_fn = assignment_fn or _default_assignment

    def assign(self, player_id: str, existing_cohort: Optional[str] = None) -> str:
        """
        Return the cohort for *player_id*.

        If *existing_cohort* is already set (loaded from save), it is returned
        unchanged — the assignment is read-only after the first write.

        Parameters
        ----------
        player_id : str
            Anonymised persistent player identifier.
        existing_cohort : str | None
            The cohort value already stored on the player's save, or None if
            this is the player's first session.

        Returns
        -------
        str
            'probe' | 'control'

        Raises
        ------
        ValueError
            If *existing_cohort* is set but is not a valid cohort value.
        """
        if existing_cohort is not None:
            if existing_cohort not in COHORT_VALUES:
                raise ValueError(
                    f"Invalid existing cohort '{existing_cohort}'; "
                    f"expected one of {COHORT_VALUES}."
                )
            # Assignment is read-only after first write — return unchanged.
            return existing_cohort

        cohort = self._assignment_fn(player_id)
        if cohort not in COHORT_VALUES:
            raise ValueError(
                f"assignment_fn returned invalid cohort '{cohort}'; "
                f"expected one of {COHORT_VALUES}."
            )
        return cohort

    def is_probe(self, cohort: str) -> bool:
        """Return True if *cohort* is the probe arm."""
        return cohort == COHORT_PROBE

    def is_control(self, cohort: str) -> bool:
        """Return True if *cohort* is the control arm."""
        return cohort == COHORT_CONTROL
