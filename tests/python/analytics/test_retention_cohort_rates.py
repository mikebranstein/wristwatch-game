"""
Tests for retention_cohort_rates.py — Issue #202
=================================================

Validates the acceptance criteria for the module-extraction refactor:

  AC1 — retention_cohort_rates.py exists and contains all four extracted functions.
  AC2 — retention_analytics.py no longer defines the four functions as class methods.
  AC3 — No circular imports between retention_cohort_rates and retention_analytics.
  AC4 — All existing tests pass without modification (covered by test_retention_analytics.py).
  AC5 — Module sizes: retention_analytics.py < 500 lines (no critical violation),
         retention_cohort_rates.py < 300 lines (no warning).

These tests are intentionally lightweight — they prove structural correctness of the
extraction; functional correctness continues to be validated by the 58 existing tests in
test_retention_analytics.py.
"""

from __future__ import annotations

import importlib
import inspect
import pathlib
import sys

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SRC_ROOT = pathlib.Path(__file__).parent.parent.parent.parent / "python" / "analytics"


def _count_source_lines(module_file: pathlib.Path) -> int:
    """Return the number of non-blank, non-comment lines in a Python source file."""
    lines = module_file.read_text(encoding="utf-8").splitlines()
    return sum(1 for ln in lines if ln.strip() and not ln.strip().startswith("#"))


# ---------------------------------------------------------------------------
# AC1 — New module exists and exports all four functions
# ---------------------------------------------------------------------------

class TestAC1NewModuleExists:
    """AC1: retention_cohort_rates.py exists with all four extracted functions."""

    def test_module_file_exists(self):
        module_path = SRC_ROOT / "retention_cohort_rates.py"
        assert module_path.exists(), (
            "python/analytics/retention_cohort_rates.py must exist after Issue #202 extraction"
        )

    def test_module_is_importable(self):
        from analytics import retention_cohort_rates  # noqa: F401

    def test_compute_cohort_rates_exported(self):
        from analytics.retention_cohort_rates import _compute_cohort_rates
        assert callable(_compute_cohort_rates)

    def test_returned_within_exported(self):
        from analytics.retention_cohort_rates import _returned_within
        assert callable(_returned_within)

    def test_compute_uplift_exported(self):
        from analytics.retention_cohort_rates import _compute_uplift
        assert callable(_compute_uplift)

    def test_compute_queue_gap_signal_exported(self):
        from analytics.retention_cohort_rates import _compute_queue_gap_signal
        assert callable(_compute_queue_gap_signal)

    def test_functions_are_module_level_not_methods(self):
        """Functions in the new module must NOT be bound to a class."""
        from analytics import retention_cohort_rates as rcr
        for name in (
            "_compute_cohort_rates",
            "_returned_within",
            "_compute_uplift",
            "_compute_queue_gap_signal",
        ):
            fn = getattr(rcr, name)
            assert not inspect.ismethod(fn), f"{name} must be a module-level function, not a method"
            assert inspect.isfunction(fn), f"{name} must be a plain function"

    def test_constants_exported(self):
        """All shared constants must be importable from the new module."""
        from analytics.retention_cohort_rates import (
            COHORT_0,
            COHORT_1,
            COHORT_2_3,
            COHORT_4_PLUS,
            COHORT_KEYS,
            MIN_COHORT_SIZE,
            MATERIAL_UPLIFT_THRESHOLD,
            QUEUE_GAP_STRONG_THRESHOLD,
            QUEUE_GAP_WEAK_THRESHOLD,
            SECONDS_PER_DAY,
        )
        assert COHORT_KEYS == [COHORT_0, COHORT_1, COHORT_2_3, COHORT_4_PLUS]
        assert MIN_COHORT_SIZE == 30
        assert MATERIAL_UPLIFT_THRESHOLD == 10.0
        assert SECONDS_PER_DAY == 86_400


# ---------------------------------------------------------------------------
# AC2 — retention_analytics no longer defines the four methods on the class
# ---------------------------------------------------------------------------

