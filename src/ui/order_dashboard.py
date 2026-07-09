"""
OrderDashboard – Order Status Dashboard data layer (AC2)
=========================================================
Provides the view-model for the workbench Order Status Dashboard panel.
Accessible from the workbench at any time during an active job.
"""

from __future__ import annotations

from src.orders.order_queue import OrderQueue
from src.orders.order_status import OrderStatus


class OrderDashboard:
    def __init__(self, order_queue: OrderQueue) -> None:
        self._queue = order_queue

    def get_dashboard_view_model(self) -> dict:
        """
        Build the view model for the Order Status Dashboard panel (AC2).

        Returns a dict with:
            has_orders  : bool
            orders      : list of dicts with display fields
        """
        in_transit = self._queue.get_all_in_transit()

        orders = [
            {
                "order_id": o.id,
                "part_name": o.part_name,
                "part_id": o.part_id,
                "job_id": o.job_id,
                "supplier_tier_name": o.supplier_tier_name,
                "cost": o.cost,
                "estimated_arrival_session": o.estimated_arrival_session,
                "eta_label": f"Session {o.estimated_arrival_session}",
                "can_cancel": o.status == OrderStatus.IN_TRANSIT,
                "can_expedite": o.status == OrderStatus.IN_TRANSIT,
            }
            for o in in_transit
        ]

        return {"orders": orders, "has_orders": bool(orders)}
