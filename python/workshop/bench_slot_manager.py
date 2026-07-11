"""
BenchSlotManager — manages the array of bench slots for a player's workshop.
=============================================================================

Issue #116: Two-Bench Workshop Probe — Second Parallel Bench Slot (Phase 1 A/B)

Design summary (from approved design decision):
    Each slot is an independent BenchSlot object sharing NO mutable state.
    BenchSlotManager owns the array and provides the single entry point for
    all slot operations so callers never need to address individual slots directly.

Responsibilities
----------------
- Holds up to MAX_SLOTS (2) BenchSlot instances.
- Exposes only the slots the player is allowed to use:
    · Slot 0 (primary) is always present.
    · Slot 1 (second) is present only when ``has_second_slot=True``.
- Provides intake, sourcing, repair, and delivery operations per slot.
- Supports save/load via snapshot() / from_snapshot().
- Does NOT contain A/B cohort logic — that lives in ABCohortManager.
- Does NOT contain unlock gate logic — that lives in SecondBenchUnlock.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from workshop.bench_slot import BenchSlot, SLOT_STATE_EMPTY

MAX_SLOTS = 2

# Save-state schema version for BenchSlotManager snapshots.
BENCH_SLOT_MANAGER_SCHEMA_VERSION = 1


class BenchSlotManager:
    """
    Manages a player's active bench slots.

    Parameters
    ----------
    has_second_slot : bool
        When True the manager exposes two slots; when False, only slot 0.
    clock : callable, optional
        Injectable clock for deterministic testing (passed to each BenchSlot).
    """

    def __init__(self, has_second_slot: bool = False, clock=None):
        self._clock = clock
        self._has_second_slot = has_second_slot
        self._slots: List[BenchSlot] = [BenchSlot(slot_index=0, clock=clock)]
        if has_second_slot:
            self._slots.append(BenchSlot(slot_index=1, clock=clock))

    # -----------------------------------------------------------------------
    # Properties
    # -----------------------------------------------------------------------

    @property
    def has_second_slot(self) -> bool:
        """True when the second slot is available for this player."""
        return self._has_second_slot

    @property
    def slot_count(self) -> int:
        """Number of slots currently available (1 or 2)."""
        return len(self._slots)

    def get_slot(self, index: int) -> BenchSlot:
        """
        Return the BenchSlot at *index*.

        Raises IndexError if the index is out of range for this player's
        available slots (e.g. requesting slot 1 when second slot is not unlocked).
        """
        if index < 0 or index >= len(self._slots):
            raise IndexError(
                f"Slot index {index} is out of range; this player has {len(self._slots)} slot(s)."
            )
        return self._slots[index]

    # -----------------------------------------------------------------------
    # Slot operations (delegating to the appropriate BenchSlot)
    # -----------------------------------------------------------------------

    def intake_job(self, slot_index: int, job_id: str, watch_label: str,
                   repair_steps: Optional[List[str]] = None) -> None:
        """Accept a new watch job into the given slot (EMPTY → INTAKE)."""
        self.get_slot(slot_index).intake_job(job_id, watch_label, repair_steps)

    def start_sourcing(self, slot_index: int, duration_seconds: float) -> None:
        """Begin part sourcing for the slot (INTAKE → SOURCING)."""
        self.get_slot(slot_index).start_sourcing(duration_seconds)

    def check_sourcing_complete(self, slot_index: int) -> bool:
        """Return True if the slot's sourcing timer has elapsed."""
        return self.get_slot(slot_index).check_sourcing_complete()

    def confirm_parts_arrived(self, slot_index: int) -> None:
        """Advance the slot from SOURCING to REPAIR once parts arrive."""
        self.get_slot(slot_index).confirm_parts_arrived()

    def complete_repair_step(self, slot_index: int, step_id: str) -> None:
        """Mark a repair step as complete on the given slot."""
        self.get_slot(slot_index).complete_repair_step(step_id)

    def confirm_delivery(self, slot_index: int) -> None:
        """Confirm delivery and reset the slot to EMPTY."""
        self.get_slot(slot_index).confirm_delivery()

    # -----------------------------------------------------------------------
    # Convenience queries
    # -----------------------------------------------------------------------

    def all_slot_states(self) -> List[Dict[str, Any]]:
        """
        Return a list of lightweight state summaries for all available slots.
        Useful for UI render decisions.
        """
        return [
            {
                "slot_index": s.slot_index,
                "state": s.state,
                "job_id": s.job_id,
                "watch_label": s.watch_label,
                "sourcing_seconds_remaining": s.sourcing_seconds_remaining(),
            }
            for s in self._slots
        ]

    def first_slot_in_sourcing(self) -> bool:
        """True when slot 0 is currently in SOURCING state."""
        return self._slots[0].is_sourcing

    def second_slot_is_empty(self) -> bool:
        """
        True when the second slot exists and is EMPTY (player has not yet
        activated it for a job).  Always False when second slot is not available.
        """
        if not self._has_second_slot:
            return False
        return self._slots[1].is_empty

    # -----------------------------------------------------------------------
    # Snapshot / restore
    # -----------------------------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        """Return a serialisable snapshot of the full manager state."""
        return {
            "_schema_version": BENCH_SLOT_MANAGER_SCHEMA_VERSION,
            "has_second_slot": self._has_second_slot,
            "slots": [s.snapshot() for s in self._slots],
        }

    @classmethod
    def from_snapshot(cls, data: Dict[str, Any], clock=None) -> "BenchSlotManager":
        """
        Restore a BenchSlotManager from a saved snapshot.

        Handles old single-slot saves gracefully: if the saved snapshot only
        has one slot entry, the manager is restored with has_second_slot=False
        regardless of the flag in the snapshot.
        """
        has_second = data.get("has_second_slot", False)
        manager = cls.__new__(cls)
        manager._clock = clock
        manager._has_second_slot = has_second
        manager._slots = [
            BenchSlot.from_snapshot(slot_data, clock=clock)
            for slot_data in data.get("slots", [{}])
        ]
        # Guard: if slots list is empty, ensure at least the primary slot exists.
        if not manager._slots:
            manager._slots = [BenchSlot(slot_index=0, clock=clock)]
            manager._has_second_slot = False
        return manager
