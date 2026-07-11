"""
BenchSlot — independent per-slot state machine for watch restoration jobs.
==========================================================================

Issue #116: Two-Bench Workshop Probe — Second Parallel Bench Slot (Phase 1 A/B)

Each BenchSlot owns its complete lifecycle:
    EMPTY → INTAKE → SOURCING → REPAIR → DELIVERY → EMPTY

Design constraints (from approved design decision):
    - Slots share NO mutable state — each slot's timer, repair steps, and
      delivery confirmation operate as a completely independent object.
    - Versioned snapshot/restore supports save-state migration.
    - Designed so that a BenchSlotManager can hold an array of 1 or 2 slots
      without any shared coupling between them.

States
------
EMPTY       No job currently assigned; slot is available for intake.
INTAKE      A job has been accepted but sourcing has not started.
SOURCING    Parts are being sourced; a countdown timer is running.
REPAIR      Parts arrived; repair steps are in progress.
DELIVERY    All repair steps complete; awaiting delivery confirmation.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# State constants
# ---------------------------------------------------------------------------

SLOT_STATE_EMPTY    = "empty"
SLOT_STATE_INTAKE   = "intake"
SLOT_STATE_SOURCING = "sourcing"
SLOT_STATE_REPAIR   = "repair"
SLOT_STATE_DELIVERY = "delivery"

SLOT_STATES_ALL = (
    SLOT_STATE_EMPTY,
    SLOT_STATE_INTAKE,
    SLOT_STATE_SOURCING,
    SLOT_STATE_REPAIR,
    SLOT_STATE_DELIVERY,
)

# Save-state schema version — bump when the snapshot schema changes.
BENCH_SLOT_SCHEMA_VERSION = 1


class BenchSlot:
    """
    Independent state machine for a single bench slot.

    Parameters
    ----------
    slot_index : int
        0-based index (0 = first/primary slot, 1 = second slot).
    clock : callable, optional
        Zero-arg callable returning a float Unix timestamp.  Defaults to
        ``time.time``.  Injectable for deterministic testing.
    """

    def __init__(self, slot_index: int = 0, clock=None):
        self._slot_index = slot_index
        self._clock = clock if clock is not None else time.time

        # Core state
        self._state: str = SLOT_STATE_EMPTY
        self._job_id: Optional[str] = None
        self._watch_label: Optional[str] = None

        # Sourcing timer
        self._sourcing_started_at: Optional[float] = None
        self._sourcing_duration_seconds: Optional[float] = None

        # Repair steps
        self._repair_steps: List[str] = []
        self._completed_repair_steps: List[str] = []

    # -----------------------------------------------------------------------
    # Public properties
    # -----------------------------------------------------------------------

    @property
    def state(self) -> str:
        return self._state

    @property
    def slot_index(self) -> int:
        return self._slot_index

    @property
    def job_id(self) -> Optional[str]:
        return self._job_id

    @property
    def watch_label(self) -> Optional[str]:
        return self._watch_label

    @property
    def is_empty(self) -> bool:
        return self._state == SLOT_STATE_EMPTY

    @property
    def is_sourcing(self) -> bool:
        return self._state == SLOT_STATE_SOURCING

    # -----------------------------------------------------------------------
    # State transitions
    # -----------------------------------------------------------------------

    def intake_job(self, job_id: str, watch_label: str, repair_steps: Optional[List[str]] = None) -> None:
        """
        Accept a new watch job into this slot.

        Transitions: EMPTY → INTAKE.

        Parameters
        ----------
        job_id : str
        watch_label : str
        repair_steps : list[str], optional
            Ordered list of repair step IDs for this job.
        """
        if self._state != SLOT_STATE_EMPTY:
            raise ValueError(
                f"BenchSlot[{self._slot_index}]: cannot intake a job in state '{self._state}'; "
                "slot must be EMPTY."
            )
        self._job_id = job_id
        self._watch_label = watch_label
        self._repair_steps = list(repair_steps or [])
        self._completed_repair_steps = []
        self._state = SLOT_STATE_INTAKE

    def start_sourcing(self, duration_seconds: float) -> None:
        """
        Begin part-sourcing for the current job.

        Transitions: INTAKE → SOURCING.

        Parameters
        ----------
        duration_seconds : float
            How long (in seconds) until parts arrive.  Must be positive.
        """
        if self._state != SLOT_STATE_INTAKE:
            raise ValueError(
                f"BenchSlot[{self._slot_index}]: cannot start sourcing in state '{self._state}'; "
                "slot must be in INTAKE state."
            )
        if duration_seconds <= 0:
            raise ValueError("duration_seconds must be positive.")
        self._sourcing_started_at = self._clock()
        self._sourcing_duration_seconds = duration_seconds
        self._state = SLOT_STATE_SOURCING

    def check_sourcing_complete(self) -> bool:
        """
        Returns True if the sourcing timer has elapsed; False otherwise.
        Does NOT transition state — call ``confirm_parts_arrived()`` to advance.
        """
        if self._state != SLOT_STATE_SOURCING:
            return False
        elapsed = self._clock() - self._sourcing_started_at
        return elapsed >= self._sourcing_duration_seconds

    def confirm_parts_arrived(self) -> None:
        """
        Advance from SOURCING to REPAIR once parts have arrived.

        Transitions: SOURCING → REPAIR.

        Raises ValueError if sourcing is not yet complete or slot is not in SOURCING.
        """
        if self._state != SLOT_STATE_SOURCING:
            raise ValueError(
                f"BenchSlot[{self._slot_index}]: cannot confirm parts in state '{self._state}'."
            )
        if not self.check_sourcing_complete():
            raise ValueError(
                f"BenchSlot[{self._slot_index}]: sourcing timer has not elapsed."
            )
        self._sourcing_started_at = None
        self._sourcing_duration_seconds = None
        # If there are no repair steps, advance directly to DELIVERY.
        if self._repair_steps:
            self._state = SLOT_STATE_REPAIR
        else:
            self._state = SLOT_STATE_DELIVERY

    def complete_repair_step(self, step_id: str) -> None:
        """
        Mark a repair step as complete.

        If all steps are done, automatically advances to DELIVERY.
        Slot must be in REPAIR state.

        Parameters
        ----------
        step_id : str
            The step to mark complete.  Must be in the step list and not already done.
        """
        if self._state != SLOT_STATE_REPAIR:
            raise ValueError(
                f"BenchSlot[{self._slot_index}]: cannot complete a repair step in state '{self._state}'."
            )
        if step_id not in self._repair_steps:
            raise ValueError(f"Step '{step_id}' is not part of this job's repair path.")
        if step_id in self._completed_repair_steps:
            raise ValueError(f"Step '{step_id}' was already completed.")
        self._completed_repair_steps.append(step_id)
        if set(self._completed_repair_steps) >= set(self._repair_steps):
            self._state = SLOT_STATE_DELIVERY

    def confirm_delivery(self) -> None:
        """
        Confirm delivery; reset slot to EMPTY for the next job.

        Transitions: DELIVERY → EMPTY.
        """
        if self._state != SLOT_STATE_DELIVERY:
            raise ValueError(
                f"BenchSlot[{self._slot_index}]: cannot confirm delivery in state '{self._state}'."
            )
        self._reset()

    # -----------------------------------------------------------------------
    # Remaining time helper
    # -----------------------------------------------------------------------

    def sourcing_seconds_remaining(self) -> Optional[float]:
        """
        Returns the number of seconds remaining in sourcing, or None if not sourcing.
        Never returns negative — clamps to 0.0.
        """
        if self._state != SLOT_STATE_SOURCING:
            return None
        elapsed = self._clock() - self._sourcing_started_at
        return max(0.0, self._sourcing_duration_seconds - elapsed)

    # -----------------------------------------------------------------------
    # Snapshot / restore (save-state support)
    # -----------------------------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        """Return a serialisable snapshot of this slot's state."""
        return {
            "_schema_version": BENCH_SLOT_SCHEMA_VERSION,
            "slot_index": self._slot_index,
            "state": self._state,
            "job_id": self._job_id,
            "watch_label": self._watch_label,
            "sourcing_started_at": self._sourcing_started_at,
            "sourcing_duration_seconds": self._sourcing_duration_seconds,
            "repair_steps": list(self._repair_steps),
            "completed_repair_steps": list(self._completed_repair_steps),
        }

    @classmethod
    def from_snapshot(cls, data: Dict[str, Any], clock=None) -> "BenchSlot":
        """
        Restore a BenchSlot from a saved snapshot.

        Supports schema_version 1.  Handles missing keys gracefully
        (backward-compatible with saves that pre-date individual fields).
        """
        slot = cls(slot_index=data.get("slot_index", 0), clock=clock)
        slot._state = data.get("state", SLOT_STATE_EMPTY)
        slot._job_id = data.get("job_id")
        slot._watch_label = data.get("watch_label")
        slot._sourcing_started_at = data.get("sourcing_started_at")
        slot._sourcing_duration_seconds = data.get("sourcing_duration_seconds")
        slot._repair_steps = list(data.get("repair_steps") or [])
        slot._completed_repair_steps = list(data.get("completed_repair_steps") or [])
        return slot

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _reset(self) -> None:
        self._state = SLOT_STATE_EMPTY
        self._job_id = None
        self._watch_label = None
        self._sourcing_started_at = None
        self._sourcing_duration_seconds = None
        self._repair_steps = []
        self._completed_repair_steps = []
