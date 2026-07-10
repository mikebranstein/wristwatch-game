"""
Tests: BenchSlot — Issue #116 state machine
============================================

Covers BenchSlot state transitions, timer logic, repair steps,
save/load snapshot, and edge cases.

Run with:
    python -m pytest tests/ -v
"""

import pytest
import time

from src.workshop.bench_slot import (
    BenchSlot,
    SLOT_STATE_EMPTY,
    SLOT_STATE_INTAKE,
    SLOT_STATE_SOURCING,
    SLOT_STATE_REPAIR,
    SLOT_STATE_DELIVERY,
    BENCH_SLOT_SCHEMA_VERSION,
)


class TestBenchSlotInitialState:
    def test_new_slot_is_empty(self):
        slot = BenchSlot(slot_index=0)
        assert slot.state == SLOT_STATE_EMPTY

    def test_new_slot_has_correct_index(self):
        slot = BenchSlot(slot_index=1)
        assert slot.slot_index == 1

    def test_new_slot_has_no_job(self):
        slot = BenchSlot()
        assert slot.job_id is None
        assert slot.watch_label is None

    def test_is_empty_true_initially(self):
        slot = BenchSlot()
        assert slot.is_empty is True

    def test_is_sourcing_false_initially(self):
        slot = BenchSlot()
        assert slot.is_sourcing is False


class TestBenchSlotIntake:
    def test_intake_transitions_to_intake_state(self):
        slot = BenchSlot()
        slot.intake_job("job-001", "Omega Seamaster")
        assert slot.state == SLOT_STATE_INTAKE

    def test_intake_stores_job_id(self):
        slot = BenchSlot()
        slot.intake_job("job-42", "Seiko SKX")
        assert slot.job_id == "job-42"

    def test_intake_stores_watch_label(self):
        slot = BenchSlot()
        slot.intake_job("job-42", "Seiko SKX")
        assert slot.watch_label == "Seiko SKX"

    def test_intake_stores_repair_steps(self):
        slot = BenchSlot()
        steps = ["step_a", "step_b"]
        slot.intake_job("job-42", "Seiko SKX", repair_steps=steps)
        snap = slot.snapshot()
        assert snap["repair_steps"] == steps

    def test_intake_without_repair_steps_defaults_to_empty(self):
        slot = BenchSlot()
        slot.intake_job("job-42", "Seiko SKX")
        snap = slot.snapshot()
        assert snap["repair_steps"] == []

    def test_intake_from_non_empty_raises(self):
        slot = BenchSlot()
        slot.intake_job("job-1", "Watch 1")
        with pytest.raises(ValueError, match="EMPTY"):
            slot.intake_job("job-2", "Watch 2")

    def test_is_empty_false_after_intake(self):
        slot = BenchSlot()
        slot.intake_job("job-1", "Watch 1")
        assert slot.is_empty is False


class TestBenchSlotSourcing:
    def test_start_sourcing_transitions_to_sourcing(self):
        slot = BenchSlot()
        slot.intake_job("job-1", "Watch 1")
        slot.start_sourcing(3600.0)
        assert slot.state == SLOT_STATE_SOURCING

    def test_is_sourcing_true_after_start(self):
        slot = BenchSlot()
        slot.intake_job("job-1", "Watch 1")
        slot.start_sourcing(3600.0)
        assert slot.is_sourcing is True

    def test_start_sourcing_from_empty_raises(self):
        slot = BenchSlot()
        with pytest.raises(ValueError):
            slot.start_sourcing(100.0)

    def test_start_sourcing_with_zero_duration_raises(self):
        slot = BenchSlot()
        slot.intake_job("job-1", "Watch 1")
        with pytest.raises(ValueError, match="positive"):
            slot.start_sourcing(0)

    def test_start_sourcing_with_negative_duration_raises(self):
        slot = BenchSlot()
        slot.intake_job("job-1", "Watch 1")
        with pytest.raises(ValueError, match="positive"):
            slot.start_sourcing(-1.0)

    def test_sourcing_not_complete_immediately(self):
        now = 1_000_000.0
        clock_calls = [now]
        slot = BenchSlot(clock=lambda: clock_calls[0])
        slot.intake_job("job-1", "Watch 1")
        slot.start_sourcing(3600.0)
        # Still at the same time — not complete
        assert slot.check_sourcing_complete() is False

    def test_sourcing_complete_after_elapsed(self):
        now = [1_000_000.0]
        slot = BenchSlot(clock=lambda: now[0])
        slot.intake_job("job-1", "Watch 1")
        slot.start_sourcing(3600.0)
        now[0] += 3601.0
        assert slot.check_sourcing_complete() is True

    def test_sourcing_seconds_remaining_decreases(self):
        now = [1_000_000.0]
        slot = BenchSlot(clock=lambda: now[0])
        slot.intake_job("job-1", "Watch 1")
        slot.start_sourcing(3600.0)
        now[0] += 1800.0
        remaining = slot.sourcing_seconds_remaining()
        assert abs(remaining - 1800.0) < 1.0

    def test_sourcing_seconds_remaining_clamps_to_zero(self):
        now = [1_000_000.0]
        slot = BenchSlot(clock=lambda: now[0])
        slot.intake_job("job-1", "Watch 1")
        slot.start_sourcing(100.0)
        now[0] += 9999.0
        assert slot.sourcing_seconds_remaining() == 0.0

    def test_sourcing_seconds_remaining_none_when_not_sourcing(self):
        slot = BenchSlot()
        assert slot.sourcing_seconds_remaining() is None

    def test_check_sourcing_complete_false_when_not_sourcing(self):
        slot = BenchSlot()
        assert slot.check_sourcing_complete() is False


