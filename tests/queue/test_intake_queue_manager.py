"""
Tests for IntakeQueueManager
=============================
Covers AC1 (intake queue shows 2-6 jobs), queue replenishment,
job acceptance, and persistence.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import random
import pytest
from src.queue.intake_queue_manager import IntakeQueueManager, QUEUE_MIN, QUEUE_MAX
from src.clients.client import Client
from src.clients.client_registry import ClientRegistry


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_registry_with_clients(n: int = 3) -> ClientRegistry:
    registry = ClientRegistry()
    names = ["Margaret", "David", "Priya", "Chen", "Sofia"]
    for i in range(n):
        client = Client.create(name=names[i % len(names)])
        registry.add(client)
    return registry


def make_deterministic_rng():
    return random.Random(42)


# ─── Null-safe construction ────────────────────────────────────────────────────

class TestIntakeQueueManagerNullSafe:
    def test_constructs_empty_from_none(self):
        mgr = IntakeQueueManager(None)
        assert mgr.count() == 0

    def test_constructs_empty_from_missing_key(self):
        mgr = IntakeQueueManager([])
        assert mgr.count() == 0


# ─── Replenishment — AC1 ──────────────────────────────────────────────────────

class TestIntakeQueueReplenishment:
    """AC1: queue shows 2-6 available jobs after replenishment."""

    def test_replenish_fills_to_max(self):
        registry = make_registry_with_clients(3)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        added = mgr.replenish(registry, current_session=1)
        assert mgr.count() == QUEUE_MAX
        assert len(added) == QUEUE_MAX

    def test_replenish_does_not_exceed_max(self):
        registry = make_registry_with_clients(3)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        mgr.replenish(registry, current_session=1)
        # A second replenish should add nothing
        added = mgr.replenish(registry, current_session=1)
        assert mgr.count() == QUEUE_MAX
        assert added == []

    def test_replenish_to_custom_target(self):
        registry = make_registry_with_clients(3)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        mgr.replenish(registry, current_session=1, target=3)
        assert mgr.count() == 3

    def test_needs_replenishment_true_when_below_min(self):
        mgr = IntakeQueueManager()
        assert mgr.needs_replenishment() is True

    def test_needs_replenishment_false_when_at_or_above_min(self):
        registry = make_registry_with_clients(3)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        mgr.replenish(registry, current_session=1, target=QUEUE_MIN)
        assert mgr.needs_replenishment() is False

    def test_replenished_jobs_have_valid_fields(self):
        registry = make_registry_with_clients(2)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        mgr.replenish(registry, current_session=1)
        for job in mgr.get_all():
            assert job.client_id
            assert job.watch_type
            assert 1 <= job.complexity <= 5
            assert job.reward > 0
            assert job.bench_slot is None  # still in queue

    def test_replenish_with_no_clients_returns_empty(self):
        registry = ClientRegistry()  # empty
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        added = mgr.replenish(registry, current_session=1)
        assert added == []
        assert mgr.count() == 0


# ─── Job acceptance ────────────────────────────────────────────────────────────

class TestIntakeQueueAcceptance:
    def test_accept_job_removes_from_queue(self):
        registry = make_registry_with_clients(3)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        mgr.replenish(registry, current_session=1)
        job = mgr.get_all()[0]
        accepted = mgr.accept_job(job.id)
        assert accepted.id == job.id
        assert mgr.count() == QUEUE_MAX - 1

    def test_accept_job_raises_when_not_found(self):
        mgr = IntakeQueueManager()
        with pytest.raises(ValueError, match="not found"):
            mgr.accept_job("nonexistent-job-id")

    def test_queue_replenishes_after_acceptance(self):
        """Scenario 1 (test scenario): accept job then replenish keeps queue healthy."""
        registry = make_registry_with_clients(3)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        mgr.replenish(registry, current_session=1)
        count_before = mgr.count()
        job = mgr.get_all()[0]
        mgr.accept_job(job.id)
        assert mgr.count() == count_before - 1
        # Replenish after acceptance
        mgr.replenish(registry, current_session=2)
        assert mgr.count() == QUEUE_MAX


# ─── Persistence ──────────────────────────────────────────────────────────────

class TestIntakeQueuePersistence:
    """Scenario 9: save/load preserves queue state."""

    def test_round_trip_preserves_jobs(self):
        registry = make_registry_with_clients(3)
        mgr = IntakeQueueManager(rng=make_deterministic_rng())
        mgr.replenish(registry, current_session=1)
        save_data = mgr.to_save_data()
        reloaded = IntakeQueueManager(save_data)
        assert reloaded.count() == mgr.count()
        original_ids = {j.id for j in mgr.get_all()}
        reloaded_ids = {j.id for j in reloaded.get_all()}
        assert original_ids == reloaded_ids

    def test_empty_queue_save_roundtrip(self):
        mgr = IntakeQueueManager()
        save_data = mgr.to_save_data()
        reloaded = IntakeQueueManager(save_data)
        assert reloaded.count() == 0
