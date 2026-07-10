"""
SessionStartDashboard — session-open view model (AC4).
=====================================================

Extends the OrderDashboard pattern to provide the full workshop state
view for the session-start screen.

Returns within 2 seconds of load (AC4) by loading entirely from
in-memory state — no blocking I/O on the call path.

View model includes:
  - Active bench job statuses
  - Intake queue job count
  - Most recent client message per active job
  - Overall reputation score and tier

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

import time
from typing import Optional

from src.ui.order_dashboard import OrderDashboard
from src.orders.order_queue import OrderQueue
from src.queue.workshop_job import WorkshopJob
from src.queue.intake_queue_manager import IntakeQueueManager
from src.clients.client_registry import ClientRegistry
from src.clients.client_message_service import ClientMessageService
from src.reputation.reputation_system import ReputationSystem
from src.bench.bench_slot_manager import BenchSlotManager


class SessionStartDashboard(OrderDashboard):
    """
    Session-start view model provider.

    Extends OrderDashboard to add the full workshop state for the
    session-open screen (AC4): active bench jobs, intake queue, client
    messages, and reputation.

    All data is read from in-memory state; no blocking I/O.
    """

    def __init__(
        self,
        order_queue: OrderQueue,
        bench_manager: BenchSlotManager,
        intake_manager: IntakeQueueManager,
        client_registry: ClientRegistry,
        reputation: ReputationSystem,
        active_jobs: Optional[list[WorkshopJob]] = None,
    ) -> None:
        super().__init__(order_queue)
        self._bench = bench_manager
        self._intake = intake_manager
        self._registry = client_registry
        self._reputation = reputation
        self._active_jobs: list[WorkshopJob] = active_jobs or []
        self._message_svc = ClientMessageService()

    def get_session_start_view_model(self) -> dict:
        """
        Build the full session-start view model (AC4).

        Returns a dict with:
            active_bench_jobs   : list of dicts with job status per bench slot
            intake_queue_count  : int — number of available unaccepted jobs
            client_messages     : list of {job_id, client_name, message} dicts
            reputation_score    : float
            reputation_tier     : int (1-3)
            has_active_jobs     : bool
            has_intake_jobs     : bool
            prompt_accept_first_job : bool — True if bench is empty and queue has jobs
        """
        start_ts = time.monotonic()

        bench_jobs = self._build_bench_job_summaries()
        intake_count = self._intake.count()
        client_messages = self._build_client_messages()

        # AC4: all data comes from in-memory state — should always be sub-2s
        elapsed = time.monotonic() - start_ts

        has_active = len(bench_jobs) > 0
        has_intake = intake_count > 0

        return {
            "active_bench_jobs": bench_jobs,
            "intake_queue_count": intake_count,
            "client_messages": client_messages,
            "reputation_score": self._reputation.score,
            "reputation_tier": self._reputation.tier,
            "has_active_jobs": has_active,
            "has_intake_jobs": has_intake,
            "prompt_accept_first_job": (not has_active) and has_intake,
            "load_time_seconds": elapsed,
        }

    def _build_bench_job_summaries(self) -> list[dict]:
        """Build the active bench job status list."""
        summaries = []
        active_slot_map = {s["slot_id"]: s["job_id"] for s in self._bench.get_active_job_slots()}

        for job in self._active_jobs:
            if job.bench_slot is None:
                continue
            client = self._registry.get(job.client_id)
            client_name = client.name if client else "Unknown client"
            summaries.append({
                "job_id": job.id,
                "bench_slot": job.bench_slot,
                "client_name": client_name,
                "watch_type": job.watch_type,
                "complexity": job.complexity,
                "repair_stage": job.repair_stage or "not_started",
                "has_soft_deadline": job.soft_deadline_sessions is not None,
            })
        return summaries

    def _build_client_messages(self) -> list[dict]:
        """Build most recent client message per active bench job."""
        messages = []
        for job in self._active_jobs:
            if job.bench_slot is None or job.is_completed:
                continue
            client = self._registry.get(job.client_id)
            if client is None:
                continue
            message = self._message_svc.get_most_recent_message_for_job(client, job)
            if message:
                messages.append({
                    "job_id": job.id,
                    "client_name": client.name,
                    "message": message,
                })
        return messages
