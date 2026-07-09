"""
Tests for CatalogFilter — AC1 and AC5

AC1: When a player accesses the parts catalog from an active job with a diagnosed
     failed component, the catalog opens pre-filtered to show only parts matching
     that component's movement family and part type. A visible "Clear filter" control
     is present and returns the player to the full unfiltered catalog.

AC5: Search results are filterable by part type, movement family, and condition
     (New / Used-Good / Used-Fair). Applying or clearing a filter updates results
     without a full scene reload or screen transition.
"""

import pytest
from src.catalog.catalog_filter import CatalogFilter, ActiveJobContext
from src.catalog.data.part_compatibility import (
    PartType, MovementFamily, PartCondition, PARTS_CATALOG
)


# ---------------------------------------------------------------------------
# AC1 — Contextual Pre-Filter
# ---------------------------------------------------------------------------

class TestAC1ContextualPreFilter:
    """AC1: Catalog pre-filter when opened from active job."""

    def test_catalog_prefilters_to_movement_family_and_part_type_on_active_job_open(self):
        """AC1 — catalog opens pre-filtered to matching movement family and part type."""
        f = CatalogFilter()
        f.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))

        results = f.get_filtered_results()

        assert len(results) > 0
        for part in results:
            assert part.part_type == PartType.MAINSPRING
            assert part.movement_family in (MovementFamily.ETA_2824, None)

    def test_pre_filter_active_flag_set_after_open_from_active_job(self):
        """AC1 — isPreFilterActive is True after openFromActiveJob."""
        f = CatalogFilter()
        f.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        assert f.is_pre_filter_active is True

    def test_clear_filter_returns_full_unfiltered_catalog(self):
        """AC1 — clearFilter returns full unfiltered catalog."""
        f = CatalogFilter()
        f.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        filtered_count = len(f.get_filtered_results())
        f.clear_filter()
        full_count = len(f.get_filtered_results())

        assert full_count > filtered_count
        assert full_count == len(PARTS_CATALOG)

    def test_pre_filter_inactive_after_clear_filter(self):
        """AC1 — pre-filter flag is False after clearFilter."""
        f = CatalogFilter()
        f.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        f.clear_filter()
        assert f.is_pre_filter_active is False

    def test_filter_state_reflects_pre_filter_values(self):
        """AC1 — filterState holds the movement family and part type after openFromActiveJob."""
        f = CatalogFilter()
        f.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.AS_1950,
            failed_part_type=PartType.BALANCE_WHEEL,
        ))
        state = f.filter_state
        assert state.movement_family == MovementFamily.AS_1950
        assert state.part_type == PartType.BALANCE_WHEEL
        assert state.pre_filter_active is True

    def test_filter_state_fully_cleared_after_clear_filter(self):
        """AC1 — all filter fields are None and preFilterActive is False after clearFilter."""
        f = CatalogFilter()
        f.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        f.clear_filter()
        state = f.filter_state

        assert state.movement_family is None
        assert state.part_type is None
        assert state.condition is None
        assert state.name_query is None
        assert state.pre_filter_active is False

    def test_scenario_10_no_pre_filter_when_opened_from_workshop_hub(self):
        """AC1 (Scenario 10) — no pre-filter when opened without active job."""
        f = CatalogFilter()
        f.open_from_workshop_hub()

        results = f.get_filtered_results()

        assert len(results) == len(PARTS_CATALOG)
        assert f.is_pre_filter_active is False
        assert f.active_job_context is None

    def test_different_movement_families_produce_different_prefiltered_results(self):
        """AC1 — pre-filter adapts to the specific movement family of the active job."""
        f1 = CatalogFilter()
        f1.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))

        f2 = CatalogFilter()
        f2.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.AS_1950,
            failed_part_type=PartType.MAINSPRING,
        ))

        ids1 = {p.id for p in f1.get_filtered_results()}
        ids2 = {p.id for p in f2.get_filtered_results()}

        # Different movement families should yield at least some different parts
        assert ids1 != ids2


# ---------------------------------------------------------------------------
# AC5 — Filter Controls (no reload)
# ---------------------------------------------------------------------------

