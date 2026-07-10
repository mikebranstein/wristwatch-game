"""
BenchSlotManager – allocation and unlock gating for workshop bench slots.

Bench Slots
-----------
Slots 1 and 2 are unlocked by the multi-job mastery milestone:
  ≥ MASTERY_MILESTONE_COMPLETIONS restorations at quality ≥ MASTERY_QUALITY_THRESHOLD.

Slots 3 and 4 are unlocked by reputation tier milestones:
  Slot 3 unlocks at reputation tier ≥ SLOT_3_REPUTATION_TIER.
  Slot 4 unlocks at reputation tier ≥ SLOT_4_REPUTATION_TIER.

Hard cap: maximum 4 simultaneous jobs (no factory mechanics — cozy invariant).

Public API
----------
unlocked_slot_count(reputation_tier, mastery_milestone_met)
    Return how many bench slots are currently available.
allocate_slot(job_id, slot_number)
    Assign *job_id* to *slot_number*. Raises if slot is unavailable or occupied.
release_slot(slot_number)
    Free a bench slot when a job is completed or abandoned.
get_slot(slot_number)                  Job ID occupying *slot_number*, or None.
get_all_allocations()                  Dict of slot_number → job_id for occupied slots.
to_save_data()                         Serialise to dict for persistence.

Null-safe: constructing with None or missing 'bench_slots' key produces empty allocations.
"""

from __future__ import annotations

from typing import Optional


# ---------------------------------------------------------------------------
# Designer-configurable constants
# ---------------------------------------------------------------------------

MASTERY_MILESTONE_COMPLETIONS: int = 5     # restorations required for multi-job unlock
MASTERY_QUALITY_THRESHOLD: int = 70        # minimum quality rating counted toward milestone

MAX_BENCH_SLOTS: int = 4

# Reputation tier required to unlock slot 3 / slot 4
SLOT_3_REPUTATION_TIER: int = 2
SLOT_4_REPUTATION_TIER: int = 3


class BenchSlotManager:

    def __init__(self, saved_state: Optional[dict] = None) -> None:
        # Null-safe: handle pre-feature saves gracefully.
        if saved_state and isinstance(saved_state.get("bench_slots"), dict):
            raw = saved_state["bench_slots"]
            # Stored as {slot_number_str: job_id}
            self._allocations: dict[int, str] = {
                int(k): v for k, v in raw.items() if v is not None
            }
        else:
            self._allocations = {}

    # ── Read ──────────────────────────────────────────────────────────────────

    def unlocked_slot_count(
        self,
        *,
        reputation_tier: int,
        mastery_milestone_met: bool,
    ) -> int:
        """
        Return the number of bench slots available to the player.

        Slots 1–2 require the multi-job mastery milestone.
        Slot 3 requires reputation tier ≥ SLOT_3_REPUTATION_TIER.
        Slot 4 requires reputation tier ≥ SLOT_4_REPUTATION_TIER.
        """
        if not mastery_milestone_met:
            return 1  # single-bench mode; slot 1 only (legacy behaviour)

        count = 2  # mastery milestone unlocks slots 1 and 2
        if reputation_tier >= SLOT_3_REPUTATION_TIER:
            count = 3
        if reputation_tier >= SLOT_4_REPUTATION_TIER:
            count = 4
        return count

    def get_slot(self, slot_number: int) -> Optional[str]:
        """Return the job_id assigned to *slot_number*, or None if empty."""
        return self._allocations.get(slot_number)

    def get_all_allocations(self) -> dict[int, str]:
        """Return a copy of the current slot → job_id mapping."""
        return dict(self._allocations)

    def get_open_slots(
        self,
        *,
        reputation_tier: int,
        mastery_milestone_met: bool,
    ) -> list[int]:
        """Return a list of unlocked slot numbers that are currently unoccupied."""
        total = self.unlocked_slot_count(
            reputation_tier=reputation_tier,
            mastery_milestone_met=mastery_milestone_met,
        )
        return [s for s in range(1, total + 1) if s not in self._allocations]

    # ── Write ─────────────────────────────────────────────────────────────────

    def allocate_slot(self, job_id: str, slot_number: int) -> None:
        """
        Assign *job_id* to *slot_number*.

        Raises
        ------
        ValueError
            If *slot_number* is out of range (1–MAX_BENCH_SLOTS) or already occupied.
        """
        if not (1 <= slot_number <= MAX_BENCH_SLOTS):
            raise ValueError(
                f"slot_number must be between 1 and {MAX_BENCH_SLOTS}, got {slot_number}"
            )
        if slot_number in self._allocations:
            raise ValueError(
                f"Bench slot {slot_number} is already occupied by job "
                f"{self._allocations[slot_number]!r}."
            )
        self._allocations[slot_number] = job_id

    def release_slot(self, slot_number: int) -> None:
        """
        Free bench slot *slot_number*.

        Raises
        ------
        ValueError
            If the slot is not currently allocated.
        """
        if slot_number not in self._allocations:
            raise ValueError(f"Bench slot {slot_number} is not currently allocated.")
        del self._allocations[slot_number]

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> dict:
        """Serialise bench slot allocations to a JSON-safe dict."""
        return {"bench_slots": {str(k): v for k, v in self._allocations.items()}}
