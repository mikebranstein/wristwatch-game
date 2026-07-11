"""
Diagnostic Fault Configuration
================================
Designer-configurable parameters for electromagnetic (and future) diagnostic
fault types — specifically, fault types that are diagnosed through watchmaker
tooling rather than visible physical damage.

Follows the damage_state_config.py config pattern: frozen dataclass + module-level
constant so designers can tweak values without touching runtime logic.

Intentionally separate from damage_state_config.py to avoid CI regression:
PHASE1_DAMAGE_STATES, DAMAGE_STATE_CONFIG.intake_rate, and
DAMAGE_STATE_CONFIG.weights are untouched by this module.

MAGNETISM_FAULT_CONFIG.intake_rate
    Probability (0.0–1.0) that any given incoming watch carries a magnetism
    fault.  Requirement: 15–20% real-world prevalence target (AC1).
    Default: 0.17 (17%) — midpoint of the 15–20% range.
    This is an independent rate; it does NOT share the
    DAMAGE_STATE_CONFIG.intake_rate = 0.25 pool.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class DiagnosticFaultConfig:
    """Configuration for a single diagnosable electromagnetic fault type."""

    # Intake rate: fraction of incoming watches assigned this fault type.
    # Independent of DAMAGE_STATE_CONFIG.intake_rate.
    intake_rate: float


# ---------------------------------------------------------------------------
# Default designer-configurable settings for magnetism fault
# ---------------------------------------------------------------------------

MAGNETISM_FAULT_CONFIG = DiagnosticFaultConfig(
    intake_rate=0.17,  # 17% of incoming watches — midpoint of 15–20% AC1 target
)
