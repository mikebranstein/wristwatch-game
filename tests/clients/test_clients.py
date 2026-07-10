"""
Tests for Client, ClientRegistry, and ClientMessageService
Issue #119 — Workshop Queue Meta-Game Phase 2
==============================================

Covers acceptance criteria:
  AC2 — returning client recognition: trust level 1–3, narrative message, complexity/reward gating

Run with: pytest tests/
"""

import pytest
from src.clients.client import Client, TRUST_LEVEL_MIN, TRUST_LEVEL_MAX
from src.clients.client_registry import ClientRegistry, TRUST_THRESHOLD_TIER_2, TRUST_THRESHOLD_TIER_3
from src.clients.client_message_service import ClientMessageService


# ─── Client dataclass ─────────────────────────────────────────────────────────

class TestClient:
    def test_create_client_with_defaults(self):
        client = Client.create(name="Margaret")
        assert client.name == "Margaret"
        assert client.trust_level == 1
        assert client.successful_jobs_count == 0
        assert client.id  # truthy UUID

    def test_create_client_with_all_fields(self):
        client = Client.create(
            name="Harold",
            trust_level=2,
            personality_flags=["urgent"],
            watch_type_affinities=["dress"],
        )
        assert client.trust_level == 2
        assert "urgent" in client.personality_flags
        assert "dress" in client.watch_type_affinities

    def test_create_raises_on_invalid_trust_level_too_low(self):
        with pytest.raises(ValueError, match="trust_level"):
            Client.create(name="Bob", trust_level=0)

    def test_create_raises_on_invalid_trust_level_too_high(self):
        with pytest.raises(ValueError, match="trust_level"):
            Client.create(name="Bob", trust_level=4)

    def test_round_trip_serialisation(self):
        client = Client.create(
            name="Alice",
            trust_level=2,
            personality_flags=["vintage_collector"],
            watch_type_affinities=["chronograph"],
        )
        client.successful_jobs_count = 3
        restored = Client.from_dict(client.to_dict())
        assert restored.id == client.id
        assert restored.name == client.name
        assert restored.trust_level == client.trust_level
        assert restored.successful_jobs_count == client.successful_jobs_count
        assert restored.personality_flags == client.personality_flags
        assert restored.watch_type_affinities == client.watch_type_affinities


# ─── ClientRegistry ───────────────────────────────────────────────────────────

class TestClientRegistry:
    def _make_client(self, name="Test Client") -> Client:
        return Client.create(name=name)

    def test_add_and_retrieve_client(self):
        registry = ClientRegistry()
        client = self._make_client("Margaret")
        registry.add_client(client)
        assert registry.get_client(client.id) is client

    def test_get_client_returns_none_for_unknown_id(self):
        registry = ClientRegistry()
        assert registry.get_client("nonexistent-id") is None

    def test_add_duplicate_raises(self):
        registry = ClientRegistry()
        client = self._make_client()
        registry.add_client(client)
        with pytest.raises(ValueError, match="already registered"):
            registry.add_client(client)

    def test_get_all_clients_snapshot(self):
        registry = ClientRegistry()
        c1 = self._make_client("Alice")
        c2 = self._make_client("Bob")
        registry.add_client(c1)
        registry.add_client(c2)
        all_clients = registry.get_all_clients()
        assert len(all_clients) == 2

    # ── Trust Progression (AC2) ───────────────────────────────────────────────

    def test_trust_level_advances_to_2_after_threshold(self):
        """AC2: Client trust advances to 2 after TRUST_THRESHOLD_TIER_2 successful jobs."""
        registry = ClientRegistry()
        client = self._make_client("Margaret")
        registry.add_client(client)

        for _ in range(TRUST_THRESHOLD_TIER_2):
            updated = registry.record_successful_job(client.id)

        assert updated.trust_level == 2
        assert updated.successful_jobs_count == TRUST_THRESHOLD_TIER_2

    def test_trust_level_advances_to_3_after_threshold(self):
        """AC2: Client trust advances to 3 after TRUST_THRESHOLD_TIER_3 successful jobs."""
        registry = ClientRegistry()
        client = self._make_client("Harold")
        registry.add_client(client)

        for _ in range(TRUST_THRESHOLD_TIER_3):
            updated = registry.record_successful_job(client.id)

        assert updated.trust_level == 3

    def test_trust_never_exceeds_max(self):
        """Trust level never goes above TRUST_LEVEL_MAX."""
        registry = ClientRegistry()
        client = self._make_client()
        registry.add_client(client)

        for _ in range(TRUST_THRESHOLD_TIER_3 + 5):
            updated = registry.record_successful_job(client.id)

        assert updated.trust_level == TRUST_LEVEL_MAX

    def test_single_success_does_not_advance_trust(self):
        """One successful job does not advance trust from level 1 if threshold is 2."""
        registry = ClientRegistry()
        client = self._make_client()
        registry.add_client(client)
        updated = registry.record_successful_job(client.id)
        assert updated.trust_level == 1

    def test_record_successful_job_raises_for_unknown_client(self):
        registry = ClientRegistry()
        with pytest.raises(ValueError, match="Client not found"):
            registry.record_successful_job("unknown-id")

    # ── Persistence ──────────────────────────────────────────────────────────

    def test_round_trip_save_and_load(self):
        """AC9: Client registry survives a save → load cycle with trust state preserved."""
        registry = ClientRegistry()
        client = self._make_client("Returning Client")
        registry.add_client(client)
        registry.record_successful_job(client.id)
        registry.record_successful_job(client.id)

        saved = registry.to_save_data()
        restored = ClientRegistry(saved)

        loaded = restored.get_client(client.id)
        assert loaded is not None
        assert loaded.name == "Returning Client"
        assert loaded.successful_jobs_count == 2
        assert loaded.trust_level == 2

    def test_null_safe_construction_from_none(self):
        registry = ClientRegistry(None)
        assert registry.get_all_clients() == []

    def test_null_safe_construction_from_empty_dict(self):
        registry = ClientRegistry({})
        assert registry.get_all_clients() == []


