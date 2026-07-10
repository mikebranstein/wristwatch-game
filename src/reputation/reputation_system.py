"""
ReputationSystem – workshop reputation score management.

Score Update Rule (Cozy Invariant Preserved)
--------------------------------------------
delta = (quality_rating / 100) × base_delta × timeliness_multiplier

Timeliness multiplier:
  - ON_TIME_MULTIPLIER  = 1.00  (delivered within soft window)
  - LATE_MULTIPLIER     = 0.85  (delivered after soft window)

Guarantees:
  - delta is always ≥ 0 — late delivery reduces reputation *gain*, never subtracts from score.
  - Score is always ≥ 0.
  - No hard failure states; preserves cozy-persona invariant.

Tier Gating
-----------
Tier thresholds are configurable constants. Tier 1 is the entry tier (score 0+).
Higher tiers gate access to richer client jobs in the intake queue.

Public API
----------
record_delivery(quality_rating, on_time)  Update score after a job delivery.
current_score()                           Current reputation score (float).
current_tier()                            Current reputation tier (int, 1-indexed).
to_save_data()                            Serialise to dict for persistence.

Null-safe: constructing with None or missing 'reputation' key initialises to score=0, tier=1.
"""

from __future__ import annotations

from typing import Optional


# ---------------------------------------------------------------------------
# Designer-configurable constants
# ---------------------------------------------------------------------------

BASE_DELTA: float = 2.0          # reputation points gained at 100% quality, on time
ON_TIME_MULTIPLIER: float = 1.0  # full gain when delivered within soft window
LATE_MULTIPLIER: float = 0.85    # partial gain when delivered after soft window

# Tier thresholds (lower-bound inclusive); tier 1 starts at 0
TIER_THRESHOLDS: list[float] = [0.0, 20.0, 50.0]  # tier 1, 2, 3


class ReputationSystem:

    def __init__(self, saved_state: Optional[dict] = None) -> None:
        # Null-safe: handle pre-feature saves gracefully.
        if saved_state and isinstance(saved_state.get("reputation"), dict):
            rep = saved_state["reputation"]
            self._score: float = float(rep.get("score", 0.0))
        else:
            self._score = 0.0

    # ── Read ──────────────────────────────────────────────────────────────────

    def current_score(self) -> float:
        """Current reputation score (always ≥ 0)."""
        return self._score

    def current_tier(self) -> int:
        """
        Current reputation tier (1-indexed).

        Tier is the 1-based index of the highest threshold that the current
        score meets or exceeds.
        """
        tier = 1
        for i, threshold in enumerate(TIER_THRESHOLDS):
            if self._score >= threshold:
                tier = i + 1
        return tier

    # ── Write ─────────────────────────────────────────────────────────────────

    def record_delivery(self, *, quality_rating: int, on_time: bool) -> float:
        """
        Update reputation score after a job delivery.

        Parameters
        ----------
        quality_rating : int
            Delivery quality rating, 0–100.
        on_time : bool
            True when the job was delivered within the soft client window.

        Returns
        -------
        float
            The reputation delta applied (always ≥ 0).

        Raises
        ------
        ValueError
            When quality_rating is outside 0–100.
        """
        if not (0 <= quality_rating <= 100):
            raise ValueError(
                f"quality_rating must be between 0 and 100, got {quality_rating}"
            )
        multiplier = ON_TIME_MULTIPLIER if on_time else LATE_MULTIPLIER
        delta = (quality_rating / 100.0) * BASE_DELTA * multiplier
        self._score = max(0.0, self._score + delta)
        return delta

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> dict:
        """Serialise reputation state to a JSON-safe dict for save-file persistence."""
        return {"reputation": {"score": self._score}}
