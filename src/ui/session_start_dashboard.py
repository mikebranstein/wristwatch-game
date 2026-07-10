"""
SessionStartDashboard – pure in-memory view-model for the session-start UI.

Provides a snapshot of the player's current workshop state at session open:
  - Active bench job statuses (AC4a)
  - Intake queue job count (AC4b)
  - Most recent client message (AC4c)
  - Current reputation score (AC3 / AC4)

AC4 constraint: all data is sourced from in-memory, already-deserialized state.
No blocking I/O is performed during view-model construction — the 2-second
load constraint is met by ensuring session loading (deserialization) completes
before this view-model is constructed.

Public API
----------
build(bench_slot_manager, intake_queue_manager, reputation_system, recent_client_message)
    Construct a DashboardSnapshot from the current in-memory state.

DashboardSnapshot
    .active_bench_jobs        list of ActiveBenchJobStatus (slot, job_id, client_name, watch_type, repair_stage)
    .intake_queue_count       int
    .recent_client_message    str | None
    .reputation_score         float
    .has_active_jobs          bool — True when ≥ 1 bench job in progress
    .has_available_queue_jobs bool — True when intake queue count > 0
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.bench.bench_slot_manager import BenchSlotManager
from src.queue.intake_queue_manager import IntakeQueueManager
from src.reputation.reputation_system import ReputationSystem


@dataclass(frozen=True)
class ActiveBenchJobStatus:
    slot: int
    job_id: str
    client_name: str
    watch_type: str
    repair_stage: Optional[str]


@dataclass(frozen=True)
class DashboardSnapshot:
    active_bench_jobs: list[ActiveBenchJobStatus]
    intake_queue_count: int
    recent_client_message: Optional[str]
    reputation_score: float

    @property
    def has_active_jobs(self) -> bool:
        return len(self.active_bench_jobs) > 0

    @property
    def has_available_queue_jobs(self) -> bool:
        return self.intake_queue_count > 0


class SessionStartDashboard:
    """Stateless view-model builder. Instantiate once; call build() each session open."""

    def build(
        self,
        *,
        bench_slot_manager: BenchSlotManager,
        intake_queue_manager: IntakeQueueManager,
        reputation_system: ReputationSystem,
        recent_client_message: Optional[str] = None,
    ) -> DashboardSnapshot:
        """
        Construct a DashboardSnapshot from the current in-memory state.

        All inputs must already be deserialized (no I/O is performed here).

        Parameters
        ----------
        bench_slot_manager      : BenchSlotManager
        intake_queue_manager    : IntakeQueueManager
        reputation_system       : ReputationSystem
        recent_client_message   : str | None — most recent client message text

        Returns
        -------
        DashboardSnapshot
        """
        # Build active bench job statuses from the cross-reference of
        # bench allocations and job details.
        allocations = bench_slot_manager.get_all_allocations()
        active_statuses: list[ActiveBenchJobStatus] = []
        for slot, job_id in sorted(allocations.items()):
            job = intake_queue_manager.get_job(job_id)
            if job is not None and job.is_active:
                active_statuses.append(
                    ActiveBenchJobStatus(
                        slot=slot,
                        job_id=job_id,
                        client_name=job.client_name,
                        watch_type=job.watch_type,
                        repair_stage=job.repair_stage,
                    )
                )

        return DashboardSnapshot(
            active_bench_jobs=active_statuses,
            intake_queue_count=intake_queue_manager.available_count(),
            recent_client_message=recent_client_message,
            reputation_score=reputation_system.current_score(),
        )
