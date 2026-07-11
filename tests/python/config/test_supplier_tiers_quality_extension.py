"""
Tests for SupplierTierConfig extension — Issue #151: Workshop Economy Expanded
==============================================================================

Covers AC2 (parts sourcing quality modifiers) and Scenario 9 (#4 integration
consistency — no duplicate sourcing UI; quality derived from supplier_tier on Order).

AC2  — Budget parts lower cost + reduced quality modifier vs premium parts
S2   — Budget selection: lower cost reflected; rework probability shown
S3   — Premium selection: higher cost; quality bonus applied; lower rework probability
S9   — No duplicate sourcing decision; quality modifier derived from supplier_tier on Order
"""

import pytest

from src.config.supplier_tiers import SUPPLIER_TIERS, SupplierTierConfig


# ---------------------------------------------------------------------------
# AC2 / S2-S3 — Quality modifier and rework probability per tier
# ---------------------------------------------------------------------------

class TestSupplierTierQualityExtension:
    """AC2 — SupplierTierConfig extended with quality_modifier and rework_probability."""

    def test_standard_tier_has_quality_modifier(self):
        """STANDARD tier has a quality_modifier attribute."""
        tier = SUPPLIER_TIERS["STANDARD"]
        assert hasattr(tier, "quality_modifier")
        assert isinstance(tier.quality_modifier, float)

    def test_standard_tier_has_rework_probability(self):
        """STANDARD tier has a rework_probability attribute."""
        tier = SUPPLIER_TIERS["STANDARD"]
        assert hasattr(tier, "rework_probability")
        assert isinstance(tier.rework_probability, float)

    def test_premium_tier_has_quality_modifier(self):
        """PREMIUM tier has a quality_modifier attribute."""
        tier = SUPPLIER_TIERS["PREMIUM"]
        assert hasattr(tier, "quality_modifier")

    def test_premium_tier_has_rework_probability(self):
        """PREMIUM tier has a rework_probability attribute."""
        tier = SUPPLIER_TIERS["PREMIUM"]
        assert hasattr(tier, "rework_probability")

    def test_premium_quality_modifier_higher_than_standard(self):
        """
        PREMIUM tier quality_modifier > STANDARD tier quality_modifier (AC2).
        Premium parts provide better quality than budget parts.
        """
        standard = SUPPLIER_TIERS["STANDARD"]
        premium = SUPPLIER_TIERS["PREMIUM"]
        assert premium.quality_modifier > standard.quality_modifier

    def test_standard_quality_modifier_is_neutral_or_lower(self):
        """STANDARD tier quality_modifier is 0.0 (neutral — budget baseline)."""
        standard = SUPPLIER_TIERS["STANDARD"]
        assert standard.quality_modifier == 0.0

    def test_premium_quality_modifier_is_positive(self):
        """PREMIUM tier quality_modifier is positive (bonus)."""
        premium = SUPPLIER_TIERS["PREMIUM"]
        assert premium.quality_modifier > 0.0

    def test_premium_rework_probability_lower_than_standard(self):
        """
        PREMIUM rework_probability < STANDARD rework_probability (AC2 / S3).
        Premium parts reduce the risk of rework.
        """
        standard = SUPPLIER_TIERS["STANDARD"]
        premium = SUPPLIER_TIERS["PREMIUM"]
        assert premium.rework_probability < standard.rework_probability

    def test_rework_probability_values_in_valid_range(self):
        """rework_probability values are in [0.0, 1.0] for both tiers."""
        for tier_key, tier in SUPPLIER_TIERS.items():
            assert 0.0 <= tier.rework_probability <= 1.0, (
                f"{tier_key}.rework_probability={tier.rework_probability} out of range"
            )

    def test_quality_modifier_values_in_valid_range(self):
        """quality_modifier values are in [-1.0, 1.0] for both tiers."""
        for tier_key, tier in SUPPLIER_TIERS.items():
            assert -1.0 <= tier.quality_modifier <= 1.0, (
                f"{tier_key}.quality_modifier={tier.quality_modifier} out of range"
            )


class TestSupplierTierExistingBehaviorUnchanged:
    """Existing delivery/expedite behavior unchanged by Issue #151 extension (S9 regression)."""

    def test_standard_sessions_to_arrive_unchanged(self):
        """STANDARD sessions_to_arrive remains 1."""
        assert SUPPLIER_TIERS["STANDARD"].sessions_to_arrive == 1

    def test_premium_sessions_to_arrive_unchanged(self):
        """PREMIUM sessions_to_arrive remains 1."""
        assert SUPPLIER_TIERS["PREMIUM"].sessions_to_arrive == 1

    def test_standard_expedite_cost_multiplier_unchanged(self):
        """STANDARD expedite_cost_multiplier remains 2.5."""
        assert SUPPLIER_TIERS["STANDARD"].expedite_cost_multiplier == 2.5

    def test_premium_expedite_cost_multiplier_unchanged(self):
        """PREMIUM expedite_cost_multiplier remains 1.5."""
        assert SUPPLIER_TIERS["PREMIUM"].expedite_cost_multiplier == 1.5

    def test_standard_expedite_min_playtime_unchanged(self):
        """STANDARD expedite_min_playtime_secs remains 600."""
        assert SUPPLIER_TIERS["STANDARD"].expedite_min_playtime_secs == 600

    def test_premium_expedite_min_playtime_unchanged(self):
        """PREMIUM expedite_min_playtime_secs remains 300."""
        assert SUPPLIER_TIERS["PREMIUM"].expedite_min_playtime_secs == 300

    def test_tier_is_frozen_dataclass(self):
        """SupplierTierConfig remains a frozen dataclass (immutable)."""
        tier = SUPPLIER_TIERS["STANDARD"]
        with pytest.raises((AttributeError, TypeError)):
            tier.sessions_to_arrive = 99  # type: ignore


# ---------------------------------------------------------------------------
# Scenario 9 — No duplicate sourcing UI (derive from supplier_tier on Order)
# ---------------------------------------------------------------------------

class TestNoDuplicateSourcingUI:
    """
    Scenario 9 — Quality modifiers are derived from the supplier_tier already
    recorded on the Order record. No second sourcing decision point needed.
    """

    def test_quality_modifier_lookup_by_tier_key(self):
        """Quality modifier for a job can be derived from supplier_tier key alone."""
        # Simulates: given an Order with supplier_tier="PREMIUM", derive modifier
        order_supplier_tier = "PREMIUM"
        tier_config = SUPPLIER_TIERS[order_supplier_tier]
        # No separate sourcing screen needed — all info is on the tier config
        assert tier_config.quality_modifier > 0.0
        assert tier_config.rework_probability < SUPPLIER_TIERS["STANDARD"].rework_probability

    def test_standard_tier_quality_consequence_derivable_from_tier_key(self):
        """STANDARD tier quality consequence derivable from tier key on Order."""
        order_supplier_tier = "STANDARD"
        tier_config = SUPPLIER_TIERS[order_supplier_tier]
        assert tier_config.quality_modifier == 0.0
        assert tier_config.rework_probability > 0.0

    def test_all_tier_keys_present_in_supplier_tiers(self):
        """Both STANDARD and PREMIUM keys exist in SUPPLIER_TIERS dict."""
        assert "STANDARD" in SUPPLIER_TIERS
        assert "PREMIUM" in SUPPLIER_TIERS
