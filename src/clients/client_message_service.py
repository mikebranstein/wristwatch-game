"""
ClientMessageService — narrative message template renderer.
===========================================================

Renders short narrative client messages for:
  - Job intake (client submitting a new job request)
  - Delivery acknowledgement (client receiving the completed watch)
  - Returning client greeting (client reappearing in the intake queue)

Message context is enriched with job and client data to produce
personalised, cozy-tone narrative text.

Issue #119 — Full Workshop Queue Meta-Game (Phase 2)
"""

from __future__ import annotations

from typing import Optional

from src.clients.client import Client
from src.queue.workshop_job import WorkshopJob


class ClientMessageService:
    """Renders narrative client messages for the session dashboard."""

    def get_intake_message(self, client: Client, job: WorkshopJob) -> str:
        """
        Return the intake message for a new job from this client.
        Includes soft deadline flavour text if the job has one.
        """
        base = client.get_intake_message()
        if job.soft_deadline_sessions is not None:
            base += (
                f" (I was hoping to have it back within {job.soft_deadline_sessions} sessions "
                f"— no pressure if that's tricky!)"
            )
        return base

    def get_delivery_message(
        self, client: Client, job: WorkshopJob, delivered_on_time: bool
    ) -> str:
        """
        Return the delivery acknowledgement message.
        Late delivery receives a mild, non-punitive narrative note (cozy invariant).
        """
        if delivered_on_time:
            return client.get_delivery_message()
        return (
            client.get_delivery_message().rstrip("!")
            + " — I was hoping for it a little sooner, but it looks wonderful. Thank you."
        )

    def get_returning_message(self, client: Client) -> str:
        """Return the returning-client greeting, including trust level context."""
        base = client.get_returning_message()
        if client.trust_level >= 2:
            base += f" I have a more interesting piece for you this time."
        return base

    def get_most_recent_message_for_job(
        self, client: Client, job: WorkshopJob
    ) -> Optional[str]:
        """
        Return the most contextually appropriate message for an active bench job
        to display on the session-start dashboard.
        """
        if job.is_completed:
            return None  # Completed jobs don't need a current message
        if job.accepted_at is not None:
            return self.get_intake_message(client, job)
        return client.get_intake_message()
