"""
BenchSlotManager — bench slot allocations and milestone-gated unlocks.
======================================================================

Tracks the 1-4 bench slot allocations.

Unlock rules:
    Slot 1:  always available (single-job baseline)
    Slot 2:  unlocked by multi-job mastery milestone (≥5 completions, quality ≥70%)
    Slot 3:  unlocked by reputation tier 2 milestone
    Slot 4:  unlocked by reputation tier 3 milestone

The player makes all intake decisions; this manager only tracks capacity
and enforces the milestone gate.

Persisted under save_data["bench_slots"] (null-safe).

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

from typing import Optional


class BenchSlotManager:
    """
    Manages the 1-4 bench slot allocations and milestone-gated unlocks.

    Slot state representation:
        {"slot_id": int, "job_id": str | None, "unlocked": bool}
    """

    # Slot unlock rules keyed by slot_id
    _UNLOCK_TRIGGERS = {
        1: "always",
        2: "multi_job_mastery",      # 5+ completions with quality ≥70%
        3: "reputation_tier_2",
        4: "reputation_tier_3",
    }

    def __init__(self, saved_state: Optional[list] = None) -> None:
        """
        Null-safe constructor.  `saved_state` is the raw list from save_data["bench_slots"].
        None or missing key → initialise with slot 1 unlocked, slots 2-4 locked.
        """
        if saved_state and isinstance(saved_state, list) and len(saved_state) == 4:
            self._slots: list[dict] = [dict(s) for s in saved_state]
        else:
            self._slots = [
                {"slot_id": 1, "job_id": None, "unlocked": True},
                {"slot_id": 2, "job_id": None, "unlocked": False},
                {"slot_id": 3, "job_id": None, "unlocked": False},
                {"slot_id": 4, "job_id": None, "unlocked": False},
            ]

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_all_slots(self) -> list[dict]:
        """Return a snapshot of all slot states."""
        return [dict(s) for s in self._slots]

    def get_unlocked_slots(self) -> list[dict]:
        """Return only the unlocked slots."""
        return [dict(s) for s in self._slots if s["unlocked"]]

    def get_open_slots(self) -> list[dict]:
        """Return unlocked slots with no active job."""
        return [dict(s) for s in self._slots if s["unlocked"] and s["job_id"] is None]

    def get_active_job_slots(self) -> list[dict]:
        """Return unlocked slots that have an active job."""
        return [dict(s) for s in self._slots if s["unlocked"] and s["job_id"] is not None]

    def count_open_slots(self) -> int:
        return len(self.get_open_slots())

    def is_slot_available(self, slot_id: int) -> bool:
        """Return True if the slot is unlocked and has no active job."""
        slot = self._find(slot_id)
        return slot["unlocked"] and slot["job_id"] is None

    def get_unlock_trigger(self, slot_id: int) -> str:
        return self._UNLOCK_TRIGGERS.get(slot_id, "unknown")

    # ── Write ─────────────────────────────────────────────────────────────────

    def assign_job(self, slot_id: int, job_id: str) -> None:
        """Assign a job to the given bench slot."""
        slot = self._find(slot_id)
        if not slot["unlocked"]:
            raise ValueError(f"Bench slot {slot_id} is not yet unlocked")
        if slot["job_id"] is not None:
            raise ValueError(f"Bench slot {slot_id} is already occupied by job {slot['job_id']!r}")
        slot["job_id"] = job_id

    def release_slot(self, slot_id: int) -> None:
        """Release a bench slot when a job is completed."""
        slot = self._find(slot_id)
        if slot["job_id"] is None:
            raise ValueError(f"Bench slot {slot_id} has no active job to release")
        slot["job_id"] = None

    def unlock_slot(self, slot_id: int) -> bool:
        """
        Unlock the given bench slot.

        Returns True if the slot was newly unlocked, False if already unlocked.
        Raises ValueError if the slot was already unlocked.
        """
        slot = self._find(slot_id)
        if slot["unlocked"]:
            return False
        slot["unlocked"] = True
        return True

    def apply_mastery_milestone(self) -> bool:
        """
        Called when the player earns the multi-job mastery milestone.
        Unlocks slot 2 if not already unlocked.

        Returns True if slot 2 was newly unlocked.
        """
        return self.unlock_slot(2)

    def apply_reputation_milestone(self, tier: int) -> bool:
        """
        Called when the player reaches a reputation tier milestone.
        tier 2 → unlocks slot 3; tier 3 → unlocks slot 4.

        Returns True if a slot was newly unlocked.
        """
        slot_map = {2: 3, 3: 4}
        if tier not in slot_map:
            return False
        return self.unlock_slot(slot_map[tier])

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> list:
        """Serialise bench slots to a JSON-safe list for save_data["bench_slots"]."""
        return [dict(s) for s in self._slots]

    # ── Internal ──────────────────────────────────────────────────────────────

    def _find(self, slot_id: int) -> dict:
        for s in self._slots:
            if s["slot_id"] == slot_id:
                return s
        raise ValueError(f"Unknown bench slot: {slot_id}")
