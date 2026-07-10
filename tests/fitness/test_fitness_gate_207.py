"""
Fitness Gate Tests — Issue #207
================================
Verifies the dependency-layering fitness gate after the save/orders
decoupling work in issues #205 and #206.

Acceptance Criteria tested:
  AC1: Fitness evaluator runs to completion without errors
       (fitness-report.json exists and is valid JSON with expected schema)
  AC2: fitness-report.json shows save-layering-violation finding is absent
       or severity is "none"  [EXPECTED TO FAIL until full decoupling complete]
  AC3: No new layering violations introduced by the refactor
       (only pre-existing violation IDs appear in report)

Run with: pytest tests/fitness/test_fitness_gate_207.py -v
"""

import json
import os

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REPORT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "fitness-report.json"
)

SAVE_LAYERING_VIOLATION_ID = "save-layering-violation"

# Violation IDs that existed BEFORE the #205/#206 decoupling work.
# These are the only IDs that may appear; any NEW id is a regression.
KNOWN_VIOLATION_IDS = {
    "save-layering-violation",
    "analytics-module-size-critical",
    "probe-telemetry-complexity-critical",
    "part-compatibility-module-size-warning",
    "probe-telemetry-module-size-warning",
    "retention-analytics-complexity-warning",
    "catalog-filter-complexity-warning",
}


def load_report():
    with open(REPORT_PATH, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# AC1 — Fitness evaluator ran to completion without errors
# ---------------------------------------------------------------------------

class TestFitnessReportValid:
    """AC1: fitness-report.json exists and is valid with expected schema."""

    def test_report_file_exists(self):
        """fitness-report.json must be present in the repo root."""
        assert os.path.isfile(REPORT_PATH), (
            f"fitness-report.json not found at {REPORT_PATH}"
        )

    def test_report_is_valid_json(self):
        """fitness-report.json must parse as valid JSON."""
        report = load_report()
        assert isinstance(report, dict), "Report must be a JSON object"

    def test_report_has_required_top_level_keys(self):
        """Report must contain window, generated_at, findings, summary."""
        report = load_report()
        for key in ("window", "generated_at", "findings", "summary"):
            assert key in report, f"Missing required key: {key}"

    def test_report_window_is_last_3_features(self):
        """Report must have been generated for the last-3-features window."""
        report = load_report()
        assert report["window"] == "last-3-features", (
            f"Expected window 'last-3-features', got {report['window']!r}"
        )

    def test_findings_is_list(self):
        """findings must be a JSON array."""
        report = load_report()
        assert isinstance(report["findings"], list), "findings must be a list"

    def test_each_finding_has_required_fields(self):
        """Each finding must have id, severity, module, description."""
        report = load_report()
        for finding in report["findings"]:
            for field in ("id", "severity", "module", "description"):
                assert field in finding, (
                    f"Finding is missing '{field}': {finding}"
                )

    def test_report_summary_counts_match_findings(self):
        """summary.total must equal the number of findings in the list."""
        report = load_report()
        assert report["summary"]["total"] == len(report["findings"]), (
            f"summary.total={report['summary']['total']} does not match "
            f"len(findings)={len(report['findings'])}"
        )


# ---------------------------------------------------------------------------
# AC2 — save-layering-violation is absent or severity is none
# ---------------------------------------------------------------------------

class TestSaveLayeringViolationResolved:
    """
    AC2: fitness-report.json shows save-layering-violation absent or
    severity is 'none'.

    This test is EXPECTED TO FAIL until save_system.py fully removes its
    import of OrderQueue from src.orders.order_queue.  PR #231 removed the
    Order import but the OrderQueue import remains, keeping the violation
    active.  Reopen issue #205 to complete the full decoupling.
    """

    def test_save_layering_violation_absent_or_none(self):
        """
        The save-layering-violation finding must be absent from the report
        OR have severity == 'none'.  Fails while OrderQueue import persists
        in src/save/save_system.py.
        """
        report = load_report()
        matching = [
            f for f in report["findings"]
            if f.get("id") == SAVE_LAYERING_VIOLATION_ID
        ]
        if not matching:
            # Finding absent — violation resolved
            return
        finding = matching[0]
        severity = finding.get("severity", "").lower()
        assert severity == "none", (
            f"save-layering-violation still present with severity={severity!r}. "
            f"save_system.py still imports OrderQueue from src.orders.order_queue. "
            f"Issue #205 must be extended to remove the OrderQueue import and make "
            f"load_session() use a local OrderQueue constructed only within orders/."
        )


# ---------------------------------------------------------------------------
# AC3 — No new layering violations introduced by the refactor
# ---------------------------------------------------------------------------

class TestNoNewLayeringViolations:
    """AC3: The refactor must not introduce new dependency-layering findings."""

    def test_no_new_layering_violation_ids(self):
        """
        Every layering-related finding ID must be in the known pre-existing set.
        A finding ID not in KNOWN_VIOLATION_IDS signals a new regression.
        """
        report = load_report()
        layering_findings = [
            f for f in report["findings"]
            if f.get("check") == "Dependency Layering"
        ]
        new_violations = [
            f["id"] for f in layering_findings
            if f["id"] not in KNOWN_VIOLATION_IDS
        ]
        assert not new_violations, (
            f"New dependency-layering violations introduced by the refactor: "
            f"{new_violations}. These were not present before #205/#206."
        )

    def test_no_new_critical_findings_beyond_known(self):
        """
        Critical findings must not exceed the pre-existing known set.
        Guards against scope creep from the decoupling refactor.
        """
        report = load_report()
        critical_ids = {
            f["id"] for f in report["findings"]
            if f.get("severity", "").lower() == "critical"
        }
        unexpected = critical_ids - KNOWN_VIOLATION_IDS
        assert not unexpected, (
            f"New critical findings not in the pre-existing known set: "
            f"{unexpected}"
        )