# ─── ClientMessageService ────────────────────────────────────────────────────

class TestClientMessageService:
    def setup_method(self):
        self.svc = ClientMessageService()

    def test_generates_intake_message_trust_1(self):
        """AC1: New client receives trust-1 intake message."""
        msg = self.svc.generate_message(
            message_type="intake",
            trust_level=1,
            client_name="Margaret",
            watch_type="dress watch",
            seed=0,
        )
        assert isinstance(msg, str)
        assert len(msg) > 0
        assert "dress watch" in msg

    def test_generates_returning_message_with_client_name(self):
        """AC2: Returning client message includes client name and watch type."""
        msg = self.svc.generate_message(
            message_type="returning",
            trust_level=2,
            client_name="Margaret",
            watch_type="chronograph",
            seed=0,
        )
        assert "Margaret" in msg
        assert "chronograph" in msg

    def test_generates_delivery_message(self):
        """AC3: Delivery acknowledgement message is generated."""
        msg = self.svc.generate_message(
            message_type="delivery",
            trust_level=1,
            client_name="Harold",
            watch_type="pocket watch",
            seed=0,
        )
        assert isinstance(msg, str)
        assert "pocket watch" in msg

    def test_different_trust_levels_produce_different_templates(self):
        """AC2: Trust-level-2 messages differ from trust-level-1."""
        msg_t1 = self.svc.generate_message(
            message_type="returning", trust_level=1,
            client_name="Alice", watch_type="dress watch", seed=0,
        )
        msg_t2 = self.svc.generate_message(
            message_type="returning", trust_level=2,
            client_name="Alice", watch_type="dress watch", seed=0,
        )
        # Different template bank → different message (at seed=0)
        assert msg_t1 != msg_t2

    def test_raises_on_unknown_message_type(self):
        with pytest.raises(ValueError, match="Unknown message_type"):
            self.svc.generate_message(
                message_type="unknown",
                trust_level=1,
                client_name="X",
                watch_type="watch",
            )

    def test_trust_level_clamped_to_valid_range(self):
        """Out-of-range trust level is clamped rather than raising."""
        msg = self.svc.generate_message(
            message_type="intake",
            trust_level=10,   # clamped to 3
            client_name="X",
            watch_type="watch",
            seed=0,
        )
        assert isinstance(msg, str)

    def test_deterministic_with_seed(self):
        """Same seed produces same message."""
        msg1 = self.svc.generate_message(
            message_type="intake", trust_level=1,
            client_name="Bob", watch_type="field watch", seed=42,
        )
        msg2 = self.svc.generate_message(
            message_type="intake", trust_level=1,
            client_name="Bob", watch_type="field watch", seed=42,
        )
        assert msg1 == msg2
