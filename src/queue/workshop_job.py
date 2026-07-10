"""
WorkshopJob – value object representing a single watch restoration job.

All fields are JSON-serialisable for save-file persistence.

Fields
------
id                       : str            — unique UUID
client_id                : str            — foreign key into ClientRegistry
client_name              : str            — denormalised for display without registry lookup
watch_type               : str            — human-readable, e.g. "dress watch"
complexity               : int            — 1–3; higher = harder job with higher reward
reward                   : float          — currency reward on successful delivery
repair_stage             : str | None     — current restoration stage; None = not yet started
bench_slot               : int | None     — 1–4 when on a bench; None = in intake queue
accepted_at              : float | None   — epoch seconds when player accepted the job
completed_at             : float | None   — epoch seconds when job was delivered
quality_rating           : int | None     — 0–100 final quality on delivery; None before completion
narrative_intake_message : str            — client's initial job-request text
soft_deadline_session    : int | None     — session number by which delivery is "on time"; None = no deadline
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional


@dataclass
class WorkshopJob:
    id: str
    client_id: str
    client_name: str
    watch_type: str
    complexity: int
    reward: float
    narrative_intake_message: str
    repair_stage: Optional[str] = None
    bench_slot: Optional[int] = None
    accepted_at: Optional[float] = None
    completed_at: Optional[float] = None
    quality_rating: Optional[int] = None
    soft_deadline_session: Optional[int] = None

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "client_id": self.client_id,
            "client_name": self.client_name,
            "watch_type": self.watch_type,
            "complexity": self.complexity,
            "reward": self.reward,
            "narrative_intake_message": self.narrative_intake_message,
            "repair_stage": self.repair_stage,
            "bench_slot": self.bench_slot,
            "accepted_at": self.accepted_at,
            "completed_at": self.completed_at,
            "quality_rating": self.quality_rating,
            "soft_deadline_session": self.soft_deadline_session,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "WorkshopJob":
        return cls(
            id=d["id"],
            client_id=d["client_id"],
            client_name=d["client_name"],
            watch_type=d["watch_type"],
            complexity=d["complexity"],
            reward=float(d["reward"]),
            narrative_intake_message=d["narrative_intake_message"],
            repair_stage=d.get("repair_stage"),
            bench_slot=d.get("bench_slot"),
            accepted_at=d.get("accepted_at"),
            completed_at=d.get("completed_at"),
            quality_rating=d.get("quality_rating"),
            soft_deadline_session=d.get("soft_deadline_session"),
        )

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        *,
        client_id: str,
        client_name: str,
        watch_type: str,
        complexity: int,
        reward: float,
        narrative_intake_message: str,
        soft_deadline_session: Optional[int] = None,
    ) -> "WorkshopJob":
        if not (1 <= complexity <= 3):
            raise ValueError(f"complexity must be between 1 and 3, got {complexity}")
        if reward < 0:
            raise ValueError("reward must be non-negative")
        return cls(
            id=str(uuid.uuid4()),
            client_id=client_id,
            client_name=client_name,
            watch_type=watch_type,
            complexity=complexity,
            reward=reward,
            narrative_intake_message=narrative_intake_message,
            soft_deadline_session=soft_deadline_session,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @property
    def is_in_queue(self) -> bool:
        """True when the job is available in the intake queue (not on a bench)."""
        return self.bench_slot is None and self.completed_at is None

    @property
    def is_active(self) -> bool:
        """True when the job is assigned to a bench slot and not yet delivered."""
        return self.bench_slot is not None and self.completed_at is None
