"""
SaveSystem – session boundary event and order queue persistence
==============================================================

load_session(raw_save_data)
    - Deserialises the save file (null-safe for pre-feature saves with no order queue node).
    - Fires resolve_arrivals() so order states are current for this session.
    - Returns (queue_data, arrived_orders, updated_save_data) as raw dicts.
      Callers construct OrderQueue(queue_data) locally when domain behaviour is needed.

save_session(order_queue_data, existing_save_data)
    - Writes the latest order queue state into the save-data dict.
    - Callers pass order_queue.to_save_data() as the first argument.
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
import time
from typing import Callable, Optional

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

    def load_session(self, raw_save_data: Optional[dict]) -> tuple[dict, list[dict], dict]:
        """
        Load session: deserialise order queue and resolve session-start arrivals.

        Parameters
        ----------
        raw_save_data : dict or None
            Full save-file object.  May be None for first-run / new saves, or a dict
            lacking an 'order_queue' key for pre-feature saves — both handled gracefully.

        Returns
        -------
        (queue_data, arrived_orders, updated_save_data)
            queue_data       : raw dict (pass to OrderQueue(queue_data) to get a domain object)
            arrived_orders   : list of raw order dicts that transitioned to Arrived this session
            updated_save_data: full save-data dict with resolved queue state written back
        """
        queue_data = (raw_save_data or {}).get("order_queue", None)

        # Session-boundary event: resolve In-Transit orders that are now due.
        # Pure-dict helper — no orders import required.
        resolved_queue_dict, arrived_orders = SaveSystem._resolve_arrivals(queue_data)

        # Write resolved state back so callers get a consistent snapshot.
        # Issue #127: ensure completed_watches always exists (null-safe default for
        # pre-feature saves that lack the key).
        completed_watches = (raw_save_data or {}).get("completed_watches", [])
        updated_save_data = {
            **(raw_save_data or {}),
            "order_queue": resolved_queue_dict,
            "completed_watches": completed_watches if isinstance(completed_watches, list) else [],
        }

        # Issue #127: Workshop Collection Gallery — additive backward-compat field
        if updated_save_data.get("completed_watches") is None:
            updated_save_data["completed_watches"] = []

        # Issue #145: Workshop Economy MVP — null-safe defaults for all new ledger fields.
        # Pre-feature saves lacking these keys receive safe zero/false/empty defaults,
        # mirroring the completed_watches guard pattern established in Issue #127.
        if updated_save_data.get("ledger_income_total") is None:
            updated_save_data["ledger_income_total"] = 0
        if updated_save_data.get("ledger_parts_cost_total") is None:
            updated_save_data["ledger_parts_cost_total"] = 0
        if updated_save_data.get("ledger_balance") is None:
            updated_save_data["ledger_balance"] = 0
        if not isinstance(updated_save_data.get("workshop_upgrades"), list):
            updated_save_data["workshop_upgrades"] = []
        if updated_save_data.get("cozy_mode_enabled") is None:
            updated_save_data["cozy_mode_enabled"] = False

        # Issue #151: Workshop Economy Expanded — null-safe defaults for new save keys.
        # Pre-feature saves that lack these keys get None, which each sub-system
        # interprets as "use defaults" in their from_save_dict() factory methods.
        for key in ("reputation", "upgrade_tree", "economy_analytics", "sourcing_history"):
            if key not in updated_save_data:
                updated_save_data[key] = None

        # Issue #253: Holistic Craftsmanship Score Phase 1 — null-safe defaults.
        # Pre-feature saves that lack these keys receive safe defaults, mirroring
        # the guard pattern established by Issues #127 and #145.
        if not isinstance(updated_save_data.get('craftsmanship_dimensions_unlocked'), list):
            updated_save_data['craftsmanship_dimensions_unlocked'] = ['cosmetic', 'mechanical']
        if 'craftsmanship_personal_best' not in updated_save_data:
            updated_save_data['craftsmanship_personal_best'] = None

        return resolved_queue_dict, arrived_orders, updated_save_data

    def save_session(self, order_queue_data: dict, existing_save_data: Optional[dict]) -> dict:
        """
        Persist order queue state into save data.

        Parameters
        ----------
        order_queue_data : dict
            Serialised queue state — callers pass order_queue.to_save_data().
        existing_save_data : dict or None
            Existing save-data dict to merge into.

        Returns the updated save-data dict (does not write to disk — caller handles I/O).
        """
        return {
            **(existing_save_data or {}),
            "order_queue": order_queue_data,
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
    def _resolve_arrivals(queue_dict: Optional[dict]) -> tuple[dict, list[dict]]:
        """
        Pure-dict session-boundary arrival resolution.

        Replicates the behaviour of ``OrderQueue(queue_dict).resolve_arrivals()``
        without importing any domain objects from ``orders``, keeping
        ``save/`` dependency-layer compliant (may import from ``config`` only).

        Algorithm (mirrors ``OrderQueue.resolve_arrivals()``):
          1. Increment ``session_boundary_count`` by 1.
          2. Clear all ``arrived_this_session`` flags from the previous session.
          3. For every order whose ``status`` is ``"In-Transit"`` and whose
             ``estimated_arrival_session`` is ≤ the new counter, transition it to
             ``"Arrived"``, stamp ``arrived_at`` with the current epoch time, and
             set ``arrived_this_session = True``.

        .. note::
            The string literals ``"In-Transit"`` and ``"Arrived"`` used here
            correspond to ``OrderStatus.IN_TRANSIT`` and ``OrderStatus.ARRIVED``
            in ``src/orders/order_status.py``.  If those enum values are ever
            renamed, update the literals here to match — otherwise arrivals will
            silently stop being resolved.

        Parameters
        ----------
        queue_dict : dict or None
            Raw ``order_queue`` dict with keys ``session_boundary_count`` (int)
            and ``orders`` (list[dict]).  May be ``None`` for pre-feature saves;
            handled gracefully (returns an empty resolved queue).

        Returns
        -------
        tuple[dict, list[dict]]
            ``(resolved_queue_dict, arrived_orders)``

            resolved_queue_dict
                Full queue state with the incremented counter and resolved order
                statuses written in — ready to be used as ``queue_data`` and
                persisted as the ``order_queue`` node in the save file.
            arrived_orders
                List of order dicts that transitioned to ``"Arrived"`` this
                session.  Each dict is a shallow copy — callers receive an
                independent snapshot.
        """
        # Null-safe: handle pre-feature saves that lack an order_queue node,
        # mirroring OrderQueue.__init__ null-safe defaults.
        if queue_dict and isinstance(queue_dict.get("orders"), list):
            orders: list[dict] = [dict(o) for o in queue_dict["orders"]]
            session_boundary_count: int = queue_dict.get("session_boundary_count", 0)
        else:
            orders = []
            session_boundary_count = 0

        # 1. Increment session boundary counter (mirrors OrderQueue.resolve_arrivals step 1).
        session_boundary_count += 1

        # 2. Clear previous session's arrival flags (step 2).
        for o in orders:
            o["arrived_this_session"] = False

        # 3. Mark qualifying In-Transit orders as Arrived (step 3).
        # "In-Transit" → OrderStatus.IN_TRANSIT  (src/orders/order_status.py)
        # "Arrived"    → OrderStatus.ARRIVED      (src/orders/order_status.py)
        arrived_orders: list[dict] = []
        for o in orders:
            if (
                o.get("status") == "In-Transit"
                and session_boundary_count >= o.get("estimated_arrival_session", 0)
            ):
                o["status"] = "Arrived"
                o["arrived_at"] = time.time()
                o["arrived_this_session"] = True
                arrived_orders.append(dict(o))  # independent snapshot for the caller

        resolved_queue_dict = {
            "session_boundary_count": session_boundary_count,
            "orders": orders,
        }
        return resolved_queue_dict, arrived_orders

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
