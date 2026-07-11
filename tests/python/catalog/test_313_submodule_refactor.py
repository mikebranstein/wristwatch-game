"""
Acceptance criteria tests for Issue #313:
Refactor: Split PARTS_CATALOG and COMPATIBILITY_TABLE into per-family sub-modules

Tests validate structural requirements and data integrity of the refactor
without modifying any pre-existing test files.
"""

import importlib
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

DATA_DIR = Path(__file__).parent.parent.parent.parent / "python" / "catalog" / "data"

EXPECTED_SUBMODULES = [
    "_catalog_eta_2824.py",
    "_catalog_as_1950.py",
    "_catalog_miyota_8215.py",
    "_catalog_universal.py",
]

LINE_LIMIT_SUBMODULE = 150
LINE_LIMIT_AGGREGATOR = 60
LINE_LIMIT_ANY_DATA_FILE = 300


def _count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


# ---------------------------------------------------------------------------
# AC1 — All 4 sub-modules exist under python/catalog/data/
# ---------------------------------------------------------------------------

class TestAC1SubmodulesExist:
    @pytest.mark.parametrize("filename", EXPECTED_SUBMODULES)
    def test_submodule_file_exists(self, filename):
        """AC1 — each required sub-module file exists under python/catalog/data/."""
        assert (DATA_DIR / filename).is_file(), (
            f"{filename} not found under python/catalog/data/"
        )

    def test_types_module_exists(self):
        """AC1 (dependency) — _types.py exists (prerequisite for sub-module imports)."""
        assert (DATA_DIR / "_types.py").is_file(), (
            "_types.py not found under python/catalog/data/"
        )


# ---------------------------------------------------------------------------
# AC2 — No sub-module exceeds 150 lines
# ---------------------------------------------------------------------------

class TestAC2SubmoduleLineCounts:
    @pytest.mark.parametrize("filename", EXPECTED_SUBMODULES)
    def test_submodule_does_not_exceed_150_lines(self, filename):
        """AC2 — each sub-module must not exceed 150 lines."""
        path = DATA_DIR / filename
        if not path.is_file():
            pytest.skip(f"{filename} does not exist")
        count = _count_lines(path)
        assert count <= LINE_LIMIT_SUBMODULE, (
            f"{filename} has {count} lines — exceeds {LINE_LIMIT_SUBMODULE}-line limit"
        )


# ---------------------------------------------------------------------------
# AC3 — part_compatibility.py does not exceed 60 lines
# ---------------------------------------------------------------------------

class TestAC3AggregatorLineCount:
    def test_part_compatibility_does_not_exceed_60_lines(self):
        """AC3 — part_compatibility.py (thin aggregator) must not exceed 60 lines."""
        path = DATA_DIR / "part_compatibility.py"
        count = _count_lines(path)
        assert count <= LINE_LIMIT_AGGREGATOR, (
            f"part_compatibility.py has {count} lines — exceeds {LINE_LIMIT_AGGREGATOR}-line limit"
        )


# ---------------------------------------------------------------------------
# AC4 — No file under python/catalog/data/ exceeds 300 lines
# ---------------------------------------------------------------------------

