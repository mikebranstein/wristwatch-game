"""
Tests for Client and ClientRegistry
=====================================
Covers AC2 (returning client trust level, narrative messages),
AC1 (client pool management), and persistence.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import pytest
from src.clients.client import Client, MAX_PERSONALITY_FLAGS
from src.clients.client_registry import ClientRegistry


# ─── Client creation ──────────────────────────────────────────────────────────

class TestClientCreate:
    def test_creates_trust_level_1_client(self):
        client = Client.create(name="Margaret")
        assert client.trust_level == 1
        assert client.successful_jobs == 0
        assert client.name == "Margaret"
        assert client.id  # truthy UUID

    def test_creates_with_personality_flags(self):
        client = Client.create(
            name="David",
            personality_flags=["urgency_high", "prefers_dress_watches"],
        )
        assert "urgency_high" in client.personality_flags

    def test_raises_on_too_many_personality_flags(self):
        too_many = ["flag_a", "flag_b", "flag_c", "flag_d", "flag_e"]
        with pytest.raises(ValueError, match="capped at"):
            Client.create(name="X", personality_flags=too_many)

    def test_max_personality_flags_allowed(self):
        flags = ["flag_a", "flag_b", "flag_c", "flag_d"]
        assert len(flags) == MAX_PERSONALITY_FLAGS
        client = Client.create(name="MaxFlags", personality_flags=flags)
        assert len(client.personality_flags) == MAX_PERSONALITY_FLAGS


# ─── Trust progression — AC2 ──────────────────────────────────────────────────

class TestClientTrustProgression:
    """AC2: client trust level advances with successful jobs; level 2+ unlocks richer jobs."""

    def test_trust_advances_to_2_after_2_successful_jobs(self):
        client = Client.create(name="Margaret")
        client.record_successful_job()
        assert client.trust_level == 1  # still level 1 after 1 job
        advanced = client.record_successful_job()
        assert advanced is True
        assert client.trust_level == 2

    def test_trust_advances_to_3_after_5_successful_jobs(self):
        client = Client.create(name="Margaret")
        for _ in range(4):
            client.record_successful_job()
        assert client.trust_level == 2
        advanced = client.record_successful_job()
        assert advanced is True
        assert client.trust_level == 3

    def test_trust_does_not_exceed_3(self):
        client = Client.create(name="Margaret")
        for _ in range(10):
            client.record_successful_job()
        assert client.trust_level == 3

    def test_record_successful_job_increments_count(self):
        client = Client.create(name="Margaret")
        client.record_successful_job()
        assert client.successful_jobs == 1

    def test_returns_false_when_trust_not_advanced(self):
        client = Client.create(name="Margaret")
        advanced = client.record_successful_job()
        assert advanced is False  # only 1 job, threshold is 2


# ─── Message templates ────────────────────────────────────────────────────────

class TestClientMessages:
    def test_intake_message_returns_string(self):
        client = Client.create(name="Margaret")
        msg = client.get_intake_message()
        assert isinstance(msg, str) and len(msg) > 0

    def test_delivery_message_returns_string(self):
        client = Client.create(name="Margaret")
        msg = client.get_delivery_message()
        assert isinstance(msg, str) and len(msg) > 0

    def test_returning_message_returns_string(self):
        client = Client.create(name="Margaret")
        msg = client.get_returning_message()
        assert isinstance(msg, str) and len(msg) > 0

    def test_custom_message_templates_respected(self):
        client = Client.create(
            name="Margaret",
            message_templates={
                "intake": "I need my Omega fixed.",
                "delivery": "Wonderful job!",
                "returning": "So glad to be back!",
            },
        )
        assert client.get_intake_message() == "I need my Omega fixed."


# ─── Serialisation ────────────────────────────────────────────────────────────

class TestClientSerialisation:
    def test_round_trip_preserves_all_fields(self):
        client = Client.create(
            name="Margaret",
            personality_flags=["urgency_high"],
            watch_type_affinities=["dress"],
        )
        client.record_successful_job()
        client.record_successful_job()  # trust → 2
        d = client.to_dict()
        reloaded = Client.from_dict(d)
        assert reloaded.id == client.id
        assert reloaded.name == "Margaret"
        assert reloaded.trust_level == 2
        assert reloaded.successful_jobs == 2
        assert "urgency_high" in reloaded.personality_flags


# ─── ClientRegistry ───────────────────────────────────────────────────────────

class TestClientRegistry:
    def test_null_safe_construction_from_none(self):
        registry = ClientRegistry(None)
        assert registry.get_all() == []

    def test_null_safe_construction_from_empty_list(self):
        registry = ClientRegistry([])
        assert registry.get_all() == []

    def test_add_and_get_client(self):
        registry = ClientRegistry()
        client = Client.create(name="Margaret")
        registry.add(client)
        retrieved = registry.get(client.id)
        assert retrieved is not None
        assert retrieved.name == "Margaret"

    def test_add_raises_on_duplicate(self):
        registry = ClientRegistry()
        client = Client.create(name="Margaret")
        registry.add(client)
        with pytest.raises(ValueError, match="already registered"):
            registry.add(client)

    def test_get_by_trust_level(self):
        registry = ClientRegistry()
        c1 = Client.create(name="Margaret")
        c2 = Client.create(name="David")
        # Advance David to trust level 2
        c2.record_successful_job()
        c2.record_successful_job()
        registry.add(c1)
        registry.add(c2)
        tier1 = registry.get_by_trust_level(1)
        tier2 = registry.get_by_trust_level(2)
        assert len(tier1) == 1
        assert tier1[0].name == "Margaret"
        assert len(tier2) == 1
        assert tier2[0].name == "David"

    def test_record_job_success_advances_trust(self):
        """AC2: registry.record_job_success advances client trust after ≥2 successful jobs."""
        registry = ClientRegistry()
        client = Client.create(name="Margaret")
        registry.add(client)
        registry.record_job_success(client.id, current_session=1)
        registry.record_job_success(client.id, current_session=2)
        assert registry.get(client.id).trust_level == 2

    def test_record_job_success_raises_on_missing_client(self):
        registry = ClientRegistry()
        with pytest.raises(ValueError, match="not found"):
            registry.record_job_success("nonexistent-id", current_session=1)

    def test_get_eligible_for_queue_excludes_recent(self):
        registry = ClientRegistry()
        client = Client.create(name="Margaret")
        client.last_seen_session = 5
        registry.add(client)
        # With min_gap_sessions=2, session=6 means client was seen at 5 (gap=1) → excluded
        eligible = registry.get_eligible_for_queue(current_session=6, min_gap_sessions=2)
        assert client not in eligible

    def test_get_eligible_includes_client_with_sufficient_gap(self):
        registry = ClientRegistry()
        client = Client.create(name="Margaret")
        client.last_seen_session = 3
        registry.add(client)
        # Gap = 6 - 3 = 3 ≥ 2 → eligible
        eligible = registry.get_eligible_for_queue(current_session=6, min_gap_sessions=2)
        assert len(eligible) == 1

    def test_round_trip_save_data(self):
        registry = ClientRegistry()
        c1 = Client.create(name="Margaret")
        c2 = Client.create(name="David")
        registry.add(c1)
        registry.add(c2)
        save_data = registry.to_save_data()
        reloaded = ClientRegistry(save_data)
        assert len(reloaded.get_all()) == 2
        names = {c.name for c in reloaded.get_all()}
        assert names == {"Margaret", "David"}
