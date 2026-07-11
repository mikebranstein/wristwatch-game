"""
Tests for src/config/damage_state_config.py — Issue #81, AC6 / Test Scenario 11.

Covers:
  - DamageStateConfig dataclass instantiation with valid arguments
  - DamageStateConfig frozen-immutability enforcement (FrozenInstanceError on mutation)
  - DAMAGE_STATE_CONFIG.intake_rate == 0.25 (exact designer-configured value)
  - DAMAGE_STATE_CONFIG.intake_rate >= 0.20 (AC1 gate: ≥20% of incoming watches)
  - DAMAGE_STATE_CONFIG.weights keys match exactly PHASE1_DAMAGE_STATES (no missing / no extras)
  - PHASE1_DAMAGE_STATES contains exactly {"water_ingress", "oxidation", "crystal_crazing"}
  - All DAMAGE_STATE_CONFIG.weights values are positive floats
"""

import dataclasses
import pytest

from src.config.damage_state_config import (
    DamageStateConfig,
    DAMAGE_STATE_CONFIG,
    PHASE1_DAMAGE_STATES,
)


# ---------------------------------------------------------------------------
# DamageStateConfig dataclass — instantiation & immutability
# ---------------------------------------------------------------------------

class TestDamageStateConfigDataclass:
    """Structural tests for the DamageStateConfig frozen dataclass."""

    def test_instantiation_with_valid_args(self):
        """DamageStateConfig instantiates without error when given valid arguments."""
        cfg = DamageStateConfig(
            intake_rate=0.30,
            weights={
                "water_ingress": 1.0,
                "oxidation": 1.0,
                "crystal_crazing": 1.0,
            },
        )
        assert cfg.intake_rate == 0.30
        assert cfg.weights["water_ingress"] == 1.0

    def test_frozen_immutability_raises_on_mutation(self):
        """Mutating a field on an instantiated DamageStateConfig raises FrozenInstanceError."""
        with pytest.raises(dataclasses.FrozenInstanceError):
            DAMAGE_STATE_CONFIG.intake_rate = 0.99

    def test_frozen_immutability_raises_on_weights_replacement(self):
        """Replacing the weights dict on the singleton raises FrozenInstanceError."""
        with pytest.raises(dataclasses.FrozenInstanceError):
            DAMAGE_STATE_CONFIG.weights = {}


# ---------------------------------------------------------------------------
# DAMAGE_STATE_CONFIG singleton — intake_rate (AC1 gate)
# ---------------------------------------------------------------------------

class TestDamageStateConfigIntakeRate:
    """Validate the module-level DAMAGE_STATE_CONFIG singleton intake_rate."""

    def test_intake_rate_exact_value(self):
        """DAMAGE_STATE_CONFIG.intake_rate is exactly 0.25 (designer default)."""
        assert DAMAGE_STATE_CONFIG.intake_rate == 0.25

    def test_intake_rate_meets_ac1_gate(self):
        """DAMAGE_STATE_CONFIG.intake_rate >= 0.20 satisfies the AC1 ≥20% requirement."""
        assert DAMAGE_STATE_CONFIG.intake_rate >= 0.20


# ---------------------------------------------------------------------------
# DAMAGE_STATE_CONFIG singleton — weights key completeness
# ---------------------------------------------------------------------------

class TestDamageStateConfigWeightKeys:
    """Validate that weights keys exactly match PHASE1_DAMAGE_STATES."""

    def test_weights_keys_match_phase1_damage_states(self):
        """set(DAMAGE_STATE_CONFIG.weights.keys()) == set(PHASE1_DAMAGE_STATES).

        No missing keys, no extra keys — ensures every Phase 1 damage type
        has an assigned weight and no stale entries exist.
        """
        assert set(DAMAGE_STATE_CONFIG.weights.keys()) == set(PHASE1_DAMAGE_STATES)


# ---------------------------------------------------------------------------
# PHASE1_DAMAGE_STATES — exact membership
# ---------------------------------------------------------------------------

class TestPhase1DamageStates:
    """Validate the PHASE1_DAMAGE_STATES list contains exactly the three Phase 1 types."""

    def test_phase1_damage_states_exact_membership(self):
        """PHASE1_DAMAGE_STATES contains exactly water_ingress, oxidation, crystal_crazing."""
        assert set(PHASE1_DAMAGE_STATES) == {"water_ingress", "oxidation", "crystal_crazing"}

    def test_phase1_damage_states_has_no_duplicates(self):
        """PHASE1_DAMAGE_STATES list contains no duplicate entries."""
        assert len(PHASE1_DAMAGE_STATES) == len(set(PHASE1_DAMAGE_STATES))

    def test_phase1_damage_states_length(self):
        """PHASE1_DAMAGE_STATES has exactly 3 entries (one per Phase 1 damage type)."""
        assert len(PHASE1_DAMAGE_STATES) == 3


# ---------------------------------------------------------------------------
# DAMAGE_STATE_CONFIG singleton — weight values are positive floats
# ---------------------------------------------------------------------------

class TestDamageStateConfigWeightValues:
    """Validate that every weight value is a positive float."""

    def test_all_weight_values_are_positive_floats(self):
        """Every value in DAMAGE_STATE_CONFIG.weights is a float strictly greater than 0.0.

        Zero or negative weights would silently suppress a damage type from
        the weighted-random selection — this assertion guards against that.
        """
        assert all(
            isinstance(v, float) and v > 0.0
            for v in DAMAGE_STATE_CONFIG.weights.values()
        ), (
            "One or more weight values are not a positive float: "
            f"{DAMAGE_STATE_CONFIG.weights}"
        )

    def test_water_ingress_weight_is_positive_float(self):
        """water_ingress weight is a positive float."""
        w = DAMAGE_STATE_CONFIG.weights["water_ingress"]
        assert isinstance(w, float) and w > 0.0

    def test_oxidation_weight_is_positive_float(self):
        """oxidation weight is a positive float."""
        w = DAMAGE_STATE_CONFIG.weights["oxidation"]
        assert isinstance(w, float) and w > 0.0

    def test_crystal_crazing_weight_is_positive_float(self):
        """crystal_crazing weight is a positive float."""
        w = DAMAGE_STATE_CONFIG.weights["crystal_crazing"]
        assert isinstance(w, float) and w > 0.0
