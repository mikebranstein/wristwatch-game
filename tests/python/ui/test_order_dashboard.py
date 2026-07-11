"""
Tests for OrderDashboard
========================
AC2: Order Status Dashboard accessible from workbench during any active job.

Run with:
    pytest tests/
"""

import pytest
from ui.order_dashboard import OrderDashboard
from orders.order_queue import OrderQueue


def make_part(**overrides):
    params = dict(
        part_id="part-001",
        part_name="Crown",
        job_id="job-omega",
        supplier_tier="STANDARD",
        cost=15.0,
    )
    params.update(overrides)
    return params


class TestOrderDashboard:
    """AC2: dashboard panel display requirements."""

    def test_returns_no_orders_when_queue_empty(self):
        queue = OrderQueue()
        dashboard = OrderDashboard(queue)
        vm = dashboard.get_dashboard_view_model()
        assert vm["has_orders"] is False
        assert vm["orders"] == []

    def test_shows_in_transit_orders_with_required_display_fields(self):
        """AC2: part name, supplier tier, estimated arrival session, cost all present."""
        queue = OrderQueue()
        queue.place_order(**make_part())
        dashboard = OrderDashboard(queue)
        vm = dashboard.get_dashboard_view_model()

        assert vm["has_orders"] is True
        assert len(vm["orders"]) == 1

        item = vm["orders"][0]
        assert item["part_name"] == "Crown"
        assert item["supplier_tier_name"] == "Standard"
        assert "Session" in item["eta_label"]
        assert item["cost"] == 15.0
        assert item["job_id"] == "job-omega"
        assert item["can_cancel"] is True
        assert item["can_expedite"] is True

    def test_does_not_show_arrived_or_cancelled_orders(self):
        queue = OrderQueue()
        o1 = queue.place_order(**make_part(part_id="p1"))
        queue.place_order(**make_part(part_id="p2"))

        queue.cancel_order(o1.id)
        queue.resolve_arrivals()  # p2 arrives

        dashboard = OrderDashboard(queue)
        vm = dashboard.get_dashboard_view_model()
        assert vm["has_orders"] is False
        assert vm["orders"] == []

    def test_scenario5_shows_orders_across_multiple_jobs(self):
        """Scenario 5: dashboard shows all orders from multiple jobs."""
        queue = OrderQueue()
        queue.place_order(**make_part(job_id="job-a", part_id="pa"))
        queue.place_order(**make_part(job_id="job-b", part_id="pb"))
        queue.place_order(**make_part(job_id="job-b", part_id="pc"))

        dashboard = OrderDashboard(queue)
        vm = dashboard.get_dashboard_view_model()

        assert len(vm["orders"]) == 3
        job_ids = [o["job_id"] for o in vm["orders"]]
        assert job_ids.count("job-a") == 1
        assert job_ids.count("job-b") == 2
