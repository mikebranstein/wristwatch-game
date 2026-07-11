"""
Tests: BenchSlotManager — Issue #116
=====================================

Covers AC2 (second slot optional; first slot unaffected) and
AC3 (both slots operate independently).

AC2 — Given a player has the second bench slot available, when they choose
       not to use it, then the first bench slot continues to function exactly
       as before — no forced parallelism.

AC3 — Given a player activates the second bench slot, when both slots have
       active jobs, then each slot's part-sourcing timer, repair steps, and
       delivery confirmation operate independently without interference.

Run with:
    python -m pytest tests/ -v
"""

import pytest

from workshop.bench_slot import (
    SLOT_STATE_EMPTY,
    SLOT_STATE_INTAKE,
    SLOT_STATE_SOURCING,
    SLOT_STATE_REPAIR,
    SLOT_STATE_DELIVERY,
)
from workshop.bench_slot_manager import BenchSlotManager, MAX_SLOTS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_clock(start=1_000_000.0):
    """Return a mutable-reference clock for injection."""
    state = {"now": start}
    return state, lambda: state["now"]


# ---------------------------------------------------------------------------
# AC2 — First slot unaffected when second slot is available but unused
# ---------------------------------------------------------------------------

class TestAC2FirstSlotUnaffected:
    """
    AC2: Second slot is optional; first slot continues to function exactly
    as before when the second slot is not used.
    """

    def test_single_slot_manager_has_one_slot(self):
        mgr = BenchSlotManager(has_second_slot=False)
        assert mgr.slot_count == 1

    def test_second_slot_manager_has_two_slots(self):
        mgr = BenchSlotManager(has_second_slot=True)
        assert mgr.slot_count == 2

    def test_first_slot_intake_unaffected_by_second_slot_existence(self):
        """Slot 0 behaves identically whether or not slot 1 exists."""
        mgr_single = BenchSlotManager(has_second_slot=False)
        mgr_double = BenchSlotManager(has_second_slot=True)
        for mgr in (mgr_single, mgr_double):
            mgr.intake_job(0, "job-a", "Omega Seamaster")
            assert mgr.get_slot(0).state == SLOT_STATE_INTAKE

    def test_second_slot_ignored_first_slot_full_flow(self):
        """Player ignores second slot; first slot completes full lifecycle normally."""
        state, clock = make_clock()
        mgr = BenchSlotManager(has_second_slot=True, clock=clock)

        mgr.intake_job(0, "job-1", "Omega Seamaster", repair_steps=["step_a"])
        mgr.start_sourcing(0, 100.0)
        state["now"] += 9999.0
        mgr.confirm_parts_arrived(0)
        mgr.complete_repair_step(0, "step_a")
        mgr.confirm_delivery(0)

        # Slot 0 is back to EMPTY; slot 1 was never touched
        assert mgr.get_slot(0).state == SLOT_STATE_EMPTY
        assert mgr.get_slot(1).state == SLOT_STATE_EMPTY

    def test_requesting_unavailable_slot_raises(self):
        mgr = BenchSlotManager(has_second_slot=False)
        with pytest.raises(IndexError):
            mgr.get_slot(1)

    def test_second_slot_is_empty_before_activation(self):
        mgr = BenchSlotManager(has_second_slot=True)
        assert mgr.second_slot_is_empty() is True

    def test_second_slot_is_empty_returns_false_when_no_second_slot(self):
        mgr = BenchSlotManager(has_second_slot=False)
        assert mgr.second_slot_is_empty() is False

    def test_has_second_slot_property_reflects_constructor(self):
        assert BenchSlotManager(has_second_slot=True).has_second_slot is True
        assert BenchSlotManager(has_second_slot=False).has_second_slot is False


# ---------------------------------------------------------------------------
# AC3 — Both slots operate independently
# ---------------------------------------------------------------------------

