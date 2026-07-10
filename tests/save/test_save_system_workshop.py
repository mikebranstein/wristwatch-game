"""
Tests for SaveSystem — Issue #119 extensions
==============================================
Covers null-safe loading of new workshop queue keys (AC save-data persistence,
Scenario 9 — save/load round-trip for jobs, client data, reputation, bench slots).

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import pytest
from src.save.save_system import SaveSystem
from src.clients.client import Client
from src.clients.client_registry import ClientRegistry
from src.queue.workshop_job import WorkshopJob
from src.bench.bench_slot_manager import BenchSlotManager
from src.reputation.reputation_system import ReputationSystem


class TestSaveSystemWorkshopExtensions:
    """Test null-safe loading/saving of workshop meta-game save-data keys."""

    def test_load_session_with_no_save_data_returns_defaults(self):
        ss = SaveSystem()
        _, _, updated = ss.load_session(None)
        # Should contain all new keys defaulted to empty/falsy values
        assert "workshop_jobs" in updated
        assert "intake_queue" in updated
        assert "clients" in updated
        assert "reputation" in updated
        assert "bench_slots" in updated
        assert "queue_feature_flag" in updated
        assert updated["queue_feature_flag"] is False

    def test_load_session_with_legacy_save_preserves_existing_keys(self):
        """Pre-feature saves load cleanly — no migration required."""
        legacy_save = {
            "order_queue": {"session_boundary_count": 3, "orders": []},
            "tutorial_first_fault_seen": True,
        }
        ss = SaveSystem()
        _, _, updated = ss.load_session(legacy_save)
        assert updated["tutorial_first_fault_seen"] is True
        assert updated["workshop_jobs"] == []
        assert updated["bench_slots"]  # BenchSlotManager default = 4 slots

    def test_load_workshop_session_returns_subsystem_objects(self):
        ss = SaveSystem()
        result = ss.load_workshop_session(None)
        assert "order_queue" in result
        assert "arrived_orders" in result
        assert "active_jobs" in result
        assert "intake_manager" in result
        assert "client_registry" in result
        assert "reputation" in result
        assert "bench_manager" in result
        assert "queue_feature_flag" in result
        assert "updated_save_data" in result

    def test_load_workshop_session_deserialises_clients(self):
        """Scenario 9: client registry persists across save/load."""
        registry = ClientRegistry()
        c = Client.create(name="Margaret")
        registry.add(c)
        save_data = {"clients": registry.to_save_data()}
        ss = SaveSystem()
        result = ss.load_workshop_session(save_data)
        loaded_registry: ClientRegistry = result["client_registry"]
        assert loaded_registry.get(c.id) is not None
        assert loaded_registry.get(c.id).name == "Margaret"

    def test_load_workshop_session_deserialises_active_jobs(self):
        """Scenario 9: active bench jobs persist across save/load."""
        job = WorkshopJob.create(
            client_id="client-001",
            watch_type="dress_watch",
            complexity=2,
            reward=50.0,
            narrative_intake_message="Hello!",
        )
        job.accept_to_bench(slot=1, now=100.0)
        save_data = {"workshop_jobs": [job.to_dict()]}
        ss = SaveSystem()
        result = ss.load_workshop_session(save_data)
        active_jobs = result["active_jobs"]
        assert len(active_jobs) == 1
        assert active_jobs[0].id == job.id
        assert active_jobs[0].bench_slot == 1

    def test_load_workshop_session_deserialises_reputation(self):
        """Scenario 9: reputation state persists across save/load."""
        rep = ReputationSystem()
        rep.update_from_job(quality_rating=90, delivered_on_time=True)
        save_data = {"reputation": rep.to_save_data()}
        ss = SaveSystem()
        result = ss.load_workshop_session(save_data)
        loaded_rep: ReputationSystem = result["reputation"]
        assert abs(loaded_rep.score - rep.score) < 0.001

    def test_load_workshop_session_deserialises_bench_slots(self):
        """Scenario 9: bench slot unlocks persist across save/load."""
        bench = BenchSlotManager()
        bench.apply_mastery_milestone()  # unlock slot 2
        save_data = {"bench_slots": bench.to_save_data()}
        ss = SaveSystem()
        result = ss.load_workshop_session(save_data)
        loaded_bench: BenchSlotManager = result["bench_manager"]
        slots = {s["slot_id"]: s for s in loaded_bench.get_all_slots()}
        assert slots[2]["unlocked"] is True

    def test_queue_feature_flag_loaded_correctly(self):
        ss = SaveSystem()
        # Flag off
        r1 = ss.load_workshop_session({"queue_feature_flag": False})
        assert r1["queue_feature_flag"] is False
        # Flag on
        r2 = ss.load_workshop_session({"queue_feature_flag": True})
        assert r2["queue_feature_flag"] is True

    def test_full_round_trip_workshop_session(self):
        """Full save/load round-trip for complete workshop state (Scenario 9)."""
        # Setup initial state
        registry = ClientRegistry()
        margaret = Client.create(name="Margaret")
        registry.add(margaret)

        job1 = WorkshopJob.create(
            client_id=margaret.id,
            watch_type="dress_watch",
            complexity=2,
            reward=50.0,
            narrative_intake_message="Hello!",
        )
        job1.accept_to_bench(slot=1)

        rep = ReputationSystem()
        rep.update_from_job(quality_rating=85, delivered_on_time=True)

        bench = BenchSlotManager()
        bench.apply_mastery_milestone()

        # Simulate a save
        save_data = {
            "workshop_jobs": [job1.to_dict()],
            "clients": registry.to_save_data(),
            "reputation": rep.to_save_data(),
            "bench_slots": bench.to_save_data(),
            "queue_feature_flag": True,
        }

        # Reload
        ss = SaveSystem()
        result = ss.load_workshop_session(save_data)

        assert result["queue_feature_flag"] is True
        assert len(result["active_jobs"]) == 1
        assert result["active_jobs"][0].bench_slot == 1
        loaded_client = result["client_registry"].get(margaret.id)
        assert loaded_client.name == "Margaret"
        assert abs(result["reputation"].score - rep.score) < 0.001
        loaded_slots = {s["slot_id"]: s for s in result["bench_manager"].get_all_slots()}
        assert loaded_slots[2]["unlocked"] is True
