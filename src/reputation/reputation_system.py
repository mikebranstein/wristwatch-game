"""
ReputationSystem — workshop reputation score and tier gating.
=============================================================

Derives workshop reputation from job quality, timeliness, and client satisfaction.

Cozy invariant: reputation can never decrease to negative values, and the
timeliness multiplier never punishes players into a failure state — it only
modestly reduces (not negates) the quality delta on late deliveries.

Score update rule:
    delta_score = (quality_rating / 100) * BASE_DELTA * timeliness_multiplier

Timeliness multiplier:
    - On time (delivered within soft_deadline_sessions): 1.0
    - Late:                                             LATE_MULTIPLIER (default 0.85)
    - No deadline signal (soft_deadline_sessions=None): 1.0 (full credit always)

Tier gating:
    Tier 1 (default): 0.0 ≤ score < tier_thresholds[1]
    Tier 2:           tier_thresholds[1] ≤ score < tier_thresholds[2]
    Tier 3:           score ≥ tier_thresholds[2]

Persisted under save_data["reputation"] (null-safe).

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

from typing import Optional


# ── Designer-configurable constants ──────────────────────────────────────────

BASE_DELTA = 10.0          # Max reputation gain per job at 100% quality
LATE_MULTIPLIER = 0.85     # Timeliness multiplier for late delivery (never negative)
DEFAULT_TIER_THRESHOLDS = (0.0, 50.0, 150.0)   # Score at which each tier begins


class ReputationSystem:
    """
    Manages workshop reputation score and tier transitions.

    All mutation is performed through update_from_job() to ensure the cozy
    invariant (score ≥ 0) is always maintained.
    """

    def __init__(self, saved_state: Optional[dict] = None) -> None:
        """
        Null-safe constructor.  `saved_state` is the raw dict from save_data["reputation"].
        None or missing key → fresh reputation state at tier 1, score 0.
        """
        if saved_state and isinstance(saved_state, dict):
            self._score: float = float(saved_state.get("score", 0.0))
            self._tier: int = int(saved_state.get("tier", 1))
            raw_thresholds = saved_state.get("tier_thresholds", list(DEFAULT_TIER_THRESHOLDS))
            self._tier_thresholds: tuple = tuple(raw_thresholds)
            self._jobs_evaluated: int = int(saved_state.get("jobs_evaluated", 0))
        else:
            self._score = 0.0
            self._tier = 1
            self._tier_thresholds = DEFAULT_TIER_THRESHOLDS
            self._jobs_evaluated = 0

    # ── Read ──────────────────────────────────────────────────────────────────

    @property
    def score(self) -> float:
        return self._score

    @property
    def tier(self) -> int:
        return self._tier

    @property
    def tier_thresholds(self) -> tuple:
        return self._tier_thresholds

    @property
    def jobs_evaluated(self) -> int:
        return self._jobs_evaluated

    def is_tier_unlocked(self, tier: int) -> bool:
        """Return True if the player's current tier is >= the requested tier."""
        return self._tier >= tier

    # ── Write ─────────────────────────────────────────────────────────────────

    def update_from_job(
        self,
        quality_rating: int,
        delivered_on_time: bool,
    ) -> dict:
        """
        Update reputation after a job delivery.

        Parameters
        ----------
        quality_rating : int
            0-100 quality score assigned at delivery.
        delivered_on_time : bool
            True if job was completed within the client's soft deadline window
            (or if the job had no deadline — always True in that case).

        Returns
        -------
        dict with keys: delta_score, new_score, old_tier, new_tier, tier_advanced
        """
        if not (0 <= quality_rating <= 100):
            raise ValueError(f"quality_rating must be 0-100, got {quality_rating}")

        timeliness = 1.0 if delivered_on_time else LATE_MULTIPLIER
        delta = (quality_rating / 100.0) * BASE_DELTA * timeliness

        old_score = self._score
        old_tier = self._tier

        # Cozy invariant: score never goes below 0 (delta is always ≥ 0 since
        # quality_rating ≥ 0 and timeliness ≥ 0)
        self._score = max(0.0, self._score + delta)
        self._jobs_evaluated += 1

        new_tier = self._compute_tier()
        tier_advanced = new_tier > old_tier
        self._tier = new_tier

        return {
            "delta_score": delta,
            "old_score": old_score,
            "new_score": self._score,
            "old_tier": old_tier,
            "new_tier": self._tier,
            "tier_advanced": tier_advanced,
        }

    def _compute_tier(self) -> int:
        """Derive tier from current score using configured thresholds."""
        tier = 1
        for i, threshold in enumerate(self._tier_thresholds):
            if self._score >= threshold:
                tier = i + 1
        return min(tier, 3)

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> dict:
        """Serialise reputation state to a JSON-safe dict for save_data["reputation"]."""
        return {
            "score": self._score,
            "tier": self._tier,
            "tier_thresholds": list(self._tier_thresholds),
            "jobs_evaluated": self._jobs_evaluated,
        }
