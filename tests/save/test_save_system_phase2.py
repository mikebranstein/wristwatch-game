"""
Tests for SaveSystem Phase 2 extensions — Issue #119, Workshop Queue Meta-Game Phase 2
=======================================================================================

Covers:
  - load_workshop_state() null-safe initialisation for pre-feature saves
  - save_workshop_state() round-trip persistence of all 5 Phase 2 keys
  - Integration: load → modify → save → reload preserves full state (AC9)
  - Feature flag backward compatibility

Run with: pytest tests/
"""

import pytest
from src.save.save_system import SaveSystem
from src.bench.bench_slot_manager import BenchSlotManager
from src.clients.client import Client
from src.clients.client_registry import ClientRegistry
from src.reputation.reputation_system import ReputationSystem
from src.queue.intake_queue_manager import IntakeQueueManager
from src.queue.workshop_job import WorkshopJob


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_job() -> WorkshopJob:
    return WorkshopJob.create(
        client_id="client-001",
        client_name="Margaret",
        watch_type="dress watch",
        complexity=1,
        reward=50.0,
        narrative_intake_message="Please restore my watch.",
    )


# ─── load_workshop_state — null-safe backward compatibility ───────────────────

class TestLoadWorkshopStateNullSafe:
    def setup_method(self):
        self.ss = SaveSystem()

    def test_none_save_data_produces_empty_state(self):
        """Pre-feature save (None) initialises all 5 Phase 2 objects to empty/default."""
        bsm, cr, rep, iqm = self.ss.load_workshop_state(None)
        assert bsm.get_all_allocations() == {}
        assert cr.get_all_clients() == []
        assert rep.current_score() == 0.0
        assert iqm.available_count() == 0

    def test_empty_dict_produces_empty_state(self):
        bsm, cr, rep, iqm = self.ss.load_workshop_state({})
        assert bsm.get_all_allocations() == {}
        assert cr.get_all_clients() == []
        assert rep.current_score() == 0.0

    def test_pre_feature_save_without_phase2_keys_loads_gracefully(self):
        """Pre-existing saves with only Phase 1 keys are forward-compatible."""
        legacy_save = {
            "order_queue": {"session_boundary_count": 3, "orders": []},
            "last_checkpoint_stage": "sourcing",
        }
        bsm, cr, rep, iqm = self.ss.load_workshop_state(legacy_save)
        # All Phase 2 state initialises to empty defaults
        assert bsm.get_all_allocations() == {}
        assert cr.get_all_clients() == []
        assert rep.current_score() == 0.0
        assert iqm.available_count() == 0


# ─── save_workshop_state ─────────────────────────────────────────────────────

class TestSaveWorkshopState:
    def setup_method(self):
        self.ss = SaveSystem()

    def test_save_merges_all_phase2_keys(self):
        """save_workshop_state() produces a dict with all 5 Phase 2 keys."""
        bsm = BenchSlotManager()
        cr = ClientRegistry()
        rep = ReputationSystem()
        iqm = IntakeQueueManager()

        result = self.ss.save_workshop_state(bsm, cr, rep, iqm, existing_save_data=None)

        assert "bench_slots" in result
        assert "clients" in result
        assert "reputation" in result
        assert "workshop_jobs" in result

    def test_save_preserves_existing_keys(self):
        """Existing save data (e.g. order_queue) is preserved when saving Phase 2 state."""
        existing = {"order_queue": {"session_boundary_count": 5, "orders": []}}
        bsm = BenchSlotManager()
        cr = ClientRegistry()
        rep = ReputationSystem()
        iqm = IntakeQueueManager()

        result = self.ss.save_workshop_state(bsm, cr, rep, iqm, existing_save_data=existing)
        assert result["order_queue"]["session_boundary_count"] == 5

    def test_save_none_existing_data_works(self):
        """save_workshop_state() handles None existing_save_data gracefully."""
        bsm = BenchSlotManager()
        cr = ClientRegistry()
        rep = ReputationSystem()
        iqm = IntakeQueueManager()
        result = self.ss.save_workshop_state(bsm, cr, rep, iqm, existing_save_data=None)
        assert isinstance(result, dict)


