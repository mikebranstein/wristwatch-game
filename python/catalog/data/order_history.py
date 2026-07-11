"""
Order History Model
====================
Tracks parts previously ordered by the player.
Used by the Previously Ordered section (AC4).

In the full game this will be persisted to the save file.
This module provides an in-memory store with a stable interface
so the persistence layer can be swapped in without API changes.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from time import time
from typing import Optional


MAX_PREVIOUSLY_ORDERED = 10


@dataclass
class OrderEntry:
    part_id: str
    part_name: str
    default_quantity: int
    ordered_at: float  # Unix timestamp


class OrderHistory:
    """
    Manages the list of previously ordered parts.

    De-duplicates by part_id (keeping most recent occurrence) and
    caps the list at MAX_PREVIOUSLY_ORDERED unique entries.
    """

    def __init__(self, initial_entries: Optional[list[OrderEntry]] = None) -> None:
        self._entries: list[OrderEntry] = []
        for entry in (initial_entries or []):
            self._record(entry.part_id, entry.part_name, entry.default_quantity, entry.ordered_at)

    def record_order(
        self,
        part_id: str,
        part_name: str,
        quantity: int = 1,
        ordered_at: Optional[float] = None,
    ) -> None:
        """
        Record that the player ordered a part.
        Moves existing entries for the same part to the front (deduplication).
        """
        self._record(part_id, part_name, quantity, ordered_at or time())

    def _record(self, part_id: str, part_name: str, quantity: int, ordered_at: float) -> None:
        # Remove existing entry for this part
        self._entries = [e for e in self._entries if e.part_id != part_id]
        # Prepend new entry (most recent first)
        self._entries.insert(0, OrderEntry(part_id, part_name, quantity, ordered_at))
        # Cap at maximum
        self._entries = self._entries[:MAX_PREVIOUSLY_ORDERED]

    def get_recently_ordered(self) -> list[OrderEntry]:
        """Returns up to MAX_PREVIOUSLY_ORDERED entries, most recent first (copy)."""
        return list(self._entries)

    @property
    def count(self) -> int:
        return len(self._entries)

    def clear(self) -> None:
        self._entries = []
