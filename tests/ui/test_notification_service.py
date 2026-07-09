"""
Tests for NotificationService
==============================
AC3: Parts Arrived session-start notification
AC5: Non-blocking missing-part informational prompt

Run with:
    pytest tests/
"""

import pytest
from src.ui.notification_service import NotificationService
from src.orders.order_queue import OrderQueue
from src.orders.order_status import OrderStatus


def make_arrived_order(**overrides):
    """Return a minimal mock Order-like object for notification tests."""
    from types import SimpleNamespace
    defaults = dict(
        id="order-001",
        part_id="part-balance-wheel",
        part_name="Balance Wheel",
        job_id="job-omega",
        supplier_tier_name="Standard",
        cost=18.0,
        status=OrderStatus.ARRIVED,
        arrived_this_session=True,
        estimated_arrival_session=1,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestBuildPartsArrivedNotification:
    """AC3: session-start notification."""

    service = NotificationService()

    def test_returns_parts_arrived_notification_when_orders_arrived(self):
        notification = self.service.build_parts_arrived_notification([make_arrived_order()])
        assert notification is not None
        assert notification["type"] == "PARTS_ARRIVED"
        assert notification["title"] == "Parts Arrived!"
        assert len(notification["items"]) == 1
        assert notification["items"][0]["part_name"] == "Balance Wheel"
        assert notification["items"][0]["job_id"] == "job-omega"

    def test_scenario6_returns_none_when_no_orders_arrived(self):
        """Scenario 6: no spurious notification when nothing arrived."""
        assert self.service.build_parts_arrived_notification([]) is None

    def test_returns_none_for_none_input(self):
        assert self.service.build_parts_arrived_notification(None) is None

    def test_lists_all_arrived_parts(self):
        orders = [make_arrived_order(part_name="Crown"), make_arrived_order(part_name="Stem")]
        notification = self.service.build_parts_arrived_notification(orders)
        names = [i["part_name"] for i in notification["items"]]
        assert "Crown" in names
        assert "Stem" in names

    def test_ac3_integrates_with_order_queue_resolve_arrivals(self):
        """AC3: end-to-end integration with OrderQueue.resolve_arrivals()."""
        queue = OrderQueue()
        queue.place_order(
            part_id="p1", part_name="Click Spring",
            job_id="job-seiko", supplier_tier="STANDARD", cost=5,
        )
        arrived = queue.resolve_arrivals()
        notification = self.service.build_parts_arrived_notification(arrived)

        assert notification is not None
        assert notification["items"][0]["part_name"] == "Click Spring"


class TestBuildMissingPartPrompt:
    """AC5: non-blocking informational prompt at installation gate."""

    service = NotificationService()

    def _in_transit_part(self, **overrides):
        from types import SimpleNamespace
        defaults = dict(
            id="order-999",
            part_name="Mainspring",
            supplier_tier_name="Standard",
            estimated_arrival_session=2,
            status=OrderStatus.IN_TRANSIT,
        )
        defaults.update(overrides)
        return SimpleNamespace(**defaults)

    def test_returns_missing_part_info_prompt(self):
        prompt = self.service.build_missing_part_prompt([self._in_transit_part()])
        assert prompt["type"] == "MISSING_PART_INFO"
        assert prompt["title"] == "Parts Still In Transit"
        assert "Mainspring" in prompt["message"]
        assert "still on the way" in prompt["message"]
        assert len(prompt["awaited_parts"]) == 1
        assert prompt["awaited_parts"][0]["estimated_arrival_session"] == 2

    def test_prompt_is_informational_not_error(self):
        """AC5: message guides the player rather than trapping them."""
        prompt = self.service.build_missing_part_prompt([self._in_transit_part()])
        assert "Return next session" in prompt["message"]
        assert "expedite" in prompt["message"]

    def test_handles_multiple_awaited_parts(self):
        parts = [
            self._in_transit_part(part_name="Crown", id="o1"),
            self._in_transit_part(part_name="Stem", id="o2"),
        ]
        prompt = self.service.build_missing_part_prompt(parts)
        assert len(prompt["awaited_parts"]) == 2
        assert '"Crown"' in prompt["message"]
        assert '"Stem"' in prompt["message"]
        assert "they are" in prompt["message"]  # plural

    def test_singular_wording_for_one_part(self):
        prompt = self.service.build_missing_part_prompt([self._in_transit_part()])
        assert "it is" in prompt["message"]

    def test_raises_on_empty_list(self):
        with pytest.raises(ValueError):
            self.service.build_missing_part_prompt([])
