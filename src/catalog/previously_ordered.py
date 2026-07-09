"""
PreviouslyOrdered — Previously Ordered section for the Parts Catalog (AC4)
===========================================================================

Responsibilities:
  - Surface the last 10 unique parts ordered by the player.
  - Provide a one-click reorder action that pre-populates the order form
    with the correct part and default quantity.

Design note: the reorder payload is routed by the calling layer to the order
form. If issue #24 (async order form) is unavailable at build time, the
payload is directed to a simple direct order form path as a fallback.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from src.catalog.data.order_history import OrderHistory


@dataclass(frozen=True)
class OrderFormPayload:
    part_id: str
    part_name: str
    quantity: int
    source: str  # Always "previously-ordered" for reorder actions


class PreviouslyOrdered:
    """
    Manages the Previously Ordered catalog section (AC4).
    """

    def __init__(self, order_history: OrderHistory) -> None:
        if not isinstance(order_history, OrderHistory):
            raise TypeError("PreviouslyOrdered requires an OrderHistory instance")
        self._order_history = order_history

    def get_entries(self):
        """Returns up to 10 previously ordered parts for display (AC4)."""
        return self._order_history.get_recently_ordered()

    def build_reorder_payload(self, part_id: str) -> Optional[OrderFormPayload]:
        """
        Builds a pre-populated order form payload for one-click reorder (AC4).
        Returns None if the part_id is not found in order history.
        """
        entries = self._order_history.get_recently_ordered()
        for entry in entries:
            if entry.part_id == part_id:
                return OrderFormPayload(
                    part_id=entry.part_id,
                    part_name=entry.part_name,
                    quantity=entry.default_quantity,
                    source="previously-ordered",
                )
        return None

    @property
    def has_entries(self) -> bool:
        return self._order_history.count > 0
