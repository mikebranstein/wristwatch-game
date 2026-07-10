"""
Tests for src/config/diagnostic_fault_config.py — Issue #292.

Covers:
  - DiagnosticFaultConfig dataclass instantiation with a valid intake_rate
  - DiagnosticFaultConfig frozen-immutability enforcement (FrozenInstanceError on mutation)
  - MAGNETISM_FAULT_CONFIG.intake_rate == 0.17 (exact designer-configured value)
  - MAGNETISM_FAULT_CONFIG.intake_rate in [0.15, 0.20] range (AC1: 15–20% target)
  - Isolation from DAMAGE_STATE_CONFIG (no shared pool; DAMAGE_STATE_CONFIG unchanged)
"""

import dataclasses
import pytest

from src.config.diagnostic_fault_config import (
    DiagnosticFaultConfig,
    MAGNETISM_FAULT_CONFIG,
)
from src.config.damage_state_config import DAMAGE_STATE_CONFIG


# ---------------------------------------------------------------------------
# DiagnosticFaultConfig dataclass — instantiation & immutability
# ---------------------------------------------------------------------------

class TestDiagnosticFaultConfigDataclass:
    """Structural tests for the DiagnosticFaultConfig frozen dataclass."""

    def test_instantiation_with_valid_intake_rate(self):
        """DiagnosticFaultConfig instantiates without error when given a valid intake_rate."""
        cfg = DiagnosticFaultConfig(intake_rate=0.17)
        assert cfg.intake_rate == 0.17

    def test_instantiation_stores_intake_rate(self):
        """intake_rate passed at construction time is accessible on the instance."""
        cfg = DiagnosticFaultConfig(intake_rate=0.20)
        assert cfg.intake_rate == 0.20

    def test_frozen_immutability_raises_on_intake_rate_mutation(self):
        """Mutating intake_rate on an instantiated DiagnosticFaultConfig raises FrozenInstanceError."""
        with pytest.raises(dataclasses.FrozenInstanceError):
            MAGNETISM_FAULT_CONFIG.intake_rate = 0.99


# ---------------------------------------------------------------------------
# MAGNETISM_FAULT_CONFIG singleton — intake_rate (AC1 gate: 15–20% target)
# ---------------------------------------------------------------------------

class TestMagnetismFaultConfigIntakeRate:
    """Validate the module-level MAGNETISM_FAULT_CONFIG singleton intake_rate."""

    def test_intake_rate_exact_value(self):
        """MAGNETISM_FAULT_CONFIG.intake_rate is exactly 0.17 (designer default)."""
        assert MAGNETISM_FAULT_CONFIG.intake_rate == 0.17

    def test_intake_rate_meets_ac1_lower_bound(self):
        """MAGNETISM_FAULT_CONFIG.intake_rate >= 0.15 satisfies the AC1 lower bound."""
        assert MAGNETISM_FAULT_CONFIG.intake_rate >= 0.15

    def test_intake_rate_meets_ac1_upper_bound(self):
        """MAGNETISM_FAULT_CONFIG.intake_rate <= 0.20 satisfies the AC1 upper bound."""
        assert MAGNETISM_FAULT_CONFIG.intake_rate <= 0.20

    def test_intake_rate_is_float(self):
        """MAGNETISM_FAULT_CONFIG.intake_rate is a float."""
        assert isinstance(MAGNETISM_FAULT_CONFIG.intake_rate, float)


# ---------------------------------------------------------------------------
# Isolation — DAMAGE_STATE_CONFIG is not affected by this module
# ---------------------------------------------------------------------------

class TestDamageStateConfigIsolation:
    """Confirm that diagnostic_fault_config.py does not mutate damage_state_config.py values."""

    def test_damage_state_config_intake_rate_unchanged(self):
        """DAMAGE_STATE_CONFIG.intake_rate remains 0.25 — diagnostic config is independent."""
        assert DAMAGE_STATE_CONFIG.intake_rate == 0.25

    def test_magnetism_intake_rate_does_not_equal_damage_state_intake_rate(self):
        """MAGNETISM_FAULT_CONFIG.intake_rate != DAMAGE_STATE_CONFIG.intake_rate (separate pools)."""
        assert MAGNETISM_FAULT_CONFIG.intake_rate != DAMAGE_STATE_CONFIG.intake_rate
