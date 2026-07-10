"""
WorkshopJob — value object representing a single watch restoration job.
=======================================================================

A WorkshopJob is analogous to Order in src/orders/ but represents the
higher-level client job rather than an individual part order.

A job can be in one of two states at any point:
  - In the intake queue (bench_slot is None) — available but not yet accepted.
  - On a bench slot (bench_slot is 1-4) — active, in-progress restoration.

All fields are JSON-serialisable for save-file persistence.
Null-safe construction mirrors the OrderQueue pattern.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class WorkshopJob:
    """Single watch restoration job — queued or active on a bench slot."""

    id: str
    client_id: str
    watch_type: str
    complexity: int                         # 1-5
    reward: float
    soft_deadline_sessions: Optional[int]   # None = no deadline signal
    repair_stage: Optional[str]             # None = not yet started
    bench_slot: Optional[int]               # 1-4; None = in intake queue
    accepted_at: Optional[float]            # epoch seconds; None = not accepted
    completed_at: Optional[float]           # epoch seconds; None = not completed
    quality_rating: Optional[int]           # 0-100 on delivery; None = not yet rated
    narrative_intake_message: str           # client job request text

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "WorkshopJob":
        return cls(**d)

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        *,
        client_id: str,
        watch_type: str,
        complexity: int,
        reward: float,
        narrative_intake_message: str,
        soft_deadline_sessions: Optional[int] = None,
    ) -> "WorkshopJob":
        """Create a new job in the intake queue (not yet accepted to a bench slot)."""
        if not (1 <= complexity <= 5):
            raise ValueError(f"complexity must be 1-5, got {complexity}")
        if reward < 0:
            raise ValueError("reward must be non-negative")
        if not client_id or not watch_type:
            raise ValueError("client_id and watch_type are required")

        return cls(
            id=str(uuid.uuid4()),
            client_id=client_id,
            watch_type=watch_type,
            complexity=complexity,
            reward=reward,
            soft_deadline_sessions=soft_deadline_sessions,
            repair_stage=None,
            bench_slot=None,
            accepted_at=None,
            completed_at=None,
            quality_rating=None,
            narrative_intake_message=narrative_intake_message,
        )

    # ── Computed properties ────────────────────────────────────────────────────

    @property
    def is_active(self) -> bool:
        """True when the job has been accepted to a bench slot."""
        return self.bench_slot is not None

    @property
    def is_completed(self) -> bool:
        """True when the job has a quality rating (delivery confirmed)."""
        return self.quality_rating is not None

    def accept_to_bench(self, slot: int, now: Optional[float] = None) -> None:
        """Move job from intake queue onto the given bench slot."""
        if not (1 <= slot <= 4):
            raise ValueError(f"bench slot must be 1-4, got {slot}")
        if self.bench_slot is not None:
            raise ValueError(f"Job already on bench slot {self.bench_slot}")
        self.bench_slot = slot
        self.accepted_at = now if now is not None else time.time()

    def complete(self, quality_rating: int, now: Optional[float] = None) -> None:
        """Mark job as delivered with a quality rating (0-100)."""
        if not (0 <= quality_rating <= 100):
            raise ValueError(f"quality_rating must be 0-100, got {quality_rating}")
        if self.bench_slot is None:
            raise ValueError("Cannot complete a job that has not been accepted to a bench slot")
        self.quality_rating = quality_rating
        self.completed_at = now if now is not None else time.time()
