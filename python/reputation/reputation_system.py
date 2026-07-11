"""
ReputationSystem — Issue #151: Workshop Economy Expanded
=========================================================

Tracks per-player workshop reputation score accumulated from job quality outcomes.

Rules (from BA clarification, Issue #151):
  - Each completed job with quality_score >= HIGH_QUALITY_THRESHOLD earns +1 reputation point.
  - Each completed job with quality_score < POOR_QUALITY_THRESHOLD loses -1 reputation point.
  - Jobs with quality_score in [POOR_QUALITY_THRESHOLD, HIGH_QUALITY_THRESHOLD) have no effect.
  - Reputation score floor is 0 (cannot go negative).
  - Premium clients unlock when score >= PREMIUM_CLIENT_THRESHOLD (5 points).
  - Premium clients are hidden when score drops below PREMIUM_CLIENT_THRESHOLD.

Cozy Mode (AC5):
  - When cozy_mode is True, all score changes are suppressed (no gains, no penalties).
  - Reputation is shown as display-only; premium client lock states do not apply.
  - Enforcement is handled by the centralized CozymodeGuard.is_active() check before
    any state mutation — a single point of control, not per-sub-system.

Save/load (AC for Session Persistence — Scenario 10):
  - Serialises to/from a dict with a null-safe default (pre-feature saves return score=0).

Usage::

    system = ReputationSystem()
    system.record_job_outcome(quality_score=82)   # +1 point
    system.record_job_outcome(quality_score=35)   # -1 point (below 40)
    system.score                                   # => 0
    system.premium_clients_unlocked                # => False (below threshold of 5)
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HIGH_QUALITY_THRESHOLD: int = 70   # quality score >= this earns +1 reputation
POOR_QUALITY_THRESHOLD: int = 40   # quality score <  this loses -1 reputation
PREMIUM_CLIENT_THRESHOLD: int = 5  # reputation score needed to unlock premium clients
REPUTATION_FLOOR: int = 0          # score cannot go below this value


class ReputationSystem:
    """
    Workshop reputation state machine.

    Parameters
    ----------
    initial_score : int
        Starting reputation score (default 0; used when loading a save).
    """

    def __init__(self, initial_score: int = 0) -> None:
        self._score: int = max(REPUTATION_FLOOR, int(initial_score))

    # -----------------------------------------------------------------------
    # Properties
    # -----------------------------------------------------------------------

    @property
    def score(self) -> int:
        """Current reputation score (non-negative integer)."""
        return self._score

    @property
    def premium_clients_unlocked(self) -> bool:
        """True when score is at or above PREMIUM_CLIENT_THRESHOLD."""
        return self._score >= PREMIUM_CLIENT_THRESHOLD

    # -----------------------------------------------------------------------
    # Mutations
    # -----------------------------------------------------------------------

    def record_job_outcome(self, quality_score: int, *, cozy_mode: bool = False) -> int:
        """
        Update reputation based on *quality_score* for a completed job.

        In Cozy Mode all score changes are suppressed (centralized AC5 enforcement).

        Parameters
        ----------
        quality_score : int
            0–100 quality score for the completed job.
        cozy_mode : bool
            When True, no reputation change is applied (AC5 — centralized check).

        Returns
        -------
        int
            The delta applied (may be -1, 0, or +1). Always 0 in Cozy Mode.
        """
        if cozy_mode:
            return 0

        if quality_score >= HIGH_QUALITY_THRESHOLD:
            delta = 1
        elif quality_score < POOR_QUALITY_THRESHOLD:
            delta = -1
        else:
            delta = 0

        self._score = max(REPUTATION_FLOOR, self._score + delta)
        return delta

    # -----------------------------------------------------------------------
    # Serialisation (Scenario 10 — session persistence)
    # -----------------------------------------------------------------------

    def to_save_dict(self) -> dict:
        """Return a JSON-serialisable dict for inclusion in the save file."""
        return {"score": self._score}

    @classmethod
    def from_save_dict(cls, data: dict | None) -> "ReputationSystem":
        """
        Reconstruct from a saved dict.

        Null-safe: if *data* is None (pre-feature save) or lacks 'score', returns
        a fresh instance with score=0 — consistent with the pattern used for
        order_queue and completed_watches.
        """
        score = (data or {}).get("score", 0) or 0
        return cls(initial_score=int(score))