class TestAC3SlotsOperateIndependently:
    """
    AC3: Part-sourcing timers, repair steps, and delivery confirmations
    operate independently per slot without interference.
    """

    def test_each_slot_has_independent_sourcing_timer(self):
        """Slot 0 timer elapsing does not affect Slot 1 timer."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        # Slot 0: 100-second sourcing
        mgr.intake_job(0, "job-0", "Watch 0")
        mgr.start_sourcing(0, 100.0)

        # Slot 1: 9999-second sourcing
        mgr.intake_job(1, "job-1", "Watch 1")
        mgr.start_sourcing(1, 9999.0)

        now[0] += 200.0  # Slot 0 timer elapsed; slot 1 still waiting

        assert mgr.check_sourcing_complete(0) is True
        assert mgr.check_sourcing_complete(1) is False

    def test_slot0_delivery_does_not_affect_slot1(self):
        """Slot 0 delivery resets only slot 0; slot 1 continues undisturbed."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        # Slot 0: full lifecycle
        mgr.intake_job(0, "job-0", "Watch 0", repair_steps=["s_a"])
        mgr.start_sourcing(0, 100.0)
        now[0] += 9999.0
        mgr.confirm_parts_arrived(0)
        mgr.complete_repair_step(0, "s_a")

        # Slot 1: still sourcing
        mgr.intake_job(1, "job-1", "Watch 1")
        mgr.start_sourcing(1, 99999.0)

        # Slot 0 delivers
        mgr.confirm_delivery(0)
        assert mgr.get_slot(0).state == SLOT_STATE_EMPTY
        assert mgr.get_slot(1).state == SLOT_STATE_SOURCING

    def test_slot1_delivery_does_not_affect_slot0(self):
        """Slot 1 delivery resets only slot 1; slot 0 continues undisturbed."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        mgr.intake_job(0, "job-0", "Watch 0")
        mgr.start_sourcing(0, 99999.0)  # Slot 0 still waiting

        mgr.intake_job(1, "job-1", "Watch 1", repair_steps=["r1"])
        mgr.start_sourcing(1, 100.0)
        now[0] += 9999.0
        mgr.confirm_parts_arrived(1)
        mgr.complete_repair_step(1, "r1")
        mgr.confirm_delivery(1)

        assert mgr.get_slot(1).state == SLOT_STATE_EMPTY
        assert mgr.get_slot(0).state == SLOT_STATE_SOURCING

    def test_both_slots_sourcing_simultaneously(self):
        """Both slots can be in SOURCING at the same time without interference."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        mgr.intake_job(0, "job-0", "Watch 0")
        mgr.start_sourcing(0, 3600.0)

        mgr.intake_job(1, "job-1", "Watch 1")
        mgr.start_sourcing(1, 7200.0)

        states = mgr.all_slot_states()
        assert states[0]["state"] == SLOT_STATE_SOURCING
        assert states[1]["state"] == SLOT_STATE_SOURCING

    def test_both_slots_sourcing_both_complete(self):
        """Both sourcing timers elapse independently; both can be confirmed."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        mgr.intake_job(0, "job-0", "Watch 0", repair_steps=["r0"])
        mgr.start_sourcing(0, 100.0)

        mgr.intake_job(1, "job-1", "Watch 1", repair_steps=["r1"])
        mgr.start_sourcing(1, 200.0)

        now[0] += 300.0  # Both elapsed

        mgr.confirm_parts_arrived(0)
        mgr.confirm_parts_arrived(1)

        assert mgr.get_slot(0).state == SLOT_STATE_REPAIR
        assert mgr.get_slot(1).state == SLOT_STATE_REPAIR

    def test_repair_steps_are_independent_per_slot(self):
        """Completing a step on slot 0 does not affect slot 1's step list."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        mgr.intake_job(0, "job-0", "Watch 0", repair_steps=["shared_step", "s0_only"])
        mgr.start_sourcing(0, 1.0)
        now[0] += 10.0
        mgr.confirm_parts_arrived(0)

        mgr.intake_job(1, "job-1", "Watch 1", repair_steps=["shared_step", "s1_only"])
        mgr.start_sourcing(1, 1.0)
        now[0] += 10.0  # Advance clock so slot 1 sourcing has elapsed
        mgr.confirm_parts_arrived(1)

        mgr.complete_repair_step(0, "shared_step")
        # Slot 1 still needs "shared_step"
        assert mgr.get_slot(1).state == SLOT_STATE_REPAIR

    def test_slot0_repair_independent_of_slot1_repair(self):
        """Each slot tracks its own completed steps."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        for idx, steps in enumerate([["a", "b"], ["x", "y"]]):
            mgr.intake_job(idx, f"job-{idx}", f"Watch {idx}", repair_steps=steps)
            mgr.start_sourcing(idx, 1.0)
        now[0] += 10.0
        for idx in range(2):
            mgr.confirm_parts_arrived(idx)

        mgr.complete_repair_step(0, "a")
        mgr.complete_repair_step(0, "b")  # Slot 0 → DELIVERY
        assert mgr.get_slot(0).state == SLOT_STATE_DELIVERY

        # Slot 1 unaffected
        assert mgr.get_slot(1).state == SLOT_STATE_REPAIR

    def test_simultaneous_delivery_both_slots(self):
        """Both slots can deliver simultaneously; both reset to EMPTY."""
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])

        for idx in range(2):
            mgr.intake_job(idx, f"job-{idx}", f"Watch {idx}", repair_steps=["step"])
            mgr.start_sourcing(idx, 1.0)
        now[0] += 10.0
        for idx in range(2):
            mgr.confirm_parts_arrived(idx)
            mgr.complete_repair_step(idx, "step")

        mgr.confirm_delivery(0)
        mgr.confirm_delivery(1)

        assert mgr.get_slot(0).state == SLOT_STATE_EMPTY
        assert mgr.get_slot(1).state == SLOT_STATE_EMPTY


# ---------------------------------------------------------------------------
# all_slot_states() / first_slot_in_sourcing()
# ---------------------------------------------------------------------------

class TestBenchSlotManagerHelpers:
    def test_all_slot_states_returns_one_entry_for_single_slot(self):
        mgr = BenchSlotManager(has_second_slot=False)
        states = mgr.all_slot_states()
        assert len(states) == 1

    def test_all_slot_states_returns_two_entries_for_double_slot(self):
        mgr = BenchSlotManager(has_second_slot=True)
        states = mgr.all_slot_states()
        assert len(states) == 2

    def test_first_slot_in_sourcing_true(self):
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=False, clock=lambda: now[0])
        mgr.intake_job(0, "j", "W")
        mgr.start_sourcing(0, 9999.0)
        assert mgr.first_slot_in_sourcing() is True

    def test_first_slot_in_sourcing_false(self):
        mgr = BenchSlotManager(has_second_slot=False)
        assert mgr.first_slot_in_sourcing() is False


# ---------------------------------------------------------------------------
# Snapshot / restore
# ---------------------------------------------------------------------------

class TestBenchSlotManagerSnapshot:
    def test_snapshot_round_trip(self):
        now = [1_000_000.0]
        mgr = BenchSlotManager(has_second_slot=True, clock=lambda: now[0])
        mgr.intake_job(0, "job-0", "Watch 0")
        mgr.start_sourcing(0, 7200.0)
        snap = mgr.snapshot()
        restored = BenchSlotManager.from_snapshot(snap, clock=lambda: now[0])
        assert restored.has_second_slot is True
        assert restored.get_slot(0).state == SLOT_STATE_SOURCING

    def test_restore_single_slot_snapshot(self):
        """Restoring a single-slot (legacy) snapshot works."""
        mgr_single = BenchSlotManager(has_second_slot=False)
        snap = mgr_single.snapshot()
        restored = BenchSlotManager.from_snapshot(snap)
        assert restored.has_second_slot is False
        assert restored.slot_count == 1

    def test_restore_empty_snapshot_has_primary_slot(self):
        restored = BenchSlotManager.from_snapshot({})
        assert restored.slot_count >= 1
        assert restored.get_slot(0).state == SLOT_STATE_EMPTY
