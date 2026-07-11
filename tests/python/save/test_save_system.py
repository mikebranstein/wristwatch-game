"""
Tests for SaveSystem
====================
Full session boundary lifecycle, save/load integrity, backward compatibility,
autosave checkpoints, atomic writes, and async save path (Issue #82).

Run with:
    pytest tests/
"""

import json
import os
import threading
import time
import tempfile

import pytest
from save.save_system import SaveSystem, CHECKPOINT_STAGES
from orders.order_queue import OrderQueue


class TestSaveSystem:
    save_system = SaveSystem()

    def make_part(self, **overrides):
        params = dict(
            part_id="part-mainspring",
            part_name="Mainspring",
            job_id="job-seiko",
            supplier_tier="STANDARD",
            cost=10.0,
        )
        params.update(overrides)
        return params

    # ── Scenario 1: full between-session flow ─────────────────────────────────

    def test_scenario1_full_between_session_flow(self):
        """Scenario 1: order placed → save → reload → part Arrived."""
        # Session 1: place order and save
        q1_data, _, save1 = self.save_system.load_session(None)
        q1 = OrderQueue(q1_data)
        q1.place_order(**self.make_part())
        saved_after_order = self.save_system.save_session(q1.to_save_data(), save1)

        # Session 2: reload — resolve_arrivals fires → part arrives
        q2_data, arrived, _ = self.save_system.load_session(saved_after_order)
        q2 = OrderQueue(q2_data)

        assert len(arrived) == 1
        assert arrived[0]["part_name"] == "Mainspring"
        assert arrived[0]["status"] == "Arrived"
        assert q2.is_part_arrived("job-seiko", "part-mainspring")

    # ── New save / pre-feature saves ──────────────────────────────────────────

    def test_load_session_on_new_save_initialises_empty_queue(self):
        queue_data, arrived, _ = self.save_system.load_session(None)
        queue = OrderQueue(queue_data)
        assert arrived == []
        assert queue.get_all_orders() == []

    def test_load_session_on_pre_feature_save_no_order_queue_node(self):
        """Backward compat: save file exists but has no order_queue key."""
        queue_data, arrived, _ = self.save_system.load_session({"player_name": "Alice"})
        queue = OrderQueue(queue_data)
        assert arrived == []
        assert queue.get_all_orders() == []

    # ── Scenario 8: crash recovery ────────────────────────────────────────────

    def test_scenario8_order_survives_crash_recovery(self):
        """Scenario 8: order persisted at placement time survives abnormal exit."""
        q1_data, _, s1 = self.save_system.load_session(None)
        q1 = OrderQueue(q1_data)
        q1.place_order(**self.make_part())
        # Atomic write immediately after placement
        saved_after_placement = self.save_system.save_session(q1.to_save_data(), s1)

        # Simulate crash: discard q1, reload from persisted data
        q2_data, arrived, _ = self.save_system.load_session(saved_after_placement)
        q2 = OrderQueue(q2_data)
        assert len(arrived) == 1
        assert q2.is_part_arrived("job-seiko", "part-mainspring")

    # ── Save data integrity ───────────────────────────────────────────────────

    def test_save_session_preserves_other_save_data_fields(self):
        queue_data, _, save_data = self.save_system.load_session({"gold": 500, "player_level": 3})
        queue = OrderQueue(queue_data)
        saved = self.save_system.save_session(queue.to_save_data(), save_data)
        assert saved["gold"] == 500
        assert saved["player_level"] == 3
        assert "order_queue" in saved

    def test_scenario6_no_spurious_notification_on_reload_with_no_orders(self):
        """Scenario 6: player saves with no pending orders → no notification on reload."""
        queue_data, _, save_data = self.save_system.load_session(None)
        queue = OrderQueue(queue_data)
        saved = self.save_system.save_session(queue.to_save_data(), save_data)
        _, arrived_next, _ = self.save_system.load_session(saved)
        assert arrived_next == []

    # ─────────────────────────────────────────────────────────────────────────
    # Issue #82: autosave_checkpoint tests (AC1, AC5)
    # ─────────────────────────────────────────────────────────────────────────

    def test_autosave_checkpoint_stamps_stage_metadata(self):
        """AC1: autosave_checkpoint stamps last_checkpoint_stage and autosave_slot."""
        ss = SaveSystem()
        game_state = {"gold": 100, "watch_id": "seiko-5"}
        result = ss.autosave_checkpoint(CHECKPOINT_STAGES.TEARDOWN, game_state)

        assert result["last_checkpoint_stage"] == CHECKPOINT_STAGES.TEARDOWN
        assert result["autosave_slot"] is True
        assert result["gold"] == 100           # original fields preserved

    def test_autosave_checkpoint_all_stages_accepted(self):
        """AC1: all four stage constants produce valid checkpoints."""
        ss = SaveSystem()
        for stage in CHECKPOINT_STAGES.ALL:
            result = ss.autosave_checkpoint(stage, {"stage": stage})
            assert result["last_checkpoint_stage"] == stage

    def test_autosave_checkpoint_raises_on_unknown_stage(self):
        """autosave_checkpoint rejects unrecognised stage names."""
        ss = SaveSystem()
        with pytest.raises(ValueError, match="Unknown checkpoint stage"):
            ss.autosave_checkpoint("invalid_stage", {})

    def test_autosave_checkpoint_does_not_mutate_original_game_state(self):
        """autosave_checkpoint returns a new dict; original is not modified."""
        ss = SaveSystem()
        game_state = {"gold": 50}
        result = ss.autosave_checkpoint(CHECKPOINT_STAGES.CLEANING, game_state)
        assert "last_checkpoint_stage" not in game_state
        assert result is not game_state

    # ── Atomic write to disk ──────────────────────────────────────────────────

    def test_autosave_checkpoint_writes_file_atomically(self, tmp_path):
        """AC5: checkpoint file exists on disk after autosave_checkpoint with save_path."""
        ss = SaveSystem()
        save_path = str(tmp_path / "autosave.json")
        game_state = {"gold": 200, "watch_id": "omega-def"}

        result = ss.autosave_checkpoint(
            CHECKPOINT_STAGES.REASSEMBLY, game_state, save_path=save_path
        )

        assert os.path.exists(save_path), "Save file must exist after atomic write"
        with open(save_path, "r") as f:
            on_disk = json.load(f)

        assert on_disk["last_checkpoint_stage"] == CHECKPOINT_STAGES.REASSEMBLY
        assert on_disk["gold"] == 200

    def test_autosave_checkpoint_no_tmp_files_left_behind(self, tmp_path):
        """Atomic write: no orphaned .tmp files after a successful write."""
        ss = SaveSystem()
        save_path = str(tmp_path / "autosave.json")
        ss.autosave_checkpoint(CHECKPOINT_STAGES.SOURCING, {"x": 1}, save_path=save_path)

        tmp_files = list(tmp_path.glob("*.tmp"))
        assert tmp_files == [], f"Orphaned tmp files found: {tmp_files}"

    def test_autosave_checkpoint_on_success_callback_fires(self, tmp_path):
        """AC2 (hook): on_success callback fires after successful write."""
        ss = SaveSystem()
        calls = []
        save_path = str(tmp_path / "autosave.json")

        ss.autosave_checkpoint(
            CHECKPOINT_STAGES.CLEANING, {}, save_path=save_path,
            on_success=lambda: calls.append("ok"),
        )
        assert calls == ["ok"]

    def test_autosave_checkpoint_on_error_callback_fires_on_bad_path(self):
        """AC3: on_error callback fires when save path is unwritable."""
        ss = SaveSystem()
        errors = []
        # Force a write failure by patching _atomic_write.
        original = SaveSystem._atomic_write
        def _bad_write(path, data):
            raise OSError("simulated write failure")
        SaveSystem._atomic_write = staticmethod(_bad_write)

        try:
            ss.autosave_checkpoint(
                CHECKPOINT_STAGES.TEARDOWN, {}, save_path="any_path.json",
                on_error=lambda exc: errors.append(exc),
            )
        finally:
            SaveSystem._atomic_write = staticmethod(original)  # restore as staticmethod

        assert len(errors) == 1
        assert isinstance(errors[0], OSError)

    def test_autosave_checkpoint_error_does_not_corrupt_existing_save(self, tmp_path):
        """AC3: failed write leaves existing save file untouched."""
        ss = SaveSystem()
        save_path = str(tmp_path / "autosave.json")

        # Write a valid save first.
        with open(save_path, "w") as f:
            json.dump({"gold": 999, "last_checkpoint_stage": "cleaning"}, f)

        # Now trigger a write failure by passing a deeply bad path.
        # We simulate this by patching _atomic_write to raise.
        original = SaveSystem._atomic_write
        def _bad_write(path, data):
            raise OSError("simulated disk full")
        SaveSystem._atomic_write = staticmethod(_bad_write)

        try:
            errors = []
            ss.autosave_checkpoint(
                CHECKPOINT_STAGES.REASSEMBLY, {"gold": 1},
                save_path=save_path,
                on_error=lambda e: errors.append(e),
            )
        finally:
            SaveSystem._atomic_write = staticmethod(original)  # restore as staticmethod

        # Original file should be unmodified.
        with open(save_path, "r") as f:
            on_disk = json.load(f)
        assert on_disk["gold"] == 999
        assert on_disk["last_checkpoint_stage"] == "cleaning"

    # ── save_async tests ──────────────────────────────────────────────────────

    def test_save_async_writes_file_in_background(self, tmp_path):
        """save_async writes the save file asynchronously without blocking."""
        ss = SaveSystem()
        save_path = str(tmp_path / "async_save.json")
        game_state = {"gold": 777}
        done = threading.Event()
        bg_errors = []

        def on_success():
            done.set()

        def on_error(exc):
            bg_errors.append(exc)
            done.set()

        ss.save_async(game_state, save_path, on_success=on_success, on_error=on_error)

        # Wait up to 10 s for background thread.
        done.wait(timeout=10.0)

        assert bg_errors == [], f"save_async raised in background thread: {bg_errors}"
        assert os.path.exists(save_path), "Save file must exist after async write"
        with open(save_path, "r") as f:
            on_disk = json.load(f)
        assert on_disk["gold"] == 777

    def test_save_async_calls_on_error_on_bad_path(self, tmp_path):
        """save_async calls on_error when the target path is unwritable."""
        ss = SaveSystem()
        errors = []
        done = threading.Event()

        # Use a file as a directory component — makedirs will fail on any OS.
        blocker = str(tmp_path / "blocker")
        with open(blocker, "w") as f:
            f.write("x")
        bad_path = str(tmp_path / "blocker" / "save.json")  # blocker is a file, not a dir

        def _on_error(exc):
            errors.append(exc)
            done.set()

        ss.save_async({}, bad_path, on_error=_on_error)
        done.wait(timeout=5.0)
        assert len(errors) == 1

    def test_save_async_is_non_blocking(self, tmp_path):
        """save_async returns immediately; game loop is not paused."""
        ss = SaveSystem()
        save_path = str(tmp_path / "nonblock.json")
        start = time.monotonic()
        ss.save_async({"x": 1}, save_path)
        elapsed = time.monotonic() - start
        # save_async must return well under 100 ms (file I/O happens on bg thread).
        assert elapsed < 0.1, f"save_async blocked for {elapsed:.3f}s"

    # ─────────────────────────────────────────────────────────────────────────
    # Issue #127 — Collection Gallery: completed_watches null-safe load tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_load_session_pre_feature_save_completed_watches_defaults_to_empty(self):
        """Issue #127: save file without completed_watches key → empty list in output."""
        ss = SaveSystem()
        _, _, updated = ss.load_session({"gold": 100})
        assert updated.get("completed_watches") == [], (
            "Pre-feature save should get completed_watches: [] default"
        )

    def test_load_session_none_save_completed_watches_defaults_to_empty(self):
        """Issue #127: None save data (new save) → completed_watches: [] in output."""
        ss = SaveSystem()
        _, _, updated = ss.load_session(None)
        assert updated.get("completed_watches") == []

    def test_load_session_preserves_existing_completed_watches(self):
        """Issue #127: completed_watches from save file is preserved after load."""
        ss = SaveSystem()
        prior_watches = [
            {
                "watchId": "w-001",
                "watchName": "Seiko 5 Sports",
                "clientName": "Alice",
                "completionDate": "2026-07-01",
                "portraitAssetKey": "portraits/seiko-5.png",
            }
        ]
        _, _, updated = ss.load_session({"completed_watches": prior_watches})
        assert len(updated["completed_watches"]) == 1
        assert updated["completed_watches"][0]["watchName"] == "Seiko 5 Sports"

    def test_load_session_completed_watches_null_value_coerced_to_empty(self):
        """Issue #127: null completed_watches in corrupted save → coerced to []."""
        ss = SaveSystem()
        _, _, updated = ss.load_session({"completed_watches": None})
        assert updated["completed_watches"] == [], (
            "Null completed_watches should be coerced to empty list"
        )

    def test_load_session_completed_watches_survives_round_trip(self):
        """Issue #127: watches persisted to disk survive load → save → reload cycle."""
        ss = SaveSystem()
        prior_watches = [
            {
                "watchId": "w-001",
                "watchName": "Omega Speedmaster",
                "clientName": "Bob",
                "completionDate": "2026-07-10",
                "portraitAssetKey": None,
            }
        ]
        # First load
        q1_data, _, s1 = ss.load_session({"completed_watches": prior_watches})
        q1 = OrderQueue(q1_data)
        # Save (adds order_queue but should preserve completed_watches)
        saved = ss.save_session(q1.to_save_data(), s1)
        assert "completed_watches" in saved
        assert len(saved["completed_watches"]) == 1

        # Second load from saved state
        _, _, s2 = ss.load_session(saved)
        assert len(s2["completed_watches"]) == 1
        assert s2["completed_watches"][0]["watchName"] == "Omega Speedmaster"
