"""
Client – value object representing a named workshop client.

Fields
------
id                    : str       — unique UUID
name                  : str       — human-readable display name
trust_level           : int       — 1–3; advances after repeated successful restorations
personality_flags     : list[str] — designer-set tags, e.g. ["urgent", "vintage_collector"]
watch_type_affinities : list[str] — preferred watch types, e.g. ["dress", "chronograph"]
successful_jobs_count : int       — total deliveries accepted as successful
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import List, Optional


TRUST_LEVEL_MIN = 1
TRUST_LEVEL_MAX = 3


@dataclass
class Client:
    id: str
    name: str
    trust_level: int
    personality_flags: List[str]
    watch_type_affinities: List[str]
    successful_jobs_count: int = 0

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "trust_level": self.trust_level,
            "personality_flags": list(self.personality_flags),
            "watch_type_affinities": list(self.watch_type_affinities),
            "successful_jobs_count": self.successful_jobs_count,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Client":
        return cls(
            id=d["id"],
            name=d["name"],
            trust_level=d["trust_level"],
            personality_flags=list(d.get("personality_flags", [])),
            watch_type_affinities=list(d.get("watch_type_affinities", [])),
            successful_jobs_count=d.get("successful_jobs_count", 0),
        )

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        *,
        name: str,
        trust_level: int = 1,
        personality_flags: Optional[List[str]] = None,
        watch_type_affinities: Optional[List[str]] = None,
    ) -> "Client":
        if not (TRUST_LEVEL_MIN <= trust_level <= TRUST_LEVEL_MAX):
            raise ValueError(
                f"trust_level must be between {TRUST_LEVEL_MIN} and {TRUST_LEVEL_MAX}, got {trust_level}"
            )
        return cls(
            id=str(uuid.uuid4()),
            name=name,
            trust_level=trust_level,
            personality_flags=list(personality_flags or []),
            watch_type_affinities=list(watch_type_affinities or []),
            successful_jobs_count=0,
        )
