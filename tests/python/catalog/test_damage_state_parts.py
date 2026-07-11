"""
Tests for Phase 1 damage-state parts — Issue #81.

Covers:
  - AC2 (Water Ingress): corrosion-cleaning-tool, gasket-universal,
    crystal-defogging-solution present in PARTS_CATALOG
  - AC3 (Oxidation/Tarnish): case-polish-compound, dial-restoration-kit present
  - AC4 (Crystal Crazing): crystal-mineral-universal, dial-enamel-repair-tool present
  - New PartType enum values: CRYSTAL, GASKET, CORROSION_CLEANING_TOOL,
    DIAL_ENAMEL_REPAIR_TOOL present
  - All Phase 1 parts are universal (movement_family=None)
  - ActiveJobContext accepts damage_state field (catalog_filter extension)
  - Existing PARTS_CATALOG entries unaffected (regression)
"""

import pytest
from catalog.data.part_compatibility import (
    PARTS_CATALOG,
    PartType,
    Part,
)
from catalog.catalog_filter import ActiveJobContext, CatalogFilter
from catalog.data.part_compatibility import MovementFamily


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_part(part_id: str) -> Part | None:
    return next((p for p in PARTS_CATALOG if p.id == part_id), None)


# ---------------------------------------------------------------------------
# New PartType enum values
# ---------------------------------------------------------------------------

class TestNewPartTypeEnumValues:
    def test_crystal_part_type_exists(self):
        assert PartType.CRYSTAL == "crystal"

    def test_gasket_part_type_exists(self):
        assert PartType.GASKET == "gasket"

    def test_corrosion_cleaning_tool_part_type_exists(self):
        assert PartType.CORROSION_CLEANING_TOOL == "corrosion-cleaning-tool"

    def test_dial_enamel_repair_tool_part_type_exists(self):
        assert PartType.DIAL_ENAMEL_REPAIR_TOOL == "dial-enamel-repair-tool"


# ---------------------------------------------------------------------------
# AC2 — Water Ingress parts
# ---------------------------------------------------------------------------

class TestWaterIngressParts:
    def test_corrosion_cleaning_tool_in_catalog(self):
        part = _find_part("corrosion-cleaning-tool")
        assert part is not None, "corrosion-cleaning-tool missing from PARTS_CATALOG"

    def test_corrosion_cleaning_tool_type(self):
        part = _find_part("corrosion-cleaning-tool")
        assert part.part_type == PartType.CORROSION_CLEANING_TOOL

    def test_corrosion_cleaning_tool_is_universal(self):
        part = _find_part("corrosion-cleaning-tool")
        assert part.movement_family is None, "Corrosion cleaning tool should be universal"

    def test_gasket_universal_in_catalog(self):
        part = _find_part("gasket-universal")
        assert part is not None, "gasket-universal missing from PARTS_CATALOG"

    def test_gasket_universal_type(self):
        part = _find_part("gasket-universal")
        assert part.part_type == PartType.GASKET

    def test_gasket_universal_is_universal(self):
        part = _find_part("gasket-universal")
        assert part.movement_family is None

    def test_crystal_defogging_solution_in_catalog(self):
        part = _find_part("crystal-defogging-solution")
        assert part is not None, "crystal-defogging-solution missing from PARTS_CATALOG"

    def test_crystal_defogging_solution_is_universal(self):
        part = _find_part("crystal-defogging-solution")
        assert part.movement_family is None

    def test_all_water_ingress_parts_have_descriptions(self):
        for pid in ["corrosion-cleaning-tool", "gasket-universal", "crystal-defogging-solution"]:
            part = _find_part(pid)
            assert part is not None
            assert len(part.function_description) > 0


# ---------------------------------------------------------------------------
# AC3 — Oxidation / Tarnish parts
# ---------------------------------------------------------------------------

class TestOxidationParts:
    def test_case_polish_compound_in_catalog(self):
        part = _find_part("case-polish-compound")
        assert part is not None, "case-polish-compound missing from PARTS_CATALOG"

    def test_case_polish_compound_is_universal(self):
        part = _find_part("case-polish-compound")
        assert part.movement_family is None

    def test_dial_restoration_kit_in_catalog(self):
        part = _find_part("dial-restoration-kit")
        assert part is not None, "dial-restoration-kit missing from PARTS_CATALOG"

    def test_dial_restoration_kit_is_universal(self):
        part = _find_part("dial-restoration-kit")
        assert part.movement_family is None

    def test_all_oxidation_parts_have_descriptions(self):
        for pid in ["case-polish-compound", "dial-restoration-kit"]:
            part = _find_part(pid)
            assert part is not None
            assert len(part.function_description) > 0


