"""
retention_memo — Memo-composition helpers for RetentionAnalytics.
==================================================================

Extracted from ``retention_analytics.py`` as part of Issue #201.

Provides ``_compose_memo`` (and its per-section sub-helpers) plus ``_fmt_rate``.
These are intentionally underscore-prefixed internal helpers; callers outside
``src/analytics/`` must not reference them directly.

Constants that are used by *both* the analytics engine and the memo-composition
layer are defined here so that ``retention_analytics`` can import them without
creating a circular dependency.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Shared constants (also re-exported through retention_analytics for back-compat)
# ---------------------------------------------------------------------------

COHORT_0        = "0_completions"
COHORT_1        = "1_completion"
COHORT_2_3      = "2_3_completions"
COHORT_4_PLUS   = "4_plus_completions"
COHORT_KEYS     = [COHORT_0, COHORT_1, COHORT_2_3, COHORT_4_PLUS]

MIN_SESSIONS              = 500    # Minimum distinct players for sufficient data
MATERIAL_UPLIFT_THRESHOLD = 10.0   # Percentage-point D30 uplift to confirm hypothesis
QUEUE_GAP_STRONG_THRESHOLD = 40.0  # % returning sessions with no active job → strong signal
QUEUE_GAP_WEAK_THRESHOLD   = 15.0  # % returning sessions with no active job → weak signal


# ---------------------------------------------------------------------------
# Primitive helper
# ---------------------------------------------------------------------------

def _fmt_rate(rate: float | None) -> str:
    """Format a fractional rate as a percentage string, or 'N/A'."""
    if rate is None:
        return "N/A (insufficient data)"
    return f"{rate * 100:.1f}%"


# ---------------------------------------------------------------------------
# Per-section helpers (each has cyclomatic complexity ≤ 4)
# ---------------------------------------------------------------------------

def _compose_header_section() -> list[str]:
    """Return document header lines."""
    return [
        "# Retention Analytics: D7/D30 Segmentation by Job Completion Count",
        "## Findings Memo — Issue #109",
        "",
    ]


def _compose_availability_section(total_distinct_players: int) -> list[str]:
    """Return '### 1. Data Availability' section lines."""
    lines: list[str] = ["### 1. Data Availability"]
    lines.append(f"- Total distinct players in telemetry: {total_distinct_players}")
    if total_distinct_players < MIN_SESSIONS:
        lines.append(
            f"- **WARNING:** Fewer than {MIN_SESSIONS} player sessions available. "
            f"Analysis reliability is limited. Consider creating an instrumentation "
            f"story before scheduling FR2 (Two-Bench Probe)."
        )
    else:
        lines.append(
            f"- Data threshold of {MIN_SESSIONS} sessions met. Analysis proceeds."
        )
    lines.append("")
    return lines


def _compose_cohort_section(cohorts: dict[str, dict[str, Any]]) -> list[str]:
    """Return '### 2. Cohort Breakdown' section lines."""
    cohort_labels = {
        COHORT_0:      "0 completions",
        COHORT_1:      "1 completion",
        COHORT_2_3:    "2–3 completions",
        COHORT_4_PLUS: "4+ completions",
    }
    lines: list[str] = ["### 2. Cohort Breakdown"]
    for key in COHORT_KEYS:
        c = cohorts[key]
        label = cohort_labels[key]
        d7  = _fmt_rate(c["d7_rate"])
        d30 = _fmt_rate(c["d30_rate"])
        flag = f" ⚠ {c['flag']}" if c["flag"] else ""
        lines.append(
            f"- **{label}** (n={c['n']}{flag}): D7={d7}, D30={d30}"
        )
    lines.append("")
    return lines


def _compose_uplift_section(
    uplift_pp: float | None,
    uplift_is_material: bool | None,
) -> list[str]:
    """Return '### 3. Multi-Completer D30 Uplift' section lines."""
    lines: list[str] = ["### 3. Multi-Completer D30 Uplift"]
    if uplift_pp is None:
        lines.append(
            "- Uplift could not be computed: either the 1-completion cohort or all "
            "multi-completer cohorts have insufficient sample size (n<30)."
        )
    else:
        lines.append(
            f"- Best multi-completer cohort D30 uplift vs 1-completion: "
            f"{uplift_pp:+.1f} percentage points"
        )
        if uplift_is_material:
            lines.append(
                f"- ✅ Uplift is **material** (≥{MATERIAL_UPLIFT_THRESHOLD:.0f}pp threshold met)."
            )
        else:
            lines.append(
                f"- ❌ Uplift is **not material** (<{MATERIAL_UPLIFT_THRESHOLD:.0f}pp threshold)."
            )
    lines.append("")
    return lines


def _compose_queue_gap_section(
    no_job_pct: float | None,
    queue_gap_signal_strong: bool | None,
) -> list[str]:
    """Return '### 4. Session-Start Behaviour (Queue-Gap Proxy)' section lines."""
    lines: list[str] = ["### 4. Session-Start Behaviour (Queue-Gap Proxy)"]
    if no_job_pct is None:
        lines.append(
            "- Insufficient returning session data to compute queue-gap signal."
        )
    else:
        lines.append(
            f"- {no_job_pct:.1f}% of returning player sessions started with no "
            f"active job in progress."
        )
        if queue_gap_signal_strong is True:
            lines.append(
                f"- ✅ Queue-gap signal is **strong** (>{QUEUE_GAP_STRONG_THRESHOLD:.0f}% "
                f"threshold). Supports urgency of FR2 (Two-Bench Workshop Probe)."
            )
        elif queue_gap_signal_strong is False:
            lines.append(
                f"- ℹ️  Queue-gap signal is **weak** (<{QUEUE_GAP_WEAK_THRESHOLD:.0f}%). "
                f"Note as risk factor but does not override retention signal."
            )
        else:
            lines.append(
                f"- ℹ️  Queue-gap signal is **inconclusive** "
                f"(between {QUEUE_GAP_WEAK_THRESHOLD:.0f}% and "
                f"{QUEUE_GAP_STRONG_THRESHOLD:.0f}%)."
            )
    lines.append("")
    return lines


def _compose_threshold_section(phase1_threshold: dict[str, str]) -> list[str]:
    """Return '### 5. Phase 1 (FR2) Success Threshold' section lines."""
    return [
        "### 5. Phase 1 (FR2) Success Threshold",
        f"- Metric: {phase1_threshold['metric']}",
        f"- Target: {phase1_threshold['target']}",
        "",
    ]


def _compose_recommendation_section(recommendation: str) -> list[str]:
    """Return '### 6. Recommendation' section lines."""
    lines: list[str] = ["### 6. Recommendation"]
    if recommendation == "DATA CONFIRMS":
        lines.append(
            "**DATA CONFIRMS** — D30 retention uplift for multi-restoration completers "
            "is statistically meaningful. Proceed to Phase 1 probe (FR2) with the "
            "success threshold defined above."
        )
    elif recommendation == "DATA DOES NOT SUPPORT":
        lines.append(
            "**DATA DOES NOT SUPPORT** — D30 retention uplift for multi-restoration "
            "completers is below the materiality threshold. Recommend deferring "
            "Two-Bench Workshop investment and reassessing after player base grows."
        )
    elif recommendation == "DATA INCONCLUSIVE":
        lines.append(
            "**DATA INCONCLUSIVE** — Multi-completer cohort sample sizes are too small "
            "for reliable statistical conclusions. Recommend minimal Phase 1 probe with "
            "an extended 8-week observation window to accumulate sufficient multi-completer "
            "data before making the full investment decision."
        )
    else:
        lines.append(
            "**INSUFFICIENT_TELEMETRY** — Total session count is below the 500-session "
            "minimum. Create an instrumentation story to ensure per-player restoration "
            "completion counts and return timestamps are captured before re-running "
            "this analysis. FR2 (Two-Bench Probe) is blocked until data is available."
        )
    return lines


# ---------------------------------------------------------------------------
# Public (within analytics layer) orchestrator
# ---------------------------------------------------------------------------

def _compose_memo(
    total_distinct_players: int,
    cohorts: dict[str, dict[str, Any]],
    uplift_pp: float | None,
    uplift_is_material: bool | None,
    no_job_pct: float | None,
    queue_gap_signal_strong: bool | None,
    recommendation: str,
    phase1_threshold: dict[str, str],
) -> str:
    """
    Compose the written findings memo.

    Orchestrates per-section helpers; each helper has cyclomatic complexity ≤ 4,
    and this function itself has complexity 1 (pure sequencing).
    """
    lines: list[str] = []
    lines.extend(_compose_header_section())
    lines.extend(_compose_availability_section(total_distinct_players))
    lines.extend(_compose_cohort_section(cohorts))
    lines.extend(_compose_uplift_section(uplift_pp, uplift_is_material))
    lines.extend(_compose_queue_gap_section(no_job_pct, queue_gap_signal_strong))
    lines.extend(_compose_threshold_section(phase1_threshold))
    lines.extend(_compose_recommendation_section(recommendation))
    return "\n".join(lines)
