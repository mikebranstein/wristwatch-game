"""
Tests for CompatibilityBadge — AC2

AC2: Every part in a search result list displays a compatibility badge
     (✓ Compatible / ~ Uncertain / ✗ Incompatible) relative to the active
     job's movement. Badge logic is deterministic — the same part and movement
     always produce the same badge.

Scenarios covered:
  Scenario 3  — Confirmed compatible part      → ✓ Compatible
  Scenario 4  — Confirmed incompatible part    → ✗ Incompatible (player NOT blocked)
  Scenario 5  — No compatibility entry         → ~ Uncertain (default, NOT Incompatible)
  Scenario 10 — No active job context          → NONE badge
"""

import pytest
from catalog.compatibility_badge import (
    evaluate_badge,
    BADGE_COMPATIBLE, BADGE_UNCERTAIN, BADGE_INCOMPATIBLE, BADGE_NONE,
)
from catalog.data.part_compatibility import MovementFamily, CompatibilityStatus


class TestAC2CompatibilityBadgeEvaluation:
    """AC2: Deterministic badge evaluation."""

    # -------------------------------------------------------------------------
    # Compatible badge (Scenario 3)
    # -------------------------------------------------------------------------

    def test_scenario3_compatible_part_returns_compatible_badge(self):
        """AC2 (Scenario 3) — part known to fit the active movement returns COMPATIBLE."""
        badge = evaluate_badge("ms-eta2824-std", MovementFamily.ETA_2824)
        assert badge is BADGE_COMPATIBLE
        assert badge.symbol == "✓"
        assert badge.label == "Compatible"
        assert badge.status == CompatibilityStatus.COMPATIBLE

    def test_as1950_specific_part_compatible_on_as1950(self):
        """AC2 — AS-1950 mainspring is COMPATIBLE on AS-1950 movement."""
        assert evaluate_badge("ms-as1950-std", MovementFamily.AS_1950) is BADGE_COMPATIBLE

    def test_miyota_part_compatible_on_miyota_movement(self):
        """AC2 — Miyota mainspring is COMPATIBLE on Miyota movement."""
        assert evaluate_badge("ms-miyota-std", MovementFamily.MIYOTA_8215) is BADGE_COMPATIBLE

    def test_universal_crown_wheel_compatible_on_all_movements(self):
        """AC2 — Universal crown wheel is COMPATIBLE for all supported movements."""
        assert evaluate_badge("cw-universal", MovementFamily.ETA_2824) is BADGE_COMPATIBLE
        assert evaluate_badge("cw-universal", MovementFamily.AS_1950) is BADGE_COMPATIBLE
        assert evaluate_badge("cw-universal", MovementFamily.MIYOTA_8215) is BADGE_COMPATIBLE

    def test_universal_click_spring_compatible_on_all_movements(self):
        """AC2 — Universal click spring is COMPATIBLE for all movements."""
        assert evaluate_badge("cs-universal", MovementFamily.ETA_2824) is BADGE_COMPATIBLE
        assert evaluate_badge("cs-universal", MovementFamily.AS_1950) is BADGE_COMPATIBLE
        assert evaluate_badge("cs-universal", MovementFamily.MIYOTA_8215) is BADGE_COMPATIBLE

    # -------------------------------------------------------------------------
    # Incompatible badge (Scenario 4)
    # -------------------------------------------------------------------------

    def test_scenario4_incompatible_part_returns_incompatible_badge(self):
        """AC2 (Scenario 4) — part from a different movement family returns INCOMPATIBLE."""
        badge = evaluate_badge("ms-eta2824-std", MovementFamily.AS_1950)
        assert badge is BADGE_INCOMPATIBLE
        assert badge.symbol == "✗"
        assert badge.label == "Incompatible"
        assert badge.status == CompatibilityStatus.INCOMPATIBLE

    def test_scenario4_incompatible_badge_does_not_have_blocked_flag(self):
        """AC2 (Scenario 4) — INCOMPATIBLE badge informs but does NOT block ordering.
        Badge object has no 'blocked' attribute that could prevent UI from showing the part."""
        badge = evaluate_badge("ms-eta2824-std", MovementFamily.AS_1950)
        assert not hasattr(badge, "blocked")

    def test_as1950_mainspring_incompatible_on_eta2824(self):
        """AC2 — AS-1950 mainspring is INCOMPATIBLE on ETA-2824 movement."""
        assert evaluate_badge("ms-as1950-std", MovementFamily.ETA_2824) is BADGE_INCOMPATIBLE

    def test_miyota_balance_wheel_incompatible_on_eta2824(self):
        """AC2 — Miyota balance wheel is INCOMPATIBLE on ETA-2824 movement."""
        assert evaluate_badge("bw-miyota-std", MovementFamily.ETA_2824) is BADGE_INCOMPATIBLE

    def test_eta_balance_wheel_incompatible_on_as1950(self):
        """AC2 — ETA balance wheel is INCOMPATIBLE on AS-1950 movement."""
        assert evaluate_badge("bw-eta2824-std", MovementFamily.AS_1950) is BADGE_INCOMPATIBLE

    def test_incompatible_badge_has_tooltip(self):
        """AC2 — INCOMPATIBLE badge has tooltip text explaining the situation."""
        badge = evaluate_badge("ms-eta2824-std", MovementFamily.AS_1950)
        assert badge.tooltip is not None
        assert len(badge.tooltip) > 0

    # -------------------------------------------------------------------------
    # Uncertain badge (Scenario 5)
    # -------------------------------------------------------------------------

    def test_scenario5_unknown_part_returns_uncertain_badge(self):
        """AC2 (Scenario 5) — part with no defined compatibility entry returns UNCERTAIN."""
        badge = evaluate_badge("totally-unknown-part-id-xyz", MovementFamily.ETA_2824)
        assert badge is BADGE_UNCERTAIN
        assert badge.symbol == "~"
        assert badge.label == "Uncertain"
        assert badge.status == CompatibilityStatus.UNCERTAIN

    def test_scenario5_uncertain_is_default_not_incompatible(self):
        """AC2 (Scenario 5) — UNCERTAIN (not INCOMPATIBLE) is the default for missing entries.
        Design decision: parts without a defined compatibility entry render ~ Uncertain."""
        badge = evaluate_badge("new-unlisted-part", MovementFamily.MIYOTA_8215)
        assert badge is BADGE_UNCERTAIN
        assert badge is not BADGE_INCOMPATIBLE

    def test_uncertain_badge_has_bench_verification_tooltip(self):
        """AC2 (Scenario 5) — UNCERTAIN badge tooltip mentions bench verification."""
        badge = evaluate_badge("unknown-part", MovementFamily.ETA_2824)
        assert badge.tooltip is not None
        assert "bench verification" in badge.tooltip.lower()

    # -------------------------------------------------------------------------
    # No badge — no active job (Scenario 10)
    # -------------------------------------------------------------------------

    def test_scenario10_no_badge_when_movement_family_is_none(self):
        """AC2 (Scenario 10) — returns NONE badge when no active movement context."""
        badge = evaluate_badge("ms-eta2824-std", None)
        assert badge is BADGE_NONE
        assert badge.symbol is None
        assert badge.label is None
        assert badge.status is None

    def test_scenario10_no_badge_when_movement_family_is_empty_string(self):
        """AC2 (Scenario 10) — returns NONE badge for empty movement family."""
        badge = evaluate_badge("ms-eta2824-std", "")
        assert badge is BADGE_NONE

    # -------------------------------------------------------------------------
    # Determinism — AC2 core invariant
    # -------------------------------------------------------------------------

    def test_determinism_same_inputs_always_return_same_badge_instance(self):
        """AC2 — same part + movement always yields the same badge (identity check)."""
        part_id = "pf-eta2824-std"
        movement = MovementFamily.ETA_2824

        results = [evaluate_badge(part_id, movement) for _ in range(10)]
        assert all(r is BADGE_COMPATIBLE for r in results)

    def test_determinism_for_incompatible_badge(self):
        """AC2 — INCOMPATIBLE badge is deterministic across repeated calls."""
        part_id = "ms-eta2824-std"
        movement = MovementFamily.AS_1950

        for _ in range(5):
            assert evaluate_badge(part_id, movement) is BADGE_INCOMPATIBLE

    def test_determinism_for_uncertain_badge(self):
        """AC2 — UNCERTAIN badge is deterministic across repeated calls."""
        part_id = "never-seen-before-part"
        movement = MovementFamily.ETA_2824

        for _ in range(5):
            assert evaluate_badge(part_id, movement) is BADGE_UNCERTAIN

    def test_different_movements_may_yield_different_badges_for_same_part(self):
        """AC2 — a part that is compatible on one movement may be incompatible on another."""
        badge_eta = evaluate_badge("ms-eta2824-std", MovementFamily.ETA_2824)
        badge_as = evaluate_badge("ms-eta2824-std", MovementFamily.AS_1950)

        assert badge_eta is BADGE_COMPATIBLE
        assert badge_as is BADGE_INCOMPATIBLE
        assert badge_eta is not badge_as