class TestAC5FilterControls:
    """AC5: Filterable by part type, movement family, condition; updates in-place."""

    def setup_method(self):
        self.f = CatalogFilter()
        self.f.open_from_workshop_hub()

    def test_part_type_filter_returns_only_matching_parts(self):
        """AC5 — filter by part type returns only that type."""
        self.f.set_part_type_filter(PartType.MAINSPRING)
        results = self.f.get_filtered_results()

        assert len(results) > 0
        assert all(p.part_type == PartType.MAINSPRING for p in results)

    def test_movement_family_filter_returns_matching_and_universal_parts(self):
        """AC5 — filter by movement family includes universal parts (movement_family=None)."""
        self.f.set_movement_family_filter(MovementFamily.MIYOTA_8215)
        results = self.f.get_filtered_results()

        assert len(results) > 0
        for p in results:
            assert p.movement_family in (MovementFamily.MIYOTA_8215, None)

    def test_condition_filter_new_returns_only_new_parts(self):
        """AC5 — condition filter New returns only new parts."""
        self.f.set_condition_filter(PartCondition.NEW)
        results = self.f.get_filtered_results()

        assert len(results) > 0
        assert all(p.condition == PartCondition.NEW for p in results)

    def test_condition_filter_used_good_returns_only_used_good(self):
        """AC5 — condition filter Used-Good returns only Used-Good parts."""
        self.f.set_condition_filter(PartCondition.USED_GOOD)
        results = self.f.get_filtered_results()

        assert len(results) > 0
        assert all(p.condition == PartCondition.USED_GOOD for p in results)

    def test_condition_filter_used_fair_returns_only_used_fair(self):
        """AC5 — condition filter Used-Fair returns only Used-Fair parts."""
        self.f.set_condition_filter(PartCondition.USED_FAIR)
        results = self.f.get_filtered_results()

        assert len(results) > 0
        assert all(p.condition == PartCondition.USED_FAIR for p in results)

    def test_switching_condition_filter_updates_results_in_place(self):
        """AC5 (Scenario 9) — switching condition filter updates results; same filter object (no reload)."""
        self.f.set_condition_filter(PartCondition.NEW)
        new_ids = {p.id for p in self.f.get_filtered_results()}

        self.f.set_condition_filter(PartCondition.USED_GOOD)
        used_good_ids = {p.id for p in self.f.get_filtered_results()}

        # Result sets changed on the same object — no new object needed (no reload)
        assert used_good_ids != new_ids
        assert all(
            p.condition == PartCondition.USED_GOOD
            for p in self.f.get_filtered_results()
        )

    def test_clearing_condition_filter_returns_to_unfiltered(self):
        """AC5 — clearing condition filter restores full unfiltered count."""
        self.f.set_condition_filter(PartCondition.NEW)
        filtered_count = len(self.f.get_filtered_results())

        self.f.set_condition_filter(None)
        unfiltered_count = len(self.f.get_filtered_results())

        assert unfiltered_count > filtered_count

    def test_scenario_8_partial_name_search_filters_results(self):
        """AC5 (Scenario 8) — partial name match filters results without reload."""
        self.f.set_name_query("mainspring")
        results = self.f.get_filtered_results()

        assert len(results) > 0
        assert all("mainspring" in p.name.lower() for p in results)

    def test_scenario_8_name_search_is_case_insensitive(self):
        """AC5 (Scenario 8) — name search is case-insensitive."""
        self.f.set_name_query("MAINSPRING")
        upper_ids = {p.id for p in self.f.get_filtered_results()}

        self.f.set_name_query("mainspring")
        lower_ids = {p.id for p in self.f.get_filtered_results()}

        assert upper_ids == lower_ids

    def test_clearing_name_query_restores_full_unfiltered_count(self):
        """AC5 — clearing name query returns to full unfiltered count."""
        self.f.set_name_query("mainspring")
        filtered = len(self.f.get_filtered_results())

        self.f.set_name_query(None)
        unfiltered = len(self.f.get_filtered_results())

        assert unfiltered > filtered

    def test_combined_part_type_and_movement_family_filters(self):
        """AC5 — combined filters apply together (AND logic)."""
        self.f.set_part_type_filter(PartType.MAINSPRING)
        self.f.set_movement_family_filter(MovementFamily.ETA_2824)
        results = self.f.get_filtered_results()

        assert len(results) > 0
        for p in results:
            assert p.part_type == PartType.MAINSPRING
            assert p.movement_family in (MovementFamily.ETA_2824, None)
