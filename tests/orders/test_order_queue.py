"""
Tests for OrderQueue – core order lifecycle state machine
=========================================================
Covers all 5 acceptance criteria and all 10 test scenarios from issue #24.

Run with:
    pytest tests/
"""

import pytest
from src.orders.order_queue import OrderQueue, InsufficientFundsError
from src.orders.order_status import OrderStatus


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_part(**overrides):
    params = dict(
        part_id="part-mainspring-001",
        part_name="Mainspring",
        job_id="job-seiko-5",
        supplier_tier="STANDARD",
        cost=12.5,
    )
    params.update(overrides)
    return params


# ─── place_order ──────────────────────────────────────────────────────────────

class TestPlaceOrder:
    def test_creates_in_transit_order_with_correct_fields(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part())
        assert order.status == OrderStatus.IN_TRANSIT
        assert order.part_id == "part-mainspring-001"
        assert order.part_name == "Mainspring"
        assert order.job_id == "job-seiko-5"
        assert order.supplier_tier == "STANDARD"
        assert order.cost == 12.5
        assert order.id  # truthy UUID

    def test_sets_estimated_arrival_session(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part(supplier_tier="STANDARD"))
        # session_boundary_count starts at 0; STANDARD.sessions_to_arrive = 1
        assert order.estimated_arrival_session == 1

    def test_raises_on_unknown_supplier_tier(self):
        queue = OrderQueue()
        with pytest.raises(ValueError, match="Unknown supplier tier"):
            queue.place_order(**make_part(supplier_tier="ULTRA"))

    def test_raises_on_negative_cost(self):
        queue = OrderQueue()
        with pytest.raises(ValueError, match="non-negative"):
            queue.place_order(**make_part(cost=-5))

    def test_raises_when_required_fields_missing(self):
        queue = OrderQueue()
        with pytest.raises((ValueError, TypeError)):
            queue.place_order(supplier_tier="STANDARD", cost=10)  # missing part_id etc.


# ─── resolve_arrivals – AC1 ───────────────────────────────────────────────────

class TestResolveArrivals:
    """AC1: Between-session resolution."""

    def test_scenario1_order_arrives_next_session(self):
        """Scenario 1: order placed → save/quit → relaunch → part Arrived."""
        queue = OrderQueue()
        order = queue.place_order(**make_part())
        assert order.status == OrderStatus.IN_TRANSIT

        arrived = queue.resolve_arrivals()

        assert len(arrived) == 1
        assert arrived[0].id == order.id
        assert arrived[0].status == OrderStatus.ARRIVED
        assert queue.is_part_arrived("job-seiko-5", "part-mainspring-001")

    def test_order_placed_after_boundary_resolves_on_next_boundary(self):
        queue = OrderQueue()
        queue.resolve_arrivals()          # boundary 1 — count now 1
        order = queue.place_order(**make_part())  # estimated_arrival = 2
        assert order.estimated_arrival_session == 2

        arrived = queue.resolve_arrivals()  # boundary 2
        assert len(arrived) == 1
        assert arrived[0].id == order.id

    def test_scenario6_no_orders_returns_empty_list(self):
        """Scenario 6: no pending orders → no spurious arrival."""
        queue = OrderQueue()
        arrived = queue.resolve_arrivals()
        assert arrived == []

    def test_does_not_double_resolve_arrived_order(self):
        queue = OrderQueue()
        queue.place_order(**make_part())
        queue.resolve_arrivals()           # arrives here
        arrived_again = queue.resolve_arrivals()  # next session
        assert arrived_again == []

    def test_sets_arrived_this_session_flag(self):
        queue = OrderQueue()
        queue.place_order(**make_part())
        queue.resolve_arrivals()
        notification_orders = queue.get_arrived_this_session()
        assert len(notification_orders) == 1
        assert notification_orders[0].arrived_this_session is True

    def test_clears_arrived_this_session_from_previous_session(self):
        queue = OrderQueue()
        queue.place_order(**make_part(part_id="p1"))
        queue.resolve_arrivals()  # p1 arrives (flag set)

        queue.place_order(**make_part(part_id="p2"))
        queue.resolve_arrivals()  # p2 arrives; p1's flag should be cleared

        arrived = queue.get_arrived_this_session()
        part_ids = [o.part_id for o in arrived]
        assert "p2" in part_ids
        assert "p1" not in part_ids


