"""
ClientRegistry – CRUD and trust-level progression for named workshop clients.

Public API
----------
add_client(client)                Register a new Client.
get_client(client_id)             Retrieve by ID (or None).
get_all_clients()                 Snapshot of every client.
record_successful_job(client_id)  Increment successful_jobs_count; promote trust_level
                                  when cumulative threshold is met.
to_save_data()                    Serialise to dict for persistence.

Null-safe: constructing with None or a dict lacking a 'clients' key produces an empty registry,
enabling graceful backward compatibility for pre-feature saves.

Trust Progression Rule
----------------------
- trust_level advances 1 → 2 after TRUST_THRESHOLD_TIER_2 cumulative successful jobs.
- trust_level advances 2 → 3 after TRUST_THRESHOLD_TIER_3 cumulative successful jobs.
- Trust never decreases.
"""

from __future__ import annotations

from typing import Optional

from src.clients.client import Client, TRUST_LEVEL_MAX


# Cumulative successful-job counts required to advance trust level.
TRUST_THRESHOLD_TIER_2 = 2   # reach trust_level=2 after 2 successes
TRUST_THRESHOLD_TIER_3 = 5   # reach trust_level=3 after 5 successes


class ClientRegistry:

    def __init__(self, saved_state: Optional[dict] = None) -> None:
        # Null-safe: handle pre-feature saves gracefully.
        if saved_state and isinstance(saved_state.get("clients"), list):
            self._clients: dict[str, Client] = {
                c["id"]: Client.from_dict(c) for c in saved_state["clients"]
            }
        else:
            self._clients = {}

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_client(self, client_id: str) -> Optional[Client]:
        """Return the Client for *client_id*, or None if not found."""
        return self._clients.get(client_id)

    def get_all_clients(self) -> list[Client]:
        """Return a snapshot of every registered client."""
        return list(self._clients.values())

    # ── Write ─────────────────────────────────────────────────────────────────

    def add_client(self, client: Client) -> None:
        """Register a new client. Raises ValueError if already registered."""
        if client.id in self._clients:
            raise ValueError(f"Client {client.id!r} is already registered.")
        self._clients[client.id] = client

    def record_successful_job(self, client_id: str) -> Client:
        """
        Record a successful job delivery for *client_id*.

        Increments successful_jobs_count and advances trust_level when the
        appropriate cumulative threshold is reached.

        Returns the updated Client.
        """
        client = self._clients.get(client_id)
        if client is None:
            raise ValueError(f"Client not found: {client_id!r}")

        client.successful_jobs_count += 1

        # Promote trust level when cumulative success thresholds are met.
        if client.trust_level < TRUST_LEVEL_MAX:
            if client.successful_jobs_count >= TRUST_THRESHOLD_TIER_3:
                client.trust_level = 3
            elif client.successful_jobs_count >= TRUST_THRESHOLD_TIER_2:
                client.trust_level = 2

        return client

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> dict:
        """Serialise registry to a JSON-safe dict for save-file persistence."""
        return {"clients": [c.to_dict() for c in self._clients.values()]}