class TestBenchSlotConfirmArrival:
    def _sourcing_slot(self, elapsed=9999.0):
        now = [1_000_000.0]
        slot = BenchSlot(clock=lambda: now[0])
        slot.intake_job("job-1", "Watch 1", repair_steps=["step_a"])
        slot.start_sourcing(100.0)
        now[0] += elapsed
        return slot

    def test_confirm_arrival_transitions_to_repair(self):
        slot = self._sourcing_slot()
        slot.confirm_parts_arrived()
        assert slot.state == SLOT_STATE_REPAIR

    def test_confirm_arrival_before_timer_raises(self):
        slot = self._sourcing_slot(elapsed=0.0)
        with pytest.raises(ValueError, match="timer"):
            slot.confirm_parts_arrived()

    def test_confirm_arrival_from_non_sourcing_raises(self):
        slot = BenchSlot()
        with pytest.raises(ValueError):
            slot.confirm_parts_arrived()


class TestBenchSlotRepairAndDelivery:
    def _repair_slot(self, steps=None):
        now = [1_000_000.0]
        slot = BenchSlot(clock=lambda: now[0])
        slot.intake_job("job-1", "Watch 1", repair_steps=steps or ["s1", "s2"])
        slot.start_sourcing(100.0)
        now[0] += 9999.0
        slot.confirm_parts_arrived()
        return slot

    def test_complete_all_steps_advances_to_delivery(self):
        slot = self._repair_slot(["s1", "s2"])
        slot.complete_repair_step("s1")
        slot.complete_repair_step("s2")
        assert slot.state == SLOT_STATE_DELIVERY

    def test_partial_steps_stay_in_repair(self):
        slot = self._repair_slot(["s1", "s2", "s3"])
        slot.complete_repair_step("s1")
        assert slot.state == SLOT_STATE_REPAIR

    def test_duplicate_step_raises(self):
        slot = self._repair_slot(["s1", "s2"])
        slot.complete_repair_step("s1")
        with pytest.raises(ValueError, match="already completed"):
            slot.complete_repair_step("s1")

    def test_unknown_step_raises(self):
        slot = self._repair_slot(["s1"])
        with pytest.raises(ValueError, match="not part"):
            slot.complete_repair_step("unknown_step")

    def test_repair_step_from_wrong_state_raises(self):
        slot = BenchSlot()
        with pytest.raises(ValueError):
            slot.complete_repair_step("s1")

    def test_no_repair_steps_skips_to_delivery(self):
        """A job with no repair steps should go directly to DELIVERY on arrival."""
        now = [1_000_000.0]
        slot = BenchSlot(clock=lambda: now[0])
        slot.intake_job("job-1", "Watch 1", repair_steps=[])
        slot.start_sourcing(100.0)
        now[0] += 9999.0
        slot.confirm_parts_arrived()
        # No steps → already in delivery
        assert slot.state == SLOT_STATE_DELIVERY

    def test_confirm_delivery_resets_to_empty(self):
        slot = self._repair_slot(["s1"])
        slot.complete_repair_step("s1")
        slot.confirm_delivery()
        assert slot.state == SLOT_STATE_EMPTY
        assert slot.job_id is None
        assert slot.watch_label is None

    def test_confirm_delivery_from_wrong_state_raises(self):
        slot = BenchSlot()
        with pytest.raises(ValueError):
            slot.confirm_delivery()


class TestBenchSlotSnapshot:
    def test_snapshot_contains_schema_version(self):
        slot = BenchSlot()
        snap = slot.snapshot()
        assert snap["_schema_version"] == BENCH_SLOT_SCHEMA_VERSION

    def test_snapshot_contains_state(self):
        slot = BenchSlot()
        snap = slot.snapshot()
        assert snap["state"] == SLOT_STATE_EMPTY

    def test_snapshot_and_restore_preserves_state(self):
        slot = BenchSlot(slot_index=1)
        slot.intake_job("job-99", "Rolex Submariner", ["step_x"])
        snap = slot.snapshot()
        restored = BenchSlot.from_snapshot(snap)
        assert restored.state == SLOT_STATE_INTAKE
        assert restored.job_id == "job-99"
        assert restored.watch_label == "Rolex Submariner"
        assert restored.slot_index == 1

    def test_restore_sourcing_slot(self):
        now = [1_000_000.0]
        slot = BenchSlot(clock=lambda: now[0])
        slot.intake_job("j", "W")
        slot.start_sourcing(3600.0)
        snap = slot.snapshot()
        restored = BenchSlot.from_snapshot(snap, clock=lambda: now[0])
        assert restored.state == SLOT_STATE_SOURCING
        assert restored.sourcing_seconds_remaining() is not None

    def test_restore_from_empty_snapshot(self):
        """from_snapshot handles missing keys with safe defaults."""
        restored = BenchSlot.from_snapshot({})
        assert restored.state == SLOT_STATE_EMPTY
        assert restored.job_id is None