# ─── cancel_order – Scenario 4 ────────────────────────────────────────────────

class TestCancelOrder:
    """Scenario 4: order cancellation with full refund."""

    def test_cancels_in_transit_order_and_returns_refund(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part(cost=20))
        result = queue.cancel_order(order.id)
        assert result["refund_amount"] == 20
        assert result["order"].status == OrderStatus.CANCELLED

    def test_cancelled_order_removed_from_in_transit(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part())
        queue.cancel_order(order.id)
        assert queue.get_all_in_transit() == []

    def test_raises_when_order_not_found(self):
        queue = OrderQueue()
        with pytest.raises(ValueError, match="not found"):
            queue.cancel_order("nonexistent-id")

    def test_raises_when_order_already_arrived(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part())
        queue.resolve_arrivals()
        with pytest.raises(ValueError, match="Cannot cancel"):
            queue.cancel_order(order.id)


# ─── expedite_order – AC4 ─────────────────────────────────────────────────────

class TestExpediteOrder:
    """AC4: expedite option within session."""

    def test_scenario2_expedites_after_minimum_playtime(self):
        """Scenario 2: happy-path expedite within current session."""
        queue = OrderQueue()
        order = queue.place_order(**make_part(cost=10, supplier_tier="STANDARD"))
        # STANDARD: expedite_min_playtime_secs=600, multiplier=2.5
        result = queue.expedite_order(
            order.id,
            current_session_playtime_secs=700,
            player_balance=100,
        )
        assert result["expedite_cost"] == 25  # ceil(10 * 2.5)
        assert result["order"].status == OrderStatus.ARRIVED
        assert result["order"].expedited is True

    def test_premium_tier_lower_cost_shorter_gate(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part(cost=10, supplier_tier="PREMIUM"))
        # PREMIUM: expedite_min_playtime_secs=300, multiplier=1.5
        result = queue.expedite_order(
            order.id,
            current_session_playtime_secs=350,
            player_balance=100,
        )
        assert result["expedite_cost"] == 15  # ceil(10 * 1.5)
        assert result["order"].status == OrderStatus.ARRIVED

    def test_scenario7_insufficient_funds_error(self):
        """Scenario 7: expedite with insufficient funds → error with details."""
        queue = OrderQueue()
        order = queue.place_order(**make_part(cost=50, supplier_tier="STANDARD"))
        # expedite_cost = ceil(50 * 2.5) = 125; balance = 50

        with pytest.raises(InsufficientFundsError) as exc_info:
            queue.expedite_order(
                order.id,
                current_session_playtime_secs=700,
                player_balance=50,
            )

        err = exc_info.value
        assert err.expedite_cost == 125
        assert err.player_balance == 50
        assert err.shortfall == 75
        assert "Insufficient Funds" in str(err)
        assert "125" in str(err)
        assert "50" in str(err)

    def test_raises_when_playtime_threshold_not_met(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part(supplier_tier="STANDARD"))
        with pytest.raises(ValueError, match="600s"):
            queue.expedite_order(
                order.id,
                current_session_playtime_secs=100,  # < 600
                player_balance=999,
            )

    def test_raises_when_order_already_arrived(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part())
        queue.resolve_arrivals()
        with pytest.raises(ValueError, match="Cannot expedite"):
            queue.expedite_order(
                order.id,
                current_session_playtime_secs=999,
                player_balance=999,
            )


# ─── Dashboard / multi-job – AC2, Scenario 5 ─────────────────────────────────

class TestDashboardQueries:
    """AC2 and Scenario 5: multiple in-flight orders across multiple jobs."""

    def test_scenario5_tracks_orders_across_multiple_jobs(self):
        """Scenario 5: 3 orders across 2 jobs, correctly attributed."""
        queue = OrderQueue()
        queue.place_order(**make_part(part_id="p1", part_name="Crown", job_id="job-omega"))
        queue.place_order(**make_part(part_id="p2", part_name="Balance Wheel", job_id="job-omega"))
        queue.place_order(**make_part(part_id="p3", part_name="Mainspring", job_id="job-seiko"))

        assert len(queue.get_all_in_transit()) == 3

        omega = queue.get_orders_for_job("job-omega")
        seiko = queue.get_orders_for_job("job-seiko")

        assert len(omega) == 2
        assert len(seiko) == 1
        assert seiko[0].part_id == "p3"

    def test_get_all_in_transit_excludes_arrived_and_cancelled(self):
        queue = OrderQueue()
        o1 = queue.place_order(**make_part(part_id="p1"))
        queue.place_order(**make_part(part_id="p2"))
        queue.place_order(**make_part(part_id="p3"))

        queue.cancel_order(o1.id)
        queue.resolve_arrivals()  # p2 and p3 arrive

        assert queue.get_all_in_transit() == []


