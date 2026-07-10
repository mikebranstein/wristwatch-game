"""
Tests for WorkshopJob
======================
Covers AC1 (job intake queue), AC3 (job completion & quality rating),
and persistence (AC save-data round-trip).

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import pytest
from src.queue.workshop_job import WorkshopJob


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_job(**overrides):
    params = dict(
        client_id="client-margaret-001",
        watch_type="dress_watch",
        complexity=2,
        reward=50.0,
        narrative_intake_message="I have a watch that needs work.",
    )
    params.update(overrides)
    return params


# ─── Factory ──────────────────────────────────────────────────────────────────

class TestWorkshopJobCreate:
    def test_creates_job_in_intake_queue(self):
        job = WorkshopJob.create(**make_job())
        assert job.bench_slot is None
        assert job.accepted_at is None
        assert job.completed_at is None
        assert job.quality_rating is None
        assert job.id  # truthy UUID

    def test_creates_job_with_correct_fields(self):
        job = WorkshopJob.create(**make_job())
        assert job.client_id == "client-margaret-001"
        assert job.watch_type == "dress_watch"
        assert job.complexity == 2
        assert job.reward == 50.0

    def test_raises_on_invalid_complexity(self):
        with pytest.raises(ValueError, match="complexity must be 1-5"):
            WorkshopJob.create(**make_job(complexity=0))
        with pytest.raises(ValueError, match="complexity must be 1-5"):
            WorkshopJob.create(**make_job(complexity=6))

    def test_raises_on_negative_reward(self):
        with pytest.raises(ValueError, match="non-negative"):
            WorkshopJob.create(**make_job(reward=-10))

    def test_raises_on_missing_client_id(self):
        with pytest.raises(ValueError):
            WorkshopJob.create(**make_job(client_id=""))

    def test_soft_deadline_optional(self):
        job_no_dl = WorkshopJob.create(**make_job())
        assert job_no_dl.soft_deadline_sessions is None
        job_with_dl = WorkshopJob.create(**make_job(soft_deadline_sessions=3))
        assert job_with_dl.soft_deadline_sessions == 3


# ─── State transitions ────────────────────────────────────────────────────────

class TestWorkshopJobStateTransitions:
    def test_accept_to_bench_sets_slot_and_accepted_at(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=1, now=1234567890.0)
        assert job.bench_slot == 1
        assert job.accepted_at == 1234567890.0
        assert job.is_active

    def test_accept_to_bench_raises_on_invalid_slot(self):
        job = WorkshopJob.create(**make_job())
        with pytest.raises(ValueError):
            job.accept_to_bench(slot=0)
        with pytest.raises(ValueError):
            job.accept_to_bench(slot=5)

    def test_accept_to_bench_raises_if_already_on_bench(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=1)
        with pytest.raises(ValueError, match="already on bench"):
            job.accept_to_bench(slot=2)

    def test_complete_sets_quality_and_completed_at(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=1)
        job.complete(quality_rating=85, now=9999999.0)
        assert job.quality_rating == 85
        assert job.completed_at == 9999999.0
        assert job.is_completed

    def test_complete_raises_on_invalid_quality(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=1)
        with pytest.raises(ValueError):
            job.complete(quality_rating=101)
        with pytest.raises(ValueError):
            job.complete(quality_rating=-1)

    def test_complete_raises_if_not_on_bench(self):
        job = WorkshopJob.create(**make_job())
        with pytest.raises(ValueError, match="not been accepted"):
            job.complete(quality_rating=90)


# ─── Properties ───────────────────────────────────────────────────────────────

class TestWorkshopJobProperties:
    def test_is_active_false_when_in_intake_queue(self):
        job = WorkshopJob.create(**make_job())
        assert job.is_active is False

    def test_is_active_true_when_on_bench(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=2)
        assert job.is_active is True

    def test_is_completed_false_before_delivery(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=1)
        assert job.is_completed is False

    def test_is_completed_true_after_delivery(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=1)
        job.complete(quality_rating=90)
        assert job.is_completed is True


# ─── Serialisation ────────────────────────────────────────────────────────────

class TestWorkshopJobSerialisation:
    def test_round_trip_preserves_all_fields(self):
        job = WorkshopJob.create(**make_job(soft_deadline_sessions=4))
        job.accept_to_bench(slot=2, now=111.0)
        d = job.to_dict()
        reloaded = WorkshopJob.from_dict(d)
        assert reloaded.id == job.id
        assert reloaded.client_id == job.client_id
        assert reloaded.bench_slot == 2
        assert reloaded.accepted_at == 111.0
        assert reloaded.soft_deadline_sessions == 4
        assert reloaded.narrative_intake_message == job.narrative_intake_message

    def test_round_trip_with_completed_job(self):
        job = WorkshopJob.create(**make_job())
        job.accept_to_bench(slot=1, now=100.0)
        job.complete(quality_rating=75, now=200.0)
        d = job.to_dict()
        reloaded = WorkshopJob.from_dict(d)
        assert reloaded.quality_rating == 75
        assert reloaded.completed_at == 200.0
        assert reloaded.is_completed