# ---------------------------------------------------------------------------
# AC4 — Crystal Crazing parts
# ---------------------------------------------------------------------------

class TestCrystalCrazingParts:
    def test_crystal_mineral_universal_in_catalog(self):
        part = _find_part("crystal-mineral-universal")
        assert part is not None, "crystal-mineral-universal missing from PARTS_CATALOG"

    def test_crystal_mineral_universal_type(self):
        part = _find_part("crystal-mineral-universal")
        assert part.part_type == PartType.CRYSTAL

    def test_crystal_mineral_universal_is_universal(self):
        part = _find_part("crystal-mineral-universal")
        assert part.movement_family is None

    def test_dial_enamel_repair_tool_in_catalog(self):
        part = _find_part("dial-enamel-repair-tool")
        assert part is not None, "dial-enamel-repair-tool missing from PARTS_CATALOG"

    def test_dial_enamel_repair_tool_type(self):
        part = _find_part("dial-enamel-repair-tool")
        assert part.part_type == PartType.DIAL_ENAMEL_REPAIR_TOOL

    def test_dial_enamel_repair_tool_is_universal(self):
        part = _find_part("dial-enamel-repair-tool")
        assert part.movement_family is None

    def test_all_crystal_crazing_parts_have_descriptions(self):
        for pid in ["crystal-mineral-universal", "dial-enamel-repair-tool"]:
            part = _find_part(pid)
            assert part is not None
            assert len(part.function_description) > 0


# ---------------------------------------------------------------------------
# ActiveJobContext — damage_state field (catalog_filter extension)
# ---------------------------------------------------------------------------

class TestActiveJobContextDamageState:
    def test_active_job_context_accepts_damage_state_field(self):
        """damage_state field added to ActiveJobContext for damage-state tool gating."""
        ctx = ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
            damage_state="water_ingress",
        )
        assert ctx.damage_state == "water_ingress"

    def test_active_job_context_damage_state_defaults_to_none(self):
        """Backward compatible: existing callers that don't pass damage_state get None."""
        ctx = ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
        )
        assert ctx.damage_state is None

    def test_catalog_filter_open_from_active_job_with_damage_state(self):
        """CatalogFilter accepts ActiveJobContext with damage_state without error."""
        ctx = ActiveJobContext(
            movement_family=MovementFamily.ETA_2824,
            failed_part_type=PartType.MAINSPRING,
            damage_state="crystal_crazing",
        )
        cf = CatalogFilter()
        cf.open_from_active_job(ctx)
        assert cf.active_job_context.damage_state == "crystal_crazing"

    def test_catalog_filter_open_from_active_job_null_damage_state(self):
        """CatalogFilter with null damage_state = standard wear path unchanged."""
        ctx = ActiveJobContext(
            movement_family=MovementFamily.AS_1950,
            failed_part_type=PartType.BALANCE_WHEEL,
        )
        cf = CatalogFilter()
        cf.open_from_active_job(ctx)
        assert cf.active_job_context.damage_state is None


# ---------------------------------------------------------------------------
# Regression: pre-existing PARTS_CATALOG entries unaffected
# ---------------------------------------------------------------------------

class TestExistingPartsUnaffected:
    EXPECTED_EXISTING_IDS = [
        "ms-eta2824-std",
        "ms-eta2824-strong",
        "ms-as1950-std",
        "ms-miyota-std",
        "bw-eta2824-std",
        "bw-as1950-std",
        "bw-miyota-std",
        "ew-eta2824-std",
        "ew-as1950-std",
        "ew-miyota-std",
        "pf-eta2824-std",
        "pf-as1950-std",
        "pf-miyota-std",
        "cp-eta2824-std",
        "cp-as1950-std",
        "cp-miyota-std",
        "cw-universal",
        "cs-universal",
        "stem-eta2824-std",
        "stem-as1950-std",
        "stem-miyota-std",
    ]

    @pytest.mark.parametrize("part_id", EXPECTED_EXISTING_IDS)
    def test_existing_part_still_in_catalog(self, part_id):
        assert _find_part(part_id) is not None, f"{part_id} missing after Phase 1 additions"