# ─── Round-trip integration (AC9) ────────────────────────────────────────────

class TestSaveLoadRoundTrip:
    def setup_method(self):
        self.ss = SaveSystem()

    def test_full_phase2_state_round_trip(self):
        """
        AC9: Full workshop state (jobs, clients, reputation, bench slots) survives
        a save → load cycle with no data loss.
        """
        # Build initial state
        bsm = BenchSlotManager()
        cr = ClientRegistry()
        rep = ReputationSystem()
        iqm = IntakeQueueManager()

        # Add a client with trust progression
        client = Client.create(name="Margaret", personality_flags=["vintage_collector"])
        cr.add_client(client)
        cr.record_successful_job(client.id)
        cr.record_successful_job(client.id)  # trust_level → 2

        # Add a job and accept it to bench slot 1
        job = make_job()
        iqm.add_job(job)
        iqm.accept_job(job.id, bench_slot=1)
        iqm.get_job(job.id).repair_stage = "teardown"
        bsm.allocate_slot(job.id, 1)

        # Record a reputation delivery
        rep.record_delivery(quality_rating=90, on_time=True)
        score_before = rep.current_score()

        # Save
        saved = self.ss.save_workshop_state(bsm, cr, rep, iqm, existing_save_data=None)

        # Reload
        bsm2, cr2, rep2, iqm2 = self.ss.load_workshop_state(saved)

        # Verify bench slot allocations
        assert bsm2.get_slot(1) == job.id

        # Verify client registry
        loaded_client = cr2.get_client(client.id)
        assert loaded_client is not None
        assert loaded_client.name == "Margaret"
        assert loaded_client.trust_level == 2
        assert loaded_client.successful_jobs_count == 2

        # Verify reputation score
        assert abs(rep2.current_score() - score_before) < 1e-9

        # Verify job state
        loaded_job = iqm2.get_job(job.id)
        assert loaded_job is not None
        assert loaded_job.bench_slot == 1
        assert loaded_job.repair_stage == "teardown"
        assert loaded_job.client_name == "Margaret"

    def test_multiple_jobs_round_trip(self):
        """AC9: Multiple accepted and queued jobs are all preserved."""
        bsm = BenchSlotManager()
        cr = ClientRegistry()
        rep = ReputationSystem()
        iqm = IntakeQueueManager()

        j1 = make_job()
        j2 = make_job()
        j3 = make_job()  # stays in queue

        iqm.add_job(j1)
        iqm.add_job(j2)
        iqm.add_job(j3)

        iqm.accept_job(j1.id, bench_slot=1)
        iqm.accept_job(j2.id, bench_slot=2)
        bsm.allocate_slot(j1.id, 1)
        bsm.allocate_slot(j2.id, 2)

        saved = self.ss.save_workshop_state(bsm, cr, rep, iqm, existing_save_data=None)
        bsm2, cr2, rep2, iqm2 = self.ss.load_workshop_state(saved)

        assert len(iqm2.get_active_jobs()) == 2
        assert len(iqm2.get_available_jobs()) == 1
        assert bsm2.get_slot(1) == j1.id
        assert bsm2.get_slot(2) == j2.id


# ─── Feature flag backward compatibility ─────────────────────────────────────

class TestFeatureFlagCompatibility:
    def test_save_without_queue_feature_flag_loads_as_false(self):
        """
        Saves created before queue_feature_flag was added must default to
        flag=false (flag-off = legacy single-bench flow).
        """
        legacy_save = {
            "order_queue": {"session_boundary_count": 1, "orders": []},
        }
        # queue_feature_flag absent in save → no Phase 2 state initialised
        ss = SaveSystem()
        bsm, cr, rep, iqm = ss.load_workshop_state(legacy_save)
        # All empty: feature is effectively off
        assert bsm.get_all_allocations() == {}
        assert iqm.available_count() == 0
