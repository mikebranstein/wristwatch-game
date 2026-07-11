"""
Tests: SaveSystem — Craftsmanship Score Phase 1 backward-compat fields (Issue #253)
====================================================================================

Tests that SaveSystem.load_session() correctly initialises both new save fields
with null-safe defaults when loading pre-feature save files that lack them.

Also covers autosave_checkpoint, save_async, and _atomic_write paths introduced
for Issue #82 and exercised by the craftsmanship integration (AC4-T1/T2/T3).

Acceptance Criteria covered:
  AC3 — craftsmanship_dimensions_unlocked default ['cosmetic', 'mechanical'] on absent field
  AC4 — null craftsmanship_personal_best on first load: graceful degradation
  AC4-T1 — autosave_checkpoint: craftsmanship fields, callbacks, ValueError on bad stage
  AC4-T2 — save_async: on_success/on_error from background thread; silent absorption
  AC4-T3 — _atomic_write: normal write produces valid JSON; .tmp cleanup on failure; re-raise

Run with: pytest tests/
"""

import json
import os
import threading
import time
import unittest.mock

import pytest

from save.save_system import CHECKPOINT_STAGES, SaveSystem


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
        from orders.order_queue import OrderQueue

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


# ===========================================================================
# AC4-T1: autosave_checkpoint — lines 197–220
# ===========================================================================

class TestAutosaveCheckpointCraftsmanship:
    """AC4-T1: autosave_checkpoint preserves craftsmanship fields, fires callbacks,
    raises ValueError on unknown stage, and re-raises when on_error is absent."""

    def test_autosave_checkpoint_preserves_craftsmanship_dimensions_unlocked(self):
        """Craftsmanship dimensions field survives a checkpoint write."""
        ss = SaveSystem()
        game_state = {
            "gold": 200,
            "craftsmanship_dimensions_unlocked": ["cosmetic", "mechanical", "diagnostic"],
            "craftsmanship_personal_best": None,
        }
        result = ss.autosave_checkpoint(CHECKPOINT_STAGES.CLEANING, game_state)
        assert result["craftsmanship_dimensions_unlocked"] == ["cosmetic", "mechanical", "diagnostic"]

    def test_autosave_checkpoint_preserves_craftsmanship_personal_best(self):
        """craftsmanship_personal_best object survives a checkpoint write."""
        ss = SaveSystem()
        pb = {"score": 88, "tier": "Master", "jobId": "job-craft-01"}
        game_state = {
            "craftsmanship_personal_best": pb,
            "craftsmanship_dimensions_unlocked": ["cosmetic", "mechanical"],
        }
        result = ss.autosave_checkpoint(CHECKPOINT_STAGES.SOURCING, game_state)
        assert result["craftsmanship_personal_best"] == pb

    def test_autosave_checkpoint_stamps_stage_and_autosave_slot(self):
        """AC4-T1: checkpoint stamps last_checkpoint_stage and autosave_slot."""
        ss = SaveSystem()
        result = ss.autosave_checkpoint(CHECKPOINT_STAGES.REASSEMBLY, {"gold": 0})
        assert result["last_checkpoint_stage"] == CHECKPOINT_STAGES.REASSEMBLY
        assert result["autosave_slot"] is True

    def test_autosave_checkpoint_raises_valueerror_on_unknown_stage(self):
        """autosave_checkpoint raises ValueError for an unrecognised stage name."""
        ss = SaveSystem()
        with pytest.raises(ValueError, match="Unknown checkpoint stage"):
            ss.autosave_checkpoint("polishing", {})

    def test_autosave_checkpoint_on_success_callback_fires_with_save_path(self, tmp_path):
        """on_success fires after a successful disk write."""
        ss = SaveSystem()
        calls = []
        save_path = str(tmp_path / "craft_checkpoint.json")
        ss.autosave_checkpoint(
            CHECKPOINT_STAGES.TEARDOWN,
            {"craftsmanship_personal_best": None},
            save_path=save_path,
            on_success=lambda: calls.append("ok"),
        )
        assert calls == ["ok"]

    def test_autosave_checkpoint_on_error_fires_when_write_fails(self):
        """on_error callback fires when _atomic_write raises."""
        ss = SaveSystem()
        errors = []
        original = SaveSystem._atomic_write

        def _bad_write(path, data):
            raise OSError("simulated disk failure")

        SaveSystem._atomic_write = staticmethod(_bad_write)
        try:
            ss.autosave_checkpoint(
                CHECKPOINT_STAGES.CLEANING,
                {},
                save_path="any.json",
                on_error=lambda exc: errors.append(exc),
            )
        finally:
            SaveSystem._atomic_write = staticmethod(original)

        assert len(errors) == 1
        assert isinstance(errors[0], OSError)

    def test_autosave_checkpoint_reraises_when_no_on_error_callback(self):
        """Lines 217-218: autosave_checkpoint re-raises on write failure when on_error is None."""
        ss = SaveSystem()
        original = SaveSystem._atomic_write

        def _bad_write(path, data):
            raise OSError("simulated disk failure")

        SaveSystem._atomic_write = staticmethod(_bad_write)
        try:
            with pytest.raises(OSError, match="simulated disk failure"):
                ss.autosave_checkpoint(
                    CHECKPOINT_STAGES.TEARDOWN,
                    {},
                    save_path="any.json",
                    # No on_error → should re-raise
                )
        finally:
            SaveSystem._atomic_write = staticmethod(original)


