"""
Tests for ClientMessageService
================================
Covers the missing branches identified in the QA coverage report for
src/clients/client_message_service.py (60% -> target >= 70%):

  - Line 34:  get_intake_message -- deadline-signal path (soft_deadline_sessions set)
  - Lines 47-49: get_delivery_message -- on-time delivery & late-delivery narrative
  - Lines 56-59: get_returning_message -- trust-level-2 and trust-level-3 extra text
  - Line 69:  get_most_recent_message_for_job -- completed job returns None
  - Line 72:  get_most_recent_message_for_job -- job not yet accepted (accepted_at is None)

Issue #119 -- Full Workshop Queue Meta-Game (Phase 2)
Run with: pytest tests/
"""

import pytest
from src.clients.client import Client
from src.clients.client_message_service import ClientMessageService
from src.queue.workshop_job import WorkshopJob


# --- Helpers -----------------------------------------------------------------

def _make_client(trust_level: int = 1, name: str = "Margaret") -> Client:
    """Create a trust-level-N client by fast-forwarding successful jobs."""
    client = Client.create(name=name)
    # Trust thresholds: level 2 at 2 jobs, level 3 at 5 jobs
    targets = {1: 0, 2: 2, 3: 5}
    for _ in range(targets.get(trust_level, 0)):
        client.record_successful_job()
    assert client.trust_level == trust_level
    return client


def _make_job(
    client: Client,
    soft_deadline_sessions=None,
    accepted: bool = False,
    completed: bool = False,
) -> WorkshopJob:
    """Create a WorkshopJob, optionally accepted and/or completed."""
    job = WorkshopJob.create(
        client_id=client.id,
        watch_type="dress",
        complexity=2,
        reward=150.0,
        narrative_intake_message="Please restore my watch.",
        soft_deadline_sessions=soft_deadline_sessions,
    )
    if accepted or completed:
        job.accept_to_bench(slot=1)
    if completed:
        job.complete(quality_rating=90)
    return job


# --- get_intake_message -------------------------------------------------------

class TestGetIntakeMessage:
    """Line 34: deadline-signal path."""

    def test_no_deadline_returns_base_message_only(self):
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client)  # soft_deadline_sessions=None
        msg = svc.get_intake_message(client, job)
        assert "session" not in msg.lower()
        assert isinstance(msg, str) and len(msg) > 0

    def test_with_deadline_appends_session_count(self):
        """Line 34 True-branch: soft_deadline_sessions is not None."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, soft_deadline_sessions=3)
        msg = svc.get_intake_message(client, job)
        assert "3" in msg
        assert "sessions" in msg

    def test_deadline_text_is_non_punitive(self):
        """Cozy invariant: deadline copy uses 'hoping', not commanding language."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, soft_deadline_sessions=5)
        msg = svc.get_intake_message(client, job)
        assert "hoping" in msg.lower()
        assert "no pressure" in msg.lower()


# --- get_delivery_message -----------------------------------------------------

class TestGetDeliveryMessage:
    """Lines 47-49: on-time delivery and late-delivery narrative."""

    def test_on_time_delivery_returns_base_message(self):
        """Line 48: delivered_on_time=True returns plain delivery message."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, accepted=True)
        msg = svc.get_delivery_message(client, job, delivered_on_time=True)
        assert msg == client.get_delivery_message()

    def test_late_delivery_appends_narrative_note(self):
        """Lines 49-52: delivered_on_time=False appends a mild narrative note."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, accepted=True)
        msg = svc.get_delivery_message(client, job, delivered_on_time=False)
        assert "sooner" in msg.lower() or "hoping" in msg.lower()
        # Must still end politely
        assert "thank you" in msg.lower()

    def test_late_delivery_is_non_punitive(self):
        """Cozy invariant: late-delivery copy does not scold the player."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, accepted=True)
        msg = svc.get_delivery_message(client, job, delivered_on_time=False)
        # Should NOT contain harsh language
        for word in ("terrible", "awful", "unacceptable", "disappointed"):
            assert word not in msg.lower(), f"Found punitive word '{word}' in late message"


# --- get_returning_message ----------------------------------------------------

class TestGetReturningMessage:
    """Lines 56-59: get_returning_message and trust-level flavour text."""

    def test_trust_level_1_returns_base_message_only(self):
        """Lines 56-59 False-branch: trust < 2 -- no extra text appended."""
        svc = ClientMessageService()
        client = _make_client(trust_level=1)
        msg = svc.get_returning_message(client)
        assert msg == client.get_returning_message()
        assert "interesting piece" not in msg

    def test_trust_level_2_appends_richer_job_hint(self):
        """Lines 57-58 True-branch: trust >= 2 -- extra flavour text appended."""
        svc = ClientMessageService()
        client = _make_client(trust_level=2)
        msg = svc.get_returning_message(client)
        assert "interesting piece" in msg

    def test_trust_level_3_also_appends_richer_job_hint(self):
        """Lines 57-58: trust level 3 also satisfies trust_level >= 2."""
        svc = ClientMessageService()
        client = _make_client(trust_level=3)
        msg = svc.get_returning_message(client)
        assert "interesting piece" in msg

    def test_returning_message_starts_with_base(self):
        """Trust-2 message must contain the base returning message as prefix."""
        svc = ClientMessageService()
        client = _make_client(trust_level=2)
        base = client.get_returning_message()
        msg = svc.get_returning_message(client)
        assert msg.startswith(base)


# --- get_most_recent_message_for_job ------------------------------------------

class TestGetMostRecentMessageForJob:
    """Lines 68-72: dashboard message selector."""

    def test_completed_job_returns_none(self):
        """Line 69: completed jobs have no current dashboard message."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, completed=True)
        assert job.is_completed  # guard
        result = svc.get_most_recent_message_for_job(client, job)
        assert result is None

    def test_accepted_job_returns_intake_message(self):
        """Line 71: accepted (non-completed) job returns intake message via service."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, accepted=True)
        assert job.accepted_at is not None
        assert not job.is_completed
        result = svc.get_most_recent_message_for_job(client, job)
        assert result is not None
        assert isinstance(result, str) and len(result) > 0

    def test_unaccepted_job_returns_bare_intake_message(self):
        """Line 72: job not yet accepted falls through to client.get_intake_message()."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client)  # not accepted, not completed
        assert job.accepted_at is None
        assert not job.is_completed
        result = svc.get_most_recent_message_for_job(client, job)
        assert result == client.get_intake_message()

    def test_accepted_job_with_deadline_includes_deadline_text(self):
        """Accepted job with soft deadline -- dashboard message includes deadline context."""
        svc = ClientMessageService()
        client = _make_client()
        job = _make_job(client, accepted=True, soft_deadline_sessions=4)
        result = svc.get_most_recent_message_for_job(client, job)
        assert result is not None
        assert "4" in result