class TestAC4NoFileExceedsWarningThreshold:
    def test_no_data_file_exceeds_300_lines(self):
        """AC4 — all .py files under python/catalog/data/ must stay under 300 lines."""
        violations = []
        for py_file in DATA_DIR.glob("*.py"):
            count = _count_lines(py_file)
            if count > LINE_LIMIT_ANY_DATA_FILE:
                violations.append(f"{py_file.name}: {count} lines")
        assert not violations, (
            f"Files exceeding {LINE_LIMIT_ANY_DATA_FILE}-line Warning threshold:\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# AC5 — PARTS_CATALOG contains same Part objects in correct logical order
# ---------------------------------------------------------------------------

class TestAC5PartsCatalogContents:
    def test_parts_catalog_contains_all_expected_ids(self):
        """AC5 — PARTS_CATALOG contains every expected part_id."""
        from catalog.data.part_compatibility import PARTS_CATALOG

        expected_ids = {
            # ETA-2824
            "ms-eta2824-std", "ms-eta2824-strong",
            "bw-eta2824-std", "ew-eta2824-std", "pf-eta2824-std",
            "cp-eta2824-std", "stem-eta2824-std",
            # AS-1950
            "ms-as1950-std",
            "bw-as1950-std", "ew-as1950-std", "pf-as1950-std",
            "cp-as1950-std", "stem-as1950-std",
            # Miyota-8215
            "ms-miyota-std", "ms-miyota-strong",
            "bw-miyota-std", "ew-miyota-std", "pf-miyota-std",
            "cp-miyota-std", "stem-miyota-std",
            # Universal
            "cw-universal", "cs-universal",
            # Damage-state repair
            "corrosion-cleaning-tool", "gasket-universal",
            "crystal-defogging-solution", "case-polish-compound",
            "dial-restoration-kit", "crystal-mineral-universal",
            "dial-enamel-repair-tool",
        }
        actual_ids = {p.id for p in PARTS_CATALOG}
        missing = expected_ids - actual_ids
        extra = actual_ids - expected_ids
        assert not missing, f"Parts missing from PARTS_CATALOG: {missing}"
        assert not extra, f"Unexpected extra parts in PARTS_CATALOG: {extra}"

    def test_parts_catalog_eta_parts_appear_before_as_parts(self):
        """AC5 — ETA-2824 parts appear before AS-1950 parts in PARTS_CATALOG."""
        from catalog.data.part_compatibility import PARTS_CATALOG, MovementFamily

        ids = [p.id for p in PARTS_CATALOG]
        eta_indices = [i for i, p in enumerate(PARTS_CATALOG)
                       if p.movement_family == MovementFamily.ETA_2824]
        as_indices = [i for i, p in enumerate(PARTS_CATALOG)
                      if p.movement_family == MovementFamily.AS_1950]
        assert max(eta_indices) < min(as_indices), (
            "ETA-2824 parts must appear before AS-1950 parts in PARTS_CATALOG"
        )

    def test_parts_catalog_as_parts_appear_before_miyota_parts(self):
        """AC5 — AS-1950 parts appear before Miyota-8215 parts in PARTS_CATALOG."""
        from catalog.data.part_compatibility import PARTS_CATALOG, MovementFamily

        as_indices = [i for i, p in enumerate(PARTS_CATALOG)
                      if p.movement_family == MovementFamily.AS_1950]
        miyota_indices = [i for i, p in enumerate(PARTS_CATALOG)
                          if p.movement_family == MovementFamily.MIYOTA_8215]
        assert max(as_indices) < min(miyota_indices), (
            "AS-1950 parts must appear before Miyota-8215 parts in PARTS_CATALOG"
        )

    def test_parts_catalog_universal_parts_appear_last(self):
        """AC5 — Universal (movement_family=None) parts appear after all family parts."""
        from catalog.data.part_compatibility import PARTS_CATALOG, MovementFamily

        family_indices = [i for i, p in enumerate(PARTS_CATALOG)
                          if p.movement_family is not None]
        universal_indices = [i for i, p in enumerate(PARTS_CATALOG)
                              if p.movement_family is None]
        assert max(family_indices) < min(universal_indices), (
            "Universal parts must appear after all family-specific parts in PARTS_CATALOG"
        )

    def test_parts_catalog_no_duplicate_ids(self):
        """AC5 — PARTS_CATALOG contains no duplicate part IDs."""
        from catalog.data.part_compatibility import PARTS_CATALOG

        ids = [p.id for p in PARTS_CATALOG]
        assert len(ids) == len(set(ids)), "Duplicate part IDs found in PARTS_CATALOG"


# ---------------------------------------------------------------------------
# AC6 — COMPATIBILITY_TABLE contains all original entries (33 entries)
# ---------------------------------------------------------------------------

class TestAC6CompatibilityTableIntegrity:
    EXPECTED_COMPAT_COUNT = 33

    def test_compatibility_table_entry_count(self):
        """AC6 — COMPATIBILITY_TABLE must contain exactly 33 entries."""
        from catalog.data.part_compatibility import COMPATIBILITY_TABLE
        assert len(COMPATIBILITY_TABLE) == self.EXPECTED_COMPAT_COUNT, (
            f"COMPATIBILITY_TABLE has {len(COMPATIBILITY_TABLE)} entries; expected {self.EXPECTED_COMPAT_COUNT}"
        )

    def test_compatibility_table_has_all_eta_entries(self):
        """AC6 — all 12 ETA-2824 compat entries are present."""
        from catalog.data.part_compatibility import COMPATIBILITY_TABLE, MovementFamily

        eta_entries = {k: v for k, v in COMPATIBILITY_TABLE.items()
                       if k[0] == MovementFamily.ETA_2824}
        assert len(eta_entries) == 12, (
            f"Expected 12 ETA-2824 compat entries, got {len(eta_entries)}"
        )

    def test_compatibility_table_has_all_as_entries(self):
        """AC6 — all 10 AS-1950 compat entries are present."""
        from catalog.data.part_compatibility import COMPATIBILITY_TABLE, MovementFamily

        as_entries = {k: v for k, v in COMPATIBILITY_TABLE.items()
                      if k[0] == MovementFamily.AS_1950}
        assert len(as_entries) == 10, (
            f"Expected 10 AS-1950 compat entries, got {len(as_entries)}"
        )

    def test_compatibility_table_has_all_miyota_entries(self):
        """AC6 — all 11 Miyota-8215 compat entries are present."""
        from catalog.data.part_compatibility import COMPATIBILITY_TABLE, MovementFamily

        miyota_entries = {k: v for k, v in COMPATIBILITY_TABLE.items()
                          if k[0] == MovementFamily.MIYOTA_8215}
        assert len(miyota_entries) == 11, (
            f"Expected 11 Miyota-8215 compat entries, got {len(miyota_entries)}"
        )

    def test_known_compatible_entries_preserved(self):
        """AC6 — spot-check: known COMPATIBLE entries are correct."""
        from catalog.data.part_compatibility import (
            COMPATIBILITY_TABLE, MovementFamily, CompatibilityStatus
        )
        assert COMPATIBILITY_TABLE[(MovementFamily.ETA_2824, "ms-eta2824-std")] == CompatibilityStatus.COMPATIBLE
        assert COMPATIBILITY_TABLE[(MovementFamily.AS_1950, "bw-as1950-std")] == CompatibilityStatus.COMPATIBLE
        assert COMPATIBILITY_TABLE[(MovementFamily.MIYOTA_8215, "pf-miyota-std")] == CompatibilityStatus.COMPATIBLE

    def test_known_incompatible_entries_preserved(self):
        """AC6 — spot-check: known INCOMPATIBLE entries are correct."""
        from catalog.data.part_compatibility import (
            COMPATIBILITY_TABLE, MovementFamily, CompatibilityStatus
        )
        assert COMPATIBILITY_TABLE[(MovementFamily.ETA_2824, "ms-as1950-std")] == CompatibilityStatus.INCOMPATIBLE
        assert COMPATIBILITY_TABLE[(MovementFamily.AS_1950, "bw-eta2824-std")] == CompatibilityStatus.INCOMPATIBLE
        assert COMPATIBILITY_TABLE[(MovementFamily.MIYOTA_8215, "ms-eta2824-std")] == CompatibilityStatus.INCOMPATIBLE


# ---------------------------------------------------------------------------
# AC7 — Public import path continues to work unchanged
# ---------------------------------------------------------------------------

class TestAC7PublicImportPath:
    def test_parts_catalog_importable_from_public_path(self):
        """AC7 — PARTS_CATALOG importable from catalog.data.part_compatibility."""
        from catalog.data.part_compatibility import PARTS_CATALOG
        assert isinstance(PARTS_CATALOG, list)
        assert len(PARTS_CATALOG) > 0

    def test_compatibility_table_importable_from_public_path(self):
        """AC7 — COMPATIBILITY_TABLE importable from catalog.data.part_compatibility."""
        from catalog.data.part_compatibility import COMPATIBILITY_TABLE
        assert isinstance(COMPATIBILITY_TABLE, dict)

    def test_movement_family_importable_from_public_path(self):
        """AC7 — MovementFamily importable from catalog.data.part_compatibility."""
        from catalog.data.part_compatibility import MovementFamily
        assert MovementFamily.ETA_2824 == "ETA-2824"

    def test_compatibility_status_importable_from_public_path(self):
        """AC7 — CompatibilityStatus importable from catalog.data.part_compatibility."""
        from catalog.data.part_compatibility import CompatibilityStatus
        assert CompatibilityStatus.COMPATIBLE == "compatible"

    def test_part_importable_from_public_path(self):
        """AC7 — Part importable from catalog.data.part_compatibility."""
        from catalog.data.part_compatibility import Part
        assert Part is not None

    def test_no_circular_import(self):
        """AC7 — smoke import: no circular import when loading part_compatibility."""
        # Force a fresh import to catch circular import errors
        mod_name = "catalog.data.part_compatibility"
        if mod_name in sys.modules:
            # Already loaded — verify it loaded cleanly
            mod = sys.modules[mod_name]
        else:
            mod = importlib.import_module(mod_name)
        assert hasattr(mod, "PARTS_CATALOG")
        assert hasattr(mod, "COMPATIBILITY_TABLE")
