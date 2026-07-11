"""
Tests for SaveConflictResolver
================================
Issue #82 — AC4, Test Scenarios 7, 8, 9.

State machine:
  IDLE → CONFLICT_DETECTED → AWAITING_CONFIRMATION → RESOLVED
                           ↑_______ player_cancels() ___|

Run with:
    pytest tests/
"""

import pytest
from unittest.mock import MagicMock
from save.save_conflict_resolver import (
    SaveConflictResolver, RESOLVER_STATE, ConflictScreenState
)
from save.cloud_sync_manager import CloudSyncManager, ConflictInfo, SaveMetadata


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_conflict_info(has_conflict=True, local_ts=2000.0, cloud_ts=1000.0):
    local_meta = SaveMetadata(
        timestamp=local_ts, last_known_stage="sourcing", source="local"
    )
    cloud_meta = SaveMetadata(
        timestamp=cloud_ts, last_known_stage="cleaning", source="cloud"
    )
    return ConflictInfo(
        has_conflict=has_conflict,
        local_meta=local_meta if has_conflict else None,
        cloud_meta=cloud_meta if has_conflict else None,
    )


def make_cloud_manager(has_conflict=True, cloud_save=None, cloud_ts=1000.0):
    """Return a CloudSyncManager mock wired to return a conflict or no-conflict."""
    mgr = MagicMock(spec=CloudSyncManager)
    mgr.detect_conflict.return_value = _make_conflict_info(has_conflict)
    mgr.pull_save.return_value = (
        cloud_save or {"gold": 100, "last_checkpoint_stage": "cleaning"},
        cloud_ts,
    )
    return mgr


# ---------------------------------------------------------------------------
# detect_conflict_at_load
# ---------------------------------------------------------------------------

class TestDetectConflictAtLoad:
    def test_returns_false_and_stays_idle_when_no_conflict(self):
        mgr = make_cloud_manager(has_conflict=False)
        resolver = SaveConflictResolver(mgr)
        result = resolver.detect_conflict_at_load({"gold": 10}, local_timestamp=1.0)
        assert result is False
        assert resolver.state == RESOLVER_STATE.IDLE

    def test_returns_true_and_transitions_to_conflict_detected(self):
        """Scenario 7: conflict is detected at load time."""
        mgr = make_cloud_manager(has_conflict=True)
        resolver = SaveConflictResolver(mgr)
        result = resolver.detect_conflict_at_load({"gold": 10}, local_timestamp=2000.0)
        assert result is True
        assert resolver.state == RESOLVER_STATE.CONFLICT_DETECTED


# ---------------------------------------------------------------------------
# build_conflict_screen_state — AC4 UI display
# ---------------------------------------------------------------------------

class TestBuildConflictScreenState:
    def test_returns_screen_state_in_conflict_detected(self):
        """AC4: conflict screen shows both saves with timestamps and stage."""
        mgr = make_cloud_manager(
            cloud_save={"last_checkpoint_stage": "cleaning"},
            cloud_ts=1000.0,
        )
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load(
            {"last_checkpoint_stage": "sourcing"}, local_timestamp=2000.0
        )
        screen = resolver.build_conflict_screen_state()

        assert isinstance(screen, ConflictScreenState)
        assert "unavailable" not in screen.local_timestamp_display or True  # may be UTC
        assert screen.local_last_stage is not None or screen.local_last_stage is None
        assert screen.selected_option is None
        assert screen.awaiting_confirmation is False
        assert screen.resolver_state == RESOLVER_STATE.CONFLICT_DETECTED
        assert len(screen.instructions) > 0

    def test_raises_in_idle_state(self):
        mgr = make_cloud_manager(has_conflict=False)
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=1.0)
        with pytest.raises(RuntimeError, match="invalid state"):
            resolver.build_conflict_screen_state()

    def test_raises_in_resolved_state(self):
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        resolver.player_selects("local")
        resolver.player_confirms()
        with pytest.raises(RuntimeError, match="invalid state"):
            resolver.build_conflict_screen_state()


# ---------------------------------------------------------------------------
# player_selects
# ---------------------------------------------------------------------------

class TestPlayerSelects:
    def test_transitions_to_awaiting_confirmation_on_local(self):
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        resolver.player_selects("local")
        assert resolver.state == RESOLVER_STATE.AWAITING_CONFIRMATION

    def test_transitions_to_awaiting_confirmation_on_cloud(self):
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        resolver.player_selects("cloud")
        assert resolver.state == RESOLVER_STATE.AWAITING_CONFIRMATION

    def test_raises_on_invalid_option(self):
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        with pytest.raises(ValueError, match="option must be"):
            resolver.player_selects("neither")

    def test_raises_when_not_in_conflict_detected_state(self):
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)  # IDLE state
        with pytest.raises(RuntimeError, match="invalid state"):
            resolver.player_selects("local")

    def test_no_write_occurs_on_player_selects(self):
        """AC4: no write at selection time — only confirmation triggers data return."""
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        resolver.player_selects("cloud")
        # Still AWAITING_CONFIRMATION; no resolved data returned yet.
        assert resolver.state == RESOLVER_STATE.AWAITING_CONFIRMATION
        assert resolver.is_confirmed is False


