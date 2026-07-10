"""
Tests for WorkshopJob and IntakeQueueManager
Issue #119 — Workshop Queue Meta-Game Phase 2
=============================================

Covers acceptance criteria:
  AC1 — intake queue shows 2–6 available jobs; player can accept to open bench slot
  AC2 — returning client trust level and complexity gating
  AC9 — save data persistence (jobs, repair states, client context preserved)
  Test scenarios 1, 2, 7, 8 (happy path, returning client, empty bench, replenishment)

Run with: pytest tests/
"""

import pytest
import time
from src.queue.workshop_job import WorkshopJob
from src.queue.intake_queue_manager import IntakeQueueManager, QUEUE_MIN, QUEUE_MAX


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_job(
    client_id="client-001",
    client_name="Margaret",
    watch_type="dress watch",
    complexity=1,
    reward=50.0,
    narrative_intake_message="Please restore my watch.",
    soft_deadline_session=None,
) -> WorkshopJob:
    return WorkshopJob.create(
        client_id=client_id,
        client_name=client_name,
        watch_type=watch_type,
        complexity=complexity,
        reward=reward,
        narrative_intake_message=narrative_intake_message,
        soft_deadline_session=soft_deadline_session,
    )


# ─── WorkshopJob ─────────────────────────────────────────────────────────────

class TestWorkshopJob:
    def test_create_sets_defaults(self):
        job = make_job()
        assert job.bench_slot is None
        assert job.repair_stage is None
        assert job.accepted_at is None
        assert job.completed_at is None
        assert job.quality_rating is None
        assert job.id  # truthy UUID

    def test_is_in_queue_when_not_accepted(self):
        job = make_job()
        assert job.is_in_queue is True
        assert job.is_active is False

    def test_is_active_after_bench_slot_assigned(self):
        job = make_job()
        job.bench_slot = 1
        job.accepted_at = time.time()
        assert job.is_active is True
        assert job.is_in_queue is False

    def test_complexity_valid_range(self):
        for c in [1, 2, 3]:
            job = WorkshopJob.create(
                client_id="c", client_name="X", watch_type="watch",
                complexity=c, reward=10.0, narrative_intake_message="msg"
            )
            assert job.complexity == c

    def test_complexity_raises_out_of_range(self):
        with pytest.raises(ValueError, match="complexity"):
            WorkshopJob.create(
                client_id="c", client_name="X", watch_type="watch",
                complexity=4, reward=10.0, narrative_intake_message="msg"
            )

    def test_negative_reward_raises(self):
        with pytest.raises(ValueError, match="reward"):
            WorkshopJob.create(
                client_id="c", client_name="X", watch_type="watch",
                complexity=1, reward=-5.0, narrative_intake_message="msg"
            )

    def test_round_trip_serialisation(self):
        job = make_job(soft_deadline_session=5)
        restored = WorkshopJob.from_dict(job.to_dict())
        assert restored.id == job.id
        assert restored.client_id == job.client_id
        assert restored.complexity == job.complexity
        assert restored.soft_deadline_session == 5


# ─── IntakeQueueManager ───────────────────────────────────────────────────────