# ===========================================================================
# AC4-T2: save_async — lines 246–256
# ===========================================================================

class TestSaveAsyncCraftsmanship:
    """AC4-T2: save_async fires on_success from background thread, fires on_error on failure,
    and silently absorbs failures when no on_error callback is provided."""

    def test_save_async_on_success_fires_after_background_write(self, tmp_path):
        """on_success is called from the background thread after a successful write."""
        ss = SaveSystem()
        done = threading.Event()
        results = []
        save_path = str(tmp_path / "async_craft.json")

        ss.save_async(
            {"craftsmanship_personal_best": {"score": 91, "tier": "Grandmaster"}},
            save_path,
            on_success=lambda: (results.append("ok"), done.set()),
        )

        done.wait(timeout=5)
        assert results == ["ok"]
        assert os.path.exists(save_path)

    def test_save_async_on_error_fires_when_write_fails(self):
        """on_error fires on the background thread when _atomic_write raises."""
        ss = SaveSystem()
        done = threading.Event()
        errors = []

        with unittest.mock.patch.object(
            ss, "_atomic_write", side_effect=OSError("async write failure")
        ):
            ss.save_async(
                {},
                "irrelevant_path.json",
                on_error=lambda exc: (errors.append(exc), done.set()),
            )
            done.wait(timeout=5)

        assert len(errors) == 1
        assert isinstance(errors[0], OSError)

    def test_save_async_silently_absorbs_failure_when_no_on_error(self):
        """No exception propagates to caller when write fails and on_error is absent."""
        ss = SaveSystem()
        with unittest.mock.patch.object(
            ss, "_atomic_write", side_effect=OSError("async write failure")
        ):
            # Should not raise — fire-and-forget mode
            ss.save_async({}, "irrelevant_path.json")
            time.sleep(0.15)  # give background thread time to run and fail silently


# ===========================================================================
# AC4-T3: _atomic_write — lines 271–285
# ===========================================================================

class TestAtomicWriteCraftsmanship:
    """AC4-T3: _atomic_write produces valid JSON on success, cleans up .tmp files on failure,
    and re-raises the exception so callers can respond."""

    def test_atomic_write_produces_valid_json_on_disk(self, tmp_path):
        """Normal write: target file exists and contains valid, complete JSON."""
        save_path = str(tmp_path / "craft_save.json")
        data = {
            "craftsmanship_personal_best": {"score": 78, "tier": "Master"},
            "craftsmanship_dimensions_unlocked": ["cosmetic", "mechanical"],
        }
        SaveSystem._atomic_write(save_path, data)

        assert os.path.exists(save_path)
        with open(save_path, "r", encoding="utf-8") as fh:
            on_disk = json.load(fh)

        assert on_disk["craftsmanship_personal_best"]["score"] == 78
        assert on_disk["craftsmanship_dimensions_unlocked"] == ["cosmetic", "mechanical"]

    def test_atomic_write_no_tmp_file_left_after_success(self, tmp_path):
        """No orphaned .tmp files remain after a successful atomic write."""
        save_path = str(tmp_path / "craft_save.json")
        SaveSystem._atomic_write(save_path, {"x": 1})
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert tmp_files == [], f"Orphaned .tmp files found: {tmp_files}"

    def test_atomic_write_reraises_on_json_dump_failure(self, tmp_path):
        """Lines 279-285: exception in json.dump is caught, .tmp cleaned up, and re-raised."""
        save_path = str(tmp_path / "craft_save.json")

        with unittest.mock.patch("json.dump", side_effect=IOError("disk full")):
            with pytest.raises(IOError, match="disk full"):
                SaveSystem._atomic_write(save_path, {"key": "value"})

        # .tmp file must be cleaned up
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert tmp_files == [], f"Orphaned .tmp files found after failure: {tmp_files}"

    def test_atomic_write_target_unchanged_when_write_fails(self, tmp_path):
        """If write fails, the original target file (if present) is not corrupted."""
        save_path = str(tmp_path / "craft_save.json")
        original_data = {"gold": 999, "last_checkpoint_stage": "cleaning"}

        # Write a valid save first
        with open(save_path, "w", encoding="utf-8") as fh:
            json.dump(original_data, fh)

        # Attempt an atomic write that fails at json.dump
        with unittest.mock.patch("json.dump", side_effect=IOError("disk full")):
            with pytest.raises(IOError):
                SaveSystem._atomic_write(save_path, {"corrupted": True})

        # Original file is untouched
        with open(save_path, "r", encoding="utf-8") as fh:
            preserved = json.load(fh)
        assert preserved["gold"] == 999

