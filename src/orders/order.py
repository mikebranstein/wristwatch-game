"""
Order – immutable value object representing a single part order record.
All fields are JSON-serialisable for save-file persistence.
"""

from __future__ import annotations
import math
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional

from src.orders.order_status import OrderStatus
from src.config.supplier_tiers import SupplierTierConfig


@dataclass
class Order:
    id: str
    part_id: str
    part_name: str
    job_id: str
    supplier_tier: str          # key into SUPPLIER_TIERS, e.g. "STANDARD"
    supplier_tier_name: str     # human-readable, e.g. "Standard"
    cost: float
    status: OrderStatus
    session_boundary_at_order: int
    sessions_to_arrive: int
    estimated_arrival_session: int
    placed_at: float            # epoch seconds
    arrived_at: Optional[float] = None
    arrived_this_session: bool = False
    expedited: bool = False

    # ── Serialisation ──────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Order":
        d = dict(d)
        d["status"] = OrderStatus(d["status"])
        return cls(**d)

    # ── Factory ────────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        *,
        part_id: str,
        part_name: str,
        job_id: str,
        supplier_tier: str,
        tier_config: SupplierTierConfig,
        cost: float,
        session_boundary_count: int,
        placed_at: Optional[float] = None,
    ) -> "Order":
        return cls(
            id=str(uuid.uuid4()),
            part_id=part_id,
            part_name=part_name,
            job_id=job_id,
            supplier_tier=supplier_tier,
            supplier_tier_name=tier_config.name,
            cost=cost,
            status=OrderStatus.IN_TRANSIT,
            session_boundary_at_order=session_boundary_count,
            sessions_to_arrive=tier_config.sessions_to_arrive,
            estimated_arrival_session=session_boundary_count + tier_config.sessions_to_arrive,
            placed_at=placed_at if placed_at is not None else time.time(),
        )
