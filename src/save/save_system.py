"""
SaveSystem – session boundary event and order queue persistence
==============================================================

load_session(raw_save_data)
    - Deserialises the save file (null-safe for pre-feature saves with no order queue node).
    - Fires resolve_arrivals() so order states are current for this session.
    - Returns (order_queue, arrived_orders, updated_save_data).

save_session(order_queue, existing_save_data)
    - Writes the latest order queue state into the save-data dict.
    - Returns the updated save-data dict ready for JSON serialisation to disk.

Atomic-write semantics:
    Orders should be persisted at placement time (call save_session() immediately after
    place_order()) to guarantee in-flight order survival across abnormal exits (Scenario 8).
"""

from __future__ import annotations
from typing import Optional

from src.orders.order_queue import OrderQueue
from src.orders.order import Order


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
        queue_data = (raw_save_data or {}).get("order_queue", None)
        order_queue = OrderQueue(queue_data)

        # Session-boundary event: resolve In-Transit orders that are now due.
        arrived_orders = order_queue.resolve_arrivals()

        # Write resolved state back so callers get a consistent snapshot.
        updated_save_data = {
            **(raw_save_data or {}),
            "order_queue": order_queue.to_save_data(),
        }

        return order_queue, arrived_orders, updated_save_data

    def save_session(self, order_queue: OrderQueue, existing_save_data: Optional[dict]) -> dict:
        """
        Persist order queue state into save data.

        Returns the updated save-data dict (does not write to disk — caller handles I/O).
        """
        return {
            **(existing_save_data or {}),
            "order_queue": order_queue.to_save_data(),
        }