class TestAC2FunctionsRemovedFromClass:
    """AC2: RetentionAnalytics class must not define the four extracted methods."""

    def _get_class(self):
        from analytics.retention_analytics import RetentionAnalytics
        return RetentionAnalytics

    def test_compute_cohort_rates_not_defined_on_class(self):
        cls = self._get_class()
        # The method must NOT be defined directly on the class's __dict__
        assert "_compute_cohort_rates" not in cls.__dict__, (
            "_compute_cohort_rates should have been extracted to retention_cohort_rates.py"
        )

    def test_returned_within_not_defined_on_class(self):
        cls = self._get_class()
        assert "_returned_within" not in cls.__dict__, (
            "_returned_within should have been extracted to retention_cohort_rates.py"
        )

    def test_compute_uplift_not_defined_on_class(self):
        cls = self._get_class()
        assert "_compute_uplift" not in cls.__dict__, (
            "_compute_uplift should have been extracted to retention_cohort_rates.py"
        )

    def test_compute_queue_gap_signal_not_defined_on_class(self):
        cls = self._get_class()
        assert "_compute_queue_gap_signal" not in cls.__dict__, (
            "_compute_queue_gap_signal should have been extracted to retention_cohort_rates.py"
        )

    def test_constants_still_importable_from_retention_analytics(self):
        """Backward-compat: constants must still be importable from retention_analytics."""
        from analytics.retention_analytics import (
            COHORT_0,
            COHORT_1,
            COHORT_2_3,
            COHORT_4_PLUS,
            COHORT_KEYS,
            MIN_COHORT_SIZE,
            MATERIAL_UPLIFT_THRESHOLD,
            QUEUE_GAP_STRONG_THRESHOLD,
            QUEUE_GAP_WEAK_THRESHOLD,
            SECONDS_PER_DAY,
        )
        assert COHORT_KEYS == [COHORT_0, COHORT_1, COHORT_2_3, COHORT_4_PLUS]


# ---------------------------------------------------------------------------
# AC3 — No circular imports
# ---------------------------------------------------------------------------

class TestAC3NoCircularImports:
    """AC3: retention_cohort_rates.py must NOT import from retention_analytics.py."""

    def test_cohort_rates_does_not_import_retention_analytics(self):
        """
        retention_cohort_rates must not contain any import of retention_analytics
        (that would create a circular import).  Docstring mentions are allowed.
        """
        import re
        source = (SRC_ROOT / "retention_cohort_rates.py").read_text(encoding="utf-8")
        # Match actual import statements only (import ... or from ... import ...)
        import_lines = [
            ln for ln in source.splitlines()
            if re.match(r"^\s*(import|from)\s+.*retention_analytics", ln)
        ]
        assert import_lines == [], (
            "retention_cohort_rates.py must not import from retention_analytics.py "
            f"(circular import risk). Found: {import_lines}"
        )

    def test_retention_analytics_imports_from_cohort_rates(self):
        """retention_analytics.py must import from retention_cohort_rates (one-way dependency)."""
        source = (SRC_ROOT / "retention_analytics.py").read_text(encoding="utf-8")
        assert "retention_cohort_rates" in source, (
            "retention_analytics.py must import the extracted functions from retention_cohort_rates.py"
        )

    def test_import_does_not_raise(self):
        """Both modules must import cleanly without ImportError or circular-import NameError."""
        import analytics.retention_cohort_rates  # noqa: F401
        import analytics.retention_analytics  # noqa: F401


# ---------------------------------------------------------------------------
# AC5 — Module size: no critical violations for affected files
# ---------------------------------------------------------------------------

class TestAC5ModuleSize:
    """AC5: Module sizes must not introduce new critical violations (>500 lines)."""

    def test_retention_analytics_below_critical_threshold(self):
        path = SRC_ROOT / "retention_analytics.py"
        total_lines = len(path.read_text(encoding="utf-8").splitlines())
        assert total_lines < 500, (
            f"retention_analytics.py has {total_lines} lines — exceeds the 500-line "
            f"critical threshold after extraction; extraction may be incomplete"
        )

    def test_retention_cohort_rates_below_warning_threshold(self):
        path = SRC_ROOT / "retention_cohort_rates.py"
        total_lines = len(path.read_text(encoding="utf-8").splitlines())
        assert total_lines < 300, (
            f"retention_cohort_rates.py has {total_lines} lines — exceeds the 300-line "
            f"warning threshold; the new module should be focused (~80-130 lines)"
        )
