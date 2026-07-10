"""
Tests: SaveSystem — Craftsmanship Score Phase 1 backward-compat fields (Issue #253)
====================================================================================

Tests that SaveSystem.load_session() correctly initialises both new save fields
with null-safe defaults when loading pre-feature save files that lack them.

Acceptance Criteria covered:
  AC4 — null craftsmanship_personal_best on first load: graceful degradation
  AC3 — craftsmanship_dimensions_unlocked default ['cosmetic', 'mechanical'] on absent field

Run with: pytest tests/
"""

from src.save.save_system import SaveSystem


class TestSaveSystemCraftsmanship:
    save_system = SaveSystem()

    # ── craftsmanship_dimensions_unlocked ────────────────────────────────────

    def test_load_session_absent_dimensions_unlocked_gets_default_list(self):
        """Pre-feature save without craftsmanship_dimensions_unlocked → default list."""
        _, _, updated = self.save_system.load_session({"gold": 100})
        assert updated.get("craftsmanship_dimensions_unlocked") == ["cosmetic", "mechanical"], (
            "Pre-feature save should receive default craftsmanship_dimensions_unlocked"
        )

    def test_load_session_none_save_dimensions_unlocked_gets_default_list(self):
        """None save (new save) → craftsmanship_dimensions_unlocked default list."""
        _, _, updated = self.save_system.load_session(None)
        assert updated.get("craftsmanship_dimensions_unlocked") == ["cosmetic", "mechanical"]

    def test_load_session_null_dimensions_unlocked_gets_default_list(self):
        """Corrupted save with null craftsmanship_dimensions_unlocked → default list."""
        _, _, updated = self.save_system.load_session({"craftsmanship_dimensions_unlocked": None})
        assert updated.get("craftsmanship_dimensions_unlocked") == ["cosmetic", "mechanical"], (
            "Null craftsmanship_dimensions_unlocked should be coerced to default list"
        )

    def test_load_session_string_dimensions_unlocked_gets_default_list(self):
        """Corrupted save with string value → replaced with default list."""
        _, _, updated = self.save_system.load_session({"craftsmanship_dimensions_unlocked": "cosmetic"})
        assert updated.get("craftsmanship_dimensions_unlocked") == ["cosmetic", "mechanical"]

    def test_load_session_valid_dimensions_unlocked_preserved(self):
        """Valid craftsmanship_dimensions_unlocked list is preserved without modification."""
        all_four = ["cosmetic", "mechanical", "diagnostic", "economic"]
        _, _, updated = self.save_system.load_session({"craftsmanship_dimensions_unlocked": all_four})
        assert updated.get("craftsmanship_dimensions_unlocked") == all_four

    def test_load_session_partial_dimensions_unlocked_preserved(self):
        """Partial unlock list (3 dimensions) is preserved as-is."""
        three = ["cosmetic", "mechanical", "diagnostic"]
        _, _, updated = self.save_system.load_session({"craftsmanship_dimensions_unlocked": three})
        assert updated.get("craftsmanship_dimensions_unlocked") == three

    # ── craftsmanship_personal_best ──────────────────────────────────────────

    def test_load_session_absent_personal_best_gets_none(self):
        """Pre-feature save without craftsmanship_personal_best → None default."""
        _, _, updated = self.save_system.load_session({"gold": 100})
        assert updated.get("craftsmanship_personal_best") is None, (
            "Pre-feature save should receive craftsmanship_personal_best: None"
        )

    def test_load_session_none_save_personal_best_gets_none(self):
        """None save (new save) → craftsmanship_personal_best is None."""
        _, _, updated = self.save_system.load_session(None)
        assert updated.get("craftsmanship_personal_best") is None

    def test_load_session_personal_best_null_value_preserved_as_none(self):
        """Explicit null craftsmanship_personal_best in save file → preserved as None."""
        _, _, updated = self.save_system.load_session({"craftsmanship_personal_best": None})
        assert updated.get("craftsmanship_personal_best") is None

    def test_load_session_valid_personal_best_object_preserved(self):
        """Valid craftsmanship_personal_best object is preserved without modification."""
        pb = {"score": 78, "tier": "Master", "jobId": "job-001"}
        _, _, updated = self.save_system.load_session({"craftsmanship_personal_best": pb})
        assert updated.get("craftsmanship_personal_best") == pb

    def test_load_session_personal_best_survives_round_trip(self):
        """craftsmanship_personal_best persists through load → save → load cycle."""
        from src.orders.order_queue import OrderQueue

        pb = {"score": 91, "tier": "Grandmaster", "jobId": "job-002"}
        q1_data, _, s1 = self.save_system.load_session({"craftsmanship_personal_best": pb})
        q1 = OrderQueue(q1_data)
        saved = self.save_system.save_session(q1.to_save_data(), s1)

        assert "craftsmanship_personal_best" in saved
        assert saved["craftsmanship_personal_best"] == pb

        # Second load round-trip
        _, _, s2 = self.save_system.load_session(saved)
        assert s2.get("craftsmanship_personal_best") == pb

    # ── Both fields together ─────────────────────────────────────────────────

    def test_load_session_both_fields_initialised_on_pre_feature_save(self):
        """Both new fields are correctly initialised together on a pre-feature save."""
        old_save = {
            "gold": 500,
            "player_level": 3,
            "completed_watches": [],
            "ledger_balance": 100,
        }
        _, _, updated = self.save_system.load_session(old_save)

        # Original fields preserved
        assert updated.get("gold") == 500
        assert updated.get("player_level") == 3

        # New fields initialised with defaults
        assert updated.get("craftsmanship_dimensions_unlocked") == ["cosmetic", "mechanical"]
        assert updated.get("craftsmanship_personal_best") is None

    def test_load_session_existing_save_fields_not_overwritten(self):
        """craftsmanship_personal_best key present in save data is never overwritten by load."""
        # Even a score of 0 should be preserved (the check is for key absence, not falsy value)
        pb_zero = {"score": 0, "tier": "Apprentice", "jobId": None}
        _, _, updated = self.save_system.load_session({"craftsmanship_personal_best": pb_zero})
        # Key was present → value preserved unchanged
        assert updated.get("craftsmanship_personal_best") == pb_zero
