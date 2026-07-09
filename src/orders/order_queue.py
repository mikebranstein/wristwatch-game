"""
OrderQueue – core async order lifecycle state machine
=====================================================

Public API
----------
place_order(...)          Create a new order (→ In-Transit). Atomic: safe to persist immediately.
cancel_order(order_id)    Cancel an In-Transit order before the shipment window closes.
resolve_arrivals()        Session-start hook: increments session boundary counter and
                          transitions qualifying In-Transit orders → Arrived.
expedite_order(...)       Resolve an In-Transit order within the current session (with
                          playtime gate and cost check).
get_orders_for_job(...)   All orders attributed to a specific job.
get_all_in_transit()      All currently In-Transit orders (for dashboard).
is_part_arrived(...)      Whether a specific part has arrived for a given job.
get_arrived_this_session()Orders that transitioned to Arrived in the most-recent
                          resolve_arrivals() call (for the session-start notification).
to_save_data()            Serialise to a JSON-safe dict for save-file persistence.

Null-safe: constructing an OrderQueue with None (or a dict lacking an 'orders' key)
produces a valid empty queue — enabling graceful backward compat for pre-feature saves.
"""

from __future__ import annotations
import math
import time
from typing import Optional

from src.orders.order import Order
from src.orders.order_status import OrderStatus
from src.config.supplier_tiers import SUPPLIER_TIERS


class InsufficientFundsError(Exception):
    """Raised when the player cannot afford an expedite."""

    def __init__(self, expedite_cost: float, player_balance: float) -> None:
        self.expedite_cost = expedite_cost
        self.player_balance = player_balance
        self.shortfall = expedite_cost - player_balance
        super().__init__(
            f"Insufficient Funds: expedite costs {expedite_cost} but player balance is "
            f"{player_balance} (shortfall: {self.shortfall})."
        )


