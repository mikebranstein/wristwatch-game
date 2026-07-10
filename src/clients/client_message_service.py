"""
ClientMessageService – template-based narrative message generation.

Message Types
-------------
intake    : client submits a new job request.
delivery  : client acknowledges a completed restoration delivery.
returning : returning client greets the player on reappearing in the intake queue.

Each type has per-trust-level template banks (trust levels 1–3).
The service is stateless; instantiate once and call generate_message() freely.
"""

from __future__ import annotations

import random
from typing import Optional


# ---------------------------------------------------------------------------
# Template banks
# ---------------------------------------------------------------------------

MESSAGE_TEMPLATES: dict[str, dict[int, list[str]]] = {
    "intake": {
        1: [
            "Hi, I found your workshop online. I have a {watch_type} that needs some attention — can you help?",
            "Hello! A friend recommended you. I've got a {watch_type} that's stopped running. Are you taking jobs?",
            "I'm hoping you can look at my {watch_type}. I've had it for a while and it really needs some care.",
        ],
        2: [
            "Good to work with you again! My {watch_type} needs a service — I know you'll do a wonderful job.",
            "I'm back with another {watch_type}. You did such great work last time, I wouldn't go anywhere else.",
            "Hi again! I've got a {watch_type} for you. No rush, but I'd love to see it running beautifully again.",
        ],
        3: [
            "It's always a pleasure. I have a rather special {watch_type} — I trust only your hands with it.",
            "I've brought you something wonderful: a vintage {watch_type}. I know you'll treat it with the care it deserves.",
            "Back again, and this time with my most cherished {watch_type}. I couldn't imagine trusting anyone else.",
        ],
    },
    "delivery": {
        1: [
            "Thank you so much! The {watch_type} looks wonderful — I'll definitely be back.",
            "This is exactly what I hoped for. The {watch_type} is running perfectly. You've earned a loyal customer.",
            "I can't believe the difference! The {watch_type} is like new. Really impressive work.",
        ],
        2: [
            "Another excellent job — you never disappoint. The {watch_type} is perfect.",
            "I knew I could count on you. The {watch_type} is running beautifully. See you next time!",
            "As always, your work on the {watch_type} is impeccable. Thank you!",
        ],
        3: [
            "Flawless, as always. The {watch_type} is a masterpiece again. You're truly gifted.",
            "You've outdone yourself this time. The {watch_type} is extraordinary. My deepest thanks.",
            "I will always bring my finest pieces to you. The {watch_type} is beyond my expectations.",
        ],
    },
    "returning": {
        1: [
            "Hi, it's {client_name} again! I have another {watch_type} I was hoping you could help with.",
            "Hello! You did such great work before, I've come back with a {watch_type}.",
            "Hi there — {client_name} here. Do you have room for a {watch_type} restoration?",
        ],
        2: [
            "It's {client_name} — I'm back! You've become my go-to workshop. Got a {watch_type} for you.",
            "{client_name} here! I wouldn't trust anyone else with this {watch_type}.",
            "Always a pleasure, {client_name}. I have a {watch_type} that I know you'll love working on.",
        ],
        3: [
            "Your favourite client is back — {client_name}! I have something special: a rare {watch_type} that only you can restore.",
            "{client_name} again. I've been saving this {watch_type} for when I could bring it to you.",
            "It's {client_name}, with another treasure. This {watch_type} has been waiting for your workshop.",
        ],
    },
}


class ClientMessageService:
    """Stateless message generator. All methods are pure functions of their arguments."""

    def generate_message(
        self,
        *,
        message_type: str,
        trust_level: int,
        client_name: str,
        watch_type: str,
        seed: Optional[int] = None,
    ) -> str:
        """
        Generate a narrative client message.

        Parameters
        ----------
        message_type : str
            One of 'intake', 'delivery', 'returning'.
        trust_level : int
            Client trust level (1–3). Clamped to valid range if out of bounds.
        client_name : str
            Client's display name, used in returning-client templates.
        watch_type : str
            Human-readable watch type, e.g. "dress watch", "chronograph".
        seed : int | None
            Optional RNG seed for deterministic selection in tests.

        Returns
        -------
        str
            Rendered narrative message with placeholders replaced.

        Raises
        ------
        ValueError
            When *message_type* is not recognised.
        """
        if message_type not in MESSAGE_TEMPLATES:
            raise ValueError(
                f"Unknown message_type: {message_type!r}. "
                f"Expected one of {list(MESSAGE_TEMPLATES)}"
            )
        # Clamp trust level to valid range.
        trust_level = max(1, min(3, trust_level))
        templates = MESSAGE_TEMPLATES[message_type][trust_level]
        rng = random.Random(seed)
        template = rng.choice(templates)
        return template.format(client_name=client_name, watch_type=watch_type)
