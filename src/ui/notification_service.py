"""
NotificationService – session-start and in-game notification surfaces
=====================================================================

build_parts_arrived_notification(arrived_orders)
    Consumes the list of orders that resolved since the last session and returns
    a structured notification dict for the "Parts Arrived" UI panel.
    Returns None when nothing arrived so the caller never renders a spurious notice.

build_missing_part_prompt(in_transit_parts)
    Called when a player tries to advance to installation but a required part is
    still In-Transit.  Returns a non-blocking informational prompt (not an error
    state) describing the awaited part(s) and their ETA.
"""

from __future__ import annotations
from typing import Optional

from src.orders.order import Order


class NotificationService:

    def build_parts_arrived_notification(
        self, arrived_orders: Optional[list[Order]]
    ) -> Optional[dict]:
        """
        Build the "Parts Arrived" session-start notification (AC3).

        Returns None when no orders arrived — prevents spurious notifications (Scenario 6).
        """
        if not arrived_orders:
            return None

        return {
            "type": "PARTS_ARRIVED",
            "title": "Parts Arrived!",
            "items": [
                {
                    "order_id": o.id,
                    "part_name": o.part_name,
                    "job_id": o.job_id,
                    "supplier_tier_name": o.supplier_tier_name,
                    "cost": o.cost,
                }
                for o in arrived_orders
            ],
        }

    def build_missing_part_prompt(self, in_transit_parts: list[Order]) -> dict:
        """
        Build a non-blocking informational prompt for the installation gate (AC5).

        Raises ValueError when called with an empty list.
        """
        if not in_transit_parts:
            raise ValueError("build_missing_part_prompt requires at least one in-transit part")

        awaited_parts = [
            {
                "part_name": o.part_name,
                "supplier_tier_name": o.supplier_tier_name,
                "estimated_arrival_session": o.estimated_arrival_session,
                "order_id": o.id,
            }
            for o in in_transit_parts
        ]

        part_names = ", ".join(f'"{p["part_name"]}"' for p in awaited_parts)
        plurality = "it is" if len(in_transit_parts) == 1 else "they are"

        message = (
            f"You cannot install {part_names} yet — {plurality} still on the way. "
            "Return next session to continue, or use the Order Dashboard to expedite."
        )

        return {
            "type": "MISSING_PART_INFO",
            "title": "Parts Still In Transit",
            "message": message,
            "awaited_parts": awaited_parts,
        }
