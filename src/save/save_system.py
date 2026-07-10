"""
SaveSystem – session boundary event and order queue persistence
==============================================================

load_session(raw_save_data)
    - Deserialises the save file (null-safe for pre-feature saves with no order queue node).
    - Fires resolve_arrivals() so order states are current for this session.
    - Returns (order_queue, arrived_orders, updated_save_data).
    - Issue #119 (Phase 2): also deserialises workshop_jobs, intake_queue, clients,
      reputation, and bench_slots using the same null-safe additive pattern.

save_session(order_queue, existing_save_data)
    - Writes the latest order queue state into the save-data dict.
    - Returns the updated save-data dict ready for JSON serialisation to disk.

autosave_checkpoint(stage, game_state, save_path)
    - Atomically writes an autosave checkpoint for the given restoration stage.
    - Uses tempfile + os.replace() for atomic semantics (Issue #82 — AC1, AC5).
    - Calls on_success / on_error callbacks when provided.
    - Returns the updated save-data dict.

save_async(game_state, save_path, on_success, on_error)
    - Non-blocking async write that fires a background thread (Issue #82 — AC1 non-blocking).
    - Calls on_success() on completion or on_error(exc) on failure without blocking the
      game loop.

Atomic-write semantics:
    Orders should be persisted at placement time (call save_session() immediately after
    place_order()) to guarantee in-flight order survival across abnormal exits (Scenario 8).
    autosave_checkpoint() also uses atomic write: data is written to a .tmp file first,
    then renamed over the target path so no partial/corrupt writes are ever visible.

Stage constants (CHECKPOINT_STAGES):
    TEARDOWN   = 'teardown'
    CLEANING   = 'cleaning'
    SOURCING   = 'sourcing'
    REASSEMBLY = 'reassembly'
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from typing import Callable, Optional

from src.orders.order_queue import OrderQueue
from src.orders.order import Order

# Issue #119 (Phase 2) — Workshop Queue Meta-Game: new null-safe subsystem imports
from src.queue.workshop_job import WorkshopJob
from src.queue.intake_queue_manager import IntakeQueueManager
from src.clients.client_registry import ClientRegistry
from src.reputation.reputation_system import ReputationSystem
from src.bench.bench_slot_manager import BenchSlotManager

# ---------------------------------------------------------------------------
# Stage constants
# ---------------------------------------------------------------------------

class CHECKPOINT_STAGES:
    """Named restoration stages at which autosave checkpoints are written."""
    TEARDOWN   = "teardown"
    CLEANING   = "cleaning"
    SOURCING   = "sourcing"
    REASSEMBLY = "reassembly"

    ALL = (TEARDOWN, CLEANING, SOURCING, REASSEMBLY)


class SaveSystem:

    def load_session(self, raw_save_data: Optional[dict]) -> tuple[OrderQueue, list[Order], dict]:
        """
        Load session: deserialise order queue and resolve session-start arrivals.

        Parameters
        ----------
        raw_save_data : dict or None
            Full save-file object.  May be None for first-run / new saves, or a dict
            lacking an 'order_queue' key for pre-feature saves — both handled gracefully.

        Returns
        -------
        (order_queue, arrived_orders, updated_save_data)
        """
        raw = raw_save_data or {}

        # -- Legacy order queue (unchanged) --
        queue_data = raw.get("order_queue", None)
        order_queue = OrderQueue(queue_data)

        # Session-boundary event: resolve In-Transit orders that are now due.
        arrived_orders = order_queue.resolve_arrivals()

        # Issue #127: ensure completed_watches always exists (null-safe default for
        # pre-feature saves that lack the key).
        completed_watches = raw.get("completed_watches", [])

        # -- Issue #119: Workshop Queue Meta-Game subsystems (null-safe) --
        workshop_jobs_data = raw.get("workshop_jobs", None)
        active_jobs = (
            [WorkshopJob.from_dict(j) for j in workshop_jobs_data]
            if isinstance(workshop_jobs_data, list)
            else []
        )

        intake_manager = IntakeQueueManager(raw.get("intake_queue", None))
        client_registry = ClientRegistry(raw.get("clients", None))
        reputation = ReputationSystem(raw.get("reputation", None))
        bench_manager = BenchSlotManager(raw.get("bench_slots", None))
        queue_feature_flag = bool(raw.get("queue_feature_flag", False))

        # Write resolved state back so callers get a consistent snapshot.
        updated_save_data = {
            **raw,
            "order_queue": order_queue.to_save_data(),
            "completed_watches": completed_watches if isinstance(completed_watches, list) else [],
            # Issue #119: persist deserialised workshop state back immediately
            "workshop_jobs": [j.to_dict() for j in active_jobs],
            "intake_queue": intake_manager.to_save_data(),
            "clients": client_registry.to_save_data(),
            "reputation": reputation.to_save_data(),
            "bench_slots": bench_manager.to_save_data(),
            "queue_feature_flag": queue_feature_flag,
        }

        return order_queue, arrived_orders, updated_save_data

    def load_workshop_session(self, raw_save_data) -> dict:
        """
        Issue #119: Load the full workshop queue subsystem state from save data.

        Returns a dict with fully-deserialised subsystem objects:
            order_queue, arrived_orders, active_jobs, intake_manager,
            client_registry, reputation, bench_manager, queue_feature_flag,
            updated_save_data

        All keys are null-safe: pre-feature saves produce empty/default state.
        """
        raw = raw_save_data or {}

        queue_data = raw.get("order_queue", None)
        order_queue = OrderQueue(queue_data)
        arrived_orders = order_queue.resolve_arrivals()

        workshop_jobs_data = raw.get("workshop_jobs", None)
        active_jobs = (
            [WorkshopJob.from_dict(j) for j in workshop_jobs_data]
            if isinstance(workshop_jobs_data, list)
            else []
        )

        intake_manager = IntakeQueueManager(raw.get("intake_queue", None))
        client_registry = ClientRegistry(raw.get("clients", None))
        reputation = ReputationSystem(raw.get("reputation", None))
        bench_manager = BenchSlotManager(raw.get("bench_slots", None))
        queue_feature_flag = bool(raw.get("queue_feature_flag", False))

        updated_save_data = {
            **raw,
            "order_queue": order_queue.to_save_data(),
            "workshop_jobs": [j.to_dict() for j in active_jobs],
            "intake_queue": intake_manager.to_save_data(),
            "clients": client_registry.to_save_data(),
            "reputation": reputation.to_save_data(),
            "bench_slots": bench_manager.to_save_data(),
            "queue_feature_flag": queue_feature_flag,
        }

        return {
            "order_queue": order_queue,
            "arrived_orders": arrived_orders,
            "active_jobs": active_jobs,
            "intake_manager": intake_manager,
            "client_registry": client_registry,
            "reputation": reputation,
            "bench_manager": bench_manager,
            "queue_feature_flag": queue_feature_flag,
            "updated_save_data": updated_save_data,
        }

    def save_session(self, order_queue: OrderQueue, existing_save_data: Optional[dict]) -> dict:
        """
        Persist order queue state into save data.

        Returns the updated save-data dict (does not write to disk — caller handles I/O).
        """
        return {
            **(existing_save_data or {}),
            "order_queue": order_queue.to_save_data(),
        }

    # -----------------------------------------------------------------------
    # Autosave checkpoint (Issue #82 — AC1, AC5)
    # -----------------------------------------------------------------------

    def autosave_checkpoint(
        self,
        stage: str,
        game_state: dict,
        save_path: Optional[str] = None,
        on_success: Optional[Callable[[], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
    ) -> dict:
        """
        Write an autosave checkpoint for *stage* (AC1).

        Stamps ``last_checkpoint_stage`` and ``autosave_slot`` into the save data,
        then atomically writes the JSON to *save_path* (if provided) using
        tempfile + os.replace() so that no partial write is ever visible on disk
        (AC5 — progress survives force-quit after autosave notification).

        Parameters
        ----------
        stage : str
            One of CHECKPOINT_STAGES.ALL.
        game_state : dict
            Current full game-state dict to persist.
        save_path : str | None
            Filesystem path for the autosave slot file.  When None, the updated
            dict is returned without touching disk (useful in tests).
        on_success : callable | None
            Zero-arg callback invoked after a successful write.
        on_error : callable | None
            Single-arg callback ``(exc: Exception) -> None`` invoked on write failure.

        Returns
        -------
        dict
            Updated game-state dict with checkpoint metadata stamped in.

        Raises
        ------
        ValueError
            When *stage* is not a recognised CHECKPOINT_STAGES value.
        """
        if stage not in CHECKPOINT_STAGES.ALL:
            raise ValueError(
                f"Unknown checkpoint stage '{stage}'. "
                f"Expected one of: {CHECKPOINT_STAGES.ALL}"
            )

        checkpoint_data = {
            **game_state,
            "last_checkpoint_stage": stage,
            "autosave_slot": True,
        }

        if save_path is not None:
            try:
                self._atomic_write(save_path, checkpoint_data)
                if on_success is not None:
                    on_success()
            except Exception as exc:
                if on_error is not None:
                    on_error(exc)
                else:
                    raise

        return checkpoint_data

    # -----------------------------------------------------------------------
    # Async (non-blocking) save (Issue #82 — AC1 non-blocking constraint)
    # -----------------------------------------------------------------------

    def save_async(
        self,
        game_state: dict,
        save_path: str,
        on_success: Optional[Callable[[], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
    ) -> None:
        """
        Write *game_state* to *save_path* on a background thread (non-blocking).

        The game loop is never paused.  ``on_success`` fires on the background
        thread when the write completes; ``on_error(exc)`` fires on failure.

        Parameters
        ----------
        game_state : dict
        save_path : str
        on_success : callable | None
        on_error : callable | None
        """
        def _write() -> None:
            try:
                self._atomic_write(save_path, game_state)
                if on_success is not None:
                    on_success()
            except Exception as exc:
                if on_error is not None:
                    on_error(exc)

        thread = threading.Thread(target=_write, daemon=True)
        thread.start()

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _atomic_write(path: str, data: dict) -> None:
        """
        Atomically write *data* as JSON to *path*.

        Writes to a sibling ``.tmp`` file first, then calls ``os.replace()``
        (POSIX-atomic on NTFS same-volume moves) so the target path either
        contains the full new content or the old content — never a partial write.
        """
        dir_name = os.path.dirname(os.path.abspath(path))
        os.makedirs(dir_name, exist_ok=True)

        fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
            os.replace(tmp_path, path)
        except Exception:
            # Best-effort cleanup of orphaned .tmp file on failure.
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