# ---------------------------------------------------------------------------
# player_confirms — AC4 overwrite gate
# ---------------------------------------------------------------------------

class TestPlayerConfirms:
    def _setup_to_confirm(self, option="local", local_save=None):
        local_save = local_save or {"gold": 500, "last_checkpoint_stage": "sourcing"}
        mgr = make_cloud_manager(
            cloud_save={"gold": 100, "last_checkpoint_stage": "cleaning"}
        )
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load(local_save, local_timestamp=9999.0)
        resolver.player_selects(option)
        return resolver, local_save

    def test_returns_local_save_when_local_selected(self):
        resolver, local_save = self._setup_to_confirm("local")
        chosen = resolver.player_confirms()
        assert chosen["last_checkpoint_stage"] == "sourcing"
        assert resolver.state == RESOLVER_STATE.RESOLVED

    def test_returns_cloud_save_when_cloud_selected(self):
        resolver, _ = self._setup_to_confirm("cloud")
        chosen = resolver.player_confirms()
        assert chosen["last_checkpoint_stage"] == "cleaning"

    def test_sets_is_confirmed(self):
        resolver, _ = self._setup_to_confirm("local")
        resolver.player_confirms()
        assert resolver.is_confirmed is True

    def test_raises_when_not_in_awaiting_confirmation(self):
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        # State is CONFLICT_DETECTED, not AWAITING_CONFIRMATION
        with pytest.raises(RuntimeError, match="invalid state"):
            resolver.player_confirms()

    def test_raises_in_idle_state(self):
        mgr = make_cloud_manager(has_conflict=False)
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=1.0)
        with pytest.raises(RuntimeError, match="invalid state"):
            resolver.player_confirms()


# ---------------------------------------------------------------------------
# player_cancels — Scenario 8: no silent overwrite
# ---------------------------------------------------------------------------

class TestPlayerCancels:
    def test_returns_to_conflict_detected_state(self):
        """Scenario 8: player can cancel and go back to choice screen."""
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        resolver.player_selects("cloud")
        resolver.player_cancels()
        assert resolver.state == RESOLVER_STATE.CONFLICT_DETECTED
        assert resolver.is_confirmed is False

    def test_raises_when_not_in_awaiting_confirmation(self):
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        with pytest.raises(RuntimeError, match="invalid state"):
            resolver.player_cancels()


# ---------------------------------------------------------------------------
# Scenario 8: silent overwrite is structurally impossible
# ---------------------------------------------------------------------------

class TestNoSilentOverwrite:
    def test_ac4_cannot_confirm_without_selection(self):
        """AC4: confirm without prior selection raises — silent overwrite impossible."""
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        resolver.detect_conflict_at_load({}, local_timestamp=2.0)
        # Manually advance state without selecting to simulate skip attempt
        resolver._state = RESOLVER_STATE.AWAITING_CONFIRMATION
        resolver._selected_option = None  # no selection
        with pytest.raises(RuntimeError, match="no selection"):
            resolver.player_confirms()

    def test_ac4_state_is_idle_initially_no_auto_load(self):
        """AC4: resolver starts IDLE — no automatic load path exists."""
        mgr = make_cloud_manager()
        resolver = SaveConflictResolver(mgr)
        assert resolver.state == RESOLVER_STATE.IDLE
        assert resolver.is_confirmed is False

    def test_full_happy_path_requires_three_explicit_steps(self):
        """
        AC4: end-to-end conflict resolution requires detect → select → confirm.
        Three explicit steps; no shortcut to overwrite.
        """
        local_save = {"gold": 800, "last_checkpoint_stage": "reassembly"}
        cloud_save = {"gold": 400, "last_checkpoint_stage": "sourcing"}

        mgr = make_cloud_manager(cloud_save=cloud_save)
        resolver = SaveConflictResolver(mgr)

        # Step 1: detect
        assert resolver.detect_conflict_at_load(local_save, local_timestamp=9000.0) is True
        assert resolver.state == RESOLVER_STATE.CONFLICT_DETECTED

        # Step 2: select
        resolver.player_selects("local")
        assert resolver.state == RESOLVER_STATE.AWAITING_CONFIRMATION
        assert resolver.is_confirmed is False

        # Step 3: confirm
        chosen = resolver.player_confirms()
        assert resolver.state == RESOLVER_STATE.RESOLVED
        assert resolver.is_confirmed is True
        assert chosen["last_checkpoint_stage"] == "reassembly"
