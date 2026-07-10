"""
Tests for SessionStartDashboard — Issue #119, Workshop Queue Meta-Game Phase 2
==============================================================================

Covers acceptance criteria:
  AC4 — session-start dashboard shows: active bench jobs, queue count, recent client message
  AC4 — dashboard is built from in-memory state (no blocking I/O)
  Test scenario 6 (active workshop) and scenario 7 (empty bench)

Run with: pytest tests/
"""

import time
import pytest
from src.bench.bench_slot_manager import BenchSlotManager
from src.queue.intake_queue_manager import IntakeQueueManager
from src.queue.workshop_job import WorkshopJob
from src.reputation.reputation_system import ReputationSystem
from src.ui.session_start_dashboard import SessionStartDashboard, DashboardSnapshot


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_job(
    client_name="Margaret",
    watch_type="dress watch",
    complexity=1,
) -> WorkshopJob:
    return WorkshopJob.create(
        client_id="client-001",
        client_name=client_name,
        watch_type=watch_type,
        complexity=complexity,
        reward=50.0,
        narrative_intake_message="Please restore my watch.",
    )


# ─── DashboardSnapshot structure ─────────────────────────────────────────────

class TestSessionStartDashboard:
    def setup_method(self):
        self.dashboard = SessionStartDashboard()

    def _build(
        self,
        bench_slot_manager=None,
        intake_queue_manager=None,
        reputation_system=None,
        recent_client_message=None,
    ) -> DashboardSnapshot:
        return self.dashboard.build(
            bench_slot_manager=bench_slot_manager or BenchSlotManager(),
            intake_queue_manager=intake_queue_manager or IntakeQueueManager(),
            reputation_system=reputation_system or ReputationSystem(),
            recent_client_message=recent_client_message,
        )

    # ── AC4a: active bench job statuses ──────────────────────────────────────

    def test_shows_active_bench_job_statuses(self):
        """AC4a / Test scenario 6: dashboard shows active bench job statuses."""
        bsm = BenchSlotManager()
        iqm = IntakeQueueManager()

        job = make_job(client_name="Harold", watch_type="chronograph")
        iqm.add_job(job)
        iqm.accept_job(job.id, bench_slot=1)
        bsm.allocate_slot(job.id, 1)

        snapshot = self._build(bench_slot_manager=bsm, intake_queue_manager=iqm)
        assert snapshot.has_active_jobs is True
        assert len(snapshot.active_bench_jobs) == 1
        assert snapshot.active_bench_jobs[0].slot == 1
        assert snapshot.active_bench_jobs[0].client_name == "Harold"
        assert snapshot.active_bench_jobs[0].watch_type == "chronograph"

    def test_shows_multiple_active_bench_jobs(self):
        """AC4a: Dashboard shows all active bench jobs."""
        bsm = BenchSlotManager()
        iqm = IntakeQueueManager()

        j1 = make_job(client_name="Alice")
        j2 = make_job(client_name="Bob")
        iqm.add_job(j1)
        iqm.add_job(j2)
        iqm.accept_job(j1.id, bench_slot=1)
        iqm.accept_job(j2.id, bench_slot=2)
        bsm.allocate_slot(j1.id, 1)
        bsm.allocate_slot(j2.id, 2)

        snapshot = self._build(bench_slot_manager=bsm, intake_queue_manager=iqm)
        assert len(snapshot.active_bench_jobs) == 2
        slots = [s.slot for s in snapshot.active_bench_jobs]
        assert 1 in slots
        assert 2 in slots

    def test_bench_job_status_includes_repair_stage(self):
        """AC4a: Dashboard shows current repair stage for each active job."""
        bsm = BenchSlotManager()
        iqm = IntakeQueueManager()
        job = make_job()
        iqm.add_job(job)
        iqm.accept_job(job.id, bench_slot=1)
        iqm.get_job(job.id).repair_stage = "sourcing"
        bsm.allocate_slot(job.id, 1)

        snapshot = self._build(bench_slot_manager=bsm, intake_queue_manager=iqm)
        assert snapshot.active_bench_jobs[0].repair_stage == "sourcing"

    # ── AC4b: intake queue job count ─────────────────────────────────────────

    def test_shows_intake_queue_count(self):
        """AC4b: Dashboard shows how many jobs are available in the intake queue."""
        iqm = IntakeQueueManager()
        for _ in range(3):
            iqm.add_job(make_job())

        snapshot = self._build(intake_queue_manager=iqm)
        assert snapshot.intake_queue_count == 3
        assert snapshot.has_available_queue_jobs is True

    def test_empty_queue_count_is_zero(self):
        """Test scenario 7: empty bench → queue count is 0."""
        snapshot = self._build()
        assert snapshot.intake_queue_count == 0
        assert snapshot.has_available_queue_jobs is False

    # ── AC4c: most recent client message ─────────────────────────────────────

    def test_shows_recent_client_message(self):
        """AC4c: Dashboard includes the most recent client message."""
        snapshot = self._build(recent_client_message="Thanks for the watch!")
        assert snapshot.recent_client_message == "Thanks for the watch!"

    def test_recent_client_message_none_when_absent(self):
        """AC4c: Dashboard handles no client message gracefully."""
        snapshot = self._build(recent_client_message=None)
        assert snapshot.recent_client_message is None

    # ── AC3: reputation score visible on dashboard ────────────────────────────

    def test_shows_reputation_score(self):
        """AC3 / AC4: Dashboard displays current reputation score."""
        rep = ReputationSystem()
        rep.record_delivery(quality_rating=90, on_time=True)
        score = rep.current_score()

        snapshot = self._build(reputation_system=rep)
        assert abs(snapshot.reputation_score - score) < 1e-9

    def test_reputation_score_zero_for_new_player(self):
        """New player starts with reputation score = 0.0."""
        snapshot = self._build()
        assert snapshot.reputation_score == 0.0

    # ── AC4: empty bench scenario (Test scenario 7) ───────────────────────────

    def test_empty_bench_has_no_active_jobs(self):
        """Test scenario 7: new session with no active jobs — dashboard shows empty bench."""
        snapshot = self._build()
        assert snapshot.has_active_jobs is False
        assert snapshot.active_bench_jobs == []

    # ── AC4: 2-second load constraint ────────────────────────────────────────

    def test_dashboard_builds_from_in_memory_state_within_2_seconds(self):
        """AC4: Dashboard view-model builds in well under 2 seconds from in-memory state."""
        bsm = BenchSlotManager()
        iqm = IntakeQueueManager()
        rep = ReputationSystem()

        # Populate with a realistic amount of data
        for i in range(4):
            job = make_job()
            iqm.add_job(job)

        start = time.monotonic()
        snapshot = self.dashboard.build(
            bench_slot_manager=bsm,
            intake_queue_manager=iqm,
            reputation_system=rep,
            recent_client_message="Welcome back!",
        )
        elapsed = time.monotonic() - start

        assert elapsed < 2.0, f"Dashboard build took {elapsed:.3f}s — must be < 2.0s"
        assert isinstance(snapshot, DashboardSnapshot)