class OrderQueue:
    def __init__(self, saved_state: Optional[dict] = None) -> None:
        # Null-safe: handle pre-feature saves gracefully.
        if saved_state and isinstance(saved_state.get("orders"), list):
            self._orders: list[Order] = [
                Order.from_dict(o) for o in saved_state["orders"]
            ]
            self._session_boundary_count: int = saved_state.get("session_boundary_count", 0)
        else:
            self._orders = []
            self._session_boundary_count = 0

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_all_orders(self) -> list[Order]:
        """Return a snapshot of every order."""
        return list(self._orders)

    def get_all_in_transit(self) -> list[Order]:
        """All In-Transit orders (used by Order Status Dashboard)."""
        return [o for o in self._orders if o.status == OrderStatus.IN_TRANSIT]

    def get_orders_for_job(self, job_id: str) -> list[Order]:
        """All orders attributed to a specific job."""
        return [o for o in self._orders if o.job_id == job_id]

    def is_part_arrived(self, job_id: str, part_id: str) -> bool:
        """Check whether a specific part has arrived for a given job."""
        return any(
            o.job_id == job_id and o.part_id == part_id and o.status == OrderStatus.ARRIVED
            for o in self._orders
        )

    def get_arrived_this_session(self) -> list[Order]:
        """Orders that became Arrived in the most-recent resolve_arrivals() call."""
        return [o for o in self._orders if o.arrived_this_session]

    def get_order(self, order_id: str) -> Optional[Order]:
        """Find a single order by ID."""
        return next((o for o in self._orders if o.id == order_id), None)

    # ── Write ─────────────────────────────────────────────────────────────────

    def place_order(
        self,
        *,
        part_id: str,
        part_name: str,
        job_id: str,
        supplier_tier: str,
        cost: float,
        placed_at: Optional[float] = None,
    ) -> Order:
        """
        Place a new part order.  Immediately transitions to In-Transit.

        Atomic-write semantics: callers should persist to_save_data() immediately
        after this call to guarantee crash recovery (Scenario 8).
        """
        if supplier_tier not in SUPPLIER_TIERS:
            raise ValueError(f"Unknown supplier tier: {supplier_tier!r}")
        if cost < 0:
            raise ValueError("Order cost must be a non-negative number")
        if not part_id or not part_name or not job_id:
            raise ValueError("part_id, part_name, and job_id are required")

        tier_config = SUPPLIER_TIERS[supplier_tier]
        order = Order.create(
            part_id=part_id,
            part_name=part_name,
            job_id=job_id,
            supplier_tier=supplier_tier,
            tier_config=tier_config,
            cost=cost,
            session_boundary_count=self._session_boundary_count,
            placed_at=placed_at,
        )
        self._orders.append(order)
        return order

    def cancel_order(self, order_id: str) -> dict:
        """
        Cancel an In-Transit order before the shipment window closes.
        Returns {'refund_amount': float, 'order': Order}.
        """
        order = self.get_order(order_id)
        if order is None:
            raise ValueError(f"Order not found: {order_id!r}")
        if order.status != OrderStatus.IN_TRANSIT:
            raise ValueError(
                f"Cannot cancel order in status {order.status.value!r}. "
                "Only In-Transit orders can be cancelled."
            )
        order.status = OrderStatus.CANCELLED
        return {"refund_amount": order.cost, "order": order}

    def resolve_arrivals(self) -> list[Order]:
        """
        Session-start resolution: advance In-Transit orders past their session-boundary
        threshold.  Must be called once when the player loads a saved game.

        Increments the internal session boundary counter, clears previous arrival flags,
        then marks qualifying In-Transit orders as Arrived.

        Returns the list of newly Arrived orders.
        """
        self._session_boundary_count += 1

        # Clear previous session's arrival flags
        for o in self._orders:
            o.arrived_this_session = False

        newly_arrived: list[Order] = []
        for o in self._orders:
            if (
                o.status == OrderStatus.IN_TRANSIT
                and self._session_boundary_count >= o.estimated_arrival_session
            ):
                o.status = OrderStatus.ARRIVED
                o.arrived_at = time.time()
                o.arrived_this_session = True
                newly_arrived.append(o)

        return newly_arrived

    def expedite_order(
        self,
        order_id: str,
        *,
        current_session_playtime_secs: int,
        player_balance: float,
    ) -> dict:
        """
        Resolve an In-Transit order within the current session.

        Raises:
            ValueError                if order not found or not In-Transit
            ValueError                if playtime threshold not met
            InsufficientFundsError    if player cannot afford the expedite
        Returns {'expedite_cost': float, 'order': Order}.
        """
        order = self.get_order(order_id)
        if order is None:
            raise ValueError(f"Order not found: {order_id!r}")
        if order.status != OrderStatus.IN_TRANSIT:
            raise ValueError(
                f"Cannot expedite order in status {order.status.value!r}. "
                "Only In-Transit orders can be expedited."
            )

        tier = SUPPLIER_TIERS[order.supplier_tier]
        expedite_cost = math.ceil(order.cost * tier.expedite_cost_multiplier)

        if current_session_playtime_secs < tier.expedite_min_playtime_secs:
            raise ValueError(
                f"Expedite requires at least {tier.expedite_min_playtime_secs}s of in-session "
                f"playtime. Current: {current_session_playtime_secs}s."
            )

        if player_balance < expedite_cost:
            raise InsufficientFundsError(expedite_cost, player_balance)

        order.status = OrderStatus.ARRIVED
        order.arrived_at = time.time()
        order.arrived_this_session = True
        order.expedited = True

        return {"expedite_cost": expedite_cost, "order": order}

    # ── Persistence ───────────────────────────────────────────────────────────

    def to_save_data(self) -> dict:
        """Serialise queue state to a JSON-safe dict for save-file persistence."""
        return {
            "session_boundary_count": self._session_boundary_count,
            "orders": [o.to_dict() for o in self._orders],
        }
