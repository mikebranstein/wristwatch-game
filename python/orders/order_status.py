"""
Order Status Enum
=================
Every state in the async part-order lifecycle.

State machine:
    PENDING    → IN_TRANSIT  (order placed; shipment window open for cancellation)
    IN_TRANSIT → ARRIVED     (session boundary passed; part ready for installation)
    IN_TRANSIT → CANCELLED   (player cancelled before shipment window closed)
    IN_TRANSIT → ARRIVED     (expedite: resolved within the current session)
"""

from enum import Enum


class OrderStatus(str, Enum):
    PENDING = "Pending"
    IN_TRANSIT = "In-Transit"
    ARRIVED = "Arrived"
    CANCELLED = "Cancelled"
