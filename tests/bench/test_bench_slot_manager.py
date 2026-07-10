"""
Tests for BenchSlotManager – Issue #119, Workshop Queue Meta-Game Phase 2
=========================================================================

Covers acceptance criteria:
  AC1 — multi-job mastery milestone unlocks 2 bench slots
  AC3 — reputation tier milestones unlock slots 3 and 4

Run with: pytest tests/
"""

import pytest
from src.bench.bench_slot_manager import (
    BenchSlotManager,
    MASTERY_MILESTONE_COMPLETIONS,
    MASTERY_QUALITY_THRESHOLD,
    MAX_BENCH_SLOTS,
    SLOT_3_REPUTATION_TIER,
    SLOT_4_REPUTATION_TIER,
)


# ─── unlocked_slot_count ──────────────────────────────────────────────────────

class TestUnlockedSlotCount:
    """AC1 / AC3 — bench slot unlock gating."""

    def test_no_mastery_returns_single_slot(self):
        """AC1: Before mastery milestone, only 1 bench slot is available."""
        bsm = BenchSlotManager()
        assert bsm.unlocked_slot_count(reputation_tier=1, mastery_milestone_met=False) == 1

    def test_mastery_milestone_unlocks_two_slots(self):
        """AC1: Mastery milestone (5 restorations at ≥70% quality) unlocks slots 1 and 2."""
        bsm = BenchSlotManager()
        assert bsm.unlocked_slot_count(reputation_tier=1, mastery_milestone_met=True) == 2

    def test_reputation_tier_2_unlocks_slot_3(self):
        """AC3: Reputation tier 2 milestone unlocks slot 3."""
        bsm = BenchSlotManager()
        count = bsm.unlocked_slot_count(
            reputation_tier=SLOT_3_REPUTATION_TIER, mastery_milestone_met=True
        )
        assert count == 3

    def test_reputation_tier_3_unlocks_slot_4(self):
        """AC3: Reputation tier 3 milestone unlocks slot 4 (hard cap)."""
        bsm = BenchSlotManager()
        count = bsm.unlocked_slot_count(
            reputation_tier=SLOT_4_REPUTATION_TIER, mastery_milestone_met=True
        )
        assert count == 4

    def test_hard_cap_at_4_slots(self):
        """No more than 4 slots regardless of reputation tier."""
        bsm = BenchSlotManager()
        count = bsm.unlocked_slot_count(reputation_tier=99, mastery_milestone_met=True)
        assert count == MAX_BENCH_SLOTS

    def test_without_mastery_reputation_tier_does_not_unlock_extra_slots(self):
        """Reputation tier alone does not unlock slots 2–4 without mastery milestone."""
        bsm = BenchSlotManager()
        count = bsm.unlocked_slot_count(
            reputation_tier=SLOT_4_REPUTATION_TIER, mastery_milestone_met=False
        )
        assert count == 1


# ─── allocate_slot / release_slot ────────────────────────────────────────────

class TestSlotAllocation:
    def test_allocate_assigns_job_to_slot(self):
        bsm = BenchSlotManager()
        bsm.allocate_slot("job-001", 1)
        assert bsm.get_slot(1) == "job-001"

    def test_allocate_multiple_slots(self):
        bsm = BenchSlotManager()
        bsm.allocate_slot("job-A", 1)
        bsm.allocate_slot("job-B", 2)
        assert bsm.get_slot(1) == "job-A"
        assert bsm.get_slot(2) == "job-B"

    def test_allocate_raises_on_occupied_slot(self):
        bsm = BenchSlotManager()
        bsm.allocate_slot("job-001", 1)
        with pytest.raises(ValueError, match="already occupied"):
            bsm.allocate_slot("job-002", 1)

    def test_allocate_raises_on_invalid_slot_number(self):
        bsm = BenchSlotManager()
        with pytest.raises(ValueError, match="slot_number"):
            bsm.allocate_slot("job-001", 5)  # exceeds MAX_BENCH_SLOTS

    def test_allocate_raises_on_zero_slot(self):
        bsm = BenchSlotManager()
        with pytest.raises(ValueError, match="slot_number"):
            bsm.allocate_slot("job-001", 0)

    def test_release_slot_frees_allocation(self):
        bsm = BenchSlotManager()
        bsm.allocate_slot("job-001", 2)
        bsm.release_slot(2)
        assert bsm.get_slot(2) is None

    def test_release_raises_on_unallocated_slot(self):
        bsm = BenchSlotManager()
        with pytest.raises(ValueError, match="not currently allocated"):
            bsm.release_slot(1)

    def test_get_open_slots_returns_unoccupied(self):
        bsm = BenchSlotManager()
        bsm.allocate_slot("job-A", 1)
        open_slots = bsm.get_open_slots(reputation_tier=2, mastery_milestone_met=True)
        assert 1 not in open_slots
        assert 2 in open_slots
        assert 3 in open_slots

    def test_get_all_allocations_snapshot(self):
        bsm = BenchSlotManager()
        bsm.allocate_slot("job-X", 1)
        bsm.allocate_slot("job-Y", 3)
        allocs = bsm.get_all_allocations()
        assert allocs == {1: "job-X", 3: "job-Y"}


# ─── Persistence ─────────────────────────────────────────────────────────────

class TestBenchSlotManagerPersistence:
    def test_round_trip_save_and_load(self):
        """AC scenario 9: bench slot allocations survive a save → load cycle."""
        bsm = BenchSlotManager()
        bsm.allocate_slot("job-001", 1)
        bsm.allocate_slot("job-002", 2)

        saved = bsm.to_save_data()
        restored = BenchSlotManager(saved)

        assert restored.get_slot(1) == "job-001"
        assert restored.get_slot(2) == "job-002"

    def test_null_safe_construction_from_none(self):
        """Pre-feature save (None) initialises to empty allocations."""
        bsm = BenchSlotManager(None)
        assert bsm.get_all_allocations() == {}

    def test_null_safe_construction_from_empty_dict(self):
        """Pre-feature save (empty dict) initialises to empty allocations."""
        bsm = BenchSlotManager({})
        assert bsm.get_all_allocations() == {}

    def test_null_safe_construction_missing_bench_slots_key(self):
        """Pre-feature save dict without 'bench_slots' key initialises gracefully."""
        bsm = BenchSlotManager({"order_queue": {}})
        assert bsm.get_all_allocations() == {}
