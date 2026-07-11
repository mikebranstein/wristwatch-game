"""
PartsCatalog — main catalog component integrating all subsystems (AC1–AC5)
==========================================================================

Top-level class orchestrating:
  - CatalogFilter    (pre-filter, clear-filter, search, condition filter)
  - CompatibilityBadge (badge evaluation per part per active movement)
  - PreviouslyOrdered (order history section + reorder payload)

Usage::

    from catalog.parts_catalog import PartsCatalog
    from catalog.data.order_history import OrderHistory
    from catalog.catalog_filter import ActiveJobContext
    from catalog.data.part_compatibility import MovementFamily, PartType

    history = OrderHistory()
    catalog = PartsCatalog(history)

    # Open from active job (triggers AC1 pre-filter):
    catalog.open_from_active_job(ActiveJobContext(
        movement_family=MovementFamily.ETA_2824,
        failed_part_type=PartType.MAINSPRING,
    ))

    # Get enriched results (parts + badges):
    results = catalog.get_enriched_results()

    # Clear filter (return to full catalog):
    catalog.clear_filter()

    # Get Previously Ordered section:
    entries = catalog.get_previously_ordered_entries()

    # Reorder a part:
    payload = catalog.build_reorder_payload("ms-eta2824-std")
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from catalog.catalog_filter import CatalogFilter, ActiveJobContext, FilterState
from catalog.compatibility_badge import evaluate_badge, BadgeResult
from catalog.previously_ordered import PreviouslyOrdered, OrderFormPayload
from catalog.data.order_history import OrderHistory
from catalog.data.part_compatibility import Part, PARTS_CATALOG


@dataclass
class EnrichedPart:
    """A catalog part enriched with its compatibility badge (AC2)."""
    id: str
    name: str
    part_type: str
    movement_family: Optional[str]
    condition: str
    price: float
    function_description: str
    badge: BadgeResult


class PartsCatalog:
    """
    Top-level Parts Catalog — integrates filter, badge, and order history subsystems.
    Implements AC1 through AC5.
    """

    def __init__(
        self,
        order_history: OrderHistory,
        catalog: Optional[list[Part]] = None,
    ) -> None:
        self._catalog = catalog if catalog is not None else PARTS_CATALOG
        self._filter = CatalogFilter(self._catalog)
        self._previously_ordered = PreviouslyOrdered(order_history)
        self._order_history = order_history

    # -------------------------------------------------------------------------
    # Catalog open modes
    # -------------------------------------------------------------------------

    def open_from_active_job(self, job_context: ActiveJobContext) -> None:
        """Open catalog from an active job with a diagnosed failed component (AC1)."""
        self._filter.open_from_active_job(job_context)

    def open_from_workshop_hub(self) -> None:
        """Open catalog from workshop hub without active job (Scenario 10)."""
        self._filter.open_from_workshop_hub()

    # -------------------------------------------------------------------------
    # Filter controls (AC1, AC5)
    # -------------------------------------------------------------------------

    def clear_filter(self) -> None:
        """Clear pre-filter and return to full unfiltered catalog (AC1)."""
        self._filter.clear_filter()

    def set_name_query(self, query: Optional[str]) -> None:
        self._filter.set_name_query(query)

    def set_part_type_filter(self, part_type: Optional[str]) -> None:
        self._filter.set_part_type_filter(part_type)

    def set_movement_family_filter(self, movement_family: Optional[str]) -> None:
        self._filter.set_movement_family_filter(movement_family)

    def set_condition_filter(self, condition: Optional[str]) -> None:
        self._filter.set_condition_filter(condition)

    # -------------------------------------------------------------------------
    # Results (AC2, AC3, AC5)
    # -------------------------------------------------------------------------

    def get_enriched_results(self) -> list[EnrichedPart]:
        """
        Returns enriched search results: filtered parts with compatibility badges.
        Badge evaluation uses the active job's movement family (None = no badges).
        Results update in-place — no full scene reload (AC5).
        """
        movement_family = (
            self._filter.active_job_context.movement_family
            if self._filter.active_job_context
            else None
        )
        return [
            EnrichedPart(
                id=part.id,
                name=part.name,
                part_type=part.part_type,
                movement_family=part.movement_family,
                condition=part.condition,
                price=part.price,
                function_description=part.function_description,
                badge=evaluate_badge(part.id, movement_family),
            )
            for part in self._filter.get_filtered_results()
        ]

    @property
    def filter_state(self) -> FilterState:
        return self._filter.filter_state

    @property
    def is_pre_filter_active(self) -> bool:
        return self._filter.is_pre_filter_active

    @property
    def active_job_context(self) -> Optional[ActiveJobContext]:
        return self._filter.active_job_context

    # -------------------------------------------------------------------------
    # Previously Ordered section (AC4)
    # -------------------------------------------------------------------------

    def get_previously_ordered_entries(self):
        """Returns up to 10 previously ordered parts (AC4)."""
        return self._previously_ordered.get_entries()

    def build_reorder_payload(self, part_id: str) -> Optional[OrderFormPayload]:
        """Builds pre-populated order form payload for one-click reorder (AC4)."""
        return self._previously_ordered.build_reorder_payload(part_id)

    def record_order(self, part_id: str, part_name: str, quantity: int = 1) -> None:
        """Record that an order was placed (updates Previously Ordered history)."""
        self._order_history.record_order(part_id, part_name, quantity)