# ─── Persistence – Scenario 8 ─────────────────────────────────────────────────

class TestPersistence:
    """Scenario 8: save/load integrity after crash recovery."""

    def test_serialise_deserialise_roundtrip(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part())
        save_data = queue.to_save_data()

        reloaded = OrderQueue(save_data)
        orders = reloaded.get_all_orders()
        assert len(orders) == 1
        assert orders[0].id == order.id
        assert orders[0].status == OrderStatus.IN_TRANSIT
        assert orders[0].part_id == order.part_id
        assert orders[0].cost == order.cost

    def test_scenario8_order_recovered_after_crash(self):
        """Scenario 8: order placed before crash is intact after reload."""
        queue = OrderQueue()
        queue.place_order(**make_part())
        save_data = queue.to_save_data()  # atomic write at placement

        # "Crash": throw away original queue, reload from save
        recovered = OrderQueue(save_data)
        recovered.resolve_arrivals()
        assert recovered.is_part_arrived("job-seiko-5", "part-mainspring-001")

    def test_gracefully_handles_null_save_data(self):
        queue = OrderQueue(None)
        assert queue.get_all_orders() == []

    def test_gracefully_handles_save_data_without_order_queue_node(self):
        queue = OrderQueue({"some_other_field": "value"})
        assert queue.get_all_orders() == []

    def test_session_boundary_count_preserved_across_save_load(self):
        queue = OrderQueue()
        queue.resolve_arrivals()  # count → 1
        queue.resolve_arrivals()  # count → 2

        save_data = queue.to_save_data()
        assert save_data["session_boundary_count"] == 2

        reloaded = OrderQueue(save_data)
        order = reloaded.place_order(**make_part())
        # count is 2; STANDARD.sessions_to_arrive = 1 → arrives at session 3
        assert order.estimated_arrival_session == 3


# ─── Scenario 9 ───────────────────────────────────────────────────────────────

class TestArrivesForUnopenedJob:
    def test_scenario9_resolve_arrivals_fires_regardless_of_active_job(self):
        """Scenario 9: part resolves even when player opens a different job."""
        queue = OrderQueue()
        queue.place_order(**make_part(job_id="job-omega-background"))

        arrived = queue.resolve_arrivals()
        assert len(arrived) == 1
        assert arrived[0].job_id == "job-omega-background"


# ─── Scenario 10: supplier tier variance ──────────────────────────────────────

class TestSupplierTierVariance:
    def test_standard_tier_resolves_in_one_session_boundary(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part(supplier_tier="STANDARD"))
        assert order.estimated_arrival_session == 1
        arrived = queue.resolve_arrivals()
        assert arrived[0].status == OrderStatus.ARRIVED

    def test_premium_tier_also_resolves_in_one_session_boundary(self):
        queue = OrderQueue()
        order = queue.place_order(**make_part(supplier_tier="PREMIUM"))
        assert order.estimated_arrival_session == 1
        arrived = queue.resolve_arrivals()
        assert arrived[0].status == OrderStatus.ARRIVED

    def test_premium_has_lower_expedite_cost_than_standard(self):
        base_cost = 20
        standard_q = OrderQueue()
        premium_q = OrderQueue()

        so = standard_q.place_order(**make_part(cost=base_cost, supplier_tier="STANDARD"))
        po = premium_q.place_order(**make_part(cost=base_cost, supplier_tier="PREMIUM"))

        sr = standard_q.expedite_order(so.id, current_session_playtime_secs=700, player_balance=9999)
        pr = premium_q.expedite_order(po.id, current_session_playtime_secs=350, player_balance=9999)

        assert pr["expedite_cost"] < sr["expedite_cost"]
