"""
Tests for NotificationService
==============================
AC3: Parts Arrived session-start notification
AC5: Non-blocking missing-part informational prompt
Issue #82: Autosave/manual-save confirmation and save-failure notifications (AC2, AC3)

Run with:
    pytest tests/
"""

import pytest
from src.ui.notification_service import (
    NotificationService,
    AUTOSAVE_CONFIRMED,
    MANUAL_SAVE_CONFIRMED,
    SAVE_FAILED,
)
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


# ─────────────────────────────────────────────────────────────────────────────
# Issue #82: Autosave / Manual Save / Save Failed notifications (AC2, AC3)
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildAutosaveNotification:
    """AC2: autosave notification — Issue #82."""

    service = NotificationService()

    def test_returns_autosave_confirmed_type(self):
        n = self.service.build_autosave_notification("teardown")
        assert n["type"] == AUTOSAVE_CONFIRMED

    def test_title_is_auto_saved(self):
        n = self.service.build_autosave_notification("cleaning")
        assert "Auto-saved" in n["title"]

    def test_message_mentions_stage(self):
        n = self.service.build_autosave_notification("reassembly")
        assert "Reassembly" in n["message"] or "reassembly" in n["message"]

    def test_is_non_blocking(self):
        """AC2: notification must not interrupt gameplay."""
        n = self.service.build_autosave_notification("sourcing")
        assert n["blocking"] is False

    def test_display_duration_2_to_3_seconds(self):
        """AC2: persists 2–3 seconds (encoded as 2000–3000 ms)."""
        n = self.service.build_autosave_notification("teardown")
        assert 2000 <= n["display_duration_ms"] <= 3000

    def test_all_four_checkpoint_stages_produce_notifications(self):
        for stage in ("teardown", "cleaning", "sourcing", "reassembly"):
            n = self.service.build_autosave_notification(stage)
            assert n["type"] == AUTOSAVE_CONFIRMED
            assert n["stage"] == stage


class TestBuildManualSaveNotification:
    """AC2: manual save notification — Issue #82."""

    service = NotificationService()

    def test_returns_manual_save_confirmed_type(self):
        n = self.service.build_manual_save_notification()
        assert n["type"] == MANUAL_SAVE_CONFIRMED

    def test_title_is_saved(self):
        n = self.service.build_manual_save_notification()
        assert "Saved" in n["title"]

    def test_is_non_blocking(self):
        n = self.service.build_manual_save_notification()
        assert n["blocking"] is False

    def test_display_duration_2_to_3_seconds(self):
        n = self.service.build_manual_save_notification()
        assert 2000 <= n["display_duration_ms"] <= 3000

    def test_distinct_from_autosave_notification(self):
        """AC2: manual save and autosave notifications have different types."""
        manual = self.service.build_manual_save_notification()
        auto = self.service.build_autosave_notification("teardown")
        assert manual["type"] != auto["type"]


class TestBuildSaveFailedNotification:
    """AC3: save failure notification — Issue #82."""

    service = NotificationService()

    def test_returns_save_failed_type(self):
        n = self.service.build_save_failed_notification("disk full")
        assert n["type"] == SAVE_FAILED

    def test_title_indicates_failure(self):
        n = self.service.build_save_failed_notification("")
        assert "fail" in n["title"].lower() or "error" in n["title"].lower()

    def test_message_is_actionable(self):
        """AC3: error notification must be actionable."""
        n = self.service.build_save_failed_notification("Check available disk space")
        assert n["actionable"] is True
        assert "Check available disk space" in n["message"] or \
               "Check available disk space" in n["error_detail"]

    def test_error_detail_preserved(self):
        n = self.service.build_save_failed_notification("Cloud write error")
        assert n["error_detail"] == "Cloud write error"

    def test_is_non_blocking(self):
        """AC3: error notification does not block gameplay."""
        n = self.service.build_save_failed_notification()
        assert n["blocking"] is False

    def test_display_duration_at_least_5_seconds(self):
        """AC3: must surface within 5 s of failure; allow player time to read."""
        n = self.service.build_save_failed_notification()
        assert n["display_duration_ms"] >= 5000

    def test_works_with_no_error_message(self):
        """build_save_failed_notification should accept no argument."""
        n = self.service.build_save_failed_notification()
        assert n["type"] == SAVE_FAILED
        assert "Save failed" in n["message"]

