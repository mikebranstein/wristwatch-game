"""
Integration tests for PartsCatalog — AC1 through AC5

These tests exercise PartsCatalog as the top-level integration point,
covering all five acceptance criteria and all 10 test scenarios.
"""

import pytest
from src.catalog.parts_catalog import PartsCatalog
from src.catalog.catalog_filter import ActiveJobContext
from src.catalog.data.order_history import OrderHistory
from src.catalog.compatibility_badge import (
    BADGE_COMPATIBLE, BADGE_UNCERTAIN, BADGE_INCOMPATIBLE, BADGE_NONE,
)
from src.catalog.data.part_compatibility import (
    PartType, MovementFamily, PartCondition, PARTS_CATALOG, Part
)


def make_history(*orders):
    """Helper: create an OrderHistory from (part_id, part_name, quantity) tuples."""
    h = OrderHistory()
    for part_id, part_name, qty in orders:
        h.record_order(part_id, part_name, qty)
    return h


# ---------------------------------------------------------------------------
# AC1 — Contextual Pre-Filter
# ---------------------------------------------------------------------------

class TestAC1Integration:
    """AC1 integration: pre-filter from active job, clear-filter control."""

    def test_scenario1_prefilter_applied_on_active_job_open(self):
        """AC1 (Scenario 1) — opening from active job pre-filters to movement + part type."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))

        results = catalog.get_enriched_results()
        assert len(results) > 0
        for part in results:
            assert part.part_type == PartType.MAINSPRING
            assert part.movement_family in (MovementFamily.ETA_2824, None)

    def test_scenario1_pre_filter_active_flag_is_true(self):
        """AC1 (Scenario 1) — isPreFilterActive is True after active job open."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        assert catalog.is_pre_filter_active is True

    def test_scenario2_clear_filter_returns_full_catalog(self):
        """AC1 (Scenario 2) — clearFilter returns full unfiltered catalog."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        catalog.clear_filter()

        assert len(catalog.get_enriched_results()) == len(PARTS_CATALOG)
        assert catalog.is_pre_filter_active is False

    def test_scenario2_after_clear_player_can_filter_manually(self):
        """AC1 (Scenario 2) — after clearing, player can apply any manual filter."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        catalog.clear_filter()
        catalog.set_part_type_filter(PartType.PALLET_FORK)

        results = catalog.get_enriched_results()
        assert len(results) > 0
        assert all(p.part_type == PartType.PALLET_FORK for p in results)


# ---------------------------------------------------------------------------
# AC2 — Compatibility Badges
# ---------------------------------------------------------------------------

class TestAC2Integration:
    """AC2 integration: every result has a badge; deterministic badge logic."""

    def test_scenario3_compatible_part_shows_compatible_badge(self):
        """AC2 (Scenario 3) — compatible part displays ✓ Compatible badge."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))

        results = catalog.get_enriched_results()
        ms = next((p for p in results if p.id == "ms-eta2824-std"), None)

        assert ms is not None
        assert ms.badge is BADGE_COMPATIBLE
        assert ms.badge.symbol == "✓"

    def test_scenario4_incompatible_part_shows_incompatible_badge_and_is_not_filtered_out(self):
        """AC2 (Scenario 4) — incompatible part shows ✗ badge but is still visible (player agency).

        Player opens catalog from active ETA-2824 job, then clears the pre-filter (Scenario 2)
        to browse the full catalog. The active job context is preserved for badge evaluation,
        so the Miyota balance wheel (incompatible with ETA-2824) shows ✗ but is NOT removed
        from results — player agency is preserved (player may still order it).
        """
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.BALANCE_WHEEL,
        ))
        # Clear pre-filter: removes movement family filter and part type filter,
        # but active_job_context is preserved so badges still evaluate against ETA-2824.
        catalog.clear_filter()

        results = catalog.get_enriched_results()
        miyota_bw = next((p for p in results if p.id == "bw-miyota-std"), None)

        assert miyota_bw is not None, "Incompatible part should still appear in results after clear_filter"
        assert miyota_bw.badge is BADGE_INCOMPATIBLE
        assert miyota_bw.badge.symbol == "✗"

    def test_scenario5_unlisted_part_shows_uncertain_badge(self):
        """AC2 (Scenario 5) — part with no defined compatibility entry shows ~ Uncertain."""
        mystery_part = Part(
            id="mystery-part-999",
            name="Mystery Part",
            part_type=PartType.JEWEL,
            movement_family=None,
            condition=PartCondition.NEW,
            price=5.00,
            function_description=(
                "A precision jewel bearing that reduces friction at a pivot point. "
                "Synthetic rubies (corundum) are used because of their hardness and oil retention."
            ),
        )
        catalog = PartsCatalog(OrderHistory(), catalog=[mystery_part])
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.JEWEL,
        ))

        results = catalog.get_enriched_results()
        assert len(results) == 1
        assert results[0].badge is BADGE_UNCERTAIN

    def test_scenario10_no_badges_when_browsing_without_active_job(self):
        """AC2 (Scenario 10) — browsing without active job shows no badges (NONE)."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_workshop_hub()

        results = catalog.get_enriched_results()
        assert len(results) > 0
        assert all(p.badge is BADGE_NONE for p in results)

    def test_every_enriched_result_has_a_badge_field(self):
        """AC2 — all enriched results carry a badge field."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_active_job(ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        ))
        catalog.set_part_type_filter(None)  # show all

        results = catalog.get_enriched_results()
        for part in results:
            assert part.badge is not None
            assert hasattr(part.badge, "symbol")
            assert hasattr(part.badge, "label")


# ---------------------------------------------------------------------------
# AC3 — Plain-Language Descriptions
# ---------------------------------------------------------------------------

class TestAC3Integration:
    """AC3 integration: every result carries a non-empty function description."""

    def test_scenario6_every_result_has_non_empty_function_description(self):
        """AC3 (Scenario 6) — every enriched result has a non-empty functionDescription."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_workshop_hub()

        results = catalog.get_enriched_results()
        assert len(results) > 0
        for part in results:
            assert isinstance(part.function_description, str)
            assert len(part.function_description.strip()) > 0


