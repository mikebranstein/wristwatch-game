"""
CatalogFilter — search and filter logic for the Parts Catalog (AC1, AC5)
=========================================================================

Responsibilities:
  - Pre-filter the catalog when opened from an active job with a
    diagnosed failed component (AC1).
  - Provide a clear_filter() method returning to the full catalog (AC1).
  - Filter by part type, movement family, and condition (AC5).
  - Filter updates are applied in-place (no full scene reload) (AC5).
  - Partial-name search (Scenario 8).

Design decision: the active-job context (movement_family + failed_part_type)
is passed to the catalog at open time. CatalogFilter accepts this context and
applies an initial pre-filter. Players can clear it at any time.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from catalog.data.part_compatibility import Part, PARTS_CATALOG, MovementFamily, PartType, PartCondition


@dataclass
class ActiveJobContext:
    movement_family: str
    failed_part_type: str
    damage_state: Optional[str] = None  # None = standard wear; Phase 1 values: 'water_ingress', 'oxidation', 'crystal_crazing'


@dataclass
class FilterState:
    name_query: Optional[str] = None
    part_type: Optional[str] = None
    movement_family: Optional[str] = None
    condition: Optional[str] = None
    pre_filter_active: bool = False


class CatalogFilter:
    """
    Applies search and filter logic to the parts catalog.
    All filtering operations update results in-place (no scene reload, AC5).
    """

    def __init__(self, catalog: Optional[list[Part]] = None) -> None:
        self._catalog = catalog if catalog is not None else PARTS_CATALOG
        self._active_job_context: Optional[ActiveJobContext] = None
        self._filter_state = FilterState()

    # -------------------------------------------------------------------------
    # Context setup
    # -------------------------------------------------------------------------

    def open_from_active_job(self, job_context: ActiveJobContext) -> None:
        """
        Open catalog from an active job with a diagnosed failed component.
        Applies contextual pre-filter (AC1): narrows to parts matching the
        failed component's movement family and part type.
        """
        self._active_job_context = job_context
        self._filter_state = FilterState(
            part_type=job_context.failed_part_type,
            movement_family=job_context.movement_family,
            pre_filter_active=True,
        )

    def open_from_workshop_hub(self) -> None:
        """
        Open catalog from the workshop hub (no active job).
        No pre-filter; full catalog shown (Scenario 10).
        """
        self._active_job_context = None
        self._filter_state = FilterState()

    # -------------------------------------------------------------------------
    # Filter controls
    # -------------------------------------------------------------------------

    def clear_filter(self) -> None:
        """
        Clear the contextual pre-filter and return to full unfiltered catalog (AC1).
        All manually set filters are also cleared.
        """
        self._filter_state = FilterState()

    def set_name_query(self, query: Optional[str]) -> None:
        """Set a partial-name search query (Scenario 8). Results update immediately."""
        q = query.strip() if query else None
        self._filter_state.name_query = q if q else None

    def set_part_type_filter(self, part_type: Optional[str]) -> None:
        """Set the part type filter (AC5)."""
        self._filter_state.part_type = part_type or None

    def set_movement_family_filter(self, movement_family: Optional[str]) -> None:
        """Set the movement family filter (AC5)."""
        self._filter_state.movement_family = movement_family or None

    def set_condition_filter(self, condition: Optional[str]) -> None:
        """Set the condition filter: New / Used-Good / Used-Fair (AC5)."""
        self._filter_state.condition = condition or None

    # -------------------------------------------------------------------------
    # Query
    # -------------------------------------------------------------------------

    def get_filtered_results(self) -> list[Part]:
        """
        Returns filtered results immediately (no reload required — AC5).
        Applies all active filters in combination.
        """
        results = list(self._catalog)
        results = self._apply_name_filter(results, self._filter_state.name_query)
        results = self._apply_part_type_filter(results, self._filter_state.part_type)
        results = self._apply_movement_family_filter(results, self._filter_state.movement_family)
        results = self._apply_condition_filter(results, self._filter_state.condition)
        return results

    # -------------------------------------------------------------------------
    # Private filter-step helpers
    # -------------------------------------------------------------------------

    def _apply_name_filter(self, results: list[Part], name_query: str | None) -> list[Part]:
        """Return parts whose name contains name_query (case-insensitive); pass through if None."""
        if not name_query:
            return results
        lc = name_query.lower()
        return [p for p in results if lc in p.name.lower()]

    def _apply_part_type_filter(self, results: list[Part], part_type: str | None) -> list[Part]:
        """Return parts matching part_type exactly; pass through if None."""
        if not part_type:
            return results
        return [p for p in results if p.part_type == part_type]

    def _apply_movement_family_filter(self, results: list[Part], movement_family: str | None) -> list[Part]:
        """Return parts matching movement_family or universal parts (movement_family=None); pass through if None."""
        if not movement_family:
            return results
        return [
            p for p in results
            if p.movement_family == movement_family or p.movement_family is None
        ]

    def _apply_condition_filter(self, results: list[Part], condition: str | None) -> list[Part]:
        """Return parts matching condition exactly; pass through if None."""
        if not condition:
            return results
        return [p for p in results if p.condition == condition]

    @property
    def filter_state(self) -> FilterState:
        """Returns a copy of the current filter state."""
        return FilterState(
            name_query=self._filter_state.name_query,
            part_type=self._filter_state.part_type,
            movement_family=self._filter_state.movement_family,
            condition=self._filter_state.condition,
            pre_filter_active=self._filter_state.pre_filter_active,
        )

    @property
    def active_job_context(self) -> Optional[ActiveJobContext]:
        """Returns the active job context, or None."""
        return self._active_job_context

    @property
    def is_pre_filter_active(self) -> bool:
        return self._filter_state.pre_filter_active
