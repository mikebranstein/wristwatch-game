"""
IntakeQueueManager — workshop job intake queue management.
==========================================================

Maintains 2-6 available (unaccepted) jobs for the player to browse.
On session open, if the queue count is below 2, new jobs are generated
from the eligible client pool.  On job acceptance, replenishment is
scheduled to maintain the 2-6 band.

Queue state is persisted immediately after replenishment (mirrors
OrderQueue's atomic-write semantics).

Replenishment client selection is weighted by trust tier:
    - Higher-trust clients appear more frequently
    - Clients with recent appearances are skipped (cooldown)

All new code paths are gated behind save_data["queue_feature_flag"].

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

import random
import uuid
from typing import Optional

from src.queue.workshop_job import WorkshopJob
from src.clients.client import Client
from src.clients.client_registry import ClientRegistry


# ── Queue size constants ──────────────────────────────────────────────────────

QUEUE_MIN = 2
QUEUE_MAX = 6

# Watch types available at each complexity level (designer-configurable)
_WATCH_TYPES_BY_COMPLEXITY = {
    1: ["pocket_watch", "simple_dress"],
    2: ["field_watch", "dress_watch"],
    3: ["diver_watch", "pilot_watch"],
    4: ["chronograph", "moonphase"],
    5: ["tourbillon", "minute_repeater"],
}

# Reward scaling: base reward * complexity
_BASE_REWARD = 25.0

# Narrative intake message templates (keyed by complexity band)
_INTAKE_TEMPLATES = {
    1: "I found this old watch and would love to see it working again.",
    2: "This piece has sentimental value — can you take a look?",
    3: "A friend recommended you for this tricky restoration.",
    4: "I have a complex piece that needs expert attention.",
    5: "This is a very rare watch — I trust only the best with it.",
}


def _generate_job_for_client(
    client: Client, session: int, rng: Optional[random.Random] = None
) -> WorkshopJob:
    """Generate a new WorkshopJob appropriate for the given client's trust level."""
    r = rng or random
    # Higher trust clients get more complex jobs
    min_complexity = client.trust_level
    max_complexity = min(client.trust_level + 1, 5)
    complexity = r.randint(min_complexity, max_complexity)

    watch_candidates = _WATCH_TYPES_BY_COMPLEXITY.get(complexity, ["pocket_watch"])
    # Filter by client's watch type affinities (if any)
    if client.watch_type_affinities:
        preferred = [w for w in watch_candidates if any(
            aff in w for aff in client.watch_type_affinities
        )]
        watch_type = r.choice(preferred) if preferred else r.choice(watch_candidates)
    else:
        watch_type = r.choice(watch_candidates)

    reward = round(_BASE_REWARD * complexity, 2)

    # 30% chance of a soft deadline for urgency-signal clients
    soft_deadline = None
    if "urgency_high" in client.personality_flags:
        soft_deadline = r.randint(2, 4)
    elif r.random() < 0.3:
        soft_deadline = r.randint(3, 6)

    # Pick a narrative template and personalise with client name
    template = _INTAKE_TEMPLATES.get(complexity, _INTAKE_TEMPLATES[1])
    if client.successful_jobs >= 2:
        message = client.get_returning_message() + " " + template
    else:
        message = client.get_intake_message() + " " + template

    return WorkshopJob.create(
        client_id=client.id,
        watch_type=watch_type,
        complexity=complexity,
        reward=reward,
        narrative_intake_message=message,
        soft_deadline_sessions=soft_deadline,
    )


class IntakeQueueManager:
    """
    Manages the player-visible intake queue of available (unaccepted) jobs.

    The intake queue is separate from bench slots — jobs here are available
    for the player to review and accept.  Accepted jobs move to BenchSlotManager.
    """

    def __init__(
        self,
        saved_state: Optional[list] = None,
        rng: Optional[random.Random] = None,
    ) -> None:
        """
        Null-safe constructor.  `saved_state` is raw list from save_data["intake_queue"].
        None or missing key → empty queue.
        """
        self._rng = rng or random.Random()
        if saved_state and isinstance(saved_state, list):
            self._jobs: list[WorkshopJob] = [
                WorkshopJob.from_dict(j) for j in saved_state
            ]
        else:
            self._jobs = []

    # ── Read ──────────────────────────────────────────────────────────────────

    def count(self) -> int:
        return len(self._jobs)

    def get_all(self) -> list[WorkshopJob]:
        return list(self._jobs)

    def get_by_id(self, job_id: str) -> Optional[WorkshopJob]:
        return next((j for j in self._jobs if j.id == job_id), None)

    def needs_replenishment(self) -> bool:
        return self.count() < QUEUE_MIN

    # ── Write ─────────────────────────────────────────────────────────────────

    def replenish(
        self,
        registry: ClientRegistry,
        current_session: int,
        target: Optional[int] = None,
    ) -> list[WorkshopJob]:
        """
        Generate new jobs until the queue reaches `target` (default QUEUE_MAX).

        Clients are selected weighted by trust level (higher trust = more weight).
        Returns the list of newly added jobs.
        """
        target = target if target is not None else QUEUE_MAX
        target = min(target, QUEUE_MAX)
        added: list[WorkshopJob] = []

        eligible = registry.get_eligible_for_queue(current_session)
        if not eligible:
            # Fallback: use all clients if no eligible ones (prevents dead state)
            eligible = registry.get_all()
        if not eligible:
            return added  # No clients at all — can't generate jobs

        while self.count() < target:
            # Weight by trust level
            weights = [c.trust_level for c in eligible]
            client = self._rng.choices(eligible, weights=weights, k=1)[0]
            job = _generate_job_for_client(client, current_session, self._rng)
            self._jobs.append(job)
            registry.update_last_seen(client.id, current_session)
            added.append(job)

        return added

    def accept_job(self, job_id: str) -> WorkshopJob:
        """
        Remove job from intake queue and return it (caller assigns to bench slot).

        Raises ValueError if the job is not in the queue.
        """
        for i, j in enumerate(self._jobs):
            if j.id == job_id:
                return self._jobs.pop(i)
        raise ValueError(f"Job {job_id!r} not found in intake queue")

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> list:
        """Serialise queue to a JSON-safe list for save_data["intake_queue"]."""
        return [j.to_dict() for j in self._jobs]
