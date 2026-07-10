"""
Tests for BenchSlotManager
============================
Covers AC1 (bench slots 1-4, unlock gating), milestone triggers,
and persistence.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import pytest
from src.bench.bench_slot_manager import BenchSlotManager


# ─── Null-safe construction ────────────────────────────────────────────────────

class TestBenchSlotManagerNullSafe:
    def test_default_state_slot1_unlocked_rest_locked(self):
        mgr = BenchSlotManager(None)
        slots = {s["slot_id"]: s for s in mgr.get_all_slots()}
        assert slots[1]["unlocked"] is True
        assert slots[2]["unlocked"] is False
        assert slots[3]["unlocked"] is False
        assert slots[4]["unlocked"] is False

    def test_constructs_from_empty_state(self):
        mgr = BenchSlotManager([])
        # Empty list fallback → default state
        assert mgr.count_open_slots() == 1  # slot 1 open by default


# ─── Unlock milestone gates — AC1 ─────────────────────────────────────────────

class TestBenchSlotUnlocks:
    """AC1: slots 2-4 unlocked through mastery/reputation milestones."""

    def test_apply_mastery_milestone_unlocks_slot_2(self):
        mgr = BenchSlotManager()
        unlocked = mgr.apply_mastery_milestone()
        assert unlocked is True
        assert mgr.get_all_slots()[1]["unlocked"] is True

    def test_apply_mastery_milestone_idempotent(self):
        mgr = BenchSlotManager()
        mgr.apply_mastery_milestone()
        unlocked_again = mgr.apply_mastery_milestone()
        assert unlocked_again is False  # already unlocked

    def test_apply_reputation_tier2_unlocks_slot_3(self):
        mgr = BenchSlotManager()
        unlocked = mgr.apply_reputation_milestone(tier=2)
        assert unlocked is True
        assert mgr.get_all_slots()[2]["unlocked"] is True

    def test_apply_reputation_tier3_unlocks_slot_4(self):
        mgr = BenchSlotManager()
        unlocked = mgr.apply_reputation_milestone(tier=3)
        assert unlocked is True
        assert mgr.get_all_slots()[3]["unlocked"] is True

    def test_reputation_milestone_tier1_no_op(self):
        mgr = BenchSlotManager()
        result = mgr.apply_reputation_milestone(tier=1)
        assert result is False  # no slot mapped to tier 1


# ─── Slot operations ──────────────────────────────────────────────────────────

class TestBenchSlotOperations:
    def test_assign_job_to_unlocked_slot(self):
        mgr = BenchSlotManager()
        mgr.assign_job(slot_id=1, job_id="job-001")
        assert not mgr.is_slot_available(1)
        active = mgr.get_active_job_slots()
        assert len(active) == 1
        assert active[0]["job_id"] == "job-001"

    def test_assign_raises_on_locked_slot(self):
        mgr = BenchSlotManager()
        with pytest.raises(ValueError, match="not yet unlocked"):
            mgr.assign_job(slot_id=2, job_id="job-001")

    def test_assign_raises_on_occupied_slot(self):
        mgr = BenchSlotManager()
        mgr.assign_job(slot_id=1, job_id="job-001")
        with pytest.raises(ValueError, match="already occupied"):
            mgr.assign_job(slot_id=1, job_id="job-002")

    def test_release_slot_clears_job(self):
        mgr = BenchSlotManager()
        mgr.assign_job(slot_id=1, job_id="job-001")
        mgr.release_slot(slot_id=1)
        assert mgr.is_slot_available(1)

    def test_release_raises_when_no_active_job(self):
        mgr = BenchSlotManager()
        with pytest.raises(ValueError, match="no active job"):
            mgr.release_slot(slot_id=1)

    def test_count_open_slots_increases_with_unlocks(self):
        mgr = BenchSlotManager()
        assert mgr.count_open_slots() == 1
        mgr.apply_mastery_milestone()
        assert mgr.count_open_slots() == 2
        mgr.apply_reputation_milestone(tier=2)
        assert mgr.count_open_slots() == 3
        mgr.apply_reputation_milestone(tier=3)
        assert mgr.count_open_slots() == 4

    def test_max_4_slots(self):
        mgr = BenchSlotManager()
        mgr.apply_mastery_milestone()
        mgr.apply_reputation_milestone(tier=2)
        mgr.apply_reputation_milestone(tier=3)
        assert len(mgr.get_unlocked_slots()) == 4

    def test_get_unlock_trigger_labels(self):
        mgr = BenchSlotManager()
        assert mgr.get_unlock_trigger(1) == "always"
        assert mgr.get_unlock_trigger(2) == "multi_job_mastery"
        assert mgr.get_unlock_trigger(3) == "reputation_tier_2"
        assert mgr.get_unlock_trigger(4) == "reputation_tier_3"


# ─── Persistence ──────────────────────────────────────────────────────────────

class TestBenchSlotPersistence:
    def test_round_trip_preserves_all_slot_states(self):
        mgr = BenchSlotManager()
        mgr.apply_mastery_milestone()
        mgr.assign_job(slot_id=1, job_id="job-abc")
        save_data = mgr.to_save_data()
        reloaded = BenchSlotManager(save_data)
        slots = {s["slot_id"]: s for s in reloaded.get_all_slots()}
        assert slots[1]["job_id"] == "job-abc"
        assert slots[2]["unlocked"] is True
        assert slots[3]["unlocked"] is False

    def test_save_data_has_4_slots(self):
        mgr = BenchSlotManager()
        d = mgr.to_save_data()
        assert len(d) == 4
