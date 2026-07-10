"""
IntakeQueueManager – manages the workshop intake queue of available jobs.

The intake queue maintains a band of 2–6 available (unaccepted) jobs at all times.
New jobs are added on session open and whenever a job is accepted, keeping the
band populated.

Public API
----------
get_available_jobs()              All unaccepted jobs currently in the queue.
get_active_jobs()                 All jobs currently assigned to a bench slot.
get_all_jobs()                    Snapshot of every job (available + active + completed).
accept_job(job_id, bench_slot, accepted_at)
                                  Move a queue job onto a bench slot.
complete_job(job_id, quality_rating, completed_at)
                                  Mark a bench job as delivered.
add_job(job)                      Add a new WorkshopJob to the available queue.
replenish(jobs)                   Add multiple jobs; respects QUEUE_MAX band.
to_save_data()                    Serialise to dict for persistence.

Null-safe: constructing with None or missing 'intake_queue'/'workshop_jobs' keys
produces an empty manager, enabling backward compatibility for pre-feature saves.

Queue Band Constants
--------------------
QUEUE_MIN = 2  (replenishment target lower bound)
QUEUE_MAX = 6  (upper bound — jobs beyond this are rejected by replenish())
"""

from __future__ import annotations

import time
from typing import Optional

from src.queue.workshop_job import WorkshopJob


QUEUE_MIN: int = 2
QUEUE_MAX: int = 6


class IntakeQueueManager:

    def __init__(self, saved_state: Optional[dict] = None) -> None:
        # Null-safe: handle pre-feature saves gracefully.
        raw = saved_state or {}
        jobs_data: list[dict] = raw.get("workshop_jobs") or []
        if isinstance(jobs_data, list):
            self._jobs: dict[str, WorkshopJob] = {
                j["id"]: WorkshopJob.from_dict(j) for j in jobs_data
            }
        else:
            self._jobs = {}

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_available_jobs(self) -> list[WorkshopJob]:
        """Return all jobs currently in the intake queue (not accepted, not completed)."""
        return [j for j in self._jobs.values() if j.is_in_queue]

    def get_active_jobs(self) -> list[WorkshopJob]:
        """Return all jobs currently assigned to a bench slot and not yet delivered."""
        return [j for j in self._jobs.values() if j.is_active]

    def get_all_jobs(self) -> list[WorkshopJob]:
        """Return a snapshot of every job."""
        return list(self._jobs.values())

    def get_job(self, job_id: str) -> Optional[WorkshopJob]:
        """Return the WorkshopJob for *job_id*, or None if not found."""
        return self._jobs.get(job_id)

    def available_count(self) -> int:
        """Number of unaccepted jobs currently in the queue."""
        return len(self.get_available_jobs())

    def needs_replenishment(self) -> bool:
        """True when the available-job count is below QUEUE_MIN."""
        return self.available_count() < QUEUE_MIN

    # ── Write ─────────────────────────────────────────────────────────────────

    def add_job(self, job: WorkshopJob) -> None:
        """
        Add a new job to the intake queue.

        Raises
        ------
        ValueError
            If *job.id* is already tracked, or if adding it would exceed QUEUE_MAX
            available jobs.
        """
        if job.id in self._jobs:
            raise ValueError(f"Job {job.id!r} is already tracked by this queue.")
        if self.available_count() >= QUEUE_MAX:
            raise ValueError(
                f"Intake queue is full ({QUEUE_MAX} available jobs). "
                "Accept or complete existing jobs before adding more."
            )
        self._jobs[job.id] = job

    def replenish(self, jobs: list[WorkshopJob]) -> list[WorkshopJob]:
        """
        Add multiple jobs up to QUEUE_MAX.

        Silently ignores jobs that would exceed the band; returns those actually added.
        """
        added: list[WorkshopJob] = []
        for job in jobs:
            if self.available_count() >= QUEUE_MAX:
                break
            if job.id not in self._jobs:
                self._jobs[job.id] = job
                added.append(job)
        return added

    def accept_job(
        self,
        job_id: str,
        bench_slot: int,
        accepted_at: Optional[float] = None,
    ) -> WorkshopJob:
        """
        Move an intake-queue job onto *bench_slot*.

        Parameters
        ----------
        job_id     : str
        bench_slot : int   — 1–4
        accepted_at: float | None — defaults to time.time()

        Returns
        -------
        The updated WorkshopJob.

        Raises
        ------
        ValueError
            If job not found, already accepted, or already completed.
        """
        job = self._jobs.get(job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id!r}")
        if not job.is_in_queue:
            raise ValueError(
                f"Job {job_id!r} is not available in the intake queue "
                f"(bench_slot={job.bench_slot}, completed_at={job.completed_at})."
            )
        job.bench_slot = bench_slot
        job.accepted_at = accepted_at if accepted_at is not None else time.time()
        return job

    def complete_job(
        self,
        job_id: str,
        *,
        quality_rating: int,
        completed_at: Optional[float] = None,
    ) -> WorkshopJob:
        """
        Mark a bench job as delivered with a final quality rating.

        Parameters
        ----------
        job_id         : str
        quality_rating : int — 0–100
        completed_at   : float | None — defaults to time.time()

        Returns
        -------
        The updated WorkshopJob.

        Raises
        ------
        ValueError
            If job not found, not currently active, or quality_rating out of range.
        """
        job = self._jobs.get(job_id)
        if job is None:
            raise ValueError(f"Job not found: {job_id!r}")
        if not job.is_active:
            raise ValueError(
                f"Job {job_id!r} is not currently active on a bench slot."
            )
        if not (0 <= quality_rating <= 100):
            raise ValueError(
                f"quality_rating must be between 0 and 100, got {quality_rating}"
            )
        job.quality_rating = quality_rating
        job.completed_at = completed_at if completed_at is not None else time.time()
        return job

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> dict:
        """Serialise queue state to a JSON-safe dict for save-file persistence."""
        return {"workshop_jobs": [j.to_dict() for j in self._jobs.values()]}
