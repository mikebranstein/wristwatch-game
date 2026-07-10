"""
ClientRegistry — CRUD and trust progression for the named client pool.
=======================================================================

Persisted under save_data["clients"] (null-safe).
Pre-feature saves that lack this key initialise to an empty registry.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

from typing import Optional

from src.clients.client import Client


class ClientRegistry:
    def __init__(self, saved_state: Optional[list] = None) -> None:
        """
        Null-safe constructor.  `saved_state` is the raw list from save_data["clients"].
        None or missing key → empty registry.
        """
        if saved_state and isinstance(saved_state, list):
            self._clients: dict[str, Client] = {
                c["id"]: Client.from_dict(c) for c in saved_state
            }
        else:
            self._clients = {}

    # ── Read ──────────────────────────────────────────────────────────────────

    def get(self, client_id: str) -> Optional[Client]:
        return self._clients.get(client_id)

    def get_all(self) -> list[Client]:
        return list(self._clients.values())

    def get_by_trust_level(self, trust_level: int) -> list[Client]:
        return [c for c in self._clients.values() if c.trust_level == trust_level]

    def get_eligible_for_queue(self, current_session: int, min_gap_sessions: int = 1) -> list[Client]:
        """
        Return clients eligible to appear in the intake queue.
        Clients who appeared recently (within min_gap_sessions) are excluded to
        avoid the same client appearing back-to-back.
        """
        return [
            c for c in self._clients.values()
            if (current_session - c.last_seen_session) >= min_gap_sessions
        ]

    # ── Write ─────────────────────────────────────────────────────────────────

    def add(self, client: Client) -> None:
        """Register a new client."""
        if client.id in self._clients:
            raise ValueError(f"Client {client.id!r} already registered")
        self._clients[client.id] = client

    def record_job_success(self, client_id: str, current_session: int) -> bool:
        """
        Record a successful job for the client, advance trust if threshold met.

        Returns True if the client's trust level was advanced.
        """
        client = self.get(client_id)
        if client is None:
            raise ValueError(f"Client {client_id!r} not found")
        client.last_seen_session = current_session
        return client.record_successful_job()

    def update_last_seen(self, client_id: str, current_session: int) -> None:
        """Update the client's last_seen_session (called when they appear in queue)."""
        client = self.get(client_id)
        if client is None:
            raise ValueError(f"Client {client_id!r} not found")
        client.last_seen_session = current_session

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> list:
        """Serialise registry to a JSON-safe list for save_data["clients"]."""
        return [c.to_dict() for c in self._clients.values()]
