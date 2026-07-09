"""
Tests for SaveSystem
====================
Full session boundary lifecycle, save/load integrity, and backward compatibility.

Run with:
    pytest tests/
"""

import pytest
from src.save.save_system import SaveSystem
from src.orders.order_status import OrderStatus


class TestSaveSystem:
    save_system = SaveSystem()

    def make_part(self, **overrides):
        params = dict(
            part_id="part-mainspring",
            part_name="Mainspring",
            job_id="job-seiko",
            supplier_tier="STANDARD",
            cost=10.0,
        )
        params.update(overrides)
        return params

    # ── Scenario 1: full between-session flow ─────────────────────────────────

    def test_scenario1_full_between_session_flow(self):
        """Scenario 1: order placed → save → reload → part Arrived."""
        # Session 1: place order and save
        q1, _, save1 = self.save_system.load_session(None)
        q1.place_order(**self.make_part())
        saved_after_order = self.save_system.save_session(q1, save1)

        # Session 2: reload — resolve_arrivals fires → part arrives
        q2, arrived, _ = self.save_system.load_session(saved_after_order)

        assert len(arrived) == 1
        assert arrived[0].part_name == "Mainspring"
        assert arrived[0].status == OrderStatus.ARRIVED
        assert q2.is_part_arrived("job-seiko", "part-mainspring")

    # ── New save / pre-feature saves ──────────────────────────────────────────

    def test_load_session_on_new_save_initialises_empty_queue(self):
        queue, arrived, _ = self.save_system.load_session(None)
        assert arrived == []
        assert queue.get_all_orders() == []

    def test_load_session_on_pre_feature_save_no_order_queue_node(self):
        """Backward compat: save file exists but has no order_queue key."""
        queue, arrived, _ = self.save_system.load_session({"player_name": "Alice"})
        assert arrived == []
        assert queue.get_all_orders() == []

    # ── Scenario 8: crash recovery ────────────────────────────────────────────

    def test_scenario8_order_survives_crash_recovery(self):
        """Scenario 8: order persisted at placement time survives abnormal exit."""
        q1, _, s1 = self.save_system.load_session(None)
        q1.place_order(**self.make_part())
        # Atomic write immediately after placement
        saved_after_placement = self.save_system.save_session(q1, s1)

        # Simulate crash: discard q1, reload from persisted data
        q2, arrived, _ = self.save_system.load_session(saved_after_placement)
        assert len(arrived) == 1
        assert q2.is_part_arrived("job-seiko", "part-mainspring")

    # ── Save data integrity ───────────────────────────────────────────────────

    def test_save_session_preserves_other_save_data_fields(self):
        queue, _, save_data = self.save_system.load_session({"gold": 500, "player_level": 3})
        saved = self.save_system.save_session(queue, save_data)
        assert saved["gold"] == 500
        assert saved["player_level"] == 3
        assert "order_queue" in saved

    def test_scenario6_no_spurious_notification_on_reload_with_no_orders(self):
        """Scenario 6: player saves with no pending orders → no notification on reload."""
        queue, _, save_data = self.save_system.load_session(None)
        saved = self.save_system.save_session(queue, save_data)
        _, arrived_next, _ = self.save_system.load_session(saved)
        assert arrived_next == []