# ---------------------------------------------------------------------------
# AC4 — Previously Ordered Section
# ---------------------------------------------------------------------------

class TestAC4Integration:
    """AC4 integration: Previously Ordered section + one-click reorder."""

    def test_scenario7_previously_ordered_section_shows_prior_orders(self):
        """AC4 (Scenario 7) — Previously Ordered section shows history."""
        history = make_history(
            ("ms-eta2824-std", "ETA 2824 Mainspring", 1),
            ("bw-eta2824-std", "ETA 2824 Balance Wheel", 1),
            ("pf-eta2824-std", "ETA 2824 Pallet Fork", 1),
        )
        catalog = PartsCatalog(history)
        catalog.open_from_workshop_hub()

        entries = catalog.get_previously_ordered_entries()
        assert len(entries) == 3

    def test_scenario7_reorder_prepopulates_order_form(self):
        """AC4 (Scenario 7) — one-click reorder pre-populates order form correctly."""
        history = make_history(
            ("ms-eta2824-std", "ETA 2824 Mainspring (Standard)", 2),
        )
        catalog = PartsCatalog(history)
        catalog.open_from_workshop_hub()

        payload = catalog.build_reorder_payload("ms-eta2824-std")

        assert payload is not None
        assert payload.part_id == "ms-eta2824-std"
        assert payload.part_name == "ETA 2824 Mainspring (Standard)"
        assert payload.quantity == 2
        assert payload.source == "previously-ordered"

    def test_record_order_updates_previously_ordered_section(self):
        """AC4 — recordOrder updates the Previously Ordered section."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_workshop_hub()

        assert len(catalog.get_previously_ordered_entries()) == 0

        catalog.record_order("ms-eta2824-std", "ETA 2824 Mainspring (Standard)", 1)

        entries = catalog.get_previously_ordered_entries()
        assert len(entries) == 1
        assert entries[0].part_id == "ms-eta2824-std"

    def test_previously_ordered_capped_at_10(self):
        """AC4 (Scenario 7) — Previously Ordered section shows at most 10 entries."""
        history = OrderHistory()
        for i in range(1, 13):
            history.record_order(f"part-{i}", f"Part {i}", 1)
        catalog = PartsCatalog(history)
        catalog.open_from_workshop_hub()

        assert len(catalog.get_previously_ordered_entries()) == 10


# ---------------------------------------------------------------------------
# AC5 — Filter Without Reload
# ---------------------------------------------------------------------------

class TestAC5Integration:
    """AC5 integration: filter updates without scene reload."""

    def test_scenario8_partial_name_search_filters_in_place(self):
        """AC5 (Scenario 8) — partial name search filters without reload."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_workshop_hub()

        catalog.set_name_query("balance")
        results = catalog.get_enriched_results()

        assert len(results) > 0
        assert all("balance" in p.name.lower() for p in results)

    def test_scenario9_new_condition_filter_shows_only_new_parts(self):
        """AC5 (Scenario 9) — condition filter New shows only new parts."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_workshop_hub()

        catalog.set_condition_filter(PartCondition.NEW)
        results = catalog.get_enriched_results()

        assert len(results) > 0
        assert all(p.condition == PartCondition.NEW for p in results)

    def test_scenario9_switching_condition_updates_results(self):
        """AC5 (Scenario 9) — switching condition filter updates results on same catalog object."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_workshop_hub()

        catalog.set_condition_filter(PartCondition.NEW)
        new_ids = {p.id for p in catalog.get_enriched_results()}

        catalog.set_condition_filter(PartCondition.USED_GOOD)
        used_good_results = catalog.get_enriched_results()

        assert len(used_good_results) > 0
        assert all(p.condition == PartCondition.USED_GOOD for p in used_good_results)
        used_good_ids = {p.id for p in used_good_results}
        assert used_good_ids != new_ids  # Results changed in-place

    def test_filter_state_accessible_after_applying_filters(self):
        """AC5 — filter state reflects applied filters."""
        catalog = PartsCatalog(OrderHistory())
        catalog.open_from_workshop_hub()

        catalog.set_condition_filter(PartCondition.NEW)
        catalog.set_part_type_filter(PartType.ESCAPE_WHEEL)

        state = catalog.filter_state
        assert state.condition == PartCondition.NEW
        assert state.part_type == PartType.ESCAPE_WHEEL