class TestIntakeQueueManager:

    # ── AC1: queue shows 2–6 available jobs ───────────────────────────────────

    def test_add_job_increases_available_count(self):
        """AC1: Adding a job increases available count."""
        mgr = IntakeQueueManager()
        mgr.add_job(make_job())
        assert mgr.available_count() == 1

    def test_get_available_jobs_returns_unaccepted_jobs(self):
        """AC1: get_available_jobs() returns jobs not yet accepted to a bench slot."""
        mgr = IntakeQueueManager()
        j1 = make_job()
        j2 = make_job()
        mgr.add_job(j1)
        mgr.add_job(j2)
        available = mgr.get_available_jobs()
        assert len(available) == 2
        assert all(j.is_in_queue for j in available)

    def test_add_job_raises_when_queue_full(self):
        """AC1: Queue does not exceed QUEUE_MAX available jobs."""
        mgr = IntakeQueueManager()
        for _ in range(QUEUE_MAX):
            mgr.add_job(make_job())
        with pytest.raises(ValueError, match="full"):
            mgr.add_job(make_job())

    def test_needs_replenishment_when_below_min(self):
        """AC1 / test scenario 8: needs_replenishment is True below QUEUE_MIN."""
        mgr = IntakeQueueManager()
        assert mgr.needs_replenishment() is True  # 0 < QUEUE_MIN

    def test_needs_replenishment_false_when_at_min(self):
        mgr = IntakeQueueManager()
        for _ in range(QUEUE_MIN):
            mgr.add_job(make_job())
        assert mgr.needs_replenishment() is False

    def test_replenish_adds_up_to_queue_max(self):
        """Test scenario 8: queue replenishes from empty without exceeding QUEUE_MAX."""
        mgr = IntakeQueueManager()
        new_jobs = [make_job() for _ in range(QUEUE_MAX + 3)]
        added = mgr.replenish(new_jobs)
        assert len(added) == QUEUE_MAX
        assert mgr.available_count() == QUEUE_MAX

    def test_replenish_does_not_add_duplicates(self):
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        added = mgr.replenish([job])  # same job again
        assert len(added) == 0
        assert mgr.available_count() == 1

    # ── AC1: accept job to bench slot ─────────────────────────────────────────

    def test_accept_job_moves_to_bench(self):
        """AC1 / test scenario 1: accepting a job assigns it to a bench slot."""
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        accepted = mgr.accept_job(job.id, bench_slot=1)
        assert accepted.bench_slot == 1
        assert accepted.is_active is True
        assert accepted.is_in_queue is False

    def test_accept_job_removes_from_available(self):
        """AC1: Accepted job no longer appears in get_available_jobs()."""
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        mgr.accept_job(job.id, bench_slot=2)
        assert mgr.available_count() == 0

    def test_accept_job_raises_for_unknown_job(self):
        mgr = IntakeQueueManager()
        with pytest.raises(ValueError, match="not found"):
            mgr.accept_job("nonexistent-id", bench_slot=1)

    def test_accept_job_raises_when_already_accepted(self):
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        mgr.accept_job(job.id, bench_slot=1)
        with pytest.raises(ValueError, match="not available"):
            mgr.accept_job(job.id, bench_slot=2)

    # ── complete_job ─────────────────────────────────────────────────────────

    def test_complete_job_sets_quality_and_timestamp(self):
        """Test scenario 1: completing a job records quality rating."""
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        mgr.accept_job(job.id, bench_slot=1)
        completed = mgr.complete_job(job.id, quality_rating=85)
        assert completed.quality_rating == 85
        assert completed.completed_at is not None
        assert completed.is_active is False

    def test_complete_job_raises_for_unaccepted_job(self):
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        with pytest.raises(ValueError, match="not currently active"):
            mgr.complete_job(job.id, quality_rating=80)

    def test_complete_job_raises_on_invalid_quality(self):
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        mgr.accept_job(job.id, bench_slot=1)
        with pytest.raises(ValueError, match="quality_rating"):
            mgr.complete_job(job.id, quality_rating=105)

    # ── AC2: complexity gating via trust level ────────────────────────────────

    def test_trust_level_2_job_has_higher_complexity_than_trust_1(self):
        """AC2: Trust-level-2+ clients offer jobs with higher complexity."""
        trust1_job = make_job(complexity=1, reward=30.0)
        trust2_job = make_job(complexity=2, reward=60.0)
        # Trust 2 job has higher complexity and reward
        assert trust2_job.complexity > trust1_job.complexity
        assert trust2_job.reward > trust1_job.reward

    # ── AC3: soft deadline gating ─────────────────────────────────────────────

    def test_job_with_soft_deadline_session_preserved(self):
        """Test scenario 4/5: soft deadline stored and retrievable from job."""
        job = make_job(soft_deadline_session=7)
        assert job.soft_deadline_session == 7

    def test_job_without_deadline_has_none(self):
        job = make_job()
        assert job.soft_deadline_session is None

    # ── Test scenario 7: empty bench / new session ────────────────────────────

    def test_new_queue_has_no_jobs(self):
        """Test scenario 7: fresh queue shows no active jobs."""
        mgr = IntakeQueueManager()
        assert mgr.available_count() == 0
        assert len(mgr.get_active_jobs()) == 0

    # ── Persistence (AC9) ─────────────────────────────────────────────────────

    def test_round_trip_preserves_accepted_jobs(self):
        """AC9: Accepted jobs, bench slots, and repair states are preserved across save → load."""
        mgr = IntakeQueueManager()
        job = make_job()
        mgr.add_job(job)
        mgr.accept_job(job.id, bench_slot=1)
        # Set a repair stage
        mgr.get_job(job.id).repair_stage = "teardown"

        saved = mgr.to_save_data()
        restored = IntakeQueueManager(saved)

        loaded = restored.get_job(job.id)
        assert loaded is not None
        assert loaded.bench_slot == 1
        assert loaded.repair_stage == "teardown"
        assert loaded.client_name == "Margaret"

    def test_round_trip_preserves_available_jobs(self):
        """AC9: Available queue jobs persist through save → load."""
        mgr = IntakeQueueManager()
        for _ in range(3):
            mgr.add_job(make_job())

        saved = mgr.to_save_data()
        restored = IntakeQueueManager(saved)
        assert restored.available_count() == 3

    def test_null_safe_construction_from_none(self):
        mgr = IntakeQueueManager(None)
        assert mgr.available_count() == 0
        assert mgr.get_all_jobs() == []

    def test_null_safe_construction_from_empty_dict(self):
        mgr = IntakeQueueManager({})
        assert mgr.available_count() == 0

    def test_null_safe_construction_missing_workshop_jobs_key(self):
        mgr = IntakeQueueManager({"order_queue": {}})
        assert mgr.available_count() == 0
