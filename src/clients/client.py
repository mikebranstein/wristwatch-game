"""
Client — named recurring client with personality and watch type affinity signals.
=================================================================================

Clients return with new jobs after successful restorations.  Trust level (1-3)
grows with each successful job, unlocking richer and more complex work.

All fields are JSON-serialisable for save-file persistence.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional


# Maximum number of personality flags per client (design cap — scope control).
MAX_PERSONALITY_FLAGS = 4


@dataclass
class Client:
    """Named recurring client with trust progression."""

    id: str
    name: str
    personality_flags: list                  # e.g. ['urgency_high', 'prefers_dress_watches']
    watch_type_affinities: list              # e.g. ['dress', 'diver']
    trust_level: int                         # 1-3
    successful_jobs: int
    last_seen_session: int                   # session_boundary_count at last return
    message_templates: dict                  # keys: 'intake' | 'delivery' | 'returning'

    # Trust level threshold: how many successful jobs needed to advance
    TRUST_THRESHOLDS: tuple = field(default=(0, 2, 5), repr=False, compare=False)

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        d = asdict(self)
        # Remove non-data class metadata
        d.pop("TRUST_THRESHOLDS", None)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Client":
        d = dict(d)
        d.pop("TRUST_THRESHOLDS", None)
        return cls(**d)

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        *,
        name: str,
        personality_flags: Optional[list] = None,
        watch_type_affinities: Optional[list] = None,
        message_templates: Optional[dict] = None,
        initial_session: int = 0,
    ) -> "Client":
        """Create a new trust-level-1 client."""
        flags = personality_flags or []
        if len(flags) > MAX_PERSONALITY_FLAGS:
            raise ValueError(
                f"personality_flags capped at {MAX_PERSONALITY_FLAGS} per client; "
                f"got {len(flags)}"
            )
        return cls(
            id=str(uuid.uuid4()),
            name=name,
            personality_flags=flags,
            watch_type_affinities=watch_type_affinities or [],
            trust_level=1,
            successful_jobs=0,
            last_seen_session=initial_session,
            message_templates=message_templates or {
                "intake": f"Hi, I have a watch that needs some work.",
                "delivery": f"Thank you for the great work!",
                "returning": f"Good to see you again!",
            },
        )

    # ── Trust progression ─────────────────────────────────────────────────────

    def record_successful_job(self) -> bool:
        """
        Increment successful job count and advance trust level if threshold met.

        Returns True if trust level was advanced, False otherwise.
        """
        self.successful_jobs += 1
        new_level = self._compute_trust_level()
        if new_level > self.trust_level:
            self.trust_level = new_level
            return True
        return False

    def _compute_trust_level(self) -> int:
        """Compute trust level from successful_jobs count."""
        # TRUST_THRESHOLDS[i] = min successful_jobs to reach trust level i+1
        # e.g. (0, 2, 5) means: level 1 at 0 jobs, level 2 at 2 jobs, level 3 at 5 jobs
        level = 1
        for i, threshold in enumerate(self.TRUST_THRESHOLDS):
            if self.successful_jobs >= threshold:
                level = i + 1
        return min(level, 3)

    def get_intake_message(self) -> str:
        return self.message_templates.get("intake", "I have a job for you.")

    def get_delivery_message(self) -> str:
        return self.message_templates.get("delivery", "Thank you!")

    def get_returning_message(self) -> str:
        return self.message_templates.get("returning", "Good to see you again!")
