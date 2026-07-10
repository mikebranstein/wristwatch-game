"""
Tests for SessionStartDashboard
=================================
Covers AC4 (session-start dashboard: active bench jobs, intake queue count,
most recent client message, all within 2 seconds).

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import pytest
from src.ui.session_start_dashboard import SessionStartDashboard
from src.orders.order_queue import OrderQueue
from src.queue.workshop_job import WorkshopJob
from src.queue.intake_queue_manager import IntakeQueueManager
from src.clients.client import Client
from src.clients.client_registry import ClientRegistry
from src.reputation.reputation_system import ReputationSystem
from src.bench.bench_slot_manager import BenchSlotManager


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_client(name="Margaret", trust_level=1):
    client = Client.create(name=name)
    if trust_level >= 2:
        client.record_successful_job()
        client.record_successful_job()
    return client


def make_active_job(client_id: str, bench_slot: int = 1, watch_type="dress_watch"):
    job = WorkshopJob.create(
        client_id=client_id,
        watch_type=watch_type,
        complexity=2,
        reward=50.0,
        narrative_intake_message="Please restore this for me.",
    )
    job.accept_to_bench(slot=bench_slot, now=100.0)
    return job


def make_dashboard(active_jobs=None, intake_count=0, reputation_score=0.0) -> SessionStartDashboard:
    order_queue = OrderQueue()
    bench_mgr = BenchSlotManager()

    registry = ClientRegistry()
    client = make_client()
    registry.add(client)

    # Optionally set intake queue jobs
    intake_mgr = IntakeQueueManager()
    if intake_count > 0:
        for _ in range(intake_count):
            job = WorkshopJob.create(
                client_id=client.id,
                watch_type="field_watch",
                complexity=1,
                reward=25.0,
                narrative_intake_message="Hi, can you fix this?",
            )
            intake_mgr._jobs.append(job)

    rep = ReputationSystem()
    if reputation_score > 0:
        rep._score = reputation_score
        rep._tier = rep._compute_tier()

    return SessionStartDashboard(
        order_queue=order_queue,
        bench_manager=bench_mgr,
        intake_manager=intake_mgr,
        client_registry=registry,
        reputation=rep,
        active_jobs=active_jobs or [],
    )


# ─── AC4: Session-start view model ────────────────────────────────────────────

class TestSessionStartDashboard:
    """AC4: session-start dashboard loads with correct data within 2 seconds."""

    def test_empty_bench_empty_queue(self):
        """Scenario 7: no active jobs, no intake queue → prompt to accept first job."""
        dashboard = make_dashboard()
        vm = dashboard.get_session_start_view_model()
        assert vm["has_active_jobs"] is False
        assert vm["has_intake_jobs"] is False
        assert vm["intake_queue_count"] == 0
        assert vm["active_bench_jobs"] == []
        assert vm["prompt_accept_first_job"] is False

    def test_empty_bench_with_intake_jobs_prompts_player(self):
        """Scenario 7: no active jobs but queue has jobs → prompt to accept."""
        dashboard = make_dashboard(intake_count=3)
        vm = dashboard.get_session_start_view_model()
        assert vm["has_active_jobs"] is False
        assert vm["has_intake_jobs"] is True
        assert vm["intake_queue_count"] == 3
        assert vm["prompt_accept_first_job"] is True

    def test_active_bench_jobs_shown(self):
        """Scenario 6: 2 active bench jobs → both visible in dashboard."""
        registry = ClientRegistry()
        c1 = make_client("Margaret")
        c2 = make_client("David")
        registry.add(c1)
        registry.add(c2)

        job1 = make_active_job(c1.id, bench_slot=1)
        job2 = make_active_job(c2.id, bench_slot=2, watch_type="diver_watch")

        order_queue = OrderQueue()
        bench_mgr = BenchSlotManager()
        intake_mgr = IntakeQueueManager()
        rep = ReputationSystem()

        dashboard = SessionStartDashboard(
            order_queue=order_queue,
            bench_manager=bench_mgr,
            intake_manager=intake_mgr,
            client_registry=registry,
            reputation=rep,
            active_jobs=[job1, job2],
        )
        vm = dashboard.get_session_start_view_model()
        assert vm["has_active_jobs"] is True
        assert len(vm["active_bench_jobs"]) == 2
        slot_ids = {j["bench_slot"] for j in vm["active_bench_jobs"]}
        assert slot_ids == {1, 2}

    def test_client_messages_populated_for_active_jobs(self):
        """AC4: most recent client message per active job included."""
        registry = ClientRegistry()
        client = make_client("Margaret")
        registry.add(client)
        job = make_active_job(client.id, bench_slot=1)

        order_queue = OrderQueue()
        bench_mgr = BenchSlotManager()
        intake_mgr = IntakeQueueManager()
        rep = ReputationSystem()

        dashboard = SessionStartDashboard(
            order_queue=order_queue,
            bench_manager=bench_mgr,
            intake_manager=intake_mgr,
            client_registry=registry,
            reputation=rep,
            active_jobs=[job],
        )
        vm = dashboard.get_session_start_view_model()
        assert len(vm["client_messages"]) == 1
        msg = vm["client_messages"][0]
        assert msg["client_name"] == "Margaret"
        assert isinstance(msg["message"], str) and len(msg["message"]) > 0
        assert msg["job_id"] == job.id

    def test_reputation_score_and_tier_visible(self):
        """AC3/AC4: reputation score visible on dashboard."""
        dashboard = make_dashboard(reputation_score=55.0)
        vm = dashboard.get_session_start_view_model()
        assert vm["reputation_score"] == 55.0
        assert vm["reputation_tier"] == 2  # 55.0 ≥ tier2 threshold of 50.0

    def test_loads_within_2_seconds(self):
        """AC4: dashboard renders within 2 seconds of load."""
        dashboard = make_dashboard()
        vm = dashboard.get_session_start_view_model()
        assert vm["load_time_seconds"] < 2.0

    def test_completed_jobs_excluded_from_client_messages(self):
        """Completed jobs should not generate client messages on dashboard."""
        registry = ClientRegistry()
        client = make_client("Margaret")
        registry.add(client)
        job = make_active_job(client.id, bench_slot=1)
        job.complete(quality_rating=90)  # Mark as completed

        order_queue = OrderQueue()
        bench_mgr = BenchSlotManager()
        intake_mgr = IntakeQueueManager()
        rep = ReputationSystem()

        dashboard = SessionStartDashboard(
            order_queue=order_queue,
            bench_manager=bench_mgr,
            intake_manager=intake_mgr,
            client_registry=registry,
            reputation=rep,
            active_jobs=[job],
        )
        vm = dashboard.get_session_start_view_model()
        # Completed job still shows in bench job list
        assert len(vm["active_bench_jobs"]) == 1
        # But no client message for it
        assert vm["client_messages"] == []

    def test_intake_queue_count_matches_queue_state(self):
        """AC4: intake_queue_count accurately reflects available jobs."""
        dashboard = make_dashboard(intake_count=4)
        vm = dashboard.get_session_start_view_model()
        assert vm["intake_queue_count"] == 4
        assert vm["has_intake_jobs"] is True

    def test_extends_order_dashboard(self):
        """SessionStartDashboard is an OrderDashboard subclass (backward compat)."""
        from src.ui.order_dashboard import OrderDashboard
        dashboard = make_dashboard()
        assert isinstance(dashboard, OrderDashboard)

    def test_order_dashboard_method_still_works(self):
        """Backward compat: parent get_dashboard_view_model() still works."""
        dashboard = make_dashboard()
        parent_vm = dashboard.get_dashboard_view_model()
        assert "has_orders" in parent_vm
        assert "orders" in parent_vm
